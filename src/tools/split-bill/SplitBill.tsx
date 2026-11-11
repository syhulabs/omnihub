import { useMemo, useState } from 'react';
import { appDefaultCurrency, currencySymbol, formatMoney as sharedFormatMoney } from '../shared/currencies';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon } from '../../components/Icon';
import { useRouter } from '../../app/Router';
import './SplitBill.css';

const TIP_PRESETS = [0, 10, 15, 20];

export function SplitBill() {
  const { back } = useRouter();
  // Read on every visit, not once when the app loads: changing Default Currency in Settings used
  // to leave this tool on the old symbol until the app was force-closed.
  const CURRENCY = appDefaultCurrency();
  const SYMBOL = currencySymbol(CURRENCY);
  const formatMoney = (amount: number) => sharedFormatMoney(Number.isFinite(amount) ? amount : 0, CURRENCY);
  const [billText, setBillText] = useState('');
  const [tipPercent, setTipPercent] = useState(0);
  const [people, setPeople] = useState(2);

  const bill = parseFloat(billText) || 0;

  const { tipAmount, total, totalPerPerson, tipPerPerson } = useMemo(() => {
    const tip = (bill * tipPercent) / 100;
    const grandTotal = bill + tip;
    return {
      tipAmount: tip,
      total: grandTotal,
      // Rounded up to the cent so the shares always cover the bill: $100 between 3 is $33.34 each,
      // not $33.33 (which collects $99.99).
      totalPerPerson: Math.ceil((grandTotal * 100) / people - 1e-9) / 100,
      tipPerPerson: tip / people,
    };
  }, [bill, tipPercent, people]);

  return (
    <div className="screen">
      <ScreenHeader title="Split Bill" subtitle="Fair shares, every time" onBack={back} />

      <div className="sb__body">
        <div className="sb__hero">
          <span className="sb__hero-icon">
            <Icon name="user" size={24} />
          </span>
          <p>Split any bill evenly between friends.</p>
        </div>

        <div className="sb__field">
          <label className="sb__label">Bill Amount</label>
          <div className="sb__amount-row">
            <span className="sb__currency">{SYMBOL}</span>
            <input
              className="sb__amount-input"
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={billText}
              onChange={(e) => setBillText(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="sb__field">
          <label className="sb__label">Tip (optional)</label>
          <div className="sb__tip-row">
            {TIP_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={`sb__tip-chip${tipPercent === p ? ' sb__tip-chip--active' : ''}`}
                onClick={() => setTipPercent(p)}
              >
                {p === 0 ? 'None' : `${p}%`}
              </button>
            ))}
          </div>
        </div>

        <div className="sb__field">
          <label className="sb__label">Split Between</label>
          <div className="sb__people-row">
            <button
              type="button"
              className="sb__stepper-btn"
              onClick={() => setPeople((p) => Math.max(2, p - 1))}
              aria-label="Fewer people"
            >
              −
            </button>
            <span className="sb__people-count">
              <Icon name="user" size={18} />
              {people}
            </span>
            <button
              type="button"
              className="sb__stepper-btn"
              onClick={() => setPeople((p) => Math.min(50, p + 1))}
              aria-label="More people"
            >
              +
            </button>
          </div>
        </div>

        <div className="sb__result">
          <div className="sb__result-row">
            <span>Total (with tip)</span>
            <span>{formatMoney(total)}</span>
          </div>
          {tipAmount > 0 && (
            <div className="sb__result-row sb__result-row--sub">
              <span>Tip / Person</span>
              <span>{formatMoney(tipPerPerson)}</span>
            </div>
          )}
          <div className="sb__result-row sb__result-row--highlight">
            <span>Each Person Pays</span>
            <span>{formatMoney(totalPerPerson)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
