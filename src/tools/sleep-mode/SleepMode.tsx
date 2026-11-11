import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { isIOS } from '../../platform';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon } from '../../components/Icon';
import { useRouter } from '../../app/Router';
import { useBackHandler } from '../../app/useBackHandler';
import { hapticSelect, hapticTap, hapticWarning } from '../../haptics';
import { WheelTimePicker } from '../alarm/WheelTimePicker';
import { SleepModePlugin, DEFAULT_SLEEP_MODE_CONFIG, type SleepModeConfig, type SleepModeStatus } from '../../sleep-mode/plugin';
import { useAuth } from '../../cloud/AuthContext';
import { generateSleepReminders, type SleepAiPersonality } from '../../cloud/generateSleepReminders';
import { INTERVAL_OPTIONS_MIN, WIND_DOWN_ACTIONS } from './types';
import { HomePersonalitySection } from './HomePersonalitySection';
import { WindDownMode } from './WindDownMode';
import { SleepSounds } from './SleepSounds';
import { SleepInsights } from './SleepInsights';
import { SleepModeAiTab } from './SleepModeAiTab';
import { SleepTabBar, type SleepTab } from './SleepTabBar';
import { heroBanner } from '../../assets/sleep-mode';
import { formatClock } from '../../settings/formats';
import './SleepMode.css';

function formatTime(hour: number, minute: number): string {
  return formatClock(hour, minute);
}

function formatTimeOfDay(ms: number): string {
  const d = new Date(ms);
  return formatTime(d.getHours(), d.getMinutes());
}

type TimeField = 'bedtime' | 'wake';
type SubScreen = SleepTab | 'wind-down';

const TAB_SCREENS = new Set<SubScreen>(['main', 'sleep-insights', 'sleep-sounds', 'ai']);

const AI_ENABLED_PERSONALITIES = new Set<SleepAiPersonality>(['gentle', 'friendly']);
const AI_POOL_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isAiPersonality(p: string): p is SleepAiPersonality {
  return AI_ENABLED_PERSONALITIES.has(p as SleepAiPersonality);
}

export function SleepMode() {
  const { back } = useRouter();
  const { user } = useAuth();
  const [config, setConfig] = useState<SleepModeStatus>({ ...DEFAULT_SLEEP_MODE_CONFIG, sessionStartMillis: 0, nagCount: 0, mutedUntilMillis: 0 });
  const [timeSheet, setTimeSheet] = useState<TimeField | null>(null);
  const [timeDraft, setTimeDraft] = useState<{ hour: number; minute: number } | null>(null);
  const [needsExactAlarmPermission, setNeedsExactAlarmPermission] = useState(false);
  const [needsFullScreenPermission, setNeedsFullScreenPermission] = useState(false);
  const [needsOverlayPermission, setNeedsOverlayPermission] = useState(false);
  const [screen, setScreen] = useState<SubScreen>('main');
  const [windDownAutoStart, setWindDownAutoStart] = useState(false);
  const [windDownInitialAction, setWindDownInitialAction] = useState<string | undefined>(undefined);
  /** Live drag value while dragging the volume slider, so persist() (a native write + possible AI
   *  refresh network call) only fires once on release, not on every intermediate tick. */
  const [volumeDraft, setVolumeDraft] = useState<number | null>(null);
  const displayedVolume = volumeDraft ?? config.volumePercent;

  useBackHandler(closeTimeSheet, timeSheet !== null);
  useBackHandler(() => setScreen('main'), screen !== 'main' && timeSheet === null);

  useEffect(() => {
    SleepModePlugin.status()
      .then((status) => {
        setConfig(status);
        // Sleep Mode may already have been enabled before this permission existed (or before
        // this device ever prompted for it) — check on every visit, not just the on-toggle, so
        // the illustrated card's auto-pop-up gets fixed without needing an off/on cycle.
        if (status.enabled) {
          SleepModePlugin.checkFullScreenIntentPermission()
            .then((r) => setNeedsFullScreenPermission(!r.granted))
            .catch(() => {});
          SleepModePlugin.checkOverlayPermission()
            .then((r) => setNeedsOverlayPermission(!r.granted))
            .catch(() => {});
        }
      })
      .catch(() => {
        // web fallback / unsupported platform — keep the default config
      });
  }, []);

  async function persist(next: SleepModeConfig) {
    // configure() always restarts scheduling from a clean session on the native side, so mirror
    // that here rather than carrying over stale session/mute state from before the edit.
    setConfig({ ...next, sessionStartMillis: 0, nagCount: 0, mutedUntilMillis: 0 });
    try {
      await SleepModePlugin.configure(next);
    } catch {
      // web fallback / unsupported platform — local state still reflects the change
    }
    void maybeRefreshAiReminders(next);
  }

  /** Best-effort background refresh of the cached AI reminder pool. Never surfaces an error or
   *  blocks Sleep Mode — the hand-written MessageBank pool is always there as a fallback.
   *  Requires sign-in (the Cloud Function needs an ID token and rate-limits per account) but no
   *  longer requires Pro — Sleep Mode AI is available to anyone signed in. */
  async function maybeRefreshAiReminders(next: SleepModeConfig) {
    if (!user || !isAiPersonality(next.personality)) return;
    try {
      const info = await SleepModePlugin.getAiMessagesInfo({ personality: next.personality });
      if (Date.now() - info.generatedAt < AI_POOL_MAX_AGE_MS) return;
      const { tiersJson, audioClips } = await generateSleepReminders({ personality: next.personality });
      await SleepModePlugin.setAiMessages({ personality: next.personality, tiersJson });
      if (audioClips.length) {
        await SleepModePlugin.setAiAudioClips({ personality: next.personality, clips: audioClips });
      }
    } catch {
      // network hiccup, rate limit, or unsupported platform — fine, try again next edit
    }
  }

  async function handleToggleEnabled() {
    hapticSelect();
    if (config.enabled) {
      await persist({ ...config, enabled: false });
      return;
    }

    try {
      const notif = await SleepModePlugin.checkNotificationPermission();
      if (!notif.granted) await SleepModePlugin.requestNotificationPermission();
    } catch {
      // web fallback / unsupported platform — proceed anyway
    }

    try {
      const exact = await SleepModePlugin.checkExactAlarmPermission();
      if (!exact.granted) {
        hapticWarning();
        setNeedsExactAlarmPermission(true);
        await SleepModePlugin.requestExactAlarmPermission();
        return; // user needs to grant it in Settings, then toggle Sleep Mode on again
      }
    } catch {
      // web fallback / unsupported platform — proceed anyway
    }

    setNeedsExactAlarmPermission(false);

    try {
      const fullScreen = await SleepModePlugin.checkFullScreenIntentPermission();
      setNeedsFullScreenPermission(!fullScreen.granted);
      // Unlike the exact-alarm permission, neither this nor the overlay permission below is
      // required for reminders to work at all (the notification still shows and can be tapped) —
      // just for the illustrated card to pop up on its own, so Sleep Mode still turns on below
      // rather than blocking on either one.
    } catch {
      // web fallback / unsupported platform — proceed anyway
    }

    try {
      const overlay = await SleepModePlugin.checkOverlayPermission();
      if (!overlay.granted) {
        setNeedsOverlayPermission(true);
        await SleepModePlugin.requestOverlayPermission();
      } else {
        setNeedsOverlayPermission(false);
      }
    } catch {
      // web fallback / unsupported platform — proceed anyway
    }

    await persist({ ...config, enabled: true });
  }

  // The wheel fires on every settled row; saving each one would reconfigure (and restart) the
  // native nag session several times per scroll, so the sheet edits a draft and saves on close.
  function openTimeSheet(field: TimeField) {
    setTimeDraft(
      field === 'bedtime'
        ? { hour: config.bedtimeHour, minute: config.bedtimeMinute }
        : { hour: config.wakeHour, minute: config.wakeMinute },
    );
    setTimeSheet(field);
  }

  function closeTimeSheet() {
    const field = timeSheet;
    const draft = timeDraft;
    setTimeSheet(null);
    setTimeDraft(null);
    if (!field || !draft) return;
    const unchanged =
      field === 'bedtime'
        ? draft.hour === config.bedtimeHour && draft.minute === config.bedtimeMinute
        : draft.hour === config.wakeHour && draft.minute === config.wakeMinute;
    if (unchanged) return;
    void persist(
      field === 'bedtime'
        ? { ...config, bedtimeHour: draft.hour, bedtimeMinute: draft.minute }
        : { ...config, wakeHour: draft.hour, wakeMinute: draft.minute },
    );
  }

  function selectInterval(min: number) {
    hapticSelect();
    persist({ ...config, intervalMin: min });
  }

  function commitVolume(percent: number) {
    setVolumeDraft(null);
    hapticSelect();
    persist({ ...config, volumePercent: percent });
  }

  function openWindDown(opts?: { autoStart?: boolean; action?: string }) {
    hapticTap();
    setWindDownAutoStart(!!opts?.autoStart);
    setWindDownInitialAction(opts?.action);
    setScreen('wind-down');
  }

  function selectTab(tab: SleepTab) {
    setScreen(tab);
  }

  if (screen === 'wind-down') {
    return (
      <WindDownMode
        onBack={() => setScreen('main')}
        autoStart={windDownAutoStart}
        initialAction={windDownInitialAction}
      />
    );
  }
  const showTabBar = TAB_SCREENS.has(screen);

  let body: ReactNode;
  if (screen === 'sleep-insights') {
    body = <SleepInsights onBack={() => setScreen('main')} />;
  } else if (screen === 'sleep-sounds') {
    body = <SleepSounds onBack={() => setScreen('main')} />;
  } else if (screen === 'ai') {
    body = <SleepModeAiTab onBack={() => setScreen('main')} />;
  } else {
    body = (
      <div className="screen">
        <ScreenHeader
          title={
            <>
              Sleep Mode <span className="screen-header__beta-tag">Beta</span>
            </>
          }
          subtitle="Your bedtime companion"
          onBack={back}
        />

        <div className="sm__body">
          <div className="sm__banner">
            <img className="sm__banner-image" src={heroBanner} alt="" />
            <p className="sm__banner-tagline">Better sleep. Brighter days.</p>
          </div>

          <div className={`sm__hero${config.enabled ? ' sm__hero--active' : ''}`}>
            <span className="sm__hero-icon">
              <Icon name="moon" size={26} />
              <span className="sm__hero-zzz">Zz</span>
            </span>
            <Icon name="star" size={9} className="sm__hero-sparkle sm__hero-sparkle--1" />
            <Icon name="star" size={7} className="sm__hero-sparkle sm__hero-sparkle--2" />
            <div className="sm__hero-text">
              <span className="sm__hero-eyebrow">Sleep Mode</span>
              <strong>{config.enabled ? 'Active' : 'Off'}</strong>
              <span className="sm__hero-desc">
                {config.enabled
                  ? `Nagging you between ${formatTime(config.bedtimeHour, config.bedtimeMinute)} and ${formatTime(config.wakeHour, config.wakeMinute)}`
                  : 'Turn it on to get talked into sleeping on time.'}
              </span>
            </div>
            <button
              type="button"
              className={`sm__switch${config.enabled ? ' sm__switch--on' : ''}`}
              onClick={handleToggleEnabled}
              aria-label="Toggle Sleep Mode"
            >
              <span className="sm__switch-knob" />
            </button>
          </div>

          {needsExactAlarmPermission && (
            <div className="sm__warning">
              <Icon name="info" size={16} />
              <span>Sleep Mode needs the "Alarms &amp; reminders" permission. Grant it in Settings, then turn Sleep Mode on again.</span>
            </div>
          )}

          {needsOverlayPermission && (
            <div className="sm__warning">
              <Icon name="info" size={16} />
              <span>
                For the reminder card to pop up on its own while you're using your phone, grant "Display over other apps" for
                Omni Hub in Settings. Without it, you'll still get the notification — just tap it to open the card.
              </span>
              <button type="button" className="sm__warning-action" onClick={() => SleepModePlugin.requestOverlayPermission()}>
                Open Settings
              </button>
            </div>
          )}

          {needsFullScreenPermission && (
            <div className="sm__warning">
              <Icon name="info" size={16} />
              <span>
                For the reminder card to also show if a reminder catches you with the phone locked, grant "Full screen
                notifications" for Omni Hub in Settings.
              </span>
              <button
                type="button"
                className="sm__warning-action"
                onClick={() => SleepModePlugin.requestFullScreenIntentPermission()}
              >
                Open Settings
              </button>
            </div>
          )}

          {config.mutedUntilMillis > Date.now() && (
            <div className="sm__warning sm__warning--muted">
              <Icon name="volume" size={16} />
              <span>Reminders paused until {formatTimeOfDay(config.mutedUntilMillis)}.</span>
              <button type="button" className="sm__warning-action" onClick={() => persist(config)}>
                Resume
              </button>
            </div>
          )}

          <HomePersonalitySection config={config} onPersist={persist} />

          <section className="sm__section">
            <h2>
              <Icon name="calendar" size={13} />
              Schedule
            </h2>
            <div className="sm__schedule-row">
              <button type="button" className="sm__time-btn" onClick={() => openTimeSheet('bedtime')}>
                <span className="sm__time-icon sm__time-icon--night">
                  <Icon name="moon" size={16} />
                </span>
                <span className="sm__time-text">
                  <span>Bedtime</span>
                  <strong>{formatTime(config.bedtimeHour, config.bedtimeMinute)}</strong>
                </span>
                <Icon name="chevron-right" size={16} className="sm__time-chevron" />
              </button>
              <button type="button" className="sm__time-btn" onClick={() => openTimeSheet('wake')}>
                <span className="sm__time-icon sm__time-icon--day">
                  <Icon name="sun" size={16} />
                </span>
                <span className="sm__time-text">
                  <span>Wake time</span>
                  <strong>{formatTime(config.wakeHour, config.wakeMinute)}</strong>
                </span>
                <Icon name="chevron-right" size={16} className="sm__time-chevron" />
              </button>
            </div>

            <div className="sm__interval-row">
              <span className="sm__interval-label">
                <Icon name="clock" size={13} />
                Check in every
              </span>
              <div className="sm__chip-row">
                {INTERVAL_OPTIONS_MIN.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`sm__chip${config.intervalMin === m ? ' sm__chip--active' : ''}`}
                    onClick={() => selectInterval(m)}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            </div>

            <div className="sm__interval-row">
              <span className="sm__interval-label">
                <Icon name="volume" size={13} />
                Reminder volume
              </span>
              <div className="sm__volume-row">
                <input
                  type="range"
                  className="sm__volume-slider"
                  min={0}
                  max={100}
                  step={5}
                  value={displayedVolume}
                  onChange={(e) => setVolumeDraft(Number(e.target.value))}
                  onMouseUp={(e) => commitVolume(Number((e.target as HTMLInputElement).value))}
                  onTouchEnd={(e) => commitVolume(Number((e.target as HTMLInputElement).value))}
                  aria-label="Reminder volume"
                />
                <span className="sm__volume-value">{displayedVolume}%</span>
              </div>
              <p className="sm__volume-hint">
                {isIOS
                  ? 'Used when a reminder is spoken while Omni Hub is open. Notifications follow your iPhone’s own sound settings.'
                  : 'Always audible, even on silent or Do Not Disturb — set independently of your phone’s own volume.'}
              </p>
            </div>
          </section>

          <button type="button" className="sm__start-btn" onClick={() => openWindDown({ autoStart: true })}>
            <Icon name="play" size={17} />
            Start Sleep Mode
          </button>

          <button type="button" className="sm__menu-row" onClick={() => openWindDown()}>
            <span className="sm__menu-icon" style={{ '--menu-color': 'var(--teal)' } as CSSProperties}>
              <Icon name="moon" size={17} />
            </span>
            <span className="sm__menu-text">
              <strong>Wind-Down</strong>
              <span>30 minutes before bedtime</span>
            </span>
            <Icon name="chevron-right" size={16} className="sm__time-chevron" />
          </button>

          <div className="sm__quick-grid">
            {WIND_DOWN_ACTIONS.map((a) => (
              <button
                key={a.id}
                type="button"
                className="sm__quick-item"
                onClick={() => (a.id === 'sounds' ? setScreen('sleep-sounds') : openWindDown({ action: a.id }))}
              >
                <Icon name={a.icon as never} size={18} />
                <span>{a.shortLabel}</span>
              </button>
            ))}
          </div>

          <button type="button" className="sm__menu-row" onClick={() => setScreen('sleep-insights')}>
            <span className="sm__menu-icon" style={{ '--menu-color': 'var(--orange)' } as CSSProperties}>
              <Icon name="trending-up" size={17} />
            </span>
            <span className="sm__menu-text">
              <strong>Sleep Tracking</strong>
              <span>Track your sleep time and build better habits</span>
            </span>
            <Icon name="chevron-right" size={16} className="sm__time-chevron" />
          </button>
        </div>

        {timeSheet && (
          <div className="sm__sheet" onClick={closeTimeSheet}>
            <div className="sm__sheet-content" onClick={(e) => e.stopPropagation()}>
              <h2>{timeSheet === 'bedtime' ? 'Bedtime' : 'Wake time'}</h2>
              <WheelTimePicker
                hour={timeDraft?.hour ?? (timeSheet === 'bedtime' ? config.bedtimeHour : config.wakeHour)}
                minute={timeDraft?.minute ?? (timeSheet === 'bedtime' ? config.bedtimeMinute : config.wakeMinute)}
                onChange={(h, m) => setTimeDraft({ hour: h, minute: m })}
              />
              <button type="button" className="sm__sheet-close" onClick={closeTimeSheet}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {body}
      {showTabBar && <SleepTabBar active={screen as SleepTab} onSelect={selectTab} />}
    </>
  );
}
