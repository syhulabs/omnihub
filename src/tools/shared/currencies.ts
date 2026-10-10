import { storageGet, StorageKeys } from '../../storage/db';

export interface CurrencyOption {
  code: string;
  flag: string;
  name: string;
  symbol: string;
}

export const CURRENCIES: CurrencyOption[] = [
  { code: 'MYR', flag: '🇲🇾', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'USD', flag: '🇺🇸', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', flag: '🇪🇺', name: 'Euro', symbol: '€' },
  { code: 'GBP', flag: '🇬🇧', name: 'British Pound', symbol: '£' },
  { code: 'JPY', flag: '🇯🇵', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CNY', flag: '🇨🇳', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'SGD', flag: '🇸🇬', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'IDR', flag: '🇮🇩', name: 'Indonesian Rupiah', symbol: 'Rp' },
  { code: 'INR', flag: '🇮🇳', name: 'Indian Rupee', symbol: '₹' },
  { code: 'KRW', flag: '🇰🇷', name: 'South Korean Won', symbol: '₩' },
  { code: 'THB', flag: '🇹🇭', name: 'Thai Baht', symbol: '฿' },
  { code: 'PHP', flag: '🇵🇭', name: 'Philippine Peso', symbol: '₱' },
  { code: 'AUD', flag: '🇦🇺', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'CAD', flag: '🇨🇦', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'HKD', flag: '🇭🇰', name: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'AED', flag: '🇦🇪', name: 'UAE Dirham', symbol: 'د.إ' },
  { code: 'SAR', flag: '🇸🇦', name: 'Saudi Riyal', symbol: '﷼' },
  { code: 'CHF', flag: '🇨🇭', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'NZD', flag: '🇳🇿', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'BRL', flag: '🇧🇷', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'VND', flag: '🇻🇳', name: 'Vietnamese Dong', symbol: '₫' },
  { code: 'BND', flag: '🇧🇳', name: 'Brunei Dollar', symbol: 'B$' },
  { code: 'TRY', flag: '🇹🇷', name: 'Turkish Lira', symbol: '₺' },
  { code: 'MXN', flag: '🇲🇽', name: 'Mexican Peso', symbol: 'MX$' },
  { code: 'ZAR', flag: '🇿🇦', name: 'South African Rand', symbol: 'R' },
];

export const DEFAULT_CURRENCY = 'USD';

/** ISO region code -> one of CURRENCIES' codes, for picking a sensible first-run default instead
 *  of always starting new users on USD. Not exhaustive — every currency we support gets its
 *  primary country/region, plus the handful of Eurozone countries someone's device is most
 *  likely to report; anything else falls back to DEFAULT_CURRENCY. */
const REGION_CURRENCY: Record<string, string> = {
  MY: 'MYR',
  US: 'USD',
  GB: 'GBP',
  JP: 'JPY',
  CN: 'CNY',
  SG: 'SGD',
  ID: 'IDR',
  IN: 'INR',
  KR: 'KRW',
  TH: 'THB',
  PH: 'PHP',
  AU: 'AUD',
  CA: 'CAD',
  HK: 'HKD',
  AE: 'AED',
  SA: 'SAR',
  CH: 'CHF',
  NZ: 'NZD',
  BR: 'BRL',
  VN: 'VND',
  BN: 'BND',
  TR: 'TRY',
  MX: 'MXN',
  ZA: 'ZAR',
  DE: 'EUR',
  FR: 'EUR',
  IT: 'EUR',
  ES: 'EUR',
  NL: 'EUR',
  BE: 'EUR',
  AT: 'EUR',
  PT: 'EUR',
  IE: 'EUR',
  FI: 'EUR',
  GR: 'EUR',
};

/** Best-effort guess at the user's local currency from the device's own locale, for picking the
 *  starting currency on a tool's first run — never throws, always falls back to USD. Only used
 *  for that first-run default; formatMoney/currencySymbol keep using DEFAULT_CURRENCY as their
 *  own fallback so a missing/invalid stored code doesn't start re-guessing on every render. */
export function detectDeviceCurrency(): string {
  try {
    const locale = new Intl.Locale(navigator.language).maximize();
    return REGION_CURRENCY[locale.region ?? ''] ?? DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

/** The user's chosen app-wide default currency (Settings > Time & Formats), falling back to a
 *  device-locale guess when they've never set one. Tools use this instead of detectDeviceCurrency()
 *  directly so setting it once in Settings changes the starting currency everywhere that hasn't
 *  already been customized per-tool. */
export function appDefaultCurrency(): string {
  return storageGet<string | null>(StorageKeys.defaultCurrency, null) ?? detectDeviceCurrency();
}

export function currencyFlag(code: string | undefined): string {
  return CURRENCIES.find((c) => c.code === code)?.flag ?? '💵';
}

export function currencySymbol(code: string | undefined): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? '$';
}

export function formatMoney(amount: number, code?: string): string {
  const symbol = currencySymbol(code ?? DEFAULT_CURRENCY);
  if (!Number.isFinite(amount)) return `${symbol}0.00`;
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
