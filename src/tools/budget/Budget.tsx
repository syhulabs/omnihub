import { useMemo, useState } from 'react';
import { fillColor } from '../../theme/fill';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon } from '../../components/Icon';
import { useRouter } from '../../app/Router';
import { useBackHandler } from '../../app/useBackHandler';
import { storageGet, storageSet, StorageKeys } from '../../storage/db';
import { hapticTap, hapticWarning } from '../../haptics';
import { useCloudSync } from '../../cloud/useCloudSync';
import { EXPENSE_CATEGORIES, getCategory } from '../expense-tracker/categories';
import { currentMonthKey, formatMonthLabel, shiftMonthKey } from '../expense-tracker/month';
import { CURRENCIES, appDefaultCurrency, formatMoney } from '../shared/currencies';
import type { Expense } from '../expense-tracker/types';
import type { BudgetLimit } from './types';
import { SetBudget } from './SetBudget';
import './Budget.css';

const RING_R = 44;
const RING_C = 2 * Math.PI * RING_R;

/** Reads budgets, migrating the old `{categoryId: amount}` map shape (pre-sync) into a list on first load. */
function loadBudgets(): BudgetLimit[] {
  const raw = storageGet<unknown>(StorageKeys.budgets, []);
  if (Array.isArray(raw)) return raw as BudgetLimit[];

  const legacy = raw as Record<string, number>;
  const now = Date.now();
  const migrated: BudgetLimit[] = Object.entries(legacy)
    .filter(([, amount]) => amount > 0)
    .map(([categoryId, amount]) => ({ id: categoryId, categoryId, amount, updatedAt: now }));
  storageSet(StorageKeys.budgets, migrated);
  return migrated;
}

export function Budget() {
  const { back } = useRouter();
  const [budgets, setBudgets] = useState<BudgetLimit[]>(() => loadBudgets());
  const [expenses] = useState<Expense[]>(() => storageGet(StorageKeys.expenses, []));
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [confirmingResetAll, setConfirmingResetAll] = useState(false);
  const [showCurrencySheet, setShowCurrencySheet] = useState(false);
  const [currency, setCurrency] = useState(() => storageGet(StorageKeys.budgetDefaultCurrency, appDefaultCurrency()));

  function selectCurrency(code: string) {
    hapticTap();
    setCurrency(code);
    storageSet(StorageKeys.budgetDefaultCurrency, code);
    setShowCurrencySheet(false);
  }

  useBackHandler(() => setShowMenu(false), showMenu);
  useBackHandler(() => setConfirmingResetAll(false), confirmingResetAll);

  // Hardware back closes an open sheet or panel instead of leaving the tool.
  useBackHandler(() => setShowCurrencySheet(false), showCurrencySheet);

  function rawPersist(next: BudgetLimit[]) {
    setBudgets(next);
    storageSet(StorageKeys.budgets, next);
  }

  const { persist } = useCloudSync('budgets', budgets, rawPersist);

  const budgetMap = useMemo(() => new Map(budgets.map((b) => [b.categoryId, b])), [budgets]);

  const spentByCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const e of expenses) {
      if (e.dateISO.slice(0, 7) !== monthKey) continue;
      totals.set(e.categoryId, (totals.get(e.categoryId) ?? 0) + e.amount);
    }
    return totals;
  }, [expenses, monthKey]);

  const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
  const totalSpent = [...spentByCategory.values()].reduce((sum, v) => sum + v, 0);
  const usedPct = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0;
  const remaining = Math.max(0, totalBudget - totalSpent);

  const isCurrentMonth = monthKey === currentMonthKey();
  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayOfMonth = isCurrentMonth ? new Date().getDate() : daysInMonth;
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
  const dailyAverage = dayOfMonth > 0 ? totalSpent / dayOfMonth : 0;

  function saveBudget(categoryId: string, patch: { amount: number; alertEnabled: boolean; alertThresholdPct: number }) {
    const withoutCategory = budgets.filter((b) => b.categoryId !== categoryId);
    const existing = budgetMap.get(categoryId);
    const next =
      patch.amount > 0
        ? [
            ...withoutCategory,
            {
              id: existing?.id ?? categoryId,
              categoryId,
              amount: patch.amount,
              alertEnabled: patch.alertEnabled,
              alertThresholdPct: patch.alertThresholdPct,
              updatedAt: Date.now(),
            },
          ]
        : withoutCategory;
    persist(next);
    setEditingCategoryId(null);
  }

  function removeBudget(categoryId: string) {
    hapticWarning();
    persist(budgets.filter((b) => b.categoryId !== categoryId));
    setEditingCategoryId(null);
  }

  function resetAll() {
    hapticWarning();
    persist([]);
    setConfirmingResetAll(false);
    setShowMenu(false);
  }

  if (editingCategoryId) {
    const category = getCategory(editingCategoryId);
    const budget = budgetMap.get(editingCategoryId);
    return (
      <SetBudget
        category={category}
        budget={budget}
        currency={currency}
        monthLabel={formatMonthLabel(monthKey)}
        spent={spentByCategory.get(editingCategoryId) ?? 0}
        onSave={(patch) => saveBudget(editingCategoryId, patch)}
        onDelete={() => removeBudget(editingCategoryId)}
        onClose={() => setEditingCategoryId(null)}
      />
    );
  }

  return (
    <div className="screen">
      <ScreenHeader
        title="Budget"
        subtitle={formatMonthLabel(monthKey)}
        onBack={back}
        action={
          <button
            type="button"
            className="bg__header-btn"
            onClick={() => {
              hapticTap();
              setShowMenu(true);
            }}
            aria-label="More options"
          >
            <Icon name="more-dots" size={20} />
          </button>
        }
      />

      <div className="bg__month-nav">
        <button type="button" onClick={() => setMonthKey(shiftMonthKey(monthKey, -1))} aria-label="Previous month">
          <Icon name="chevron-right" size={18} className="bg__prev-icon" />
        </button>
        <Icon name="calendar" size={15} />
        <span>{formatMonthLabel(monthKey)}</span>
        <button type="button" onClick={() => setMonthKey(shiftMonthKey(monthKey, 1))} aria-label="Next month">
          <Icon name="chevron-right" size={18} />
        </button>
      </div>

      <div className="bg__overview">
        <div className="bg__ring-wrap">
          <svg className="bg__ring" viewBox="0 0 100 100">
            <circle className="bg__ring-track" cx="50" cy="50" r={RING_R} />
            <circle
              className={`bg__ring-progress${usedPct >= 100 ? ' bg__ring-progress--over' : ''}`}
              cx="50"
              cy="50"
              r={RING_R}
              style={{ strokeDasharray: RING_C, strokeDashoffset: RING_C * (1 - usedPct / 100) }}
            />
          </svg>
          <div className="bg__ring-center">
            <strong>{Math.round(usedPct)}%</strong>
            <span>Used</span>
          </div>
        </div>
        <div className="bg__overview-stats">
          <div className="bg__overview-stat">
            <span>Total Budget</span>
            <strong>{formatMoney(totalBudget, currency)}</strong>
          </div>
          <div className="bg__overview-stat">
            <span>Total Spent</span>
            <strong>{formatMoney(totalSpent, currency)}</strong>
          </div>
          <div className={`bg__overview-remaining${remaining === 0 && totalBudget > 0 ? ' bg__overview-remaining--over' : ''}`}>
            {remaining === 0 && totalBudget > 0 && <Icon name="info" size={14} />}
            {totalBudget === 0
              ? 'Set a budget to get started'
              : remaining === 0
                ? "You've reached your budget"
                : `${formatMoney(remaining, currency)} left`}
          </div>
        </div>
      </div>

      {isCurrentMonth && (
        <div className="bg__mini-stats">
          <div className="bg__mini-stat">
            <Icon name="wallet" size={16} />
            <div>
              <strong>{formatMoney(dailyAverage, currency)}</strong>
              <span>Daily Average</span>
            </div>
          </div>
          <div className="bg__mini-stat">
            <Icon name="calendar" size={16} />
            <div>
              <strong>{daysLeft}</strong>
              <span>Days Left</span>
            </div>
          </div>
        </div>
      )}

      <div className="bg__list-header">
        <h2>Category Budgets</h2>
      </div>

      <ul className="bg__list">
        {EXPENSE_CATEGORIES.map((cat) => {
          const spent = spentByCategory.get(cat.id) ?? 0;
          const budget = budgetMap.get(cat.id);
          const limit = budget?.amount ?? 0;
          const hasLimit = limit > 0;
          const pct = hasLimit ? Math.min(100, (spent / limit) * 100) : 0;
          const over = hasLimit && spent > limit;
          // The category's Spending Alert: warn once spending crosses its threshold.
          const near =
            hasLimit && !over && (budget?.alertEnabled ?? true) && pct >= (budget?.alertThresholdPct ?? 80);
          const tone = over ? 'bg__over' : near ? 'bg__near' : '';

          return (
            <li key={cat.id}>
              <button type="button" className="bg__card" onClick={() => setEditingCategoryId(cat.id)}>
                <div className="bg__card-top">
                  <span className="bg__card-name">
                    <Icon name={cat.icon} size={16} style={{ color: cat.color }} />
                    {cat.label}
                  </span>
                  <Icon name="chevron-right" size={16} className="bg__card-chevron" />
                </div>
                <div className="bg__track">
                  <div
                    className="bg__bar"
                    style={{ width: `${pct}%`, background: fillColor(over ? 'var(--red)' : near ? 'var(--orange)' : cat.color) }}
                  />
                </div>
                <div className="bg__card-bottom">
                  <span className={tone}>
                    {formatMoney(spent, currency)} / {hasLimit ? formatMoney(limit, currency) : formatMoney(0, currency)}
                  </span>
                  <span className={tone}>{hasLimit ? `${Math.round(pct)}%` : '0%'}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="bg__tip">
        <Icon name="lightbulb" size={16} />
        Tip: Set a budget for each category to keep track of your spending and build better habits.
      </p>

      {showMenu && (
        <div className="bg__menu-overlay" onClick={() => setShowMenu(false)}>
          <div className="bg__menu-sheet" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="bg__menu-item"
              onClick={() => {
                setShowMenu(false);
                setShowCurrencySheet(true);
              }}
            >
              <Icon name="wallet" size={18} />
              Currency ({currency})
            </button>
            <button
              type="button"
              className="bg__menu-item bg__menu-item--danger"
              onClick={() => setConfirmingResetAll(true)}
            >
              <Icon name="repeat" size={18} />
              Reset All Budgets
            </button>
            <button type="button" className="bg__menu-cancel" onClick={() => setShowMenu(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showCurrencySheet && (
        <div className="bg__menu-overlay" onClick={() => setShowCurrencySheet(false)}>
          <div className="bg__menu-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bg__currency-grid">
              {CURRENCIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  className={`bg__currency-chip${currency === c.code ? ' bg__currency-chip--active' : ''}`}
                  onClick={() => selectCurrency(c.code)}
                >
                  <span>{c.flag}</span>
                  {c.code}
                </button>
              ))}
            </div>
            <button type="button" className="bg__menu-cancel" onClick={() => setShowCurrencySheet(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {confirmingResetAll && (
        <div className="bg__menu-overlay" onClick={() => setConfirmingResetAll(false)}>
          <div className="bg__menu-sheet" onClick={(e) => e.stopPropagation()}>
            <p className="bg__confirm-text">Remove all category budgets? This can't be undone.</p>
            <button type="button" className="bg__menu-item bg__menu-item--danger" onClick={resetAll}>
              <Icon name="trash" size={18} />
              Reset All
            </button>
            <button type="button" className="bg__menu-cancel" onClick={() => setConfirmingResetAll(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
