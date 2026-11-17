import type { CSSProperties } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SoonHero } from '../../components/SoonHero';
import { Icon, type IconName } from '../../components/Icon';
import { TOOL_ICON_IMAGES } from '../../assets/tool-icons';
import { TOOL_ICON_IMAGES_LIGHT } from '../../assets/tool-icons/lightIndex';
import { useIsLightTheme } from '../../theme/useTheme';
import '../../components/InfoList.css';
import './Craft.css';

const HERO_TOOL_IDS = ['budget', 'notes', 'time-zone'];

const STEPS: { icon: IconName; tile: string; title: string; desc: string }[] = [
  { icon: 'layers', tile: '#3f7cf6', title: 'Combine Tools', desc: 'Turn multiple tools into one powerful solution.' },
  { icon: 'repeat', tile: '#7c5cf5', title: 'Smarter Workflow', desc: 'Save time with all-in-one tools.' },
  { icon: 'lightbulb', tile: '#ee8a1d', title: 'More Possibilities', desc: 'New tools and combos designed for your needs.' },
];

/** Each recipe shows the icons of the tools it is made of (the ones that exist in the Hub). */
const RECIPES: { name: string; parts: string; toolIds: string[] }[] = [
  {
    name: 'Finance Manager',
    parts: 'Budget + Debt + Loan + Subscription',
    toolIds: ['budget', 'debt-calculator', 'subscription-calculator'],
  },
  {
    name: 'Document Hub',
    parts: 'Scanner + OCR + PDF + Notes',
    toolIds: ['barcode-scanner', 'pdf-converter', 'notes'],
  },
  {
    name: 'Travel Planner',
    parts: 'Time Zone + Time Difference + Alarm',
    toolIds: ['time-zone', 'time-difference', 'alarm'],
  },
];

/** Coming-soon page: information only, no clickable controls. Laid out like Home and Hub (plain
    header, the app's own background, cards and the Hub's tool icons). */
export function Craft() {
  const isLight = useIsLightTheme();
  const icons = isLight ? TOOL_ICON_IMAGES_LIGHT : TOOL_ICON_IMAGES;

  return (
    <div className="screen">
      <ScreenHeader title="Crafting Station" subtitle="Combine your tools into more powerful ones." />

      <div className="tab-body">
        <SoonHero
          title="Still cooking."
          text="We're working hard to bring the Crafting Station to Omni Hub."
          art={
            <div className="craft__hero-icons">
              {HERO_TOOL_IDS.map((id, i) => (
                <img
                  key={id}
                  src={TOOL_ICON_IMAGES[id]}
                  alt=""
                  className="craft__hero-chip"
                  style={{ '--i': i } as CSSProperties}
                />
              ))}
            </div>
          }
        />

        <section className="tab-section">
          <div className="tab-section__head">
            <h2>How it will work</h2>
          </div>
          <div className="info-card">
            {STEPS.map((s) => (
              <div key={s.title} className="info-row">
                <span className="info-row__icon" style={{ '--tile': s.tile } as CSSProperties}>
                  <Icon name={s.icon} size={21} strokeWidth={2} />
                </span>
                <span className="info-row__text">
                  <strong>{s.title}</strong>
                  <span>{s.desc}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="tab-section">
          <div className="tab-section__head">
            <h2>Featured Recipes</h2>
            <p>A sneak peek of what&rsquo;s coming.</p>
          </div>
          <div className="craft__recipes">
            {RECIPES.map((r) => (
              <div key={r.name} className="info-card craft__recipe">
                <span className="craft__recipe-icons">
                  {r.toolIds.map((id) => (
                    <img key={id} src={icons[id]} alt="" />
                  ))}
                </span>
                <strong>{r.name}</strong>
                <span className="craft__recipe-parts">{r.parts}</span>
                <span className="craft__recipe-soon">
                  <Icon name="lock" size={10} strokeWidth={2.4} />
                  Soon
                </span>
              </div>
            ))}
          </div>
        </section>

        <p className="tab-note">Thanks for being an early Omni Hub user.</p>
      </div>
    </div>
  );
}
