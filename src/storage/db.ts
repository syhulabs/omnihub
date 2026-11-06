import { notifyStorageError } from './storageErrorBus';

const PREFIX = 'omnihub:';

export const StorageKeys = {
  theme: `${PREFIX}theme`,
  pinnedTools: `${PREFIX}pinnedTools`,
  calculatorHistory: `${PREFIX}calculator.history`,
  notes: `${PREFIX}notes`,
  checklists: `${PREFIX}checklists`,
  expenses: `${PREFIX}expenses`,
  budgets: `${PREFIX}budgets`,
  randomLists: `${PREFIX}random.lists`,
  homeSections: `${PREFIX}home.sections`,
  homeMyPhonePosition: `${PREFIX}home.myPhonePosition`,
  vaultSalt: `${PREFIX}vault.salt`,
  vaultCanary: `${PREFIX}vault.canary`,
  vaultFailedAttempts: `${PREFIX}vault.failedAttempts`,
  vaultLockedUntil: `${PREFIX}vault.lockedUntil`,
  vaultNotes: `${PREFIX}vault.notes`,
  alarmPresets: `${PREFIX}alarm.presets`,
  alarmFavoriteSounds: `${PREFIX}alarm.favoriteSounds`,
  alarmCustomSounds: `${PREFIX}alarm.customSounds`,
  alarmCategoryDefaultSounds: `${PREFIX}alarm.categoryDefaultSounds`,
  toolSuggestions: `${PREFIX}tools.suggestions`,
  subscriptions: `${PREFIX}subscriptions`,
  timeZoneCities: `${PREFIX}timeZone.cities`,
  debts: `${PREFIX}debts`,
  compassSettings: `${PREFIX}compass.settings`,
  timerHistory: `${PREFIX}timer.history`,
  timerState: `${PREFIX}timer.state`,
  stopwatchState: `${PREFIX}stopwatch.state`,
  stopwatchHistory: `${PREFIX}stopwatch.history`,
  diceRollHistory: `${PREFIX}random.diceHistory`,
  checklistCategories: `${PREFIX}checklist.categories`,
  percentageHistory: `${PREFIX}percentage.history`,
  people: `${PREFIX}age.people`,
  debtDefaultCurrency: `${PREFIX}debt.defaultCurrency`,
  timeZoneFavorites: `${PREFIX}timeZone.favorites`,
  subscriptionDefaultCurrency: `${PREFIX}subscription.defaultCurrency`,
  expenseDefaultCurrency: `${PREFIX}expense.defaultCurrency`,
  budgetDefaultCurrency: `${PREFIX}budget.defaultCurrency`,
  hapticsEnabled: `${PREFIX}settings.hapticsEnabled`,
  keepAwakeEnabled: `${PREFIX}settings.keepAwakeEnabled`,
  textScale: `${PREFIX}settings.textScale`,
  clockFormat24h: `${PREFIX}settings.clockFormat24h`,
  dateFormat: `${PREFIX}settings.dateFormat`,
  firstDayOfWeek: `${PREFIX}settings.firstDayOfWeek`,
  defaultCurrency: `${PREFIX}settings.defaultCurrency`,
  measurementSystem: `${PREFIX}settings.measurementSystem`,
  appLockEnabled: `${PREFIX}settings.appLockEnabled`,
  appLockPinHash: `${PREFIX}settings.appLockPinHash`,
  appLockPinSalt: `${PREFIX}settings.appLockPinSalt`,
  vaultAutoLockMinutes: `${PREFIX}settings.vaultAutoLockMinutes`,
  appLockBiometricEnabled: `${PREFIX}settings.appLockBiometricEnabled`,
  appLockFailedAttempts: `${PREFIX}settings.appLockFailedAttempts`,
  appLockLockedUntil: `${PREFIX}settings.appLockLockedUntil`,
  vaultBiometricEnabled: `${PREFIX}settings.vaultBiometricEnabled`,
} as const;

export function storageGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function storageSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // Storage full or unavailable. The write is lost and the caller has no return value to
    // check, so this needs to be visible — console for a device's logcat/crash reporting, and a
    // toast (see storageErrorBus/StorageErrorToast) since the UI otherwise has no idea a save
    // just silently failed.
    console.error(`storageSet failed for "${key}":`, err);
    notifyStorageError("Couldn't save — your device may be out of storage space.");
  }
}

export function storageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function allOmniHubKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  return keys;
}

export interface BackupPayload {
  app: 'omni-hub';
  version: 1;
  exportedAt: string;
  data: Record<string, unknown>;
}

export function exportBackup(): BackupPayload {
  const data: Record<string, unknown> = {};
  for (const key of allOmniHubKeys()) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try {
      data[key] = JSON.parse(raw);
    } catch {
      // skip unparsable value
    }
  }
  return {
    app: 'omni-hub',
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function importBackup(payload: unknown): { imported: number } {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    (payload as Partial<BackupPayload>).app !== 'omni-hub' ||
    typeof (payload as Partial<BackupPayload>).data !== 'object'
  ) {
    throw new Error('This file is not a valid Omni Hub backup.');
  }
  const { data } = payload as BackupPayload;
  let imported = 0;
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith(PREFIX)) continue;
    storageSet(key, value);
    imported++;
  }
  return { imported };
}

export function clearAllData(): void {
  for (const key of allOmniHubKeys()) {
    storageRemove(key);
  }
}
