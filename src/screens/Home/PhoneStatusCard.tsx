import { useEffect, useRef, useState } from 'react';
import { useBackHandler } from '../../app/useBackHandler';
import { Icon } from '../../components/Icon';
import { DeviceStatsPlugin, type DeviceStats } from '../../device-stats/plugin';
import './PhoneStatusCard.css';

interface PhoneStatusCardProps {
  atTop: boolean;
  onHide: () => void;
  onTogglePosition: () => void;
  onOpen: () => void;
}

function formatGb(bytes: number): string {
  if (!bytes) return '—';
  return `${Math.round(bytes / 1024 ** 3)} GB`;
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

export function PhoneStatusCard({ atTop, onHide, onTogglePosition, onOpen }: PhoneStatusCardProps) {
  const [stats, setStats] = useState<DeviceStats | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useBackHandler(() => setMenuOpen(false), menuOpen);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    DeviceStatsPlugin.getStats()
      .then(setStats)
      .catch(() => {
        // native plugin unavailable — card just stays in its loading/placeholder state
      });
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onOutside(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    window.addEventListener('pointerdown', onOutside);
    return () => window.removeEventListener('pointerdown', onOutside);
  }, [menuOpen]);

  const status = statusFor(stats);

  return (
    <div className="phc">
      <div className="phc__head">
        <button type="button" className="phc__head-tap" onClick={onOpen}>
          <span className="phc__icon">
            <Icon name="smartphone" size={20} />
          </span>
          <div className="phc__head-text">
            <span className="phc__eyebrow">My Phone</span>
            <strong>{stats?.deviceModel ?? 'Your device'}</strong>
            <span className={`phc__status phc__status--${status.tone}`}>
              <span className="phc__status-dot" />
              {status.text}
            </span>
          </div>
        </button>
        <div className="phc__menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="phc__menu-btn"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="My Phone card options"
          >
            <Icon name="more-dots" size={18} />
          </button>
          {menuOpen && (
            <div className="phc__menu">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onHide();
                }}
              >
                <Icon name="x" size={14} />
                Hide from Home
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onTogglePosition();
                }}
              >
                <Icon name="trending-up" size={14} />
                {atTop ? 'Move below Pinned Tools' : 'Move to top'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="phc__stats">
        <div className="phc__stat phc__stat--battery">
          <Icon name="battery" size={19} />
          <strong>{stats && stats.batteryPercent >= 0 ? `${stats.batteryPercent}%` : '—'}</strong>
          <span>Battery</span>
        </div>
        <div className="phc__stat phc__stat--storage">
          <Icon name="database" size={19} />
          <strong>{stats ? formatGb(stats.storageFreeBytes) : '—'}</strong>
          <span>Free / {stats ? formatGb(stats.storageTotalBytes) : '—'}</span>
        </div>
        <div className="phc__stat phc__stat--ram">
          <Icon name="cpu" size={19} />
          <strong>{stats ? formatGb(stats.ramTotalBytes) : '—'}</strong>
          <span>RAM</span>
        </div>
        <div className="phc__stat phc__stat--wifi">
          <Icon name="wifi" size={19} />
          <strong>{!stats?.wifiConnected && stats?.hasInternetConnection ? 'Mobile' : 'Wi-Fi'}</strong>
          <span>{stats?.wifiConnected ? 'Connected' : stats?.hasInternetConnection ? 'Data' : 'Off'}</span>
        </div>
      </div>
    </div>
  );
}
