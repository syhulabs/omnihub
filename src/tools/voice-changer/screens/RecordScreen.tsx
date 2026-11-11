import { useEffect, useRef, useState } from 'react';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { Icon } from '../../../components/Icon';
import { hapticTap } from '../../../haptics';
import { decodeBlob } from '../playback';
import type { VcApi } from '../types';

/** Keeps recordings (and later processing time — Auto-Tune's analysis is the slowest consumer)
 *  quick and the exported file small. */
const MAX_RECORD_MS = 30_000;

function formatSeconds(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function RecordScreen({ api }: { api: VcApi }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [levels, setLevels] = useState<number[]>(() => Array(28).fill(8));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const autoStopRef = useRef<number | null>(null);
  const analyserCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const tickRef = useRef<(() => void) | null>(null);

  const unmountedRef = useRef(false);
  useEffect(
    () => () => {
      // Stopping the tracks makes the recorder fire `stop`; the handler below must then do
      // nothing, or backing out of a recording would navigate the user to Effects anyway.
      unmountedRef.current = true;
      if (mediaRecorderRef.current) mediaRecorderRef.current.onstop = null;
      if (autoStopRef.current) window.clearTimeout(autoStopRef.current);
      stopStream();
      clearTimer();
      stopVisualizer();
    },
    [],
  );

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function startVisualizer(stream: MediaStream) {
    const ctx = new AudioContext();
    analyserCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const BARS = 28;
    const step = Math.max(1, Math.floor(data.length / BARS));

    function tick() {
      analyser.getByteFrequencyData(data);
      const next: number[] = [];
      for (let i = 0; i < BARS; i++) next.push(Math.max(8, (data[i * step] / 255) * 100));
      setLevels(next);
      rafRef.current = requestAnimationFrame(tick);
    }
    tickRef.current = tick;
    tick();
  }

  function pauseVisualizerLoop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  function resumeVisualizerLoop() {
    if (tickRef.current && analyserRef.current) tickRef.current();
  }

  function stopVisualizer() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    tickRef.current = null;
    analyserRef.current = null;
    void analyserCtxRef.current?.close().catch(() => {});
    analyserCtxRef.current = null;
    setLevels(Array(28).fill(8));
  }

  function clearTimer() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }

  const startingRef = useRef(false);

  async function startRecording() {
    // A second tap while the permission prompt or the mic is still opening would start a second
    // stream and recorder; the first stream was then never stopped and the mic stayed on.
    if (startingRef.current || mediaRecorderRef.current?.state === 'recording') return;
    startingRef.current = true;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (unmountedRef.current) {
        // The user left while the permission prompt was up: don't keep the mic open.
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => void handleStopped();

      recorder.start();
      startVisualizer(stream);
      hapticTap();
      setIsRecording(true);
      setIsPaused(false);
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      timerRef.current = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 100);
      autoStopRef.current = window.setTimeout(() => stopRecording(), MAX_RECORD_MS);
    } catch {
      setError("Couldn't access the microphone — check that Omni Hub has microphone permission.");
    } finally {
      startingRef.current = false;
    }
  }

  function togglePause() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    hapticTap();
    if (isPaused) {
      recorder.resume();
      resumeVisualizerLoop();
      // Resuming shifts the "start" reference forward so elapsedMs keeps counting from where it
      // was frozen, rather than jumping to include the paused interval.
      startedAtRef.current = Date.now() - elapsedMs;
      timerRef.current = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 100);
      // The max-duration cutoff is a cap on actual recorded content, not wall-clock session time —
      // without this, time spent paused would silently eat into it, auto-stopping a session with
      // less audio than MAX_RECORD_MS ever actually captured.
      autoStopRef.current = window.setTimeout(() => stopRecording(), MAX_RECORD_MS - elapsedMs);
    } else {
      recorder.pause();
      pauseVisualizerLoop();
      clearTimer();
      if (autoStopRef.current) {
        window.clearTimeout(autoStopRef.current);
        autoStopRef.current = null;
      }
    }
    setIsPaused((p) => !p);
  }

  function stopRecording() {
    clearTimer();
    stopVisualizer();
    if (autoStopRef.current) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    hapticTap();
    setIsRecording(false);
    mediaRecorderRef.current?.stop();
  }

  async function handleStopped() {
    stopStream();
    if (unmountedRef.current) return;
    setIsBusy(true);
    try {
      const blob = new Blob(chunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' });
      const buffer = await decodeBlob(blob);
      api.setOriginal(buffer);
      const dest = api.pendingScreen ?? 'effects';
      api.setPendingScreen(null);
      api.replace(dest);
    } catch {
      setError("Couldn't process that recording — give it another try.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="screen">
      <ScreenHeader title="Recording" onBack={api.popBack} />
      <div className="vch__body vch__body--center">
        {error && (
          <div className="vch__error">
            <Icon name="info" size={16} />
            <span>{error}</span>
          </div>
        )}

        {!isRecording ? (
          <>
            <button type="button" className="vch__record-btn" onClick={() => void startRecording()} disabled={isBusy} aria-label="Start recording">
              <Icon name="mic" size={36} />
            </button>
            <p className="vch__hint">{isBusy ? 'Processing…' : 'Tap to start recording'}</p>
          </>
        ) : (
          <>
            <p className="vch__timer">
              {!isPaused && <span className="vch__rec-dot" />}
              {formatSeconds(elapsedMs)}
            </p>
            <div className="vch__pulse-wrap">
              {!isPaused && <span className="vch__pulse-ring" />}
              <button type="button" className="vch__record-btn vch__record-btn--active" onClick={stopRecording} aria-label="Stop recording">
                <Icon name="mic" size={36} />
              </button>
            </div>
            <div className="vch__waveform vch__waveform--live" aria-hidden="true">
              {levels.map((h, i) => (
                <span key={i} style={{ '--h': `${h}%` } as React.CSSProperties} />
              ))}
            </div>
            <p className="vch__hint">{isPaused ? 'Paused.' : 'Recording…'} Tap Stop when done</p>

            <div className="vch__actions">
              <button type="button" className="vch__action vch__action--secondary" onClick={togglePause}>
                <Icon name={isPaused ? 'play' : 'pause'} size={17} />
                {isPaused ? 'Resume' : 'Pause'}
              </button>
              <button type="button" className="vch__action vch__action--danger" onClick={stopRecording}>
                <Icon name="stop" size={17} />
                Stop
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
