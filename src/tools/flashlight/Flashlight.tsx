import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { isIOS } from '../../platform';
import { App as CapacitorApp } from '@capacitor/app';
import { Torch } from '@capawesome/capacitor-torch';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon, type IconName } from '../../components/Icon';
import { useRouter } from '../../app/Router';
import { hapticTap } from '../../haptics';
import { FlashAlertPlugin, type FlashAlertSettings } from '../../flashalert/plugin';
import { useIsLightTheme } from '../../theme/useTheme';
import { setStatusBarStyle } from '../../theme/statusBar';
import './Flashlight.css';

type Status = 'checking' | 'unavailable' | 'ready';
type Mode = 'normal' | 'strobe' | 'sos' | 'blink';

const DEFAULT_ALERT_SETTINGS: FlashAlertSettings = {
  notificationEnabled: false,
  callEnabled: false,
  alarmEnabled: false,
  notificationAccessGranted: false,
  callPermissionGranted: false,
};

const MODES: { id: Mode; label: string; icon: IconName }[] = [
  { id: 'normal', label: 'Normal', icon: 'sun' },
  { id: 'strobe', label: 'Strobe', icon: 'zap' },
  { id: 'sos', label: 'SOS', icon: 'bell' },
  { id: 'blink', label: 'Blink', icon: 'clock' },
];

function buildPattern(mode: Mode): { on: boolean; ms: number }[] {
  if (mode === 'strobe') return [{ on: true, ms: 80 }, { on: false, ms: 80 }];
  if (mode === 'blink') return [{ on: true, ms: 450 }, { on: false, ms: 450 }];
  const dot = 150;
  const dash = 450;
  const gap = 180;
  const letterGap = 480;
  const wordGap: number = 1300;
  const seq: { on: boolean; ms: number }[] = [];
  const dots = () => {
    for (let i = 0; i < 3; i++) {
      seq.push({ on: true, ms: dot });
      seq.push({ on: false, ms: gap });
    }
  };
  const dashes = () => {
    for (let i = 0; i < 3; i++) {
      seq.push({ on: true, ms: dash });
      seq.push({ on: false, ms: gap });
    }
  };
  dots();
  seq.pop();
  seq.push({ on: false, ms: letterGap });
  dashes();
  seq.pop();
  seq.push({ on: false, ms: letterGap });
  dots();
  seq.pop();
  seq.push({ on: false, ms: wordGap });
  return seq;
}

export function Flashlight() {
  const { back } = useRouter();
  const [status, setStatus] = useState<Status>('checking');
  const [on, setOn] = useState(false);
  const [lit, setLit] = useState(false);
  const [mode, setMode] = useState<Mode>('normal');
  const [alerts, setAlerts] = useState<FlashAlertSettings>(DEFAULT_ALERT_SETTINGS);
  const isNative = Capacitor.isNativePlatform();
  const isLightTheme = useIsLightTheme();
  const runIdRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    Torch.isAvailable()
      .then(({ available }) => {
        if (mounted) setStatus(available ? 'ready' : 'unavailable');
      })
      .catch(() => {
        if (mounted) setStatus('unavailable');
      });
    return () => {
      mounted = false;
      Torch.disable().catch(() => {
        // ignore
      });
    };
  }, []);

  useEffect(() => {
    if (!isNative) return;
    function refresh() {
      FlashAlertPlugin.getSettings().then(setAlerts).catch(() => {});
    }
    refresh();
    const listener = CapacitorApp.addListener('resume', refresh);
    return () => {
      listener.then((l) => l.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drive the physical torch from the `on` + `mode` state. Steady mode just
  // mirrors `on`; the animated modes step through a real enable/disable
  // pattern on the hardware torch itself (there's no separate "brightness"
  // level exposed by the plugin, so intensity always stays hardware-default).
  useEffect(() => {
    const runId = ++runIdRef.current;
    if (!on) {
      setLit(false);
      Torch.disable().catch(() => {});
      return;
    }
    if (mode === 'normal') {
      setLit(true);
      Torch.enable().catch(() => setStatus('unavailable'));
      return;
    }
    const pattern = buildPattern(mode);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let i = 0;
    async function step() {
      if (cancelled || runIdRef.current !== runId) return;
      const segment = pattern[i % pattern.length];
      setLit(segment.on);
      try {
        if (segment.on) await Torch.enable();
        else await Torch.disable();
      } catch {
        setStatus('unavailable');
        return;
      }
      i++;
      timer = setTimeout(step, segment.ms);
    }
    step();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [on, mode]);

  // The torch-on backdrop (.fl--on) is a fixed dark color regardless of app
  // theme, so the status bar icons need to follow that backdrop rather than
  // the app's own light/dark setting while it's showing.
  useEffect(() => {
    setStatusBarStyle(lit ? false : isLightTheme);
    return () => setStatusBarStyle(isLightTheme);
  }, [lit, isLightTheme]);

  function toggle() {
    hapticTap();
    setOn((v) => !v);
  }

  async function toggleAlarmAlert() {
    hapticTap();
    setAlerts(await FlashAlertPlugin.setAlarmEnabled({ enabled: !alerts.alarmEnabled }));
  }

  async function toggleCallAlert() {
    hapticTap();
    if (!alerts.callPermissionGranted) {
      const granted = await FlashAlertPlugin.requestCallPermission();
      setAlerts(granted);
      if (!granted.callPermissionGranted) return;
      setAlerts(await FlashAlertPlugin.setCallEnabled({ enabled: true }));
      return;
    }
    setAlerts(await FlashAlertPlugin.setCallEnabled({ enabled: !alerts.callEnabled }));
  }

  async function toggleNotificationAlert() {
    hapticTap();
    if (!alerts.notificationAccessGranted) {
      // Optimistically mark it enabled so it turns on by itself once access is granted in
      // Settings and we refresh on 'resume' - Android has no in-app permission dialog for this.
      setAlerts(await FlashAlertPlugin.setNotificationEnabled({ enabled: true }));
      await FlashAlertPlugin.openNotificationAccessSettings();
      return;
    }
    setAlerts(await FlashAlertPlugin.setNotificationEnabled({ enabled: !alerts.notificationEnabled }));
  }

  async function openNotificationAccess() {
    hapticTap();
    await FlashAlertPlugin.openNotificationAccessSettings();
  }

  const callOn = alerts.callEnabled && alerts.callPermissionGranted;
  const notificationOn = alerts.notificationEnabled && alerts.notificationAccessGranted;

  return (
    <div className={`screen fl${lit ? ' fl--on' : ''}`}>
      <ScreenHeader title="Flashlight" subtitle="Light up your world." onBack={back} />

      <div className="fl__body">
        {status === 'checking' && <p className="fl__hint">Checking flashlight…</p>}

        {status === 'unavailable' && (
          <div className="fl__toggle-section">
            <Icon name="info" size={32} className="fl__hint-icon" />
            <p className="fl__hint">This device doesn't have a flashlight.</p>
          </div>
        )}

        {status === 'ready' && (
          <div className="fl__toggle-section">
            <div className={`fl__beam${lit ? ' fl__beam--on' : ''}`} />
            <button
              type="button"
              className={`fl__toggle${lit ? ' fl__toggle--on' : ''}`}
              onClick={toggle}
              aria-label={on ? 'Turn off flashlight' : 'Turn on flashlight'}
            >
              <Icon name="power" size={56} />
            </button>
            <p className="fl__status">{on ? 'ON' : 'OFF'}</p>
            <p className="fl__hint">Tap to {on ? 'turn off' : 'turn on'}</p>
          </div>
        )}

        {status === 'ready' && (
          <div className="fl__modes">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`fl__mode-chip${mode === m.id ? ' fl__mode-chip--active' : ''}`}
                onClick={() => {
                  hapticTap();
                  setMode(m.id);
                }}
              >
                <Icon name={m.icon} size={18} />
                {m.label}
              </button>
            ))}
          </div>
        )}

        {/* Flash Alerts need notification access and call state, which iOS does not give apps. */}
        {isNative && !isIOS && status === 'ready' && (
          <div className="fl__alerts">
            <div className="fl__alerts-head">
              <span className="fl__alerts-icon">
                <Icon name="bell" size={18} />
              </span>
              <div>
                <h2 className="fl__alerts-title">Flash Alerts</h2>
                <p className="fl__alerts-subtitle">Blink the flash for things you might miss.</p>
              </div>
            </div>

            <div className="fl__alert-row">
              <span className="fl__alert-icon fl__alert-icon--blue">
                <Icon name="clock" size={16} />
              </span>
              <span className="fl__alert-info">
                <span className="fl__alert-name">Alarm</span>
                <span className="fl__alert-desc">Blink while an Omni Hub alarm rings</span>
              </span>
              <button
                type="button"
                className={`fl__switch${alerts.alarmEnabled ? ' fl__switch--on' : ''}`}
                onClick={toggleAlarmAlert}
                aria-label="Toggle flash on alarm"
              >
                <span className="fl__switch-knob" />
              </button>
            </div>

            <div className="fl__alert-row">
              <span className="fl__alert-icon fl__alert-icon--purple">
                <Icon name="bell" size={16} />
              </span>
              <span className="fl__alert-info">
                <span className="fl__alert-name">Incoming Calls</span>
                <span className="fl__alert-desc">
                  {callOn ? 'Blink while your phone rings' : 'Needs phone-state permission'}
                </span>
              </span>
              <button
                type="button"
                className={`fl__switch${callOn ? ' fl__switch--on' : ''}`}
                onClick={toggleCallAlert}
                aria-label="Toggle flash on incoming call"
              >
                <span className="fl__switch-knob" />
              </button>
            </div>

            <div className="fl__alert-row">
              <span className="fl__alert-icon fl__alert-icon--orange">
                <Icon name="info" size={16} />
              </span>
              <span className="fl__alert-info">
                <span className="fl__alert-name">Notifications</span>
                <span className="fl__alert-desc">
                  {notificationOn ? 'Blink for app notifications' : 'Needs notification access'}
                </span>
              </span>
              <button
                type="button"
                className={`fl__switch${notificationOn ? ' fl__switch--on' : ''}`}
                onClick={toggleNotificationAlert}
                aria-label="Toggle flash on notifications"
              >
                <span className="fl__switch-knob" />
              </button>
            </div>

            {!alerts.notificationAccessGranted && (
              <button type="button" className="fl__access-row" onClick={openNotificationAccess}>
                <span className="fl__alert-icon fl__alert-icon--green">
                  <Icon name="settings" size={16} />
                </span>
                <span className="fl__alert-info">
                  <span className="fl__alert-name">Grant Notification Access</span>
                  <span className="fl__alert-desc">Needed for notification alerts</span>
                </span>
                <Icon name="chevron-right" size={16} />
              </button>
            )}
          </div>
        )}

        {status === 'ready' && (
          <div className="fl__badges">
            <div className="fl__badge fl__badge--green">
              <Icon name="battery" size={20} />
              <strong>Battery Friendly</strong>
              <span>Low power usage</span>
            </div>
            <div className="fl__badge fl__badge--purple">
              <Icon name="flashlight" size={20} />
              <strong>Fast Access</strong>
              <span>One tap on/off</span>
            </div>
            <div className="fl__badge fl__badge--blue">
              <Icon name="shield" size={20} />
              <strong>Safe &amp; Secure</strong>
              <span>Uses device flashlight</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
