import { useEffect, useState } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon, type IconName } from '../../components/Icon';
import { useRouter } from '../../app/Router';
import { DeviceStatsPlugin, type DeviceStats, type StorageBreakdown } from '../../device-stats/plugin';
import './PhoneCenter.css';

function formatGb(bytes: number): string {
  if (!bytes) return '0 GB';
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

const CATEGORY_COLORS = {
  audio: 'var(--purple)',
  other: 'var(--blue)',
} as const;

export function StorageDetails() {
  const { back } = useRouter();
  const [stats, setStats] = useState<DeviceStats | null>(null);
  const [breakdown, setBreakdown] = useState<StorageBreakdown | null>(null);
  const [permission, setPermission] = useState<'checking' | 'granted' | 'denied'>('checking');

  useEffect(() => {
    DeviceStatsPlugin.getStats().then(setStats).catch(() => {});
    DeviceStatsPlugin.checkMediaPermission()
      .then(({ granted }) => setPermission(granted ? 'granted' : 'denied'))
      .catch(() => setPermission('denied'));
  }, []);

  useEffect(() => {
    if (permission !== 'granted') return;
    DeviceStatsPlugin.getStorageBreakdown().then(setBreakdown).catch(() => {});
  }, [permission]);

  async function grantAccess() {
    const { granted } = await DeviceStatsPlugin.requestMediaPermission();
    setPermission(granted ? 'granted' : 'denied');
  }

  const usedBytes = stats ? stats.storageTotalBytes - stats.storageFreeBytes : 0;
  const otherBytes = breakdown ? Math.max(0, usedBytes - breakdown.audioBytes) : 0;

  const categories: { key: keyof typeof CATEGORY_COLORS; icon: IconName; label: string; bytes: number; sub: string }[] = breakdown
    ? [
        { key: 'audio', icon: 'music', label: 'Audio', bytes: breakdown.audioBytes, sub: `${breakdown.audioCount.toLocaleString()} audio files` },
        { key: 'other', icon: 'database', label: 'Other', bytes: otherBytes, sub: 'Apps, photos, videos & system files' },
      ]
    : [];

  return (
    <div className="screen">
      <ScreenHeader title="Storage Details" onBack={back} />

      <div className="pc2__body">
        <div className="pc2__hero">
          <span className="pc2__hero-icon pc2__hero-icon--purple">
            <Icon name="database" size={26} />
          </span>
          <div className="pc2__hero-text">
            <span>Total Storage</span>
            <strong>{stats ? formatGb(stats.storageTotalBytes) : '—'}</strong>
            <span className="pc2__card-sub">
              {stats ? `${formatGb(usedBytes)} used · ${formatGb(stats.storageFreeBytes)} free` : '—'}
            </span>
          </div>
        </div>

        {stats && (
          <div className="sd__totalbar">
            {categories.map((c) => (
              <div
                key={c.key}
                className="sd__totalbar-seg"
                style={{ width: `${(c.bytes / stats.storageTotalBytes) * 100}%`, background: CATEGORY_COLORS[c.key] }}
              />
            ))}
          </div>
        )}

        {permission === 'denied' && (
          <div className="sd__permission">
            <Icon name="music" size={22} />
            <strong>See how much space audio uses</strong>
            <span>Grant access to audio files to see how much space your music and recordings take up.</span>
            <button type="button" className="sd__permission-btn" onClick={grantAccess}>
              Grant Access
            </button>
          </div>
        )}

        {permission === 'granted' && breakdown && (
          <div className="sd__list">
            <span className="pc2__quick-title">Storage Breakdown</span>
            {categories.map((c) => (
              <div key={c.key} className="sd__row">
                <span className="pc2__row-icon" style={{ background: `color-mix(in srgb, ${CATEGORY_COLORS[c.key]} 20%, transparent)`, color: CATEGORY_COLORS[c.key] }}>
                  <Icon name={c.icon} size={16} />
                </span>
                <span className="di__row-label">
                  {c.label}
                  <span className="sd__row-sub">{c.sub}</span>
                </span>
                <span className="di__row-value">{formatGb(c.bytes)}</span>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          className="pc2__row"
          onClick={() => DeviceStatsPlugin.openStorageSettings().catch(() => {})}
        >
          <span className="pc2__row-icon">
            <Icon name="settings" size={18} />
          </span>
          <span className="pc2__row-text">
            <strong>Clean Up Storage</strong>
            <span>Opens your device's storage settings to free up space</span>
          </span>
          <Icon name="chevron-right" size={18} className="pc2__row-chevron" />
        </button>
      </div>
    </div>
  );
}
