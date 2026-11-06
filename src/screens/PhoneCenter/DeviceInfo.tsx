import { useEffect, useState } from 'react';
import { isIOS } from '../../platform';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon, type IconName } from '../../components/Icon';
import { useRouter } from '../../app/Router';
import { DeviceStatsPlugin, type DeviceInfo as DeviceInfoStats } from '../../device-stats/plugin';
import './PhoneCenter.css';

function formatGb(bytes: number): string {
  if (!bytes) return '—';
  // One decimal place, not a whole-number round — independently rounding total/used/free to
  // whole GB can make "used + free" visibly not add up to "total" (e.g. 6 + 2 = 8 when the
  // real total is 7.4GB rounding down).
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function formatUptime(ms: number): string {
  if (!ms) return '—';
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function DeviceInfo() {
  const { back } = useRouter();
  const [info, setInfo] = useState<DeviceInfoStats | null>(null);

  useEffect(() => {
    DeviceStatsPlugin.getDeviceInfo()
      .then(setInfo)
      .catch(() => {
        // native plugin unavailable — screen just stays in its loading/placeholder state
      });
  }, []);

  const chip = info?.socModel
    ? `${info.socManufacturer ? `${info.socManufacturer} ` : ''}${info.socModel}`
    : null;

  const rows: { icon: IconName; label: string; value: string }[] = [
    { icon: 'smartphone', label: isIOS ? 'iOS Version' : 'Android Version', value: info?.androidVersion || '—' },
    { icon: 'file', label: 'Build Number', value: info?.buildNumber || '—' },
    { icon: 'smartphone', label: 'Model', value: info?.deviceModel || '—' },
    ...(info && info.screenWidthPx
      ? [{ icon: 'image' as IconName, label: 'Screen Resolution', value: `${info.screenWidthPx} × ${info.screenHeightPx}` }]
      : []),
    ...(info?.refreshRateHz ? [{ icon: 'activity' as IconName, label: 'Refresh Rate', value: `${info.refreshRateHz} Hz` }] : []),
    ...(info?.screenSizeInches ? [{ icon: 'image' as IconName, label: 'Screen Size', value: `${info.screenSizeInches} inches` }] : []),
    ...(chip ? [{ icon: 'cpu' as IconName, label: 'Chipset', value: chip }] : []),
    { icon: 'cpu', label: 'RAM', value: info ? formatGb(info.ramTotalBytes) : '—' },
    { icon: 'database', label: 'Storage', value: info ? formatGb(info.storageTotalBytes) : '—' },
    { icon: 'clock', label: 'Uptime', value: info ? formatUptime(info.uptimeMillis) : '—' },
  ];

  return (
    <div className="screen">
      <ScreenHeader title="Device Information" onBack={back} />

      <div className="pc2__body">
        <div className="pc2__hero">
          <span className="pc2__hero-icon">
            <Icon name="smartphone" size={26} />
          </span>
          <div className="pc2__hero-text">
            <span>{info?.manufacturer && info.manufacturer !== 'Browser' ? info.manufacturer : 'My Phone'}</span>
            <strong>{info?.deviceModel ?? 'Your device'}</strong>
          </div>
        </div>

        <div className="di__list">
          {rows.map((row) => (
            <div key={row.label} className="di__row">
              <span className="pc2__row-icon">
                <Icon name={row.icon} size={16} />
              </span>
              <span className="di__row-label">{row.label}</span>
              <span className="di__row-value">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
