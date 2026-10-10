import type { ReactNode } from 'react';
import { Icon } from '../components/Icon';

const PIN_LENGTH = 4;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'backspace'];

interface PinPadProps {
  title: string;
  subtitle?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  /** Disables all key input, e.g. during a post-failed-attempts lockout. */
  disabled?: boolean;
  /** Rendered under the keys, e.g. a "Use fingerprint or face" button. */
  action?: ReactNode;
}

export function PinPad({ title, subtitle, value, onChange, error, disabled, action }: PinPadProps) {
  function press(key: string) {
    if (disabled) return;
    if (key === 'backspace') {
      onChange(value.slice(0, -1));
    } else if (key && value.length < PIN_LENGTH) {
      onChange(value + key);
    }
  }

  return (
    <div className="vault-pin">
      <div className="vault-pin__lock">
        <Icon name="lock" size={28} />
      </div>
      <h2 className="vault-pin__title">{title}</h2>
      {subtitle && <p className="vault-pin__subtitle">{subtitle}</p>}

      <div className={`vault-pin__dots${error ? ' vault-pin__dots--error' : ''}`}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span key={i} className={`vault-pin__dot${i < value.length ? ' vault-pin__dot--filled' : ''}`} />
        ))}
      </div>

      <p className="vault-pin__error">{error || ' '}</p>

      <div className="vault-pin__keys">
        {KEYS.map((key, i) =>
          key === '' ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              className="vault-pin__key"
              onClick={() => press(key)}
              disabled={disabled}
              aria-label={key === 'backspace' ? 'Backspace' : key}
            >
              {key === 'backspace' ? <Icon name="backspace" size={20} /> : key}
            </button>
          ),
        )}
      </div>
      {action && <div className="vault-pin__action">{action}</div>}
    </div>
  );
}

export { PIN_LENGTH };
