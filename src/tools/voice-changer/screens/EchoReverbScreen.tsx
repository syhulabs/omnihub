import { useState } from 'react';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { Icon } from '../../../components/Icon';
import { hapticTap } from '../../../haptics';
import { renderEchoReverb } from '../audioEffects';
import { playBuffer, stopPlayback } from '../playback';
import type { VcApi } from '../types';

export function EchoReverbScreen({ api }: { api: VcApi }) {
  const [delayTime, setDelayTime] = useState(0.25);
  const [feedback, setFeedback] = useState(0.35);
  const [echoMix, setEchoMix] = useState(0.3);
  const [reverbDecay, setReverbDecay] = useState(1.2);
  const [reverbMix, setReverbMix] = useState(0.25);
  const [isBusy, setIsBusy] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  function stopPreview() {
    stopPlayback();
    setIsPlaying(false);
  }

  async function render() {
    if (!api.original) return null;
    return renderEchoReverb(api.original, {
      delayTime,
      feedback,
      echoMix,
      reverbDecaySeconds: reverbDecay,
      reverbMix,
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

  function handleContinue() {
    if (!api.original) return;
    hapticTap();
    stopPlayback();
    setIsBusy(true);
    render()
      .then((rendered) => {
        if (rendered) api.setResult(rendered, 'Echo & Reverb');
        api.goto('preview');
      })
      .finally(() => setIsBusy(false));
  }

  return (
    <div className="screen">
      <ScreenHeader title="Echo & Reverb" subtitle="Studio-style space and depth" onBack={api.popBack} />
      <div className="vch__body">
        <div className="vch__section-title-row">
          <Icon name="repeat" size={15} />
          <span className="vch__section-title">Echo</span>
        </div>
        <div className="vch__field">
          <div className="vch__slider-row">
            <span>Delay Time</span>
            <span className="vch__slider-value">{Math.round(delayTime * 1000)}ms</span>
          </div>
          <input type="range" className="vch__slider" min={50} max={600} value={Math.round(delayTime * 1000)} onChange={(e) => setDelayTime(Number(e.target.value) / 1000)} />
        </div>
        <div className="vch__field">
          <div className="vch__slider-row">
            <span>Feedback</span>
            <span className="vch__slider-value">{Math.round(feedback * 100)}%</span>
          </div>
          <input type="range" className="vch__slider" min={0} max={80} value={Math.round(feedback * 100)} onChange={(e) => setFeedback(Number(e.target.value) / 100)} />
        </div>
        <div className="vch__field">
          <div className="vch__slider-row">
            <span>Echo Mix</span>
            <span className="vch__slider-value">{Math.round(echoMix * 100)}%</span>
          </div>
          <input type="range" className="vch__slider" min={0} max={100} value={Math.round(echoMix * 100)} onChange={(e) => setEchoMix(Number(e.target.value) / 100)} />
        </div>

        <div className="vch__section-title-row">
          <Icon name="music" size={15} />
          <span className="vch__section-title">Reverb</span>
        </div>
        <div className="vch__field">
          <div className="vch__slider-row">
            <span>Room Size / Decay</span>
            <span className="vch__slider-value">{reverbDecay.toFixed(1)}s</span>
          </div>
          <input type="range" className="vch__slider" min={20} max={300} value={Math.round(reverbDecay * 100)} onChange={(e) => setReverbDecay(Number(e.target.value) / 100)} />
        </div>
        <div className="vch__field">
          <div className="vch__slider-row">
            <span>Reverb Mix</span>
            <span className="vch__slider-value">{Math.round(reverbMix * 100)}%</span>
          </div>
          <input type="range" className="vch__slider" min={0} max={100} value={Math.round(reverbMix * 100)} onChange={(e) => setReverbMix(Number(e.target.value) / 100)} />
        </div>

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
