import { useEffect, useState } from 'react';
import { fillColor } from '../../theme/fill';
import { useBackHandler } from '../../app/useBackHandler';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon, type IconName } from '../../components/Icon';
import { useRouter } from '../../app/Router';
import { DeviceStatsPlugin, type DeviceStats } from '../../device-stats/plugin';
import { DisplayTest, TouchTest, AudioTest, FrontCameraTest, RearCameraTest, SensorTest } from './HealthCheckTests';
import './PhoneCenter.css';
import './HealthCheck.css';

type CheckId =
  | 'battery'
  | 'storage'
  | 'memory'
  | 'connectivity'
  | 'display'
  | 'touch'
  | 'audio'
  | 'frontCamera'
  | 'rearCamera'
  | 'sensors';
type Result = 'checking' | 'pass' | 'fail' | 'untested';

interface CheckDef {
  id: CheckId;
  label: string;
  desc: string;
  icon: IconName;
  interactive: boolean;
}

const CHECKS: CheckDef[] = [
  { id: 'battery', label: 'Battery', desc: 'Battery reading and charging state', icon: 'battery', interactive: false },
  { id: 'storage', label: 'Storage', desc: 'Storage status and space', icon: 'database', interactive: false },
  { id: 'memory', label: 'Memory', desc: 'RAM usage and performance', icon: 'cpu', interactive: false },
  { id: 'display', label: 'Display', desc: 'Screen colors render correctly', icon: 'image', interactive: true },
  { id: 'touch', label: 'Touch', desc: 'Touch response across the screen', icon: 'target', interactive: true },
  { id: 'audio', label: 'Audio', desc: 'Speaker and microphone', icon: 'volume', interactive: true },
  { id: 'frontCamera', label: 'Front Camera', desc: 'Selfie camera preview', icon: 'camera', interactive: true },
  { id: 'rearCamera', label: 'Rear Camera', desc: 'Main camera preview', icon: 'camera', interactive: true },
  { id: 'sensors', label: 'Sensors', desc: 'Gyroscope, accelerometer, etc.', icon: 'gyroscope', interactive: true },
  { id: 'connectivity', label: 'Connectivity', desc: 'Wi-Fi and mobile network', icon: 'wifi', interactive: false },
];

const TEST_COMPONENTS: Partial<Record<CheckId, typeof DisplayTest>> = {
  display: DisplayTest,
  touch: TouchTest,
  audio: AudioTest,
  frontCamera: FrontCameraTest,
  rearCamera: RearCameraTest,
  sensors: SensorTest,
};

export function HealthCheck() {
  const { back } = useRouter();
  const [results, setResults] = useState<Record<CheckId, Result>>({
    battery: 'checking',
    storage: 'checking',
    memory: 'checking',
    connectivity: 'checking',
    display: 'untested',
    touch: 'untested',
    audio: 'untested',
    frontCamera: 'untested',
    rearCamera: 'untested',
    sensors: 'untested',
  });
  const [activeTest, setActiveTest] = useState<CheckId | null>(null);

  function runAutoChecks() {
    setResults((prev) => ({ ...prev, battery: 'checking', storage: 'checking', memory: 'checking', connectivity: 'checking' }));
    DeviceStatsPlugin.getStats()
      .then((stats: DeviceStats) => {
        setResults((prev) => ({
          ...prev,
          battery: stats.batteryPercent >= 0 ? 'pass' : 'fail',
          storage: stats.storageTotalBytes > 0 ? 'pass' : 'fail',
          memory: stats.ramTotalBytes > 0 ? 'pass' : 'fail',
          connectivity: stats.hasInternetConnection ? 'pass' : 'fail',
        }));
      })
      .catch(() => {
        setResults((prev) => ({ ...prev, battery: 'fail', storage: 'fail', memory: 'fail', connectivity: 'fail' }));
      });
  }

  useEffect(() => {
    runAutoChecks();
  }, []);

  useBackHandler(() => setActiveTest(null), activeTest !== null);

  function runAgain() {
    runAutoChecks();
    setResults((prev) => ({
      ...prev,
      display: 'untested',
      touch: 'untested',
      audio: 'untested',
      frontCamera: 'untested',
      rearCamera: 'untested',
      sensors: 'untested',
    }));
  }

  function openTest(id: CheckId) {
    setActiveTest(id);
  }

  function completeTest(id: CheckId, passed: boolean) {
    setResults((prev) => ({ ...prev, [id]: passed ? 'pass' : 'fail' }));
    setActiveTest(null);
  }

  const passedCount = CHECKS.filter((c) => results[c.id] === 'pass').length;
  const failedCount = CHECKS.filter((c) => results[c.id] === 'fail').length;
  const untestedCount = CHECKS.filter((c) => results[c.id] === 'untested').length;
  const testedCount = passedCount + failedCount;
  const stillChecking = CHECKS.some((c) => results[c.id] === 'checking');
  // Ring and headline fraction are out of what's actually been tested, not the full 10 -- an
  // untested camera/sensor check isn't a failure, so it shouldn't drag the score down or make
  // "Everything looks good" and "4/10 passed" contradict each other on screen at the same time.
  const ringPct = testedCount > 0 ? passedCount / testedCount : 0;

  const RING_R = 52;
  const RING_C = 2 * Math.PI * RING_R;

  const ActiveComponent = activeTest ? TEST_COMPONENTS[activeTest] : null;

  return (
    <div className="screen">
      <ScreenHeader title="Phone Health Check" onBack={back} />

      <div className="pc2__body">
        <div className="hc__ring-wrap">
          <svg width="140" height="140" viewBox="0 0 140 140">
            <circle cx="70" cy="70" r={RING_R} fill="none" stroke="var(--bg-active)" strokeWidth="10" />
            <circle
              cx="70"
              cy="70"
              r={RING_R}
              fill="none"
              stroke={fillColor(failedCount === 0 ? 'var(--green)' : 'var(--blue)')}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - ringPct)}
              transform="rotate(-90 70 70)"
            />
          </svg>
          <div className="hc__ring-text">
            <strong>
              {passedCount}/{testedCount}
            </strong>
            <span>Checks Passed</span>
            {untestedCount > 0 && <span className="hc__ring-untested">{untestedCount} not tested</span>}
          </div>
        </div>

        <p className="hc__summary">
          {stillChecking
            ? 'Checking…'
            : failedCount === 0 && untestedCount === 0
              ? "Everything looks good! 🎉"
              : failedCount === 0
                ? `No issues found. ${untestedCount} check${untestedCount === 1 ? '' : 's'} haven't been run yet.`
                : `${failedCount} check${failedCount === 1 ? '' : 's'} need attention${untestedCount > 0 ? `, ${untestedCount} not tested yet` : ''}.`}
        </p>

        <div className="hc__list">
          {CHECKS.map((check) => {
            const result = results[check.id];
            return (
              <button
                key={check.id}
                type="button"
                className="hc__row"
                onClick={() => (check.interactive ? openTest(check.id) : undefined)}
                disabled={!check.interactive}
              >
                <span className="pc2__row-icon">
                  <Icon name={check.icon} size={16} />
                </span>
                <span className="pc2__row-text">
                  <strong>{check.label}</strong>
                  <span>{check.desc}</span>
                </span>
                {result === 'checking' && <span className="hc__badge hc__badge--checking">Checking…</span>}
                {result === 'pass' && (
                  <span className="hc__badge hc__badge--pass">
                    <Icon name="check" size={14} />
                  </span>
                )}
                {result === 'fail' && (
                  <span className="hc__badge hc__badge--fail">
                    <Icon name="x" size={14} />
                  </span>
                )}
                {result === 'untested' && <span className="hc__badge hc__badge--untested">Tap to test</span>}
              </button>
            );
          })}
        </div>

        <button type="button" className="hc__run-again" onClick={runAgain}>
          <Icon name="history" size={16} />
          Run Again
        </button>
      </div>

      {ActiveComponent && (
        <ActiveComponent
          onComplete={(passed) => completeTest(activeTest as CheckId, passed)}
          onCancel={() => setActiveTest(null)}
        />
      )}
    </div>
  );
}
