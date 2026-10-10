import { useMemo, useState } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon } from '../../components/Icon';
import { SwipeToDelete } from '../../components/SwipeToDelete';
import { useRouter } from '../../app/Router';
import { storageGet, storageSet, StorageKeys } from '../../storage/db';
import { useCloudSync } from '../../cloud/useCloudSync';
import { hapticSelect, hapticTap } from '../../haptics';
import { CURRENCIES, DEFAULT_CURRENCY, appDefaultCurrency, formatMoney } from '../shared/currencies';
import { CalendarPicker } from '../age-date/CalendarPicker';
import { parseISODate, toISODate } from '../age-date/dateMath';
import type { DebtDirection, DebtEntry } from './types';
import './DebtCalculator.css';

function formatDue(ts: number | undefined): string {
  if (!ts) return 'Select date';
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')} ${
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]
  } ${d.getFullYear()}`;
}

function dueBadge(ts: number | undefined): { label: string; overdue: boolean } | null {
  if (!ts) return null;
  const today = new Date();
  const todayStrip = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dueStrip = new Date(new Date(ts).getFullYear(), new Date(ts).getMonth(), new Date(ts).getDate()).getTime();
  const days = Math.round((dueStrip - todayStrip) / 86400000);
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, overdue: true };
  if (days === 0) return { label: 'Due today', overdue: false };
  return { label: `In ${days} day${days === 1 ? '' : 's'}`, overdue: false };
}

export function DebtCalculator() {
  const { back } = useRouter();
  const [debts, setDebts] = useState<DebtEntry[]>(() => storageGet(StorageKeys.debts, []));
  const [person, setPerson] = useState('');
  const [debtName, setDebtName] = useState('');
  const [amountText, setAmountText] = useState('');
  const [currency, setCurrency] = useState(() => storageGet(StorageKeys.debtDefaultCurrency, appDefaultCurrency()));
  const [note, setNote] = useState('');
  const [dueAt, setDueAt] = useState<number | undefined>(undefined);
  const [direction, setDirection] = useState<DebtDirection>('owed_to_me');
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [showCurrencySheet, setShowCurrencySheet] = useState(false);
  const [showDueCalendar, setShowDueCalendar] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showCalendarSheet, setShowCalendarSheet] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  function rawPersist(next: DebtEntry[]) {
    setDebts(next);
    storageSet(StorageKeys.debts, next);
  }

  const { persist } = useCloudSync('debts', debts, rawPersist);

  function addDebt() {
    const amount = parseFloat(amountText);
    if (!person.trim() || !amount || amount <= 0) return;
    hapticTap();
    const now = Date.now();
    const entry: DebtEntry = {
      id: `${now}`,
      person: person.trim(),
      debtName: debtName.trim() || undefined,
      amount,
      currency,
      direction,
      note: note.trim() || undefined,
      dueAt,
      createdAt: now,
      updatedAt: now,
    };
    persist([entry, ...debts]);
    setPerson('');
    setDebtName('');
    setAmountText('');
    setNote('');
    setDueAt(undefined);
  }

  function settleDebt(id: string) {
    persist(debts.filter((d) => d.id !== id));
  }

  const owedToMeDebts = useMemo(
    () => [...debts].filter((d) => d.direction === 'owed_to_me').sort((a, b) => b.createdAt - a.createdAt),
    [debts],
  );
  const iOweDebts = useMemo(
    () => [...debts].filter((d) => d.direction === 'i_owe').sort((a, b) => b.createdAt - a.createdAt),
    [debts],
  );

  // Totals are per currency: RM100 + $100 is not "200" of anything. Rows in other currencies
  // still list normally; the summary says how many it leaves out.
  const inCurrency = (d: DebtEntry) => (d.currency ?? DEFAULT_CURRENCY) === currency;
  const { owedToMe, iOwe, net, otherCurrencyCount } = useMemo(() => {
    const owedToMe = owedToMeDebts.filter(inCurrency).reduce((sum, d) => sum + d.amount, 0);
    const iOwe = iOweDebts.filter(inCurrency).reduce((sum, d) => sum + d.amount, 0);
    return { owedToMe, iOwe, net: owedToMe - iOwe, otherCurrencyCount: debts.filter((d) => !inCurrency(d)).length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owedToMeDebts, iOweDebts, debts, currency]);

  const currencyOption = CURRENCIES.find((c) => c.code === currency);

  function exportCsv() {
    hapticTap();
    const header = 'Person,Debt Name,Direction,Amount,Currency,Due Date,Note';
    const rows = debts.map((d) =>
      [
        d.person,
        d.debtName ?? '',
        d.direction === 'owed_to_me' ? 'Owed to me' : 'I owe',
        d.amount.toFixed(2),
        d.currency ?? DEFAULT_CURRENCY,
        d.dueAt ? formatDue(d.dueAt) : '',
        d.note ?? '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    const csv = [header, ...rows].join('\n');
    if (navigator.share) {
      navigator
        .share({ title: 'Debt Tracker Export', text: csv })
        .then(() => setExportStatus('Shared.'))
        .catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(csv).then(() => setExportStatus('Copied CSV to clipboard.'));
    }
  }

  const upcoming = useMemo(
    () => [...debts].filter((d) => d.dueAt).sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0)),
    [debts],
  );

  return (
    <div className="screen">
      <ScreenHeader
        title="Debt Tracker"
        subtitle="Keep track of who owes you and who you owe"
        onBack={back}
        action={
          <button type="button" className="dc__header-btn" onClick={() => setShowMenu(true)} aria-label="More">
            <Icon name="more-dots" size={18} />
          </button>
        }
      />

      <div className="dc__body">
        <div className="dc__summary">
          <div className="dc__summary-item dc__summary-item--green">
            <span className="dc__summary-icon dc__summary-icon--green">
              <Icon name="download" size={18} />
            </span>
            <div>
              <span>Owed to You</span>
              <strong className="dc__summary-value--green">{formatMoney(owedToMe, currency)}</strong>
              <em>{owedToMeDebts.length} {owedToMeDebts.length === 1 ? 'person owes' : 'people owe'} you</em>
            </div>
          </div>
          <div className="dc__summary-item dc__summary-item--red">
            <span className="dc__summary-icon dc__summary-icon--red">
              <Icon name="upload" size={18} />
            </span>
            <div>
              <span>You Owe</span>
              <strong className="dc__summary-value--red">{formatMoney(iOwe, currency)}</strong>
              <em>{iOweDebts.length} {iOweDebts.length === 1 ? 'person' : 'people'} you owe</em>
            </div>
          </div>
        </div>

        {debts.length > 0 && (
          <div className={`dc__balance dc__balance--${net >= 0 ? 'positive' : 'negative'}`}>
            <span className="dc__balance-icon">
              <Icon name="wallet" size={18} />
            </span>
            <div>
              <span>Overall Balance</span>
              <strong>
                {net >= 0 ? 'People owe you ' : 'You owe people '}
                {formatMoney(Math.abs(net), currency)}
              </strong>
              {otherCurrencyCount > 0 && (
                <span className="dc__currency-note">
                  {otherCurrencyCount} in other currencies not counted.
                </span>
              )}
            </div>
          </div>
        )}

        <div className="dc__tabs">
          <button
            type="button"
            className={`dc__tab${direction === 'owed_to_me' ? ' dc__tab--active-green' : ''}`}
            onClick={() => {
              hapticSelect();
              setDirection('owed_to_me');
            }}
          >
            <Icon name="user" size={15} />
            They owe me
            <em>{owedToMeDebts.length}</em>
          </button>
          <button
            type="button"
            className={`dc__tab${direction === 'i_owe' ? ' dc__tab--active-red' : ''}`}
            onClick={() => {
              hapticSelect();
              setDirection('i_owe');
            }}
          >
            <Icon name="user" size={15} />
            I owe them
            <em>{iOweDebts.length}</em>
          </button>
        </div>

        <div className="dc__add">
          <div className="dc__add-head">
            <span className={`dc__add-icon dc__add-icon--${direction === 'owed_to_me' ? 'green' : 'red'}`}>
              <Icon name="plus" size={16} />
            </span>
            <div>
              <strong>Add New Debt</strong>
              <span>Fill in the details to keep track</span>
            </div>
          </div>

          <div className="dc__row-fields">
            <div className="dc__field">
              <div className="dc__input-row">
                <Icon name="user" size={14} />
                <input placeholder="Person's name" value={person} onChange={(e) => setPerson(e.target.value)} />
              </div>
            </div>
            <div className="dc__field">
              <div className="dc__input-row">
                <Icon name="tag" size={14} />
                <input
                  placeholder="Debt name"
                  value={debtName}
                  onChange={(e) => setDebtName(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="dc__row-fields dc__row-fields--three">
            <div className="dc__field">
              <label className="dc__field-label">Amount</label>
              <div className="dc__input-row">
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
            <div className="dc__field">
              <label className="dc__field-label">Currency</label>
              <button type="button" className="dc__input-row dc__currency-btn" onClick={() => setShowCurrencySheet(true)}>
                <span>{currencyOption?.flag}</span>
                {currency}
              </button>
            </div>
            <div className="dc__field">
              <label className="dc__field-label">Due date</label>
              <button type="button" className="dc__input-row dc__due-btn" onClick={() => setShowDueCalendar((v) => !v)}>
                <Icon name="calendar" size={14} />
                <span>{dueAt ? formatDue(dueAt) : 'Set date'}</span>
              </button>
            </div>
          </div>

          {showDueCalendar && (
            <CalendarPicker
              selectedISO={dueAt ? toISODate(new Date(dueAt)) : toISODate(new Date())}
              onSelect={(iso) => {
                const d = parseISODate(iso);
                setDueAt(d?.getTime());
                setShowDueCalendar(false);
              }}
              accentColor={direction === 'owed_to_me' ? 'var(--green)' : 'var(--red)'}
            />
          )}

          <div className="dc__field">
            <div className="dc__input-row">
              <Icon name="file" size={14} />
              <input placeholder="Note (e.g. borrowed money)" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          <button
            type="button"
            className={`dc__add-btn dc__add-btn--${direction === 'owed_to_me' ? 'green' : 'red'}`}
            onClick={addDebt}
          >
            <Icon name="plus" size={16} />
            Add Debt
          </button>
        </div>

        {debts.length === 0 ? (
          <p className="dc__empty">No debts tracked yet. Add who owes you, or who you owe, above.</p>
        ) : (
          <>
            <DebtGroup
              title="People Who Owe You"
              debts={owedToMeDebts}
              tone="green"
              openSwipeId={openSwipeId}
              onOpenChange={setOpenSwipeId}
              onSettle={settleDebt}
              totalCurrency={currency}
            />
            <DebtGroup
              title="You Owe Them"
              debts={iOweDebts}
              tone="red"
              openSwipeId={openSwipeId}
              onOpenChange={setOpenSwipeId}
              onSettle={settleDebt}
              totalCurrency={currency}
            />
          </>
        )}
      </div>

      <div className="dc__actions">
        <button type="button" className="dc__action" onClick={() => setShowStats(true)}>
          <Icon name="trending-up" size={20} />
          Stats
        </button>
        <button type="button" className="dc__action" onClick={() => setShowCalendarSheet(true)}>
          <Icon name="calendar" size={20} />
          Calendar
        </button>
        <button type="button" className="dc__action" onClick={exportCsv}>
          <Icon name="download" size={20} />
          Export
        </button>
        <button type="button" className="dc__action" onClick={() => setShowSettings(true)}>
          <Icon name="settings" size={20} />
          Settings
        </button>
      </div>

      {showMenu && (
        <div className="dc__sheet" onClick={() => setShowMenu(false)}>
          <div className="dc__sheet-content" onClick={(e) => e.stopPropagation()}>
            <h2>Debt Tracker</h2>
            <button type="button" className="dc__menu-item" onClick={() => { setShowMenu(false); setShowStats(true); }}>
              <Icon name="trending-up" size={16} /> View Stats
            </button>
            <button type="button" className="dc__menu-item" onClick={() => { setShowMenu(false); setShowSettings(true); }}>
              <Icon name="settings" size={16} /> Settings
            </button>
            <button type="button" className="dc__sheet-close" onClick={() => setShowMenu(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {showCurrencySheet && (
        <div className="dc__sheet" onClick={() => setShowCurrencySheet(false)}>
          <div className="dc__sheet-content" onClick={(e) => e.stopPropagation()}>
            <h2>Select Currency</h2>
            <div className="dc__currency-grid">
              {CURRENCIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  className={`dc__currency-chip${currency === c.code ? ' dc__currency-chip--active' : ''}`}
                  onClick={() => {
                    hapticSelect();
                    setCurrency(c.code);
                    setShowCurrencySheet(false);
                  }}
                >
                  <span>{c.flag}</span>
                  {c.code}
                </button>
              ))}
            </div>
            <button type="button" className="dc__sheet-close" onClick={() => setShowCurrencySheet(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {showStats && (
        <div className="dc__sheet" onClick={() => setShowStats(false)}>
          <div className="dc__sheet-content" onClick={(e) => e.stopPropagation()}>
            <h2>Stats</h2>
            <div className="dc__stat-rows">
              <div className="dc__stat-row">
                <span>Total debts tracked</span>
                <strong>{debts.length}</strong>
              </div>
              <div className="dc__stat-row">
                <span>People who owe you</span>
                <strong>{owedToMeDebts.length}</strong>
              </div>
              <div className="dc__stat-row">
                <span>People you owe</span>
                <strong>{iOweDebts.length}</strong>
              </div>
              <div className="dc__stat-row">
                <span>Largest debt owed to you</span>
                <strong>{formatMoney(Math.max(0, ...owedToMeDebts.filter(inCurrency).map((d) => d.amount)), currency)}</strong>
              </div>
              <div className="dc__stat-row">
                <span>Largest debt you owe</span>
                <strong>{formatMoney(Math.max(0, ...iOweDebts.filter(inCurrency).map((d) => d.amount)), currency)}</strong>
              </div>
              <div className="dc__stat-row">
                <span>Net balance</span>
                <strong className={net >= 0 ? 'dc__summary-value--green' : 'dc__summary-value--red'}>
                  {net >= 0 ? '+' : '-'}
                  {formatMoney(Math.abs(net), currency)}
                </strong>
              </div>
            </div>
            <button type="button" className="dc__sheet-close" onClick={() => setShowStats(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {showCalendarSheet && (
        <div className="dc__sheet" onClick={() => setShowCalendarSheet(false)}>
          <div className="dc__sheet-content" onClick={(e) => e.stopPropagation()}>
            <h2>Upcoming Due Dates</h2>
            {upcoming.length === 0 ? (
              <p className="dc__empty">No debts have a due date set.</p>
            ) : (
              <ul className="dc__due-list">
                {upcoming.map((d) => {
                  const badge = dueBadge(d.dueAt);
                  return (
                    <li key={d.id} className="dc__due-item">
                      <span className={`dc__due-dot dc__due-dot--${d.direction === 'owed_to_me' ? 'green' : 'red'}`} />
                      <span className="dc__due-info">
                        <strong>{d.person}</strong>
                        <span>{formatDue(d.dueAt)}</span>
                      </span>
                      <span className={`dc__due-badge${badge?.overdue ? ' dc__due-badge--overdue' : ''}`}>
                        {badge?.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <button type="button" className="dc__sheet-close" onClick={() => setShowCalendarSheet(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="dc__sheet" onClick={() => setShowSettings(false)}>
          <div className="dc__sheet-content" onClick={(e) => e.stopPropagation()}>
            <h2>Settings</h2>
            <div className="dc__setting-row">
              <span className="dc__setting-text">
                <span className="dc__setting-title">Default Currency</span>
                <span className="dc__setting-desc">Used when adding a new debt</span>
              </span>
            </div>
            <div className="dc__currency-grid">
              {CURRENCIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  className={`dc__currency-chip${currency === c.code ? ' dc__currency-chip--active' : ''}`}
                  onClick={() => {
                    hapticSelect();
                    setCurrency(c.code);
                    storageSet(StorageKeys.debtDefaultCurrency, c.code);
                  }}
                >
                  <span>{c.flag}</span>
                  {c.code}
                </button>
              ))}
            </div>
            <button type="button" className="dc__sheet-close" onClick={() => setShowSettings(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {exportStatus && (
        <div className="dc__toast" onAnimationEnd={() => setExportStatus(null)}>
          {exportStatus}
        </div>
      )}
    </div>
  );
}

function DebtGroup({
  title,
  debts,
  tone,
  openSwipeId,
  onOpenChange,
  onSettle,
  totalCurrency,
}: {
  title: string;
  debts: DebtEntry[];
  tone: 'green' | 'red';
  openSwipeId: string | null;
  onOpenChange: (id: string | null) => void;
  onSettle: (id: string) => void;
  totalCurrency: string;
}) {
  if (debts.length === 0) return null;
  const total = debts.reduce((sum, d) => sum + d.amount, 0);
  return (
    <div className="dc__group">
      <div className="dc__group-header">
        <strong>
          {title} ({debts.length})
        </strong>
        <span>
          Total: <em className={`dc__summary-value--${tone}`}>{formatMoney(total, totalCurrency)}</em>
        </span>
      </div>
      <ul className="dc__list">
        {debts.map((debt) => {
          const badge = dueBadge(debt.dueAt);
          return (
            <li key={debt.id}>
              <SwipeToDelete id={debt.id} openId={openSwipeId} onOpenChange={onOpenChange} onDelete={() => onSettle(debt.id)}>
                <div className="dc__row">
                  <span className={`dc__row-icon dc__row-icon--${tone}`}>{debt.person.slice(0, 1).toUpperCase()}</span>
                  <span className="dc__row-info">
                    <span className="dc__row-name-line">
                      <span className="dc__row-name">{debt.person}</span>
                      <span className={`dc__row-pill dc__row-pill--${tone}`}>
                        {tone === 'green' ? 'Owes you' : 'You owe'}
                      </span>
                    </span>
                    <span className="dc__row-note">{debt.debtName ?? debt.note ?? ''}</span>
                    {debt.dueAt && (
                      <span className="dc__row-due">
                        <Icon name="calendar" size={11} /> {formatDue(debt.dueAt)}
                        {badge && (
                          <span className={`dc__due-badge dc__due-badge--inline${badge.overdue ? ' dc__due-badge--overdue' : ''}`}>
                            {badge.label}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                  <span className="dc__row-amount-col">
                    <span className={`dc__row-amount dc__row-amount--${tone}`}>{formatMoney(debt.amount, debt.currency)}</span>
                    <span className="dc__row-currency">{debt.currency ?? DEFAULT_CURRENCY}</span>
                  </span>
                </div>
              </SwipeToDelete>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
