import { Icon, type IconName } from '../components/Icon';
import { useRouter } from './Router';
import navMark from '../assets/syxdi-ai/nav-icon-static.webp';
import './BottomNav.css';

/* The bar is drawn to design/bottom-nav-reference-v2.png, a 1220-wide mockup at the phone's exact
   width: the frame, accent lines and AI tile are one SVG in that coordinate space, and the tabs
   are placed at the mockup's measured centres as percentages, so the whole bar scales with the
   screen width. The owner found the mockup's bar too tall twice: it was first compressed from 350
   units to 272, then (Nov 17) redrawn at 200 units, about 72 CSS px on the phone instead of 97.
   The shapes are the mockup's (chamfered frame, raised notch, AI tile, accent lines, pink bars);
   the notch, tile, icons and labels are scaled down to fit the lower frame. */

interface Tab {
  path: string;
  label: string;
  icon?: IconName;
  /** Box size of the flat icon, chosen per glyph so its drawn extent matches the mockup. */
  iconSize?: number;
  /** Horizontal centre as a percentage of the bar width. */
  x: number;
  /** The centre AI tab: the brand mark inside the tile instead of a flat icon. */
  brand?: boolean;
}

const TABS: Tab[] = [
  { path: '/', label: 'Home', icon: 'home', iconSize: 26, x: 14.84 },
  { path: '/tools', label: 'Hub', icon: 'grid', iconSize: 24.5, x: 33.0 },
  { path: '/ai', label: 'AI', brand: true, x: 50 },
  { path: '/craft', label: 'Craft', icon: 'flask', iconSize: 22.5, x: 67.38 },
  { path: '/profile', label: 'Desk', icon: 'archive', iconSize: 24, x: 85.57 },
];

export function BottomNav() {
  const { path, navigate } = useRouter();

  return (
    <nav className="bottom-nav">
      <svg className="bottom-nav__frame" viewBox="0 0 1220 200" aria-hidden="true" focusable="false">
        <defs>
          {/* sampled along the mockup's tile border: cyan at top-left, blue, violet, magenta at bottom-right */}
          <linearGradient id="bn-tile" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0ec9ff" />
            <stop offset="0.22" stopColor="#30a3ff" />
            <stop offset="0.5" stopColor="#6470ff" />
            <stop offset="0.76" stopColor="#a04eff" />
            <stop offset="1" stopColor="#e24bce" />
          </linearGradient>
        </defs>
        {/* outer frame: chamfered corners, raised notch for the AI tile */}
        <path
          d="M101 40 H518 L548 6 H671 L701 40 H1118 L1164 86 V146 L1118 192 H101 L55 146 V86 Z"
          fill="none"
          stroke="#649bff"
          strokeWidth="5"
          strokeLinejoin="miter"
        />
        {/* purple accent lines following the top chamfers */}
        <path d="M482 60 H107 L80 92" fill="none" stroke="#7a62ff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M737 60 H1112 L1139 92" fill="none" stroke="#7a62ff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        {/* pink bars under the outer tabs */}
        <path d="M153 178 H318" stroke="#ed5ac5" strokeWidth="5" strokeLinecap="round" />
        <path d="M901 178 H1066" stroke="#ed5ac5" strokeWidth="5" strokeLinecap="round" />
        {/* AI tile */}
        <rect x="541.5" y="22" width="136" height="104" rx="29" fill="none" stroke="url(#bn-tile)" strokeWidth="6" />
      </svg>

      {TABS.map((tab) => {
        const active = tab.path === '/' ? path === '/' : path === tab.path || path.startsWith(`${tab.path}/`);
        return (
          <button
            key={tab.path}
            type="button"
            className={`bottom-nav__item${active ? ' bottom-nav__item--active' : ''}${tab.brand ? ' bottom-nav__item--brand' : ''}`}
            style={{ left: `${tab.x}%` }}
            onClick={() => navigate(tab.path)}
            aria-current={active ? 'page' : undefined}
            aria-label={tab.brand ? 'SYXDI AI' : undefined}
          >
            {tab.brand ? (
              <img src={navMark} alt="" className="bottom-nav__mark" draggable={false} />
            ) : (
              <span className={`bottom-nav__icon bottom-nav__icon--${tab.icon}`}>
                <Icon name={tab.icon!} size={tab.iconSize} strokeWidth={1.5} />
              </span>
            )}
            <span className="bottom-nav__label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
