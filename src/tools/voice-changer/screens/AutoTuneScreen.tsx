import { useState } from 'react';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { Icon } from '../../../components/Icon';
import { hapticTap, hapticSelect } from '../../../haptics';
import { AUTOTUNE_PRESETS, KEY_NAMES, SCALE_INTERVALS, renderAutoTune, type ScaleName } from '../autotune';
import { playBuffer, stopPlayback } from '../playback';
import { heroMicrophone, autoTuneNotes } from '../../../assets/voice-changer';
import { autoTuneNotesLight } from '../../../assets/voice-changer/lightIndex';
import { useIsLightTheme } from '../../../theme/useTheme';
import type { VcApi } from '../types';

const SCALE_NAMES = Object.keys(SCALE_INTERVALS) as ScaleName[];

export function AutoTuneScreen({ api }: { api: VcApi }) {
  const isLight = useIsLightTheme();
  const noteIcon = isLight ? autoTuneNotesLight : autoTuneNotes;
  const [presetId, setPresetId] = useState('pop');
  const [keyRoot, setKeyRoot] = useState(0);
  const [scale, setScale] = useState<ScaleName>('Major');
  const [autoDetect, setAutoDetect] = useState(true);
  const [strength, setStrength] = useState(0.65);
  const [responseSpeed, setResponseSpeed] = useState(0.55);
  const [pitchCorrection, setPitchCorrection] = useState(0);
  const [formant, setFormant] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  function stopPreview() {
    stopPlayback();
    setIsPlaying(false);
  }

  function applyPreset(id: string) {
    hapticSelect();
    setPresetId(id);
    const preset = AUTOTUNE_PRESETS.find((p) => p.id === id);
    if (preset) {
      setStrength(preset.strength);
      setResponseSpeed(preset.responseSpeed);
      setFormant(preset.formant);
    }
  }

  async function render() {
    if (!api.original) return null;
    return renderAutoTune(api.original, {
      keyRoot,
      scale,
      autoDetectKey: autoDetect,
      strength,
      responseSpeed,
      pitchCorrectionSemitones: pitchCorrection,
      formant,
    });
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

  function handleApply() {
    if (!api.original) return;
    hapticTap();
    stopPlayback();
    setIsBusy(true);
    render()
      .then((rendered) => {
        if (rendered) api.setResult(rendered, 'Auto-Tune');
        api.goto('preview');
      })
      .finally(() => setIsBusy(false));
  }

  return (
    <div className="screen">
      <ScreenHeader title="Auto-Tune" subtitle="Fix your pitch, sound like a pro" onBack={api.popBack} />
      <div className="vch__body">
        <div className="vch__at-hero" aria-hidden="true">
          <span className="vch__at-hero-icon">
            <img src={noteIcon} alt="" />
          </span>
          <span className="vch__at-hero-icon vch__at-hero-icon--main">
            <img src={heroMicrophone} alt="" />
          </span>
          <span className="vch__at-hero-icon">
            <img src={noteIcon} alt="" />
          </span>
        </div>

        <div className="vch__section-title-row">
          <span className="vch__section-title">Presets</span>
        </div>
        <div className="vch__preset-row">
          {AUTOTUNE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`vch__preset${presetId === p.id ? ' vch__preset--active' : ''}`}
              onClick={() => applyPreset(p.id)}
            >
              <Icon name="music" size={18} />
              <span>{p.label}</span>
              <small>{p.desc}</small>
            </button>
          ))}
        </div>

        <div className="vch__field-row">
          <span>Key / Scale</span>
          <label className="vch__toggle">
            <span>Auto Detect</span>
            <input type="checkbox" checked={autoDetect} onChange={(e) => setAutoDetect(e.target.checked)} />
            <span className="vch__toggle-track" />
          </label>
        </div>
        <div className="vch__key-row">
          <select className="vch__select" value={keyRoot} onChange={(e) => setKeyRoot(Number(e.target.value))} disabled={autoDetect}>
            {KEY_NAMES.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
          <select className="vch__select" value={scale} onChange={(e) => setScale(e.target.value as ScaleName)}>
            {SCALE_NAMES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <SliderField label="Auto-Tune Strength" value={strength} onChange={setStrength} leftLabel="Natural" rightLabel="Strong" />
        <SliderField label="Response Speed" value={responseSpeed} onChange={setResponseSpeed} leftLabel="Slow" rightLabel="Fast" />
        <SliderField
          label="Pitch Correction"
          value={(pitchCorrection + 12) / 24}
          onChange={(v) => setPitchCorrection(Math.round(v * 24 - 12))}
          leftLabel="Lower"
          rightLabel="Higher"
          display={`${pitchCorrection > 0 ? '+' : ''}${pitchCorrection}`}
        />
        <SliderField
          label="Formant"
          value={(formant + 1) / 2}
          onChange={(v) => setFormant(v * 2 - 1)}
          leftLabel="Deep"
          rightLabel="Bright"
          display={`${Math.round(formant * 100)}`}
        />

        <div className="vch__actions vch__actions--bottom">
          <button type="button" className="vch__action vch__action--secondary" onClick={() => (isPlaying ? stopPreview() : void preview())} disabled={isBusy || !api.original}>
            <Icon name={isPlaying ? 'stop' : 'play'} size={17} />
            Preview
          </button>
          <button type="button" className="vch__action vch__action--primary" onClick={handleApply} disabled={isBusy || !api.original}>
            <Icon name="check" size={17} />
            {isBusy ? 'Processing…' : 'Apply Auto-Tune'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  onChange,
  leftLabel,
  rightLabel,
  display,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  leftLabel: string;
  rightLabel: string;
  display?: string;
}) {
  return (
    <div className="vch__field">
      <div className="vch__slider-row">
        <span>{label}</span>
        <span className="vch__slider-value">{display ?? `${Math.round(value * 100)}%`}</span>
      </div>
      <input
        type="range"
        className="vch__slider"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
      />
      <div className="vch__slider-labels">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}
