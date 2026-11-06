import { useEffect, useState } from 'react';
import { Haptics } from '@capacitor/haptics';
import { isIOS } from '../../platform';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon, type IconName } from '../../components/Icon';
import { useRouter } from '../../app/Router';
import { DeviceStatsPlugin, type DeviceStats } from '../../device-stats/plugin';
import './PhoneCenter.css';

const QUICK_ACTIONS: { id: string; label: string; icon: IconName; color: string }[] = [
  { id: 'flashlight', label: 'Flashlight', icon: 'flashlight', color: 'var(--orange)' },
  { id: 'wifi', label: 'Wi-Fi', icon: 'wifi', color: 'var(--blue)' },
  { id: 'sound', label: 'Sound', icon: 'volume', color: 'var(--green)' },
  { id: 'vibrate', label: 'Vibrate', icon: 'zap', color: 'var(--red)' },
  { id: 'more', label: 'More', icon: 'more-dots', color: 'var(--text-secondary)' },
];

// iOS only lets an app open its own Settings page, so the Wi-Fi and Sound panels have no equivalent there.
const QUICK_ACTIONS_FOR_PLATFORM = isIOS ? QUICK_ACTIONS.filter((a) => a.id !== 'wifi' && a.id !== 'sound') : QUICK_ACTIONS;

function formatGb(bytes: number): string {
  if (!bytes) return '—';
  // One decimal place, not a whole-number round — independently rounding total/used/free to
  // whole GB can make "used + free" visibly not add up to "total" (e.g. 6 + 2 = 8 when the
  // real total is 7.4GB rounding down).
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function statusFor(stats: DeviceStats | null): { tone: 'good' | 'warn'; text: string } {
  if (!stats) return { tone: 'good', text: 'Checking device…' };
  if (stats.batteryPercent >= 0 && stats.batteryPercent <= 15 && !stats.isCharging) {
    return { tone: 'warn', text: 'Battery is low' };
  }
  if (stats.storageTotalBytes > 0 && stats.storageFreeBytes / stats.storageTotalBytes < 0.1) {
    return { tone: 'warn', text: 'Storage is almost full' };
  }
  return { tone: 'good', text: 'Everything looks good' };
}

export function PhoneCenter() {
  const { back, navigate } = useRouter();
  const [stats, setStats] = useState<DeviceStats | null>(null);

  useEffect(() => {
    DeviceStatsPlugin.getStats()
      .then(setStats)
      .catch(() => {
        // native plugin unavailable — screen just stays in its loading/placeholder state
      });
  }, []);

  function runQuickAction(id: string) {
    // No hapticTap() here: App.tsx already buzzes every button press once.
    if (id === 'flashlight') navigate('/tools/flashlight');
    else if (id === 'wifi') DeviceStatsPlugin.openWifiPanel().catch(() => {});
    else if (id === 'sound') DeviceStatsPlugin.openSoundPanel().catch(() => {});
    else if (id === 'vibrate') Haptics.vibrate({ duration: 400 }).catch(() => {}); // a real test buzz, even with haptic feedback off
    else if (id === 'more') DeviceStatsPlugin.openAppSettings().catch(() => {});
  }

  const status = statusFor(stats);
  const storageUsedPct = stats && stats.storageTotalBytes > 0
    ? Math.round(((stats.storageTotalBytes - stats.storageFreeBytes) / stats.storageTotalBytes) * 100)
    : 0;
  const ramUsedBytes = stats ? stats.ramTotalBytes - stats.ramAvailBytes : 0;
  const ramUsedPct = stats && stats.ramTotalBytes > 0 ? Math.round((ramUsedBytes / stats.ramTotalBytes) * 100) : 0;

  return (
    <div className="screen">
      <ScreenHeader title="Phone Center" onBack={back} />

      <div className="pc2__body">
        <div className="pc2__hero">
          <span className="pc2__hero-icon">
            <Icon name="smartphone" size={26} />
          </span>
          <div className="pc2__hero-text">
            <span>{stats?.manufacturer && stats.manufacturer !== 'Browser' ? stats.manufacturer : 'My Phone'}</span>
            <strong>{stats?.deviceModel ?? 'Your device'}</strong>
            <span className={`pc2__status pc2__status--${status.tone}`}>
              <span className="pc2__status-dot" />
              {status.text}
            </span>
          </div>
        </div>

        <div className="pc2__grid">
          <div className="pc2__card">
            <div className="pc2__card-head">
              <span className="pc2__card-icon pc2__card-icon--blue">
                <Icon name="battery" size={16} />
              </span>
              <span>Battery</span>
            </div>
            <strong className="pc2__card-value">{stats && stats.batteryPercent >= 0 ? `${stats.batteryPercent}%` : '—'}</strong>
            <span className="pc2__card-sub">{stats?.isCharging ? 'Charging' : 'Not charging'}</span>
            <div className="pc2__bar">
              <div className="pc2__bar-fill" style={{ width: `${Math.max(0, stats?.batteryPercent ?? 0)}%` }} />
            </div>
            {!!stats?.batteryTempC && (
              <span className="pc2__card-foot">
                <Icon name="activity" size={12} />
                {stats.batteryTempC.toFixed(0)}°C
              </span>
            )}
          </div>

          <button type="button" className="pc2__card pc2__card--tappable" onClick={() => navigate('/storage-details')}>
            <div className="pc2__card-head">
              <span className="pc2__card-icon pc2__card-icon--purple">
                <Icon name="database" size={16} />
              </span>
              <span>Storage</span>
              <Icon name="chevron-right" size={14} className="pc2__card-chevron" />
            </div>
            <strong className="pc2__card-value">{stats ? formatGb(stats.storageFreeBytes) : '—'}</strong>
            <span className="pc2__card-sub">Free / {stats ? formatGb(stats.storageTotalBytes) : '—'}</span>
            <div className="pc2__bar">
              <div className="pc2__bar-fill pc2__bar-fill--purple" style={{ width: `${storageUsedPct}%` }} />
            </div>
          </button>

          <div className="pc2__card">
            <div className="pc2__card-head">
              <span className="pc2__card-icon pc2__card-icon--orange">
                <Icon name="cpu" size={16} />
              </span>
              <span>Memory (RAM)</span>
            </div>
            <strong className="pc2__card-value">{stats ? formatGb(stats.ramTotalBytes) : '—'}</strong>
            <span className="pc2__card-sub">Total RAM</span>
            <div className="pc2__bar">
              <div className="pc2__bar-fill pc2__bar-fill--orange" style={{ width: `${ramUsedPct}%` }} />
            </div>
            {!!stats?.ramAvailBytes && (
              <span className="pc2__card-foot">{formatGb(ramUsedBytes)} used · {formatGb(stats.ramAvailBytes)} free</span>
            )}
          </div>

          <div className="pc2__card">
            <div className="pc2__card-head">
              <span className="pc2__card-icon pc2__card-icon--green">
                <Icon name="wifi" size={16} />
              </span>
              <span>Connection</span>
            </div>
            <div className="pc2__conn-row">
              <strong className="pc2__card-value">
                {stats?.wifiConnected ? 'Wi-Fi' : stats?.hasInternetConnection ? 'Mobile data' : 'Off'}
              </strong>
              {stats?.wifiConnected && (stats?.wifiSignalBars ?? -1) >= 0 && (
                <span className="pc2__signal" aria-label={`Signal strength ${stats.wifiSignalBars} of 4`}>
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className={`pc2__signal-bar${i < stats.wifiSignalBars ? ' pc2__signal-bar--on' : ''}`} />
                  ))}
                </span>
              )}
            </div>
            <span className="pc2__card-sub">
              {stats?.wifiConnected ? 'Connected' : stats?.hasInternetConnection ? 'Connected' : 'Not connected'}
            </span>
            {!!stats?.ipAddress && <span className="pc2__card-foot">{stats.ipAddress}</span>}
            {!!(stats?.wifiRxMbps || stats?.wifiTxMbps) && (
              <span className="pc2__card-foot">
                ↓{stats.wifiRxMbps} · ↑{stats.wifiTxMbps} Mbps
              </span>
            )}
          </div>
        </div>

        <div className="pc2__health-card">
          <span className="pc2__health-icon">
            <Icon name="heart" size={22} />
          </span>
          <strong>Phone Health Check</strong>
          <span>Test your phone's hardware and system</span>
          <button type="button" className="pc2__health-btn" onClick={() => navigate('/health-check')}>
            Run Health Check
            <Icon name="chevron-right" size={16} />
          </button>
        </div>

        <button type="button" className="pc2__row" onClick={() => navigate('/device-info')}>
          <span className="pc2__row-icon">
            <Icon name="info" size={18} />
          </span>
          <span className="pc2__row-text">
            <strong>Device Information</strong>
            <span>OS version, build, screen, chip and more</span>
          </span>
          <Icon name="chevron-right" size={18} className="pc2__row-chevron" />
        </button>

        <div className="pc2__quick">
          <span className="pc2__quick-title">Quick Actions</span>
          <div className="pc2__quick-grid" style={{ gridTemplateColumns: `repeat(${QUICK_ACTIONS_FOR_PLATFORM.length}, 1fr)` }}>
            {QUICK_ACTIONS_FOR_PLATFORM.map((action) => (
              <button
                key={action.id}
                type="button"
                className="pc2__quick-item"
                onClick={() => runQuickAction(action.id)}
              >
                <span className="pc2__quick-icon" style={{ '--quick-color': action.color } as React.CSSProperties}>
                  <Icon name={action.icon} size={18} />
                </span>
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
