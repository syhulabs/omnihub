import { useState } from 'react';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { Icon } from '../../../components/Icon';
import { hapticTap, hapticSelect } from '../../../haptics';
import { EFFECTS, renderEffects } from '../audioEffects';
import { playBuffer, stopPlayback } from '../playback';
import { EFFECT_IMAGES } from '../../../assets/voice-changer';
import { EFFECT_IMAGES_LIGHT } from '../../../assets/voice-changer/lightIndex';
import { useIsLightTheme } from '../../../theme/useTheme';
import type { VcApi } from '../types';

const MIXABLE = EFFECTS.filter((e) => e.id !== 'normal');

export function MixerScreen({ api }: { api: VcApi }) {
  const isLight = useIsLightTheme();
  const effectImages = isLight ? EFFECT_IMAGES_LIGHT : EFFECT_IMAGES;
  const [selected, setSelected] = useState<string[]>([]);
  const [intensity, setIntensity] = useState(0.5);
  const [isBusy, setIsBusy] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  function stopPreview() {
    stopPlayback();
    setIsPlaying(false);
  }

  function toggleEffect(id: string) {
    hapticSelect();
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function render() {
    if (!api.original || selected.length === 0) return null;
    return renderEffects(api.original, selected, intensity);
  }

  async function preview() {
    if (!api.original || selected.length === 0) return;
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
    if (!api.original || selected.length === 0) return;
    hapticTap();
    stopPlayback();
    setIsBusy(true);
    render()
      .then((rendered) => {
        if (rendered) {
          const labels = selected.map((id) => MIXABLE.find((e) => e.id === id)?.label ?? id);
          api.setResult(rendered, labels.join(' + '));
        }
        api.goto('preview');
      })
      .finally(() => setIsBusy(false));
  }

  return (
    <div className="screen">
      <ScreenHeader title="Voice Mixer" subtitle="Combine multiple effects at once" onBack={api.popBack} />
      <div className="vch__body">
        <p className="vch__hint vch__hint--left">Tap to select two or more effects to layer together.</p>

        <div className="vch__effects">
          {MIXABLE.map((effect) => (
            <button
              key={effect.id}
              type="button"
              className={`vch__effect${selected.includes(effect.id) ? ' vch__effect--active' : ''}`}
              onClick={() => toggleEffect(effect.id)}
              disabled={!api.original}
              style={{ '--effect-color': effect.color } as React.CSSProperties}
            >
              <span className="vch__effect-icon" aria-hidden="true">
                <img src={effectImages[effect.id]} alt="" />
              </span>
              <span>{effect.label}</span>
            </button>
          ))}
        </div>

        <div className="vch__slider-row">
          <span>Mix Intensity</span>
          <span className="vch__slider-value">{Math.round(intensity * 100)}%</span>
        </div>
        <input
          type="range"
          className="vch__slider"
          min={0}
          max={100}
          value={Math.round(intensity * 100)}
          onChange={(e) => setIntensity(Number(e.target.value) / 100)}
        />

        <div className="vch__actions vch__actions--bottom">
          <button
            type="button"
            className="vch__action vch__action--secondary"
            onClick={() => (isPlaying ? stopPreview() : void preview())}
            disabled={isBusy || !api.original || selected.length === 0}
          >
            <Icon name={isPlaying ? 'stop' : 'play'} size={17} />
            Preview
          </button>
          <button
            type="button"
            className="vch__action vch__action--primary"
            onClick={handleContinue}
            disabled={isBusy || !api.original || selected.length === 0}
          >
            <Icon name="check" size={17} />
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
