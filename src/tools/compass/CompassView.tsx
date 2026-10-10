import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../../components/Icon';
import { hapticSelect } from '../../haptics';
import { useDeviceOrientation } from './useDeviceOrientation';
import { useMotionSensors, type SensorAvailability } from './useMotionSensors';
import type { GeoState } from './useGeolocation';
import type { CompassSettings } from './types';
import { solarAzimuth } from './sunPosition';
import './CompassView.css';

const SHORT_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const FULL_DIRECTIONS = [
  'North',
  'Northeast',
  'East',
  'Southeast',
  'South',
  'Southwest',
  'West',
  'Northwest',
];

const CARDINAL_LABELS: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
const INTERCARDINAL_LABELS: Record<number, string> = { 45: 'NE', 135: 'SE', 225: 'SW', 315: 'NW' };
const NUMBER_DEGREES = [30, 60, 120, 150, 210, 240, 300, 330];
const TICK_DEGREES = Array.from({ length: 36 }, (_, i) => i * 10);
const LETTER_DEGREES = [0, 45, 90, 135, 180, 225, 270, 315];

function octant(heading: number): number {
  return Math.round(heading / 45) % 8;
}

interface CompassViewProps {
  geo: GeoState;
  settings: CompassSettings;
  locked: boolean;
}

export function CompassView({ geo, settings, locked }: CompassViewProps) {
  const { status, heading: liveHeading, requestPermission } = useDeviceOrientation();
  const motion = useMotionSensors();
  const lastOctantRef = useRef<number | null>(null);
  const lockedHeadingRef = useRef(liveHeading);
  if (!locked) lockedHeadingRef.current = liveHeading;
  const heading = locked ? lockedHeadingRef.current : liveHeading;

  // The dial is rotated by a continuous, unwrapped angle: stepping 359 -> 1 would otherwise be
  // animated by the CSS transition as a full -358deg spin the long way round every time the
  // phone crosses north. Each update adds the shortest signed delta instead.
  const dialAngleRef = useRef(heading);
  const lastHeadingRef = useRef(heading);
  if (heading !== lastHeadingRef.current) {
    let delta = heading - lastHeadingRef.current;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    dialAngleRef.current += delta;
    lastHeadingRef.current = heading;
  }
  const dialAngle = dialAngleRef.current;

  useEffect(() => {
    if (!settings.hapticTicks || status !== 'ready' || locked) return;
    const current = octant(heading);
    if (lastOctantRef.current !== null && lastOctantRef.current !== current) hapticSelect();
    lastOctantRef.current = current;
  }, [heading, settings.hapticTicks, status, locked]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const magnetometer: SensorAvailability =
    status === 'ready' ? 'available' : status === 'unavailable' ? 'unavailable' : 'checking';
  const allAvailable = magnetometer === 'available' && motion.gyroscope === 'available' && motion.accelerometer === 'available';
  const anyChecking = magnetometer === 'checking' || motion.gyroscope === 'checking' || motion.accelerometer === 'checking';

  function formatAltitude(meters: number | null): string {
    if (meters === null) return '—';
    return settings.altitudeUnit === 'ft' ? `${Math.round(meters * 3.28084)} ft` : `${Math.round(meters)} m`;
  }

  const sunAz =
    geo.status === 'ready' && geo.coords ? solarAzimuth(now, geo.coords.lat, geo.coords.lng) : null;
  const speedKmh =
    geo.status === 'ready' && geo.coords && geo.coords.speed !== null ? geo.coords.speed * 3.6 : null;

  return (
    <div className="cp__body">
      {status === 'checking' && <p className="cp__hint">Finding compass sensor…</p>}

      {status === 'unavailable' && (
        <>
          <Icon name="info" size={32} className="cp__hint-icon" />
          <p className="cp__hint">This device doesn't have a compass sensor.</p>
        </>
      )}

      {status === 'needsPermission' && (
        <>
          <p className="cp__hint">Compass needs access to motion &amp; orientation sensors.</p>
          <button type="button" className="cp__btn" onClick={requestPermission}>
            Enable Compass
          </button>
        </>
      )}

      {status === 'ready' && (
        <>
          <div className="cp__dial-wrap">
            <div className="cp__dial-backdrop">
              <span className="cp__backdrop-glow" />
              <span className="cp__backdrop-peak cp__backdrop-peak--back" />
              <span className="cp__backdrop-peak cp__backdrop-peak--mid" />
              <span className="cp__backdrop-peak cp__backdrop-peak--front" />
            </div>
            <div className="cp__dial" style={{ transform: `rotate(${-dialAngle}deg)` }}>
              {TICK_DEGREES.map((deg) => (
                <span key={`t${deg}`} className="cp__tick-wrap" style={{ transform: `rotate(${deg}deg)` }}>
                  <span className={`cp__tick${deg % 30 === 0 ? ' cp__tick--major' : ''}`} />
                </span>
              ))}
              {NUMBER_DEGREES.map((deg) => (
                <span key={`n${deg}`} className="cp__tick-wrap" style={{ transform: `rotate(${deg}deg)` }}>
                  <span className="cp__deg-label" style={{ transform: `translateX(-50%) rotate(${dialAngle - deg}deg)` }}>
                    {deg}
                  </span>
                </span>
              ))}
              {LETTER_DEGREES.map((deg) => {
                const label = CARDINAL_LABELS[deg] ?? INTERCARDINAL_LABELS[deg];
                const major = deg % 90 === 0;
                return (
                  <span key={`l${deg}`} className="cp__tick-wrap" style={{ transform: `rotate(${deg}deg)` }}>
                    <span
                      className={`cp__letter${major ? ' cp__letter--major' : ''}${deg === 0 ? ' cp__letter--north' : ''}`}
                      style={{ transform: `translateX(-50%) rotate(${dialAngle - deg}deg)` }}
                    >
                      {label}
                    </span>
                  </span>
                );
              })}
            </div>

            <div className="cp__needle">
              <span className="cp__needle-half cp__needle-half--north" />
              <span className="cp__needle-half cp__needle-half--south" />
              <span className="cp__needle-pivot" />
            </div>
            <span className="cp__pointer" />
          </div>

          <span className="cp__heading">{Math.round(heading)}°</span>
          <span className="cp__direction">{SHORT_DIRECTIONS[octant(heading)]}</span>
          <span className="cp__direction-pill">{FULL_DIRECTIONS[octant(heading)]}</span>
          {locked && (
            <span className="cp__lock-pill">
              <Icon name="lock" size={12} /> Direction locked
            </span>
          )}

          <div className="cp__quick-stats">
            <StatCard
              icon="sunrise"
              label="Sun Direction"
              value={sunAz !== null ? `${Math.round(sunAz)}° ${SHORT_DIRECTIONS[octant(sunAz)]}` : '—'}
            />
            <StatCard
              icon="activity"
              label="Speed"
              value={speedKmh !== null ? `${speedKmh.toFixed(1)} km/h` : '—'}
              sublabel={speedKmh !== null && speedKmh > 0.5 ? 'Moving' : 'Stationary'}
            />
          </div>

          <div className="cp__stats">
            <StatCard
              icon="pin"
              label="Your Location"
              value={
                geo.status === 'ready' && geo.coords
                  ? `${Math.abs(geo.coords.lat).toFixed(4)}° ${geo.coords.lat >= 0 ? 'N' : 'S'}\n${Math.abs(geo.coords.lng).toFixed(4)}° ${geo.coords.lng >= 0 ? 'E' : 'W'}`
                  : geoStatusLabel(geo.status)
              }
            />
            <StatCard
              icon="mountain"
              label="Altitude"
              value={geo.status === 'ready' && geo.coords ? formatAltitude(geo.coords.altitude) : '—'}
            />
            <StatCard
              icon="target"
              label="Accuracy"
              value={geo.status === 'ready' && geo.coords ? `± ${Math.round(geo.coords.accuracy)} m` : '—'}
            />
          </div>

          <div className="cp__sensor-panel">
            <div className="cp__sensor-header">
              <span>Sensor Status</span>
              <span className={`cp__sensor-overall${allAvailable ? ' cp__sensor-overall--ok' : ''}`}>
                <span className="cp__sensor-dot" />
                {anyChecking ? 'Checking…' : allAvailable ? 'All systems operational' : 'Some sensors unavailable'}
              </span>
            </div>
            <div className="cp__sensor-row">
              <SensorChip icon="magnet" label="Magnetometer" state={magnetometer} />
              <SensorChip icon="gyroscope" label="Gyroscope" state={motion.gyroscope} />
              <SensorChip icon="activity" label="Accelerometer" state={motion.accelerometer} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function geoStatusLabel(status: GeoState['status']): string {
  switch (status) {
    case 'checking':
      return 'Locating…';
    case 'denied':
      return 'Permission denied';
    case 'unavailable':
      return 'Unavailable';
    default:
      return '—';
  }
}

function StatCard({
  icon,
  label,
  value,
  sublabel,
}: {
  icon: IconName;
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="cp__stat-card">
      <Icon name={icon} size={18} className="cp__stat-icon" />
      <span className="cp__stat-value">{value}</span>
      <span className="cp__stat-label">{label}</span>
      {sublabel && <span className="cp__stat-sublabel">{sublabel}</span>}
    </div>
  );
}

function SensorChip({ icon, label, state }: { icon: IconName; label: string; state: SensorAvailability }) {
  return (
    <div className={`cp__sensor-chip cp__sensor-chip--${state}`}>
      <span className="cp__sensor-chip-icon">
        <Icon name={icon} size={18} />
      </span>
      <span className="cp__sensor-chip-label">{label}</span>
      <span className="cp__sensor-chip-state">
        {state === 'checking' ? 'Checking…' : state === 'available' ? 'Available' : 'Unavailable'}
      </span>
    </div>
  );
}
