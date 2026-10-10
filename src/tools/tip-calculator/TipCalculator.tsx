import { useMemo, useState } from 'react';
import { appDefaultCurrency, currencySymbol, formatMoney as sharedFormatMoney } from '../shared/currencies';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon } from '../../components/Icon';
import { useRouter } from '../../app/Router';
import './TipCalculator.css';

const TIP_PRESETS = [10, 15, 18, 20, 25];

const CURRENCY = appDefaultCurrency();
const SYMBOL = currencySymbol(CURRENCY);

function formatMoney(amount: number): string {
  return sharedFormatMoney(Number.isFinite(amount) ? amount : 0, CURRENCY);
}

export function TipCalculator() {
  const { back } = useRouter();
  const [billText, setBillText] = useState('');
  const [tipPercent, setTipPercent] = useState(15);
  const [customTip, setCustomTip] = useState('');
  const [useCustomTip, setUseCustomTip] = useState(false);

  const bill = parseFloat(billText) || 0;
  const effectiveTipPercent = useCustomTip ? parseFloat(customTip) || 0 : tipPercent;

  const { tipAmount, total } = useMemo(() => {
    const tip = (bill * effectiveTipPercent) / 100;
    return { tipAmount: tip, total: bill + tip };
  }, [bill, effectiveTipPercent]);

  return (
    <div className="screen">
      <ScreenHeader title="Tip Calculator" subtitle="Work out the tip in seconds" onBack={back} />

      <div className="tc__body">
        <div className="tc__hero">
          <span className="tc__hero-icon">
            <Icon name="receipt" size={26} />
          </span>
          <p>Enter the bill, pick a tip, done.</p>
        </div>

        <div className="tc__field">
          <label className="tc__label">Bill Amount</label>
          <div className="tc__amount-row">
            <span className="tc__currency">{SYMBOL}</span>
            <input
              className="tc__amount-input"
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={billText}
              onChange={(e) => setBillText(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="tc__field">
          <label className="tc__label">Tip</label>
          <div className="tc__tip-row">
            {TIP_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={`tc__tip-chip${!useCustomTip && tipPercent === p ? ' tc__tip-chip--active' : ''}`}
                onClick={() => {
                  setUseCustomTip(false);
                  setTipPercent(p);
                }}
              >
                {p}%
              </button>
            ))}
            <button
              type="button"
              className={`tc__tip-chip${useCustomTip ? ' tc__tip-chip--active' : ''}`}
              onClick={() => setUseCustomTip(true)}
            >
              Custom
            </button>
          </div>
          {useCustomTip && (
            <div className="tc__custom-tip-row">
              <input
                className="tc__custom-tip-input"
                type="number"
                inputMode="decimal"
                placeholder="Tip %"
                value={customTip}
                onChange={(e) => setCustomTip(e.target.value)}
                autoFocus
              />
              <span>%</span>
            </div>
          )}
        </div>

        <div className="tc__result">
          <div className="tc__result-row">
            <span>Tip Amount</span>
            <span>{formatMoney(tipAmount)}</span>
          </div>
          <div className="tc__result-row tc__result-row--highlight">
            <span>Total</span>
            <span>{formatMoney(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
