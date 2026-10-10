import { useMemo, useRef, useState } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon, type IconName } from '../../components/Icon';
import { SwipeToDelete } from '../../components/SwipeToDelete';
import { useRouter } from '../../app/Router';
import { storageGet, storageSet, StorageKeys } from '../../storage/db';
import { useCloudSync } from '../../cloud/useCloudSync';
import { hapticSelect, hapticTap } from '../../haptics';
import { CURRENCIES, DEFAULT_CURRENCY, appDefaultCurrency, formatMoney } from '../shared/currencies';
import type { BillingCycle, Subscription } from './types';
import './SubscriptionCalculator.css';

const CYCLES: { id: BillingCycle; label: string; icon: IconName; perMonth: (amount: number) => number }[] = [
  { id: 'weekly', label: 'Weekly', icon: 'calendar', perMonth: (a) => a * 4.345 },
  { id: 'monthly', label: 'Monthly', icon: 'calendar', perMonth: (a) => a },
  { id: 'yearly', label: 'Yearly', icon: 'calendar', perMonth: (a) => a / 12 },
];

type FilterTab = 'all' | BillingCycle;
type SortMode = 'newest' | 'price' | 'name';

interface Example {
  name: string;
  amount: number;
  cycle: BillingCycle;
  color: string;
}

const EXAMPLES: Example[] = [
  { name: 'Netflix', amount: 15.49, cycle: 'monthly', color: 'var(--red)' },
  { name: 'Spotify', amount: 10.99, cycle: 'monthly', color: 'var(--green)' },
  { name: 'YouTube Premium', amount: 13.99, cycle: 'monthly', color: 'var(--red)' },
  { name: 'Disney+', amount: 13.99, cycle: 'monthly', color: 'var(--blue)' },
  { name: 'Apple Music', amount: 10.99, cycle: 'monthly', color: 'var(--pink)' },
  { name: 'Amazon Prime', amount: 14.99, cycle: 'monthly', color: 'var(--orange)' },
  { name: 'iCloud+', amount: 2.99, cycle: 'monthly', color: 'var(--blue)' },
  { name: 'PlayStation Plus', amount: 17.99, cycle: 'monthly', color: 'var(--blue)' },
];

export function SubscriptionCalculator() {
  const { back } = useRouter();
  const [subs, setSubs] = useState<Subscription[]>(() => storageGet(StorageKeys.subscriptions, []));
  const [name, setName] = useState('');
  const [amountText, setAmountText] = useState('');
  const [currency, setCurrency] = useState(() => storageGet(StorageKeys.subscriptionDefaultCurrency, appDefaultCurrency()));
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [showCurrencySheet, setShowCurrencySheet] = useState(false);
  const [showAllExamples, setShowAllExamples] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  function rawPersist(next: Subscription[]) {
    setSubs(next);
    storageSet(StorageKeys.subscriptions, next);
  }

  const { persist } = useCloudSync('subscriptions', subs, rawPersist);

  function addSubscription() {
    const amount = parseFloat(amountText);
    if (!name.trim() || !amount || amount <= 0) return;
    hapticTap();
    const now = Date.now();
    const sub: Subscription = {
      id: `${now}`,
      name: name.trim(),
      amount,
      currency,
      cycle,
      createdAt: now,
      updatedAt: now,
    };
    persist([sub, ...subs]);
    setName('');
    setAmountText('');
  }

  function addExample(ex: Example) {
    hapticSelect();
    const now = Date.now();
    const sub: Subscription = {
      id: `${now}`,
      name: ex.name,
      amount: ex.amount,
      currency: DEFAULT_CURRENCY,
      cycle: ex.cycle,
      createdAt: now,
      updatedAt: now,
    };
    persist([sub, ...subs]);
  }

  function deleteSubscription(id: string) {
    persist(subs.filter((s) => s.id !== id));
  }

  function focusAddForm() {
    hapticTap();
    nameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nameInputRef.current?.focus();
  }

  const { monthlyTotal, yearlyTotal } = useMemo(() => {
    const monthly = subs.reduce((sum, s) => {
      const cycleDef = CYCLES.find((c) => c.id === s.cycle);
      return sum + (cycleDef ? cycleDef.perMonth(s.amount) : s.amount);
    }, 0);
    return { monthlyTotal: monthly, yearlyTotal: monthly * 12 };
  }, [subs]);

  const visibleSubs = useMemo(() => {
    let list = filterTab === 'all' ? subs : subs.filter((s) => s.cycle === filterTab);
    list = [...list].sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name);
      if (sortMode === 'price') {
        const aM = CYCLES.find((c) => c.id === a.cycle)?.perMonth(a.amount) ?? a.amount;
        const bM = CYCLES.find((c) => c.id === b.cycle)?.perMonth(b.amount) ?? b.amount;
        return bM - aM;
      }
      return b.createdAt - a.createdAt;
    });
    return list;
  }, [subs, filterTab, sortMode]);

  const currencyOption = CURRENCIES.find((c) => c.code === currency);

  return (
    <div className="screen">
      <ScreenHeader title="Subscription Calculator" subtitle="Manage your subscriptions. Know your costs." onBack={back} />

      <div className="sc__body">
        <div className="sc__summary">
          <div className="sc__summary-item">
            <span className="sc__summary-icon sc__summary-icon--blue">
              <Icon name="calendar" size={18} />
            </span>
            <div>
              <span>Total per Month</span>
              <strong>{formatMoney(monthlyTotal, currency)}</strong>
              <em>{subs.length} subscription{subs.length === 1 ? '' : 's'}</em>
            </div>
          </div>
          <div className="sc__summary-divider" />
          <div className="sc__summary-item">
            <span className="sc__summary-icon sc__summary-icon--purple">
              <Icon name="trending-up" size={18} />
            </span>
            <div>
              <span>Total per Year</span>
              <strong>{formatMoney(yearlyTotal, currency)}</strong>
              <em>Save smarter. Live better.</em>
            </div>
          </div>
        </div>

        <div className="sc__add">
          <div className="sc__add-head">
            <span className="sc__add-icon">
              <Icon name="plus" size={16} />
            </span>
            <strong>Add Subscription</strong>
          </div>

          <label className="sc__field-label">Subscription name</label>
          <div className="sc__input-row">
            <Icon name="tag" size={15} />
            <input
              ref={nameInputRef}
              placeholder="e.g. Netflix, Spotify, Canva"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="sc__price-row">
            <div className="sc__field">
              <label className="sc__field-label">Price</label>
              <div className="sc__input-row">
                <span>{currencyOption?.symbol ?? '$'}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                />
              </div>
            </div>
            <div className="sc__field">
              <label className="sc__field-label">Currency</label>
              <button type="button" className="sc__input-row sc__currency-btn" onClick={() => setShowCurrencySheet(true)}>
                <span>{currencyOption?.flag}</span>
                <span className="sc__currency-code">{currency}</span>
                <Icon name="chevron-down" size={14} />
              </button>
            </div>
          </div>

          <label className="sc__field-label">Billing cycle</label>
          <div className="sc__cycle-row">
            {CYCLES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`sc__cycle-chip${cycle === c.id ? ' sc__cycle-chip--active' : ''}`}
                onClick={() => {
                  hapticSelect();
                  setCycle(c.id);
                }}
              >
                <Icon name={c.icon} size={14} />
                {c.label}
              </button>
            ))}
          </div>

          <button type="button" className="sc__add-btn" onClick={addSubscription}>
            <Icon name="plus" size={16} />
            Add Subscription
          </button>
        </div>

        <div className="sc__list-header">
          <strong>Your Subscriptions</strong>
          <button
            type="button"
            className="sc__sort-btn"
            onClick={() => {
              hapticSelect();
              setSortMode((m) => (m === 'newest' ? 'price' : m === 'price' ? 'name' : 'newest'));
            }}
          >
            <Icon name="sort" size={13} />
            Sort: {sortMode === 'newest' ? 'Newest' : sortMode === 'price' ? 'Price' : 'Name'}
          </button>
        </div>

        <div className="sc__tabs">
          {(['all', 'monthly', 'yearly', 'weekly'] as FilterTab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`sc__tab${filterTab === t ? ' sc__tab--active' : ''}`}
              onClick={() => setFilterTab(t)}
            >
              {t === 'all' ? 'All' : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {subs.length === 0 ? (
          <div className="sc__empty">
            <span className="sc__empty-icon">
              <Icon name="package" size={40} />
            </span>
            <strong>No subscriptions yet</strong>
            <span>Add your first subscription to start tracking your monthly and yearly costs.</span>
            <button type="button" className="sc__empty-btn" onClick={focusAddForm}>
              <Icon name="plus" size={15} />
              Add Your First Subscription
            </button>
          </div>
        ) : visibleSubs.length === 0 ? (
          <p className="sc__empty-compact">No {filterTab} subscriptions.</p>
        ) : (
          <ul className="sc__list">
            {visibleSubs.map((sub) => (
              <li key={sub.id}>
                <SwipeToDelete
                  id={sub.id}
                  openId={openSwipeId}
                  onOpenChange={setOpenSwipeId}
                  onDelete={() => deleteSubscription(sub.id)}
                >
                  <div className="sc__row">
                    <span className="sc__row-icon">{sub.name.slice(0, 1).toUpperCase()}</span>
                    <span className="sc__row-info">
                      <span className="sc__row-name">{sub.name}</span>
                      <span className="sc__row-cycle">{CYCLES.find((c) => c.id === sub.cycle)?.label}</span>
                    </span>
                    <span className="sc__row-amount-col">
                      <span className="sc__row-amount">{formatMoney(sub.amount, sub.currency)}</span>
                      {sub.currency && sub.currency !== DEFAULT_CURRENCY && (
                        <span className="sc__row-currency">{sub.currency}</span>
                      )}
                    </span>
                  </div>
                </SwipeToDelete>
              </li>
            ))}
          </ul>
        )}

        <div className="sc__examples">
          <div className="sc__examples-head">
            <span className="sc__add-icon">
              <Icon name="lightbulb" size={16} />
            </span>
            <div>
              <strong>Quick Examples</strong>
              <span>Tap to add an example</span>
            </div>
            <button type="button" className="sc__see-all" onClick={() => setShowAllExamples(true)}>
              See all
              <Icon name="chevron-right" size={13} />
            </button>
          </div>
          <div className="sc__examples-row">
            {EXAMPLES.slice(0, 3).map((ex) => (
              <button key={ex.name} type="button" className="sc__example-chip" onClick={() => addExample(ex)}>
                <span className="sc__example-icon" style={{ '--ex-color': ex.color } as React.CSSProperties}>
                  {ex.name.slice(0, 1)}
                </span>
                <span className="sc__example-info">
                  <strong>{ex.name}</strong>
                  <span>{formatMoney(ex.amount)} / month</span>
                </span>
                <Icon name="plus" size={16} className="sc__example-plus" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {showCurrencySheet && (
        <div className="sc__sheet" onClick={() => setShowCurrencySheet(false)}>
          <div className="sc__sheet-content" onClick={(e) => e.stopPropagation()}>
            <h2>Select Currency</h2>
            <div className="sc__currency-grid">
              {CURRENCIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  className={`sc__currency-chip${currency === c.code ? ' sc__currency-chip--active' : ''}`}
                  onClick={() => {
                    hapticSelect();
                    setCurrency(c.code);
                    storageSet(StorageKeys.subscriptionDefaultCurrency, c.code);
                    setShowCurrencySheet(false);
                  }}
                >
                  <span>{c.flag}</span>
                  {c.code}
                </button>
              ))}
            </div>
            <button type="button" className="sc__sheet-close" onClick={() => setShowCurrencySheet(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {showAllExamples && (
        <div className="sc__sheet" onClick={() => setShowAllExamples(false)}>
          <div className="sc__sheet-content" onClick={(e) => e.stopPropagation()}>
            <h2>All Examples</h2>
            <div className="sc__examples-list">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.name}
                  type="button"
                  className="sc__example-chip"
                  onClick={() => {
                    addExample(ex);
                    setShowAllExamples(false);
                  }}
                >
                  <span className="sc__example-icon" style={{ '--ex-color': ex.color } as React.CSSProperties}>
                    {ex.name.slice(0, 1)}
                  </span>
                  <span className="sc__example-info">
                    <strong>{ex.name}</strong>
                    <span>{formatMoney(ex.amount)} / month</span>
                  </span>
                  <Icon name="plus" size={16} className="sc__example-plus" />
                </button>
              ))}
            </div>
            <button type="button" className="sc__sheet-close" onClick={() => setShowAllExamples(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
