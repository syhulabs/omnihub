import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '../../components/Icon';
import { hapticSuccess, hapticTap } from '../../haptics';

interface TestProps {
  onComplete: (passed: boolean) => void;
  onCancel: () => void;
}

const TEST_COLORS = [
  { name: 'Red', css: '#e5333d' },
  { name: 'Green', css: '#22c55e' },
  { name: 'Blue', css: '#4d7cfe' },
  { name: 'White', css: '#ffffff' },
  { name: 'Black', css: '#000000' },
];

export function DisplayTest({ onComplete, onCancel }: TestProps) {
  const [index, setIndex] = useState(0);
  const color = TEST_COLORS[index];
  const isLast = index === TEST_COLORS.length - 1;
  const textDark = color.name === 'White';

  return (
    <div className="hct__overlay" style={{ background: color.css }}>
      <button type="button" className="hct__close" style={{ color: textDark ? '#000' : '#fff' }} onClick={onCancel}>
        <Icon name="x" size={22} />
      </button>
      <div className="hct__center">
        <p className="hct__hint" style={{ color: textDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.75)' }}>
          {isLast ? 'Did all the colors look correct — no dead pixels or odd tints?' : `Checking screen color: ${color.name}`}
        </p>
        {!isLast ? (
          <button type="button" className="hct__btn" style={{ color: textDark ? '#000' : '#fff', borderColor: textDark ? '#000' : '#fff' }} onClick={() => { hapticTap(); setIndex((i) => i + 1); }}>
            Next Color
          </button>
        ) : (
          <div className="hct__yn">
            <button type="button" className="hct__btn hct__btn--fail" onClick={() => onComplete(false)}>
              No, something's off
            </button>
            <button type="button" className="hct__btn hct__btn--pass" onClick={() => onComplete(true)}>
              Yes, looks good
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const TOUCH_COLS = 5;
const TOUCH_ROWS = 8;
const TOUCH_TOTAL = TOUCH_COLS * TOUCH_ROWS;
const TOUCH_PASS_RATIO = 0.85;

export function TouchTest({ onComplete, onCancel }: TestProps) {
  const [touched, setTouched] = useState<Set<number>>(new Set());
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const coverage = touched.size / TOUCH_TOTAL;
  const done = coverage >= TOUCH_PASS_RATIO;

  function markAt(clientX: number, clientY: number) {
    for (let i = 0; i < cellRefs.current.length; i++) {
      const el = cellRefs.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        setTouched((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));
        break;
      }
    }
  }

  const detachRef = useRef<(() => void) | null>(null);
  useEffect(() => () => detachRef.current?.(), []);

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    markAt(e.clientX, e.clientY);
    detachRef.current?.();
    const move = (ev: PointerEvent) => markAt(ev.clientX, ev.clientY);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      detachRef.current = null;
    };
    detachRef.current = up;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  useEffect(() => {
    if (done) hapticSuccess();
  }, [done]);

  return (
    <div className="hct__overlay hct__overlay--dark">
      <button type="button" className="hct__close" onClick={onCancel}>
        <Icon name="x" size={22} />
      </button>
      <p className="hct__hint">Drag your finger across the whole screen to test touch response.</p>
      <div className="hct__touch-grid" onPointerDown={handlePointerDown}>
        {Array.from({ length: TOUCH_TOTAL }, (_, i) => (
          <div
            key={i}
            ref={(el) => {
              cellRefs.current[i] = el;
            }}
            className={`hct__touch-cell${touched.has(i) ? ' hct__touch-cell--on' : ''}`}
          />
        ))}
      </div>
      <div className="hct__touch-footer">
        <span>{Math.round(coverage * 100)}% covered</span>
        <button
          type="button"
          className={`hct__btn${done ? ' hct__btn--pass' : ''}`}
          onClick={() => onComplete(done)}
        >
          {done ? 'Done — Pass' : 'Finish Early'}
        </button>
      </div>
    </div>
  );
}

export function AudioTest({ onComplete, onCancel }: TestProps) {
  const [played, setPlayed] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);

  function playTone() {
    hapticTap();
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = ctxRef.current ?? new AudioCtx();
      ctxRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 440;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 1);
      setPlayed(true);
    } catch {
      setPlayed(true);
    }
  }

  useEffect(
    () => () => {
      ctxRef.current?.close().catch(() => {});
    },
    [],
  );

  return (
    <div className="hct__overlay hct__overlay--dark">
      <button type="button" className="hct__close" onClick={onCancel}>
        <Icon name="x" size={22} />
      </button>
      <div className="hct__center">
        <span className="hct__big-icon">
          <Icon name="volume" size={40} />
        </span>
        <p className="hct__hint">Turn your volume up, then play a test tone through the speaker.</p>
        <button type="button" className="hct__btn" onClick={playTone}>
          {played ? 'Play Again' : 'Play Tone'}
        </button>
        {played && (
          <div className="hct__yn">
            <button type="button" className="hct__btn hct__btn--fail" onClick={() => onComplete(false)}>
              Didn't hear it
            </button>
            <button type="button" className="hct__btn hct__btn--pass" onClick={() => onComplete(true)}>
              Heard it clearly
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface CameraTestProps extends TestProps {
  facing: 'user' | 'environment';
}

function CameraTestImpl({ onComplete, onCancel, facing }: CameraTestProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'timeout'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    const timeoutId = window.setTimeout(() => {
      if (!cancelled) setStatus((s) => (s === 'loading' ? 'timeout' : s));
    }, 8000);

    // {ideal: facing} (not a bare string or {exact: facing}) asks for that specific camera
    // without making it a hard requirement — a device that can't satisfy it falls back to
    // whatever camera it has instead of rejecting or hanging, which is what caused the
    // original "stuck on Starting camera forever" bug with a plain facingMode: 'environment'.
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: facing } } })
      .then((stream) => {
        window.clearTimeout(timeoutId);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setStatus('ready');
      })
      .catch(() => {
        window.clearTimeout(timeoutId);
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [attempt, facing]);

  // Runs after the 'ready' render has actually mounted the <video> element — assigning
  // srcObject inside the getUserMedia .then() above was a no-op, because that callback
  // fires before the setStatus('ready') that gates the <video> into existence even
  // renders, so videoRef.current was still null at that point every single time. That's
  // why the preview never showed anything (a broken-media placeholder, stream or not).
  useEffect(() => {
    if (status === 'ready' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [status]);

  function retry() {
    hapticTap();
    setAttempt((a) => a + 1);
  }

  return (
    <div className="hct__overlay hct__overlay--dark">
      <button type="button" className="hct__close" onClick={onCancel}>
        <Icon name="x" size={22} />
      </button>
      <div className="hct__center">
        {status === 'loading' && <p className="hct__hint">Starting camera…</p>}
        {status === 'error' && (
          <>
            <p className="hct__hint">Couldn't start the camera — permission denied or no camera available.</p>
            <div className="hct__yn">
              <button type="button" className="hct__btn" onClick={retry}>
                Try Again
              </button>
              <button type="button" className="hct__btn hct__btn--fail" onClick={() => onComplete(false)}>
                Mark as Failed
              </button>
            </div>
          </>
        )}
        {status === 'timeout' && (
          <>
            <p className="hct__hint">
              This is taking too long. Check that no other app is using the camera, then try again.
            </p>
            <div className="hct__yn">
              <button type="button" className="hct__btn" onClick={retry}>
                Try Again
              </button>
              <button type="button" className="hct__btn hct__btn--fail" onClick={() => onComplete(false)}>
                Mark as Failed
              </button>
            </div>
          </>
        )}
        {status === 'ready' && (
          <>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} autoPlay playsInline muted className={`hct__video${facing === 'user' ? ' hct__video--mirror' : ''}`} />
            <p className="hct__hint">Does the {facing === 'user' ? 'front' : 'rear'} camera preview look clear and focused?</p>
            <div className="hct__yn">
              <button type="button" className="hct__btn hct__btn--fail" onClick={() => onComplete(false)}>
                No
              </button>
              <button type="button" className="hct__btn hct__btn--pass" onClick={() => onComplete(true)}>
                Yes
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function FrontCameraTest(props: TestProps) {
  return <CameraTestImpl {...props} facing="user" />;
}

export function RearCameraTest(props: TestProps) {
  return <CameraTestImpl {...props} facing="environment" />;
}

const SENSOR_DURATION_MS = 6000;
const SENSOR_VARIANCE_THRESHOLD = 1.5;

export function SensorTest({ onComplete, onCancel }: TestProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [detected, setDetected] = useState(false);
  const samplesRef = useRef<number[]>([]);
  const startRef = useRef(Date.now());

  const timedOut = elapsedMs >= SENSOR_DURATION_MS;

  useEffect(() => {
    function handleMotion(e: DeviceMotionEvent) {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const magnitude = Math.sqrt((acc.x ?? 0) ** 2 + (acc.y ?? 0) ** 2 + (acc.z ?? 0) ** 2);
      const samples = samplesRef.current;
      samples.push(magnitude);
      if (samples.length > 30) samples.shift();
      if (samples.length >= 5) {
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
        const variance = samples.reduce((a, b) => a + (b - avg) ** 2, 0) / samples.length;
        if (variance > SENSOR_VARIANCE_THRESHOLD) setDetected(true);
      }
    }
    // iOS only delivers motion events after this permission call, which must come from a tap;
    // this test mounts straight from the "Tap to test" tap. Android has no such gate.
    const requestPermission = (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> })
      .requestPermission;
    if (typeof requestPermission === 'function') {
      requestPermission.call(DeviceMotionEvent).catch(() => {
        // refused or not allowed here: the listener below simply never fires and the test times out
      });
    }
    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setElapsedMs(Date.now() - startRef.current), 200);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (detected) hapticSuccess();
  }, [detected]);

  const progress = useMemo(() => Math.min(1, elapsedMs / SENSOR_DURATION_MS), [elapsedMs]);

  return (
    <div className="hct__overlay hct__overlay--dark">
      <button type="button" className="hct__close" onClick={onCancel}>
        <Icon name="x" size={22} />
      </button>
      <div className="hct__center">
        <span className="hct__big-icon">
          <Icon name="gyroscope" size={40} />
        </span>
        {!detected && !timedOut && (
          <>
            <p className="hct__hint">Gently move or shake your phone to test the motion sensors.</p>
            <div className="hct__sensor-bar">
              <div className="hct__sensor-bar-fill" style={{ width: `${progress * 100}%` }} />
            </div>
          </>
        )}
        {detected && (
          <>
            <p className="hct__hint">Motion detected — sensors are responding.</p>
            <button type="button" className="hct__btn hct__btn--pass" onClick={() => onComplete(true)}>
              Continue
            </button>
          </>
        )}
        {!detected && timedOut && (
          <>
            <p className="hct__hint">No motion detected. Try moving the phone more, or mark as failed.</p>
            <div className="hct__yn">
              <button
                type="button"
                className="hct__btn"
                onClick={() => {
                  samplesRef.current = [];
                  startRef.current = Date.now();
                  setElapsedMs(0);
                }}
              >
                Try Again
              </button>
              <button type="button" className="hct__btn hct__btn--fail" onClick={() => onComplete(false)}>
                Mark as Failed
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
