import { useEffect, useRef } from 'react';
import { Icon } from '../../components/Icon';
import { hapticSelect } from '../../haptics';
import { useDeviceOrientation } from './useDeviceOrientation';
import './LevelView.css';

const FLAT_THRESHOLD_DEG = 1.5;
const MAX_TILT_DEG = 45; // tilt beyond this saturates the bubble at the edge of the guide ring

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function LevelView() {
  const { status: orientationStatus, beta, gamma, tiltReady, requestPermission } = useDeviceOrientation();
  // The level only needs tilt. A phone with no magnetometer never reports a heading, and was
  // told it had no tilt sensor either.
  const status = tiltReady ? 'ready' : orientationStatus;
  const wasFlatRef = useRef(false);

  // Normalize beta into the same -90..90 "how far from lying flat" range as gamma, since beta
  // itself spans -180..180 to also describe the phone facing the other way.
  const tiltFrontBack = beta > 90 ? 180 - beta : beta < -90 ? -180 - beta : beta;
  const tiltLeftRight = gamma;

  const isFlat = Math.abs(tiltFrontBack) < FLAT_THRESHOLD_DEG && Math.abs(tiltLeftRight) < FLAT_THRESHOLD_DEG;

  useEffect(() => {
    if (isFlat && !wasFlatRef.current) hapticSelect();
    wasFlatRef.current = isFlat;
  }, [isFlat]);

  const bubbleX = clamp(tiltLeftRight / MAX_TILT_DEG, -1, 1) * 42;
  const bubbleY = clamp(tiltFrontBack / MAX_TILT_DEG, -1, 1) * 42;

  return (
    <div className="lv__body">
      {status === 'checking' && <p className="lv__hint">Finding tilt sensor…</p>}

      {status === 'unavailable' && (
        <>
          <Icon name="info" size={32} className="lv__hint-icon" />
          <p className="lv__hint">This device doesn't have a tilt sensor.</p>
        </>
      )}

      {status === 'denied' && (
        <>
          <Icon name="info" size={32} className="lv__hint-icon" />
          <p className="lv__hint">
            Motion access was turned down. Allow Motion &amp; Orientation for Omni Hub in your phone's Settings, then
            open the Level again.
          </p>
        </>
      )}

      {status === 'needsPermission' && (
        <>
          <p className="lv__hint">Level needs access to motion &amp; orientation sensors.</p>
          <button type="button" className="lv__btn" onClick={requestPermission}>
            Enable Level
          </button>
        </>
      )}

      {status === 'ready' && (
        <>
          <div className={`lv__guide${isFlat ? ' lv__guide--flat' : ''}`}>
            <span className="lv__crosshair lv__crosshair--h" />
            <span className="lv__crosshair lv__crosshair--v" />
            <span
              className="lv__bubble"
              style={{ transform: `translate(${bubbleX}px, ${bubbleY}px)` }}
            />
          </div>
          <p className="lv__status">{isFlat ? 'Flat' : 'Not level'}</p>
          <div className="lv__readouts">
            <div className="lv__readout">
              <span className="lv__readout-label">Front / Back</span>
              <span className="lv__readout-value">{tiltFrontBack.toFixed(1)}°</span>
            </div>
            <div className="lv__readout">
              <span className="lv__readout-label">Left / Right</span>
              <span className="lv__readout-value">{tiltLeftRight.toFixed(1)}°</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
