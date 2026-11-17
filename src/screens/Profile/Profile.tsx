import type { CSSProperties } from 'react';
import { useRouter } from '../../app/Router';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon, type IconName } from '../../components/Icon';
import '../../components/InfoList.css';
import './Profile.css';

interface NavItem {
  path: string;
  icon: IconName;
  /** Solid colour of the icon tile. */
  tile: string;
  title: string;
  subtitle: string;
}

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Account',
    items: [
      { path: '/profile/account', icon: 'user', tile: '#3f7cf6', title: 'Profile', subtitle: 'Your account, devices and personal settings.' },
    ],
  },
  {
    label: 'Preferences',
    items: [
      { path: '/profile/settings', icon: 'settings', tile: '#7c5cf5', title: 'Settings', subtitle: 'App preferences.' },
      { path: '/profile/appearance', icon: 'palette', tile: '#d9479f', title: 'Appearance', subtitle: 'Theme & visual style.' },
    ],
  },
  {
    label: 'Data & Privacy',
    items: [
      { path: '/profile/data-sync', icon: 'cloud', tile: '#12a36d', title: 'Data & Sync', subtitle: 'Backup & cloud storage.' },
      { path: '/profile/privacy', icon: 'shield', tile: '#ee8a1d', title: 'Privacy & Security', subtitle: 'Permissions & security.' },
    ],
  },
  {
    label: 'About',
    items: [
      { path: '/profile/about', icon: 'info', tile: '#5b6780', title: 'About Omni Hub', subtitle: 'Version, support and credits.' },
    ],
  },
];

/** The Desk tab: a plain menu in the same style as the Settings screen it leads to. */
export function Profile() {
  const { navigate } = useRouter();

  return (
    <div className="screen">
      <ScreenHeader title="Desk" subtitle="Your space, your settings, your data." />

      <div className="tab-body">
        {GROUPS.map((group) => (
          <section key={group.label} className="tab-section">
            <span className="tab-section__label">{group.label}</span>
            <nav className="info-card">
              {group.items.map((item) => (
                <button key={item.path} type="button" className="info-row" onClick={() => navigate(item.path)}>
                  <span className="info-row__icon" style={{ '--tile': item.tile } as CSSProperties}>
                    <Icon name={item.icon} size={21} strokeWidth={2} />
                  </span>
                  <span className="info-row__text">
                    <strong>{item.title}</strong>
                    <span>{item.subtitle}</span>
                  </span>
                  <span className="info-row__chevron">
                    <Icon name="chevron-right" size={18} strokeWidth={2.2} />
                  </span>
                </button>
              ))}
            </nav>
          </section>
        ))}
      </div>
    </div>
  );
}
