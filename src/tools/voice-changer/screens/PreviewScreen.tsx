import { useEffect, useState } from 'react';
import { isShareCancel, saveOrShareFile } from '../../../share/saveFile';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { Icon } from '../../../components/Icon';
import { hapticTap, hapticSuccess } from '../../../haptics';
import { audioBufferToWav, audioBufferToMp3 } from '../audioEffects';
import { playBuffer, stopPlayback } from '../playback';
import { saveClip, type SavedClip } from '../clipStorage';
import type { VcApi } from '../types';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function ClipRow({ label, buffer, playingId, id, onPlay }: { label: string; buffer: AudioBuffer; playingId: string | null; id: string; onPlay: (id: string, buffer: AudioBuffer) => void }) {
  const isPlaying = playingId === id;
  return (
    <div className="vch__clip-row">
      <button type="button" className="vch__clip-play" onClick={() => onPlay(id, buffer)}>
        <Icon name={isPlaying ? 'stop' : 'play'} size={16} />
      </button>
      <div className="vch__clip-info">
        <strong>{label}</strong>
        <div className="vch__waveform" aria-hidden="true">
          {Array.from({ length: 28 }).map((_, i) => (
            <span key={i} style={{ '--h': `${20 + Math.abs(Math.sin(i * 1.7 + id.length)) * 80}%` } as React.CSSProperties} />
          ))}
        </div>
        <span className="vch__clip-duration">00:00 · {formatDuration(buffer.duration)}</span>
      </div>
    </div>
  );
}

type ExportFormat = 'mp3' | 'wav';

export function PreviewScreen({ api }: { api: VcApi }) {
  // Leaving this screen stops its clip; it used to keep playing on the next screen with no stop control.
  useEffect(() => () => stopPlayback(), []);
  const [fileName, setFileName] = useState('My Voice');
  const [format, setFormat] = useState<ExportFormat>('mp3');
  const [saveToDevice, setSaveToDevice] = useState(true);
  const [addToHistory, setAddToHistory] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function handlePlay(id: string, buffer: AudioBuffer) {
    if (playingId === id) {
      stopPlayback();
      setPlayingId(null);
      return;
    }
    await playBuffer(buffer, () => setPlayingId(null));
    setPlayingId(id);
  }

  async function handleSave() {
    if (!api.original || !api.processed) return;
    hapticTap();
    stopPlayback();
    setIsBusy(true);
    try {
      const encoded = format === 'mp3' ? audioBufferToMp3(api.processed) : audioBufferToWav(api.processed);
      const name = fileName.trim() || 'My Voice';
      const safeName = `${name}.${format}`;

      if (addToHistory) {
        const clip: SavedClip = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name,
          createdAt: Date.now(),
          durationSeconds: api.processed.duration,
          effectLabel: api.processedLabel,
          blob: encoded,
        };
        await saveClip(clip);
        api.bumpHistoryToken();
        api.setShareClip(clip);
      } else {
        api.setShareClip({
          id: 'unsaved',
          name,
          createdAt: Date.now(),
          durationSeconds: api.processed.duration,
          effectLabel: api.processedLabel,
          blob: encoded,
        });
      }

      if (saveToDevice) {
        try {
          await saveOrShareFile(encoded, safeName, 'Save audio');
        } catch (err) {
          if (!isShareCancel(err)) throw err;
        }
      }

      hapticSuccess();
      api.replace('share');
    } finally {
      setIsBusy(false);
    }
  }

  if (!api.original || !api.processed) {
    return (
      <div className="screen">
        <ScreenHeader title="Preview & Save" onBack={api.popBack} />
        <div className="vch__body vch__body--center">
          <p className="vch__hint">Nothing to preview yet — record or import audio first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <ScreenHeader title="Preview & Save" onBack={api.popBack} />
      <div className="vch__body">
        <ClipRow label="Original Voice" buffer={api.original} id="original" playingId={playingId} onPlay={handlePlay} />
        <ClipRow label={`With Effect (${api.processedLabel})`} buffer={api.processed} id="processed" playingId={playingId} onPlay={handlePlay} />

        <div className="vch__field">
          <label className="vch__label" htmlFor="vch-filename">
            File Name
          </label>
          <input id="vch-filename" type="text" className="vch__text-input" value={fileName} onChange={(e) => setFileName(e.target.value)} maxLength={60} />
        </div>

        <div className="vch__field">
          <label className="vch__label" htmlFor="vch-format">
            Format
          </label>
          <select id="vch-format" className="vch__select" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
            <option value="mp3">MP3 (High Quality)</option>
            <option value="wav">WAV (Lossless)</option>
          </select>
        </div>

        <label className="vch__switch-row">
          <span>
            <Icon name="download" size={16} />
            Save to Device
          </span>
          <input type="checkbox" checked={saveToDevice} onChange={(e) => setSaveToDevice(e.target.checked)} />
          <span className="vch__toggle-track" />
        </label>

        <label className="vch__switch-row">
          <span>
            <Icon name="history" size={16} />
            Add to History
          </span>
          <input type="checkbox" checked={addToHistory} onChange={(e) => setAddToHistory(e.target.checked)} />
          <span className="vch__toggle-track" />
        </label>

        <button type="button" className="vch__action vch__action--primary vch__action--full" onClick={() => void handleSave()} disabled={isBusy}>
          <Icon name="download" size={17} />
          {isBusy ? 'Saving…' : 'Save Audio'}
        </button>
      </div>
    </div>
  );
}
