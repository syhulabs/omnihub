import { useState } from 'react';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { Icon } from '../../../components/Icon';
import { hapticTap, hapticSelect } from '../../../haptics';
import { EFFECTS, type EffectCategory, renderEffect } from '../audioEffects';
import { playBuffer, stopPlayback } from '../playback';
import { ClipCard } from '../ClipCard';
import { EFFECT_IMAGES } from '../../../assets/voice-changer';
import { EFFECT_IMAGES_LIGHT } from '../../../assets/voice-changer/lightIndex';
import { useIsLightTheme } from '../../../theme/useTheme';
import type { VcApi } from '../types';

const CATEGORY_TABS: { id: EffectCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'fun', label: 'Fun' },
  { id: 'character', label: 'Character' },
  { id: 'special', label: 'Special' },
];

export function EffectsScreen({ api }: { api: VcApi }) {
  const isLight = useIsLightTheme();
  const effectImages = isLight ? EFFECT_IMAGES_LIGHT : EFFECT_IMAGES;
  const [category, setCategory] = useState<(typeof CATEGORY_TABS)[number]['id']>('all');
  const [selected, setSelected] = useState('normal');
  const [intensity, setIntensity] = useState(0.5);
  const [isPlaying, setIsPlaying] = useState(false);

  function stopPreview() {
    stopPlayback();
    setIsPlaying(false);
  }
  const [isBusy, setIsBusy] = useState(false);
  const [isPlayingOriginal, setIsPlayingOriginal] = useState(false);

  const visible = category === 'all' ? EFFECTS : EFFECTS.filter((e) => e.category === category);

  async function playOriginal() {
    if (!api.original) return;
    if (isPlayingOriginal) {
      stopPlayback();
      setIsPlayingOriginal(false);
      return;
    }
    setIsPlaying(false);
    await playBuffer(api.original, () => setIsPlayingOriginal(false));
    setIsPlayingOriginal(true);
  }

  async function preview(effectId = selected, effectIntensity = intensity) {
    if (!api.original) return;
    stopPlayback();
    setIsPlayingOriginal(false);
    setIsBusy(true);
    try {
      const rendered = await renderEffect(api.original, effectId, effectIntensity);
      await playBuffer(rendered, () => setIsPlaying(false));
      setIsPlaying(true);
    } catch {
      // best-effort preview — a failure here just means silence, not worth surfacing an error banner
    } finally {
      setIsBusy(false);
    }
  }

  function selectEffect(id: string) {
    hapticSelect();
    setSelected(id);
    void preview(id, intensity);
  }

  function handleContinue() {
    if (!api.original) return;
    hapticTap();
    stopPlayback();
    setIsBusy(true);
    renderEffect(api.original, selected, intensity)
      .then((rendered) => {
        const label = EFFECTS.find((e) => e.id === selected)?.label ?? 'Effect';
        api.setResult(rendered, label);
        api.goto('preview');
      })
      .finally(() => setIsBusy(false));
  }

  return (
    <div className="screen">
      <ScreenHeader title="Voice Effects" subtitle={api.original ? undefined : 'Record or import audio first'} onBack={api.popBack} />
      <div className="vch__body">
        {api.original && (
          <ClipCard label="Original Voice" durationSeconds={api.original.duration} seed="original" isPlaying={isPlayingOriginal} onPlay={() => void playOriginal()} />
        )}

        <div className="vch__chip-row">
          {CATEGORY_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`vch__chip${category === t.id ? ' vch__chip--active' : ''}`}
              onClick={() => setCategory(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="vch__effects">
          {visible.map((effect) => (
            <button
              key={effect.id}
              type="button"
              className={`vch__effect${selected === effect.id ? ' vch__effect--active' : ''}`}
              onClick={() => selectEffect(effect.id)}
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
          <span>Effect Intensity</span>
          <span className="vch__slider-value">{Math.round(intensity * 100)}%</span>
        </div>
        <input
          type="range"
          className="vch__slider"
          min={0}
          max={100}
          value={Math.round(intensity * 100)}
          onChange={(e) => setIntensity(Number(e.target.value) / 100)}
          onPointerUp={() => void preview()}
        />

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
