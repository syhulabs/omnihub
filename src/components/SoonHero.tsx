import type { ReactNode } from 'react';
import { Icon } from './Icon';
import './SoonHero.css';

interface SoonHeroProps {
  title: ReactNode;
  text: string;
  /** Artwork on the right: a brand mark or a stack of tool icons. */
  art?: ReactNode;
}

/** The card that announces something that isn't built yet. It is the same deep purple card as the
    Hub's "More Tools On The Way", so every "on the way" surface in the app is one family. It is
    information only: nothing on it is clickable. */
export function SoonHero({ title, text, art }: SoonHeroProps) {
  return (
    <div className="soon-hero">
      <div className="soon-hero__glow" />
      {art && <div className="soon-hero__art">{art}</div>}
      <span className="soon-hero__badge">
        <Icon name="clock" size={10} />
        Coming Soon
      </span>
      <h2 className="soon-hero__title">{title}</h2>
      <p className="soon-hero__text">{text}</p>
    </div>
  );
}
