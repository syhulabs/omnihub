import { useRef, useState, type CSSProperties, type TouchEvent, useEffect } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon, type IconName } from '../../components/Icon';
import { hapticTap, hapticSelect } from '../../haptics';
import { useAuth } from '../../cloud/AuthContext';
import { PERSONALITY_META } from './types';
import { PREVIEW_SAMPLES, heroBanner, type PreviewPhase } from '../../assets/sleep-mode';
import './SleepMode.css';

/** Only these two actually get AI-generated lines/voice (see isAiPersonality in SleepMode.tsx
 *  and generateSleepReminders) — the rest stay hand-written-only even when signed in. */
const AI_ENABLED = new Set(['gentle', 'friendly']);
const AI_ENABLED_LABEL = PERSONALITY_META.filter((p) => AI_ENABLED.has(p.id))
  .map((p) => p.label)
  .join(' and ');

const PHASE_LABEL: Record<PreviewPhase, string> = {
  bedtime: 'Bedtime',
  snooze: 'Snooze',
  wake: 'Wake-up',
};

const PERKS: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'moon', title: 'AI bedtime coaching', desc: 'Helps you wind down and sleep on time.' },
  { icon: 'sun', title: 'AI wake-up companion', desc: "Won't stop until you actually wake up." },
  { icon: 'volume', title: 'Smart snooze reactions', desc: 'Different messages every time you snooze.' },
  { icon: 'trending-up', title: 'Adaptive escalation', desc: 'Gets stronger if you ignore reminders.' },
  { icon: 'activity', title: 'AI voice reminders', desc: 'Your AI actually speaks to you.' },
  { icon: 'zap', title: 'Sleep insights', desc: 'Understand your sleep patterns.' },
];

interface SleepModeAiTabProps {
  onBack: () => void;
}

export function SleepModeAiTab({ onBack }: SleepModeAiTabProps) {
  const { user } = useAuth();
  const isActive = !!user;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const touchStartX = useRef<number | null>(null);

  const activePersonality = PERSONALITY_META.find((p) => p.id === activeId);
  const samples = activeId ? PREVIEW_SAMPLES[activeId] : null;
  const currentSample = samples?.[sampleIndex];

  function stopAudio() {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
  }

  // A sample must not keep talking after the user has moved to another tab or screen.
  useEffect(() => () => audioRef.current?.pause(), []);

  function selectPersonality(id: string) {
    if (!PREVIEW_SAMPLES[id]) return; // Custom has no fixed voice to preview
    hapticSelect();
    stopAudio();
    setActiveId(id);
    setSampleIndex(0);
  }

  function playCurrent() {
    if (!currentSample) return;
    hapticTap();
    stopAudio();
    const audio = new Audio(currentSample.audio);
    audioRef.current = audio;
    setPlaying(true);
    audio.onended = () => setPlaying(false);
    audio.onerror = () => setPlaying(false);
    audio.play().catch(() => setPlaying(false));
  }

  function showSample(index: number) {
    if (!samples) return;
    hapticTap();
    stopAudio();
    setSampleIndex((index + samples.length) % samples.length);
  }

  function onTouchStart(e: TouchEvent<HTMLDivElement>) {
    touchStartX.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: TouchEvent<HTMLDivElement>) {
    if (touchStartX.current === null || !samples) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    showSample(sampleIndex + (dx < 0 ? 1 : -1));
  }

  return (
    <div className="screen sm__ai2">
      <ScreenHeader
        title={
          <>
            Sleep Mode <span className="sm__ai2-title-accent">AI</span>
          </>
        }
        subtitle="Your personal bedtime companion"
        onBack={onBack}
        action={
          <span className={`sm__ai2-status-badge${isActive ? ' sm__ai2-status-badge--active' : ''}`}>
            <Icon name={isActive ? 'check' : 'lock'} size={12} />
            {isActive ? 'ACTIVE' : 'SIGN IN'}
          </span>
        }
      />

      <div className="sm__body sm__ai2-body">
        <div className="sm__ai2-hero">
          <img className="sm__ai2-hero-img" src={heroBanner} alt="" />
          <div className="sm__ai2-hero-bubble">
            I can help you get to bed tonight… and make sure you get up tomorrow.
            <span aria-hidden="true"> 🌙</span>
          </div>
        </div>

        <div className="sm__ai2-toggle-row">
          <span className="sm__ai2-toggle-icon">
            <Icon name="moon" size={20} />
          </span>
          <span className="sm__ai2-toggle-text">
            <span className="sm__ai2-toggle-title-row">
              <strong>Sleep Mode AI</strong>
              {!isActive && (
                <span className="sm__ai2-status-chip">
                  <Icon name="lock" size={10} />
                  SIGN IN TO ACTIVATE
                </span>
              )}
            </span>
            <span className="sm__ai2-toggle-desc">
              {isActive ? `Active for your ${AI_ENABLED_LABEL} reminders.` : 'Sign in to activate your AI companion.'}
            </span>
          </span>
          <span className={`sm__ai2-toggle-switch${isActive ? ' sm__ai2-toggle-switch--active' : ''}`}>
            <Icon name={isActive ? 'check' : 'lock'} size={12} />
          </span>
        </div>

        <div className="sm__ai2-section-head">
          <h2>Meet Your AI Companion</h2>
          <p>Six unique personalities, same goal. A better you.</p>
        </div>

        <div className="sm__ai2-grid">
          {PERSONALITY_META.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`sm__ai2-avatar${activeId === p.id ? ' sm__ai2-avatar--active' : ''}`}
              onClick={() => selectPersonality(p.id)}
              disabled={!PREVIEW_SAMPLES[p.id]}
            >
              <span className="sm__ai2-avatar-img" style={{ '--emoji-color': p.color } as CSSProperties}>
                {p.image ? <img src={p.image} alt="" /> : <Icon name={(p.icon ?? 'user') as IconName} size={20} />}
                {!isActive && (
                  <span className="sm__ai2-avatar-lock">
                    <Icon name="lock" size={9} />
                  </span>
                )}
              </span>
              <span className="sm__ai2-avatar-label">{p.label}</span>
            </button>
          ))}
        </div>

        <div className="sm__ai2-section-head">
          <h2>Hear a Preview</h2>
          <p>Tap a personality above, then swipe to hear it at every moment.</p>
        </div>

        {currentSample && activePersonality ? (
          <div className="sm__ai2-preview" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <div className="sm__ai2-preview-top">
              <span className="sm__ai2-preview-avatar" style={{ '--emoji-color': activePersonality.color } as CSSProperties}>
                {activePersonality.image && <img src={activePersonality.image} alt="" />}
              </span>
              <button type="button" className="sm__ai2-preview-play" onClick={playCurrent} aria-label="Play preview">
                <Icon name="play" size={16} />
              </button>
              <span className={`sm__ai2-preview-wave${playing ? ' sm__ai2-preview-wave--active' : ''}`} aria-hidden="true">
                {Array.from({ length: 20 }).map((_, i) => (
                  <span key={i} style={{ '--i': i } as CSSProperties} />
                ))}
              </span>
            </div>

            <p className="sm__ai2-preview-text">&ldquo;{currentSample.text}&rdquo;</p>

            <div className="sm__ai2-preview-nav-row">
              <button type="button" className="sm__ai2-preview-nav" onClick={() => showSample(sampleIndex - 1)} aria-label="Previous sample">
                <Icon name="chevron-right" size={14} className="sm__ai2-chevron-left" />
              </button>
              <span className="sm__ai2-preview-dots">
                {samples!.map((s, i) => (
                  <button
                    key={s.phase}
                    type="button"
                    className={`sm__ai2-preview-dot${i === sampleIndex ? ' sm__ai2-preview-dot--active' : ''}`}
                    onClick={() => showSample(i)}
                  >
                    {PHASE_LABEL[s.phase]}
                  </button>
                ))}
              </span>
              <button type="button" className="sm__ai2-preview-nav" onClick={() => showSample(sampleIndex + 1)} aria-label="Next sample">
                <Icon name="chevron-right" size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div className="sm__ai2-preview sm__ai2-preview--empty">
            <p>Tap a personality above to hear a preview.</p>
          </div>
        )}

        <div className="sm__ai2-section-head">
          <h2>{isActive ? 'What You Get' : "What You'll Get"}</h2>
        </div>

        <div className="sm__ai2-perks-grid">
          {PERKS.map((p) => (
            <div key={p.title} className="sm__ai2-perk-card">
              <span className="sm__ai2-perk-icon">
                <Icon name={p.icon} size={17} />
              </span>
              <strong>{p.title}</strong>
              <span>{p.desc}</span>
            </div>
          ))}
        </div>

        {!isActive && (
          <div className="smp__coming-soon">
            <Icon name="lock" size={28} className="smp__coming-soon-icon" />
            <h3>Sign In Required</h3>
            <p>Sleep Mode AI is ready to go — sign in from your Desk to turn it on.</p>
          </div>
        )}
      </div>
    </div>
  );
}
