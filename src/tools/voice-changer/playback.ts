/** Lazy singleton AudioContext for preview playback across every Voice Changer screen — same
 *  pattern as sleep-mode/audioEngine.ts's getContext(), kept out of React state since playback
 *  doesn't need to trigger re-renders, just start/stop calls from whichever screen is active. */
let ctx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function stopPlayback(): void {
  if (currentSource) {
    try {
      currentSource.stop();
    } catch {
      // already stopped — ignore
    }
    currentSource = null;
  }
}

/** ctx.resume() is expected to resolve near-instantly off a real user tap, but nothing in the
 *  spec guarantees it ever settles (a stuck browser/WebView-specific resume is a real, if rare,
 *  failure mode) — racing it against a timeout means a screen's "Preview"/"Continue"/"Apply"
 *  button can never get soft-locked in a permanently-busy state waiting on a promise that never
 *  settles, which would otherwise leave no way forward except leaving the screen. */
function resumeWithTimeout(c: AudioContext, ms = 2000): Promise<void> {
  return Promise.race([c.resume(), new Promise<void>((resolve) => setTimeout(resolve, ms))]);
}

export async function playBuffer(buffer: AudioBuffer, onEnded?: () => void): Promise<void> {
  // The clip being replaced must not report "ended": its callback would land after the new clip
  // has started and reset the screen's playing state, leaving a clip that plays with no way to
  // stop it. (An explicit stopPlayback() still reports, as its callers expect.)
  if (currentSource) currentSource.onended = null;
  stopPlayback();
  const c = getCtx();
  if (c.state === 'suspended') await resumeWithTimeout(c);
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.connect(c.destination);
  source.onended = () => {
    if (currentSource === source) currentSource = null;
    onEnded?.();
  };
  source.start();
  currentSource = source;
}

export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  return getCtx().decodeAudioData(arrayBuffer);
}
