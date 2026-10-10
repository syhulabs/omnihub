import { useEffect, useRef, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { Icon } from './Icon';
import type { ToolMeta } from '../types';
import { TOOL_ICON_IMAGES } from '../assets/tool-icons';
import { TOOL_ICON_IMAGES_LIGHT } from '../assets/tool-icons/lightIndex';
import { useIsLightTheme } from '../theme/useTheme';
import './ToolTile.css';

const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 10;

interface ToolTileProps {
  tool: ToolMeta;
  onClick: () => void;
  onRemove?: () => void;
  /** Long-press support (e.g. Tools screen's press-and-hold-to-pin). Omit to disable. */
  onLongPress?: () => void;
  showPinBadge?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
  /** True when the pin limit is reached and this tool isn't already pinned. */
  pinLimitReached?: boolean;
}

export function ToolTile({
  tool,
  onClick,
  onRemove,
  onLongPress,
  showPinBadge,
  pinned,
  onTogglePin,
  pinLimitReached,
}: ToolTileProps) {
  const isLight = useIsLightTheme();
  const image = (isLight ? TOOL_ICON_IMAGES_LIGHT : TOOL_ICON_IMAGES)[tool.id];
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef({ x: 0, y: 0 });
  const suppressClickRef = useRef(false);

  function clearTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => clearTimer, []);

  function handlePointerDown(e: PointerEvent) {
    // Every new gesture starts clean — otherwise a stale suppress flag left
    // over from the long-press that just revealed the pin badge can eat the
    // very next tap (e.g. on the badge itself), forcing a second tap to pin.
    suppressClickRef.current = false;
    // A locked tool has no real pinnable destination yet — skip the
    // long-press-to-pin gesture entirely rather than offering to pin it.
    if (!onLongPress || tool.locked) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      suppressClickRef.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!timerRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (Math.abs(dx) > MOVE_CANCEL_PX || Math.abs(dy) > MOVE_CANCEL_PX) clearTimer();
  }

  function handleClickCapture(e: MouseEvent) {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClickRef.current = false;
    }
  }

  return (
    <div
      className="tool-tile"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={clearTimer}
      onPointerCancel={clearTimer}
      onClickCapture={handleClickCapture}
    >
      <button type="button" className="tool-tile__button" onClick={onClick}>
        <span className={`tool-tile__icon-wrap${tool.locked ? ' tool-tile__icon-wrap--locked' : ''}`}>
          {image ? (
            <span className="tool-tile__icon tool-tile__icon--image">
              <img src={image} alt="" className="tool-tile__icon-img" />
            </span>
          ) : (
            <span className="tool-tile__icon" style={{ '--tool-color': tool.color } as CSSProperties}>
              <span className="tool-tile__icon-gloss" />
              <Icon name={tool.icon} size={28} className="tool-tile__icon-svg" />
            </span>
          )}
          {tool.locked && (
            <span className="tool-tile__lock-badge">
              <Icon name="lock" size={11} strokeWidth={2.5} />
            </span>
          )}
          {tool.beta && <span className="tool-tile__beta-badge">Beta</span>}
        </span>
        <span className="tool-tile__label">{tool.name}</span>
      </button>
      {onRemove && (
        <button
          type="button"
          className="tool-tile__remove"
          onClick={onRemove}
          aria-label={`Unpin ${tool.name}`}
        >
          <Icon name="x" size={12} strokeWidth={3} />
        </button>
      )}
      {showPinBadge && onTogglePin && (
        <button
          type="button"
          className={`tool-tile__pin-badge${pinned ? ' tool-tile__pin-badge--active' : ''}`}
          onClick={onTogglePin}
          disabled={!pinned && pinLimitReached}
          aria-label={pinned ? `Unpin ${tool.name}` : `Pin ${tool.name}`}
        >
          <Icon name="pin" size={17} />
          {pinned ? 'Unpin' : pinLimitReached ? 'Limit reached' : 'Pin'}
        </button>
      )}
    </div>
  );
}
