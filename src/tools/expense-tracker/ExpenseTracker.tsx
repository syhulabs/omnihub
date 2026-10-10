import { useMemo, useState } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon } from '../../components/Icon';
import { SearchBar } from '../../components/SearchBar';
import { useRouter } from '../../app/Router';
import { storageGet, storageSet, StorageKeys } from '../../storage/db';
import { useCloudSync } from '../../cloud/useCloudSync';
import { hapticSelect, hapticTap } from '../../haptics';
import { AddExpense } from './AddExpense';
import { EXPENSE_CATEGORIES, getCategory } from './categories';
import { currentMonthKey, formatMonthLabel, shiftMonthKey } from './month';
import { CURRENCIES, appDefaultCurrency, currencySymbol, formatMoney } from '../shared/currencies';
import type { Expense } from './types';
import './ExpenseTracker.css';

type Tab = 'overview' | 'categories' | 'history';

function formatDayHeader(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function ExpenseTracker() {
  const { back } = useRouter();
  const [expenses, setExpenses] = useState<Expense[]>(() => storageGet(StorageKeys.expenses, []));
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [adding, setAdding] = useState<{ categoryId?: string } | false>(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showCurrencySheet, setShowCurrencySheet] = useState(false);
  const [currency, setCurrency] = useState(() => storageGet(StorageKeys.expenseDefaultCurrency, appDefaultCurrency()));
  const [toast, setToast] = useState<string | null>(null);

  function selectCurrency(code: string) {
    hapticSelect();
    setCurrency(code);
    storageSet(StorageKeys.expenseDefaultCurrency, code);
    setShowCurrencySheet(false);
  }

  function rawPersist(next: Expense[]) {
    setExpenses(next);
    storageSet(StorageKeys.expenses, next);
  }

  const { persist } = useCloudSync('expenses', expenses, rawPersist);

  const monthExpenses = useMemo(
    () => expenses.filter((e) => e.dateISO.slice(0, 7) === monthKey).sort((a, b) => (a.dateISO < b.dateISO ? 1 : -1)),
    [expenses, monthKey],
  );

  const prevMonthTotal = useMemo(() => {
    const prevKey = shiftMonthKey(monthKey, -1);
    return expenses.filter((e) => e.dateISO.slice(0, 7) === prevKey).reduce((sum, e) => sum + e.amount, 0);
  }, [expenses, monthKey]);

  const total = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  const monthChange = prevMonthTotal > 0 ? ((total - prevMonthTotal) / prevMonthTotal) * 100 : null;

  const today = new Date();
  const isCurrentMonth = monthKey === currentMonthKey();
  const daysElapsed = isCurrentMonth ? today.getDate() : new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0).getDate();
  const dailyAverage = daysElapsed > 0 ? total / daysElapsed : 0;
  const avgPerTransaction = monthExpenses.length > 0 ? total / monthExpenses.length : 0;

  const categoryTotals = useMemo(() => {
    const totals = new Map<string, { amount: number; count: number }>();
    for (const e of monthExpenses) {
      const cur = totals.get(e.categoryId) ?? { amount: 0, count: 0 };
      totals.set(e.categoryId, { amount: cur.amount + e.amount, count: cur.count + 1 });
    }
    return EXPENSE_CATEGORIES.map((cat) => ({ cat, ...(totals.get(cat.id) ?? { amount: 0, count: 0 }) }))
      .filter((row) => row.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [monthExpenses]);

  const maxCategoryAmount = categoryTotals[0]?.amount ?? 0;
  const topCategory = categoryTotals[0]?.cat ?? null;

  const historyExpenses = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return monthExpenses.filter((e) => {
      if (historyFilter && e.categoryId !== historyFilter) return false;
      if (q && !e.note.toLowerCase().includes(q) && !getCategory(e.categoryId).label.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [monthExpenses, historySearch, historyFilter]);

  const historyGroups = useMemo(() => {
    const groups = new Map<string, Expense[]>();
    for (const e of historyExpenses) {
      const list = groups.get(e.dateISO) ?? [];
      list.push(e);
      groups.set(e.dateISO, list);
    }
    return [...groups.entries()].sort(([a], [b]) => (a < b ? 1 : -1));
  }, [historyExpenses]);

  function addExpense(expense: Expense) {
    persist([expense, ...expenses]);
    setAdding(false);
  }

  function deleteExpense(id: string) {
    persist(expenses.filter((e) => e.id !== id));
  }

  function exportCsv() {
    hapticTap();
    const header = 'Date,Category,Note,Amount';
    const rows = monthExpenses.map((e) =>
      [e.dateISO, getCategory(e.categoryId).label, e.note, e.amount.toFixed(2)]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    const csv = [header, ...rows].join('\n');
    if (navigator.share) {
      navigator.share({ title: `Expenses — ${formatMonthLabel(monthKey)}`, text: csv }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(csv).then(() => setToast('Copied CSV to clipboard.'));
    }
    setShowMenu(false);
  }

  if (adding) {
    return (
      <AddExpense
        initialCategoryId={adding ? adding.categoryId : undefined}
        currencySymbol={currencySymbol(currency)}
        onSave={addExpense}
        onClose={() => setAdding(false)}
      />
    );
  }

  return (
    <div className="screen">
      <ScreenHeader
        title="Expense Tracker"
        subtitle="Track your spending, reach your goals"
        onBack={back}
        action={
          <button type="button" className="et__header-btn" onClick={() => setShowMenu(true)} aria-label="More">
            <Icon name="more-dots" size={20} />
          </button>
        }
      />

      <div className="et__month-nav">
        <button type="button" onClick={() => setMonthKey(shiftMonthKey(monthKey, -1))} aria-label="Previous month">
          <Icon name="chevron-right" size={18} className="et__prev-icon" />
        </button>
        <Icon name="calendar" size={14} />
        <span>{formatMonthLabel(monthKey)}</span>
        <button type="button" onClick={() => setMonthKey(shiftMonthKey(monthKey, 1))} aria-label="Next month">
          <Icon name="chevron-right" size={18} />
        </button>
      </div>

      <div className="et__tabs">
        <button type="button" className={`et__tab${tab === 'overview' ? ' et__tab--active' : ''}`} onClick={() => setTab('overview')}>
          Overview
        </button>
        <button type="button" className={`et__tab${tab === 'categories' ? ' et__tab--active' : ''}`} onClick={() => setTab('categories')}>
          Categories
        </button>
        <button type="button" className={`et__tab${tab === 'history' ? ' et__tab--active' : ''}`} onClick={() => setTab('history')}>
          History
        </button>
      </div>

      {tab === 'overview' && (
        <div className="et__body">
          <div className="et__hero">
            <span className="et__hero-label">Total Spent</span>
            <span className="et__hero-amount">{formatMoney(total, currency)}</span>
            {monthChange !== null && (
              <span className={`et__hero-change${monthChange > 0 ? ' et__hero-change--up' : monthChange < 0 ? ' et__hero-change--down' : ''}`}>
                <Icon name="trending-up" size={12} className={monthChange < 0 ? 'et__hero-change-icon--down' : undefined} />
                {Math.abs(monthChange).toFixed(0)}% vs last month
              </span>
            )}
            <span className="et__hero-count">{monthExpenses.length} transaction{monthExpenses.length === 1 ? '' : 's'}</span>
          </div>

          <div className="et__stat-row">
            <div className="et__stat-card">
              <Icon name="calendar" size={16} />
              <strong>{formatMoney(dailyAverage, currency)}</strong>
              <span>Daily Avg</span>
            </div>
            <div className="et__stat-card">
              <Icon name="receipt" size={16} />
              <strong>{formatMoney(avgPerTransaction, currency)}</strong>
              <span>Per Transaction</span>
            </div>
            <div className="et__stat-card">
              {topCategory ? (
                <>
                  <Icon name={topCategory.icon} size={16} style={{ color: topCategory.color }} />
                  <strong>{topCategory.label}</strong>
                </>
              ) : (
                <>
                  <Icon name="pie-chart" size={16} />
                  <strong>—</strong>
                </>
              )}
              <span>Top Category</span>
            </div>
          </div>

          <div className="et__quick-add">
            {EXPENSE_CATEGORIES.slice(0, 5).map((cat) => (
              <button
                key={cat.id}
                type="button"
                className="et__quick-chip"
                style={{ '--cat-color': cat.color } as React.CSSProperties}
                onClick={() => {
                  hapticSelect();
                  setAdding({ categoryId: cat.id });
                }}
              >
                <Icon name={cat.icon} size={16} />
                {cat.label}
              </button>
            ))}
          </div>

          {categoryTotals.length > 0 && (
            <div className="et__section">
              <div className="et__section-header">
                <h2>Top Categories</h2>
                <button type="button" onClick={() => setTab('categories')}>
                  See all <Icon name="chevron-right" size={12} />
                </button>
              </div>
              <div className="et__chart">
                {categoryTotals.slice(0, 3).map(({ cat, amount }) => (
                  <div key={cat.id} className="et__chart-row">
                    <span className="et__chart-label">
                      <Icon name={cat.icon} size={14} style={{ color: cat.color }} />
                      {cat.label}
                    </span>
                    <div className="et__chart-track">
                      <div className="et__chart-bar" style={{ width: `${(amount / maxCategoryAmount) * 100}%`, background: cat.color }} />
                    </div>
                    <span className="et__chart-amount">{formatMoney(amount, currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="et__section">
            <div className="et__section-header">
              <h2>Recent Transactions</h2>
              <button type="button" onClick={() => setTab('history')}>
                View all <Icon name="chevron-right" size={12} />
              </button>
            </div>
            {monthExpenses.length === 0 ? (
              <p className="et__empty">No expenses for {formatMonthLabel(monthKey)} yet.</p>
            ) : (
              <ul className="et__list">
                {monthExpenses.slice(0, 5).map((expense) => (
                  <ExpenseRow key={expense.id} expense={expense} currency={currency} onDelete={deleteExpense} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'categories' && (
        <div className="et__body">
          {categoryTotals.length === 0 ? (
            <p className="et__empty">No spending yet for {formatMonthLabel(monthKey)}.</p>
          ) : (
            <ul className="et__cat-list">
              {categoryTotals.map(({ cat, amount, count }) => (
                <li key={cat.id}>
                  <button
                    type="button"
                    className="et__cat-row"
                    onClick={() => {
                      setHistoryFilter(cat.id);
                      setTab('history');
                    }}
                  >
                    <span className="et__cat-icon" style={{ background: `color-mix(in srgb, ${cat.color} 18%, transparent)`, color: cat.color }}>
                      <Icon name={cat.icon} size={18} />
                    </span>
                    <span className="et__cat-info">
                      <span className="et__cat-name-row">
                        <strong>{cat.label}</strong>
                        <strong>{formatMoney(amount, currency)}</strong>
                      </span>
                      <div className="et__chart-track">
                        <div className="et__chart-bar" style={{ width: `${(amount / maxCategoryAmount) * 100}%`, background: cat.color }} />
                      </div>
                      <span className="et__cat-meta">
                        {((amount / total) * 100).toFixed(0)}% of spending · {count} transaction{count === 1 ? '' : 's'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="et__body">
          <SearchBar value={historySearch} onChange={setHistorySearch} placeholder="Search transactions..." />

          <div className="et__filter-row">
            <button
              type="button"
              className={`et__filter-chip${historyFilter === null ? ' et__filter-chip--active' : ''}`}
              onClick={() => setHistoryFilter(null)}
            >
              All
            </button>
            {categoryTotals.map(({ cat }) => (
              <button
                key={cat.id}
                type="button"
                className={`et__filter-chip${historyFilter === cat.id ? ' et__filter-chip--active' : ''}`}
                onClick={() => setHistoryFilter(cat.id)}
              >
                <Icon name={cat.icon} size={12} /> {cat.label}
              </button>
            ))}
          </div>

          {historyGroups.length === 0 ? (
            <p className="et__empty">No matching transactions.</p>
          ) : (
            <div className="et__history">
              {historyGroups.map(([dateISO, items]) => (
                <div key={dateISO} className="et__day-group">
                  <div className="et__day-header">
                    <span>{formatDayHeader(dateISO)}</span>
                    <span>{formatMoney(items.reduce((sum, e) => sum + e.amount, 0), currency)}</span>
                  </div>
                  <ul className="et__list">
                    {items.map((expense) => (
                      <ExpenseRow key={expense.id} expense={expense} currency={currency} onDelete={deleteExpense} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button type="button" className="et__fab" onClick={() => setAdding({})} aria-label="Add expense">
        <Icon name="plus" size={24} />
      </button>

      {showMenu && (
        <div className="et__sheet" onClick={() => setShowMenu(false)}>
          <div className="et__sheet-content" onClick={(e) => e.stopPropagation()}>
            <h2>Expense Tracker</h2>
            <button type="button" className="et__menu-item" onClick={exportCsv}>
              <Icon name="download" size={16} /> Export {formatMonthLabel(monthKey)} as CSV
            </button>
            <button
              type="button"
              className="et__menu-item"
              onClick={() => {
                setShowMenu(false);
                setShowCurrencySheet(true);
              }}
            >
              <Icon name="wallet" size={16} /> Currency ({currency})
            </button>
            <button type="button" className="et__sheet-close" onClick={() => setShowMenu(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {showCurrencySheet && (
        <div className="et__sheet" onClick={() => setShowCurrencySheet(false)}>
          <div className="et__sheet-content" onClick={(e) => e.stopPropagation()}>
            <h2>Select Currency</h2>
            <div className="et__currency-grid">
              {CURRENCIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  className={`et__currency-chip${currency === c.code ? ' et__currency-chip--active' : ''}`}
                  onClick={() => selectCurrency(c.code)}
                >
                  <span>{c.flag}</span>
                  {c.code}
                </button>
              ))}
            </div>
            <button type="button" className="et__sheet-close" onClick={() => setShowCurrencySheet(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="et__toast" onAnimationEnd={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  );
}

function ExpenseRow({ expense, currency, onDelete }: { expense: Expense; currency: string; onDelete: (id: string) => void }) {
  const cat = getCategory(expense.categoryId);
  return (
    <li className="et__row">
      <span className="et__row-icon" style={{ background: `color-mix(in srgb, ${cat.color} 18%, transparent)`, color: cat.color }}>
        <Icon name={cat.icon} size={16} />
      </span>
      <span className="et__row-info">
        <span className="et__row-title">{expense.note || cat.label}</span>
        <span className="et__row-date">{cat.label}</span>
      </span>
      <span className="et__row-amount">{formatMoney(expense.amount, currency)}</span>
      <button type="button" className="et__row-delete" onClick={() => onDelete(expense.id)} aria-label="Delete expense">
        <Icon name="x" size={14} />
      </button>
    </li>
  );
}
