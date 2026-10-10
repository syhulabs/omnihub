import { useEffect, useRef, useState } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon } from '../../components/Icon';
import { useBackHandler } from '../../app/useBackHandler';
import { hapticSelect, hapticTap, hapticSuccess } from '../../haptics';
import { WIND_DOWN_ACTIONS, SLEEP_SOUNDS, SOUND_FILTERS } from './types';
import * as audioEngine from './audioEngine';
import './SleepMode.css';

interface WindDownModeProps {
  onBack: () => void;
  autoStart?: boolean;
  initialAction?: string;
}

const DURATION_MS = 30 * 60 * 1000;
const RING_R = 44;
const RING_C = 2 * Math.PI * RING_R;
const QUOTE = "Let's slow things down. 30 minutes to a better you.";

function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function WindDownMode({ onBack, autoStart, initialAction }: WindDownModeProps) {
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(DURATION_MS);
  const [breathingOpen, setBreathingOpen] = useState(false);
  const [dimOn, setDimOn] = useState(false);
  const [focusOn, setFocusOn] = useState(false);
  const [filter, setFilter] = useState<(typeof SOUND_FILTERS)[number]['id']>('all');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.5);

  useBackHandler(() => setBreathingOpen(false), breathingOpen);
  useBackHandler(() => setDimOn(false), dimOn);
  const endAtRef = useRef(0);
  const soundsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!running) return;
    endAtRef.current = Date.now() + remaining;
    const id = window.setInterval(() => {
      const left = endAtRef.current - Date.now();
      if (left <= 0) {
        // Wind-down is over: the user should be asleep, so the sound stops with it.
        setRemaining(0);
        setRunning(false);
        audioEngine.stopSound();
        setPlayingId(null);
        hapticSuccess();
        window.clearInterval(id);
      } else {
        setRemaining(left);
      }
    }, 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  useEffect(() => () => audioEngine.stopSound(), []);

  useEffect(() => {
    if (autoStart) setRunning(true);
    if (initialAction === 'breathing') setBreathingOpen(true);
    if (initialAction === 'dim') setDimOn(true);
    if (initialAction === 'focus') setFocusOn(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleRunning() {
    hapticTap();
    if (running) {
      setRunning(false);
    } else {
      if (remaining <= 0) setRemaining(DURATION_MS);
      setRunning(true);
    }
  }

  function handleAction(id: string) {
    hapticSelect();
    if (id === 'sounds') soundsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (id === 'breathing') setBreathingOpen(true);
    if (id === 'dim') setDimOn(true);
    if (id === 'focus') setFocusOn((v) => !v);
  }

  function togglePlay(id: string) {
    hapticTap();
    if (playingId === id) {
      audioEngine.stopSound();
      setPlayingId(null);
    } else {
      audioEngine.playSound(id as never, volume);
      setPlayingId(id);
    }
  }

  function handleVolume(v: number) {
    setVolume(v);
    audioEngine.setVolume(v);
  }

  const fraction = remaining / DURATION_MS;
  const visibleSounds = SLEEP_SOUNDS.filter((s) => filter === 'all' || s.category === filter);

  return (
    <div className="screen">
      <ScreenHeader title="Wind-Down" subtitle="Relax your mind and prepare for sleep" onBack={onBack} />

      <div className="sm__body sm__body--center">
        <div className="wd__ring-wrap">
          <svg className="wd__ring" viewBox="0 0 100 100">
            <circle className="wd__ring-track" cx="50" cy="50" r={RING_R} />
            <circle
              className="wd__ring-progress"
              cx="50"
              cy="50"
              r={RING_R}
              style={{ strokeDasharray: RING_C, strokeDashoffset: RING_C * (1 - fraction) }}
            />
          </svg>
          <div className="wd__ring-center">
            <Icon name="paw" size={22} />
            <strong>{formatClock(remaining)}</strong>
            <span>Wind-down</span>
          </div>
        </div>

        <div className="wd__quote">
          <p>"{QUOTE}"</p>
        </div>

        <div className="wd__actions">
          {WIND_DOWN_ACTIONS.map((a) => {
            const active = (a.id === 'dim' && dimOn) || (a.id === 'focus' && focusOn) || (a.id === 'sounds' && !!playingId);
            return (
              <button
                key={a.id}
                type="button"
                className={`wd__action${active ? ' wd__action--active' : ''}`}
                onClick={() => handleAction(a.id)}
              >
                <Icon name={a.icon as never} size={18} />
                <span>{a.label}</span>
              </button>
            );
          })}
        </div>

        <button type="button" className="wd__start-btn" onClick={toggleRunning}>
          <Icon name={running ? 'stop' : 'play'} size={18} />
          {running ? 'Stop Wind-Down' : 'Start Wind-Down'}
        </button>

        <section className="sm__section wd__sounds-section" ref={soundsRef}>
          <h2>Choose a sound</h2>
          <div className="sm__chip-row">
            {SOUND_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`sm__chip${filter === f.id ? ' sm__chip--active' : ''}`}
                onClick={() => {
                  hapticSelect();
                  setFilter(f.id);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="ss__grid">
            {visibleSounds.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`ss__card${playingId === s.id ? ' ss__card--playing' : ''}`}
                onClick={() => togglePlay(s.id)}
              >
                <img className="ss__card-image" src={s.image} alt="" />
                <span className="ss__card-play">
                  <Icon name={playingId === s.id ? 'pause' : 'play'} size={16} />
                </span>
                <span className="ss__card-label">{s.label}</span>
              </button>
            ))}
          </div>

          <div className="ss__volume-row">
            <Icon name="volume" size={18} />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => handleVolume(parseFloat(e.target.value))}
              className="ss__volume-slider"
            />
          </div>
        </section>
      </div>

      {breathingOpen && (
        <div className="wd__breathe-overlay" onClick={() => setBreathingOpen(false)}>
          <div className="wd__breathe-circle" aria-hidden="true" />
          <p className="wd__breathe-label">Breathe in… breathe out…</p>
          <span className="wd__breathe-hint">Tap anywhere to stop</span>
        </div>
      )}

      {dimOn && (
        <div className="wd__dim-overlay" onClick={() => setDimOn(false)}>
          <span>Screen dimmed — tap to undim</span>
        </div>
      )}
    </div>
  );
}
