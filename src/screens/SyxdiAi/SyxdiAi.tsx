import type { CSSProperties } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SoonHero } from '../../components/SoonHero';
import { Icon, type IconName } from '../../components/Icon';
import brandMark from '../../assets/syxdi-ai/nav-icon-static.webp';
import '../../components/InfoList.css';
import './SyxdiAi.css';

const FEATURES: { icon: IconName; tile: string; title: string; desc: string }[] = [
  { icon: 'chat', tile: '#3f7cf6', title: 'Natural Conversations', desc: 'Talk naturally, anytime.' },
  { icon: 'user', tile: '#7c5cf5', title: 'Understands You', desc: 'Learns your preferences.' },
  { icon: 'bookmark', tile: '#0f9f8f', title: 'Personal News Feed', desc: 'Updates that matter to you.' },
  { icon: 'lightbulb', tile: '#ee8a1d', title: 'Smart Insights', desc: 'Helpful suggestions for a better day.' },
];

/** Coming-soon page: information only, no clickable controls. Laid out like Home and Hub (plain
    header, the app's own background, cards), not as a full-screen illustration. */
export function SyxdiAi() {
  return (
    <div className="screen">
      <ScreenHeader title="SYXDI AI" subtitle="Your AI companion for Omni Hub." />

      <div className="tab-body">
        <SoonHero
          title={
            <>
              A smarter,
              <br />
              more personal AI.
            </>
          }
          text="On its way to Omni Hub."
          art={<img className="syxdi__mark" src={brandMark} alt="" draggable={false} />}
        />

        <section className="tab-section">
          <div className="tab-section__head">
            <h2>What to expect</h2>
          </div>
          <div className="syxdi__features">
            {FEATURES.map((f) => (
              <div key={f.title} className="info-card syxdi__feature">
                <span className="info-row__icon" style={{ '--tile': f.tile } as CSSProperties}>
                  <Icon name={f.icon} size={21} strokeWidth={2} />
                </span>
                <strong>{f.title}</strong>
                <span>{f.desc}</span>
              </div>
            ))}
          </div>
        </section>

        <p className="tab-note">
          Better days are coming.
          <br />
          Thank you for your support.
        </p>
      </div>
    </div>
  );
}
