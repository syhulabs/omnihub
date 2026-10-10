import { useState } from 'react';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { Icon } from '../../../components/Icon';
import { hapticTap } from '../../../haptics';
import { renderPitchSpeed } from '../audioEffects';
import { playBuffer, stopPlayback } from '../playback';
import type { VcApi } from '../types';

export function PitchSpeedScreen({ api }: { api: VcApi }) {
  const [semitones, setSemitones] = useState(0);
  const [speedPercent, setSpeedPercent] = useState(100);
  const [isBusy, setIsBusy] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  function stopPreview() {
    stopPlayback();
    setIsPlaying(false);
  }

  async function render() {
    if (!api.original) return null;
    return renderPitchSpeed(api.original, { semitones, speed: speedPercent / 100 });
  }

  async function preview() {
    if (!api.original) return;
    stopPlayback();
    setIsBusy(true);
    try {
      const rendered = await render();
      if (rendered) {
        await playBuffer(rendered, () => setIsPlaying(false));
        setIsPlaying(true);
      }
    } catch {
      // best-effort preview
    } finally {
      setIsBusy(false);
    }
  }

  function handleContinue() {
    if (!api.original) return;
    hapticTap();
    stopPlayback();
    setIsBusy(true);
    render()
      .then((rendered) => {
        if (rendered) api.setResult(rendered, 'Pitch & Speed');
        api.goto('preview');
      })
      .finally(() => setIsBusy(false));
  }

  function reset() {
    hapticTap();
    setSemitones(0);
    setSpeedPercent(100);
  }

  return (
    <div className="screen">
      <ScreenHeader title="Pitch & Speed" subtitle="Fine-tune pitch and playback speed" onBack={api.popBack} />
      <div className="vch__body">
        <div className="vch__field">
          <div className="vch__slider-row">
            <span>Pitch</span>
            <span className="vch__slider-value">
              {semitones > 0 ? '+' : ''}
              {semitones} st
            </span>
          </div>
          <input type="range" className="vch__slider" min={-12} max={12} value={semitones} onChange={(e) => setSemitones(Number(e.target.value))} />
          <div className="vch__slider-labels">
            <span>Lower</span>
            <span>Higher</span>
          </div>
        </div>

        <div className="vch__field">
          <div className="vch__slider-row">
            <span>Speed</span>
            <span className="vch__slider-value">{speedPercent}%</span>
          </div>
          <input
            type="range"
            className="vch__slider"
            min={50}
            max={200}
            value={speedPercent}
            onChange={(e) => setSpeedPercent(Number(e.target.value))}
          />
          <div className="vch__slider-labels">
            <span>Slower</span>
            <span>Faster</span>
          </div>
        </div>

        <button type="button" className="vch__link-btn" onClick={reset}>
          Reset to normal
        </button>

        <div className="vch__actions vch__actions--bottom">
          <button type="button" className="vch__action vch__action--secondary" onClick={() => (isPlaying ? stopPreview() : void preview())} disabled={isBusy || !api.original}>
            <Icon name={isPlaying ? 'stop' : 'play'} size={17} />
            Preview
          </button>
          <button type="button" className="vch__action vch__action--primary" onClick={handleContinue} disabled={isBusy || !api.original}>
            <Icon name="check" size={17} />
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
