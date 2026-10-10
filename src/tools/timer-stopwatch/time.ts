export function pad(n: number, width = 2): string {
  return n.toString().padStart(width, '0');
}

export function formatClock(ms: number, showHours: boolean): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (showHours || hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/** "MM:SS.cc"; with `wrapHours` the minutes roll over at 60 for a display that shows hours separately. */
export function formatStopwatch(ms: number, wrapHours = false): string {
  const totalMs = Math.max(0, ms);
  const minutes = wrapHours ? Math.floor((totalMs % 3600000) / 60000) : Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const centis = Math.floor((totalMs % 1000) / 10);
  return `${pad(minutes)}:${pad(seconds)}.${pad(centis)}`;
}

export function playBeep() {
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.6);
    oscillator.onended = () => ctx.close();
  } catch {
    // audio unavailable — ignore
  }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}
