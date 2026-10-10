import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { useBackHandler } from '../../app/useBackHandler';
import { clearNativeState } from '../../storage/clearNative';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon } from '../../components/Icon';
import { PinPad } from '../../vault/PinPad';
import { useRouter } from '../../app/Router';
import { storageGet, storageSet, StorageKeys, exportBackup, importBackup, clearAllData } from '../../storage/db';
import { clearAllFiles } from '../../vault/fileStore';
import { hapticWarning, hapticSuccess } from '../../haptics';
import { useAuth } from '../../cloud/AuthContext';
import { useSettings, TEXT_SCALES, type TextScale } from '../../settings/SettingsContext';
import { AlarmPlugin } from '../../alarm/plugin';
import { CURRENCIES, appDefaultCurrency } from '../../tools/shared/currencies';
import { hashPin, randomSalt } from '../../applock/crypto';
import {
  getDateFormat,
  getFirstDayOfWeek,
  getMeasurementSystem,
  type DateFormat,
  type FirstDayOfWeek,
  type MeasurementSystem,
} from '../../settings/formats';
import { vaultAutoLockMinutes } from '../../vault/session';
import {
  BiometricPlugin,
  biometricLabel,
  biometricUnavailableReason,
  type BiometricCheck,
} from '../../biometric/plugin';
import { disableVaultBiometric, enableVaultBiometric, isVaultBiometricEnabled } from '../../vault/biometric';

/** One check per screen visit: what biometrics this phone has and whether any is enrolled. */
function useBiometricCheck(): BiometricCheck | null {
  const [check, setCheck] = useState<BiometricCheck | null>(null);
  useEffect(() => {
    let cancelled = false;
    BiometricPlugin.check()
      .then((r) => {
        if (!cancelled) setCheck(r);
      })
      .catch(() => {
        if (!cancelled) setCheck({ available: false, reason: 'no_hardware', type: 'none' });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return check;
}
import './Profile.css';

type Theme = 'dark' | 'light';

export function ProfileAccount() {
  const { back, navigate } = useRouter();
  const {
    user,
    loading: authLoading,
    signingIn,
    deletingAccount,
    error: authError,
    signInWithGoogle,
    signOut,
    deleteAccount,
  } = useAuth();
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [confirmingDeleteAccount, setConfirmingDeleteAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  async function handleDeleteAccount() {
    hapticWarning();
    setDeleteAccountError(null);
    try {
      await deleteAccount();
      clearAllData();
      await clearAllFiles();
      await clearNativeState();
      window.location.reload();
    } catch (err) {
      setDeleteAccountError(err instanceof Error ? err.message : 'Could not delete your account. Please try again.');
    }
  }

  return (
    <div className="screen">
      <ScreenHeader title="Profile" subtitle="Your account, devices and personal settings." onBack={back} />
      <div className="pf__body">
        <section className="pf__section">
          <div className="pf__card">
            {authLoading ? (
              <div className="pf__row pf__row--static">
                <span className="pf__row-text">
                  <span>Checking sign-in status…</span>
                </span>
              </div>
            ) : user ? (
              <>
                <div className="pf__account">
                  {user.photoUrl ? (
                    <img src={user.photoUrl} alt="" className="pf__account-avatar" />
                  ) : (
                    <span className="pf__account-avatar pf__account-avatar--fallback">
                      <Icon name="user" size={20} />
                    </span>
                  )}
                  <span className="pf__account-text">
                    <strong>{user.displayName || 'Signed in'}</strong>
                    <span>{user.email}</span>
                  </span>
                </div>
                <div className="pf__divider" />
                {!confirmingSignOut ? (
                  <button type="button" className="pf__row pf__row--danger" onClick={() => setConfirmingSignOut(true)}>
                    <span className="pf__row-icon pf__row-icon--danger">
                      <Icon name="x" size={18} />
                    </span>
                    <span className="pf__row-text">
                      <strong>Sign Out</strong>
                    </span>
                  </button>
                ) : (
                  <div className="pf__confirm">
                    <p>Sign out of your Google account? Your data stays on this device, but it'll stop syncing until you sign back in.</p>
                    <div className="pf__confirm-actions">
                      <button type="button" onClick={() => setConfirmingSignOut(false)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="pf__confirm-delete"
                        onClick={() => {
                          setConfirmingSignOut(false);
                          signOut();
                        }}
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
                <div className="pf__divider" />
                {!confirmingDeleteAccount ? (
                  <button
                    type="button"
                    className="pf__row pf__row--danger"
                    onClick={() => setConfirmingDeleteAccount(true)}
                  >
                    <span className="pf__row-icon pf__row-icon--danger">
                      <Icon name="trash" size={18} />
                    </span>
                    <span className="pf__row-text">
                      <strong>Delete My Account</strong>
                      <span>Permanently erase your synced data and account</span>
                    </span>
                  </button>
                ) : (
                  <div className="pf__confirm">
                    <p>
                      This permanently deletes everything synced to your account (notes, checklists, expenses,
                      budgets, subscriptions, debts, alarms, and Vault) from our servers, deletes your account
                      itself, and clears this device's local data too. This can't be undone.
                    </p>
                    <div className="pf__confirm-actions">
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteAccount(false)}
                        disabled={deletingAccount}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="pf__confirm-delete"
                        onClick={handleDeleteAccount}
                        disabled={deletingAccount}
                      >
                        {deletingAccount ? 'Deleting…' : 'Delete Account'}
                      </button>
                    </div>
                  </div>
                )}
                {deleteAccountError && <p className="pf__status pf__status--error">{deleteAccountError}</p>}
              </>
            ) : (
              <button type="button" className="pf__row" onClick={signInWithGoogle} disabled={signingIn}>
                <span className="pf__row-icon pf__row-icon--blue">
                  <Icon name="user" size={18} />
                </span>
                <span className="pf__row-text">
                  <strong>{signingIn ? 'Signing in…' : 'Sign in with Google'}</strong>
                  <span>Optional — first step toward syncing your data across devices</span>
                </span>
                <Icon name="chevron-right" size={18} className="pf__row-chevron" />
              </button>
            )}
          </div>
          {authError && <p className="pf__status pf__status--error">{authError}</p>}
        </section>

        <section className="pf__section">
          <div className="pf__card">
            <button type="button" className="pf__row" onClick={() => navigate('/profile/privacy')}>
              <span className="pf__row-icon pf__row-icon--green">
                <Icon name="shield" size={18} />
              </span>
              <span className="pf__row-text">
                <strong>Privacy &amp; Security</strong>
                <span>See what signing in does and doesn't change</span>
              </span>
              <Icon name="chevron-right" size={18} className="pf__row-chevron" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export function ProfileSettings() {
  const { back, navigate } = useRouter();
  const {
    nav3dIconEnabled,
    setNav3dIconEnabled,
    hapticsEnabled,
    setHapticsEnabled,
    keepAwakeEnabled,
    setKeepAwakeEnabled,
  } = useSettings();

  return (
    <div className="screen">
      <ScreenHeader title="Settings" subtitle="App preferences and behavior." onBack={back} />
      <div className="pf__body pf__body--settings">
        <div className="pf__group">
          <span className="pf__group-label" style={{ '--label-icon': '#6e96fc' } as CSSProperties}>
            <Icon name="settings" size={16} />
            GENERAL
          </span>
          <div className="pf__card">
            <div className="pf__row">
              <span className="pf__row-icon pf__row-icon--haptic">
                <Icon name="smartphone" size={20} />
              </span>
              <span className="pf__row-text">
                <strong>Haptic Feedback</strong>
                <span>Vibrations throughout the app.</span>
              </span>
              <button
                type="button"
                className={`pf__switch${hapticsEnabled ? ' pf__switch--on' : ''}`}
                onClick={() => setHapticsEnabled(!hapticsEnabled)}
                aria-label="Toggle haptic feedback"
              >
                <span className="pf__switch-knob" />
              </button>
            </div>
            <div className="pf__divider" />
            <div className="pf__row">
              <span className="pf__row-icon pf__row-icon--awake">
                <Icon name="moon" size={20} />
              </span>
              <span className="pf__row-text">
                <strong>Keep Screen Awake</strong>
                <span>Prevent screen from sleeping.</span>
              </span>
              <button
                type="button"
                className={`pf__switch${keepAwakeEnabled ? ' pf__switch--on' : ''}`}
                onClick={() => setKeepAwakeEnabled(!keepAwakeEnabled)}
                aria-label="Toggle keep screen awake"
              >
                <span className="pf__switch-knob" />
              </button>
            </div>
            <div className="pf__divider" />
            <div className="pf__row">
              <span className="pf__row-icon pf__row-icon--nav3d">
                <Icon name="zap" size={20} />
              </span>
              <span className="pf__row-text">
                <strong>3D Nav Icon</strong>
                <span>Swipeable 3D icon for the AI tab. Turn off to save battery.</span>
              </span>
              <button
                type="button"
                className={`pf__switch${nav3dIconEnabled ? ' pf__switch--on' : ''}`}
                onClick={() => setNav3dIconEnabled(!nav3dIconEnabled)}
                aria-label="Toggle 3D nav icon"
              >
                <span className="pf__switch-knob" />
              </button>
            </div>
          </div>
        </div>

        <div className="pf__group">
          <span className="pf__group-label" style={{ '--label-icon': '#e754f5' } as CSSProperties}>
            <Icon name="palette" size={16} />
            APPEARANCE
          </span>
          <div className="pf__card">
            <button type="button" className="pf__row" onClick={() => navigate('/profile/settings/text-size')}>
              <span className="pf__row-icon pf__row-icon--text">
                <Icon name="text-size" size={20} />
              </span>
              <span className="pf__row-text">
                <strong>Text Size</strong>
                <span>Adjust text size across the app.</span>
              </span>
              <Icon name="chevron-right" size={18} className="pf__row-chevron" />
            </button>
            <div className="pf__divider" />
            <div className="pf__row pf__row--static">
              <span className="pf__row-icon pf__row-icon--lang">
                <Icon name="globe" size={20} />
              </span>
              <span className="pf__row-text">
                <strong>Language</strong>
                <span>English (for now)</span>
              </span>
            </div>
          </div>
        </div>

        <div className="pf__group">
          <span className="pf__group-label" style={{ '--label-icon': '#6ddd77' } as CSSProperties}>
            <Icon name="globe" size={16} />
            TIME &amp; FORMATS
          </span>
          <div className="pf__card">
            <button
              type="button"
              className="pf__row"
              onClick={() => navigate('/profile/settings/time-formats')}
            >
              <span className="pf__row-icon pf__row-icon--time">
                <Icon name="clock" size={20} />
              </span>
              <span className="pf__row-text">
                <strong>Time &amp; Formats</strong>
                <span>Clock, date, first day of week, currency and units.</span>
              </span>
              <Icon name="chevron-right" size={18} className="pf__row-chevron" />
            </button>
          </div>
        </div>

        <div className="pf__group">
          <span className="pf__group-label" style={{ '--label-icon': '#44c3fc' } as CSSProperties}>
            <Icon name="bell" size={16} />
            NOTIFICATIONS
          </span>
          <div className="pf__card">
            <button
              type="button"
              className="pf__row"
              onClick={() => navigate('/profile/settings/notifications')}
            >
              <span className="pf__row-icon pf__row-icon--notif">
                <Icon name="bell" size={20} />
              </span>
              <span className="pf__row-text">
                <strong>Notifications</strong>
                <span>App, alarm, reminders and more.</span>
              </span>
              <Icon name="chevron-right" size={18} className="pf__row-chevron" />
            </button>
          </div>
        </div>

        <div className="pf__group">
          <span className="pf__group-label" style={{ '--label-icon': '#2d9ff8' } as CSSProperties}>
            <Icon name="shield" size={16} />
            SECURITY
          </span>
          <div className="pf__card">
            <button type="button" className="pf__row" onClick={() => navigate('/profile/settings/app-lock')}>
              <span className="pf__row-icon pf__row-icon--applock">
                <Icon name="lock" size={20} />
              </span>
              <span className="pf__row-text">
                <strong>App Lock &amp; Biometrics</strong>
                <span>Lock the app with PIN, fingerprint or face unlock.</span>
              </span>
              <Icon name="chevron-right" size={18} className="pf__row-chevron" />
            </button>
            <div className="pf__divider" />
            <button
              type="button"
              className="pf__row"
              onClick={() => navigate('/profile/settings/vault-security')}
            >
              <span className="pf__row-icon pf__row-icon--vault">
                <Icon name="archive" size={20} />
              </span>
              <span className="pf__row-text">
                <strong>Vault Security</strong>
                <span>Change PIN, auto-lock timing and biometric access.</span>
              </span>
              <Icon name="chevron-right" size={18} className="pf__row-chevron" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProfileAppearance() {
  const { back } = useRouter();
  const [theme, setTheme] = useState<Theme>(() => storageGet(StorageKeys.theme, 'dark'));

  function applyTheme(next: Theme) {
    setTheme(next);
    storageSet(StorageKeys.theme, next);
    document.documentElement.dataset.theme = next;
  }

  return (
    <div className="screen">
      <ScreenHeader title="Appearance" subtitle="Theme, colors, and visual style." onBack={back} />
      <div className="pf__body">
        <section className="pf__section">
          <div className="pf__theme-toggle">
            <button
              type="button"
              className={`pf__theme-btn${theme === 'dark' ? ' pf__theme-btn--active' : ''}`}
              onClick={() => applyTheme('dark')}
            >
              <Icon name="moon" size={18} />
              Dark
            </button>
            <button
              type="button"
              className={`pf__theme-btn${theme === 'light' ? ' pf__theme-btn--active' : ''}`}
              onClick={() => applyTheme('light')}
            >
              <Icon name="sun" size={18} />
              Light
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export function ProfileDataSync() {
  const { back } = useRouter();
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    const payload = exportBackup();
    const json = JSON.stringify(payload, null, 2);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `omni-hub-backup-${date}.json`;

    if (!Capacitor.isNativePlatform()) {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }

    const sharedPath = `shared/${filename}`;
    try {
      await Filesystem.writeFile({ path: sharedPath, data: json, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true });
      const { uri } = await Filesystem.getUri({ path: sharedPath, directory: Directory.Cache });
      await Share.share({ title: 'Omni Hub Backup', url: uri, dialogTitle: 'Save your backup' });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (!/cancel/i.test(message)) {
        setImportStatus({ type: 'error', message: 'Could not export your backup. Please try again.' });
      }
    }
  }

  function handleImportClick() {
    setImportStatus(null);
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result));
        const { imported } = importBackup(json);
        setImportStatus({ type: 'success', message: `Restored ${imported} item${imported === 1 ? '' : 's'}. Reloading…` });
        setTimeout(() => window.location.reload(), 800);
      } catch (err) {
        setImportStatus({ type: 'error', message: err instanceof Error ? err.message : 'Could not read that file.' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function handleClearData() {
    hapticWarning();
    clearAllData();
    await clearAllFiles();
    await clearNativeState();
    window.location.reload();
  }

  return (
    <div className="screen">
      <ScreenHeader title="Data & Sync" subtitle="Cloud sync, backup, and data management." onBack={back} />
      <div className="pf__body">
        <section className="pf__section">
          <h2 className="pf__section-title">Backup</h2>
          <div className="pf__card">
            <button type="button" className="pf__row" onClick={handleExport}>
              <span className="pf__row-icon pf__row-icon--blue">
                <Icon name="download" size={18} />
              </span>
              <span className="pf__row-text">
                <strong>Export Backup</strong>
                <span>Save your tool data as a JSON file (Vault files export separately, from inside Vault)</span>
              </span>
              <Icon name="chevron-right" size={18} className="pf__row-chevron" />
            </button>
            <div className="pf__divider" />
            <button type="button" className="pf__row" onClick={handleImportClick}>
              <span className="pf__row-icon pf__row-icon--purple">
                <Icon name="upload" size={18} />
              </span>
              <span className="pf__row-text">
                <strong>Import Backup</strong>
                <span>Restore data from a JSON file</span>
              </span>
              <Icon name="chevron-right" size={18} className="pf__row-chevron" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="pf__file-input"
              onChange={handleFileChange}
            />
          </div>
          {importStatus && (
            <p className={`pf__status pf__status--${importStatus.type}`}>{importStatus.message}</p>
          )}
        </section>

        <section className="pf__section">
          <h2 className="pf__section-title">Data</h2>
          <div className="pf__card">
            {!confirmingClear ? (
              <button type="button" className="pf__row pf__row--danger" onClick={() => setConfirmingClear(true)}>
                <span className="pf__row-icon pf__row-icon--danger">
                  <Icon name="trash" size={18} />
                </span>
                <span className="pf__row-text">
                  <strong>Clear All Data</strong>
                  <span>Delete everything stored on this device</span>
                </span>
              </button>
            ) : (
              <div className="pf__confirm">
                <p>
                  This will permanently delete everything stored on this device — notes, lists,
                  expenses, alarms, your Vault (including its PIN-locked photos and files), and
                  settings. This can't be undone.
                </p>
                <div className="pf__confirm-actions">
                  <button type="button" onClick={() => setConfirmingClear(false)}>
                    Cancel
                  </button>
                  <button type="button" className="pf__confirm-delete" onClick={handleClearData}>
                    Delete Everything
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export function ProfilePrivacy() {
  const { back, navigate } = useRouter();

  return (
    <div className="screen">
      <ScreenHeader title="Privacy & Security" subtitle="Permissions, data controls and security options." onBack={back} />
      <div className="pf__body">
        <section className="pf__section">
          <div className="pf__card">
            <div className="pf__privacy">
              <span className="pf__row-icon pf__row-icon--green pf__privacy-icon">
                <Icon name="shield" size={18} />
              </span>
              <p>
                No account is needed to use Omni Hub. Signing in is entirely optional and only
                used to sync your data across your own devices; nothing is shared, sold, or used for
                ads or analytics.
              </p>
            </div>
            <div className="pf__divider" />
            <button type="button" className="pf__row" onClick={() => navigate('/privacy-policy')}>
              <span className="pf__row-icon pf__row-icon--green">
                <Icon name="file" size={18} />
              </span>
              <span className="pf__row-text">
                <strong>Privacy Policy</strong>
                <span>Exactly what's collected, and when</span>
              </span>
              <Icon name="chevron-right" size={18} className="pf__row-chevron" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export function ProfileAbout() {
  const { back } = useRouter();

  return (
    <div className="screen">
      <ScreenHeader title="About Omni Hub" subtitle="Version, support and credits." onBack={back} />
      <div className="pf__body">
        <section className="pf__section">
          <div className="pf__card">
            <div className="pf__row pf__row--static">
              <span className="pf__row-text">
                <strong>Omni Hub</strong>
                <span>Everything you need. One place.</span>
              </span>
            </div>
            <div className="pf__divider" />
            <div className="pf__row pf__row--static">
              <span className="pf__row-text">
                <strong>Version</strong>
              </span>
              <span className="pf__row-value">1.0</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

const TEXT_SCALE_LABELS: Record<TextScale, string> = {
  0.9: 'Small',
  1: 'Default',
  1.15: 'Large',
  1.3: 'Extra Large',
};

export function ProfileTextSize() {
  const { back } = useRouter();
  const { textScale, setTextScale } = useSettings();

  return (
    <div className="screen">
      <ScreenHeader title="Text Size" subtitle="Adjust text size across the app." onBack={back} />
      <div className="pf__body pf__body--settings">
        <div className="pf__card">
          {TEXT_SCALES.map((scale, i) => (
            <div key={scale}>
              <button
                type="button"
                className="pf__row pf__row--static"
                onClick={() => setTextScale(scale)}
              >
                <span className="pf__row-text">
                  <strong style={{ fontSize: `${14 * scale}px` }}>{TEXT_SCALE_LABELS[scale]}</strong>
                </span>
                {textScale === scale && <Icon name="check" size={18} style={{ color: 'var(--accent)' }} />}
              </button>
              {i < TEXT_SCALES.length - 1 && <div className="pf__divider" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type ClockFormat = '12h' | '24h';

const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  MDY: 'MM/DD/YYYY',
  DMY: 'DD/MM/YYYY',
  YMD: 'YYYY-MM-DD',
};

export function ProfileTimeFormats() {
  const { back } = useRouter();
  const [clockFormat, setClockFormatState] = useState<ClockFormat>(() =>
    storageGet(StorageKeys.clockFormat24h, false) ? '24h' : '12h',
  );
  const [dateFormat, setDateFormatState] = useState<DateFormat>(getDateFormat);
  const [firstDay, setFirstDayState] = useState<FirstDayOfWeek>(getFirstDayOfWeek);
  const [currency, setCurrencyState] = useState(() => storageGet(StorageKeys.defaultCurrency, appDefaultCurrency()));
  const [measurement, setMeasurementState] = useState<MeasurementSystem>(getMeasurementSystem);
  const [showCurrencyList, setShowCurrencyList] = useState(false);

  function setClockFormat(v: ClockFormat) {
    setClockFormatState(v);
    storageSet(StorageKeys.clockFormat24h, v === '24h');
  }

  function setDateFormat(v: DateFormat) {
    setDateFormatState(v);
    storageSet(StorageKeys.dateFormat, v);
  }

  function setFirstDay(v: FirstDayOfWeek) {
    setFirstDayState(v);
    storageSet(StorageKeys.firstDayOfWeek, v);
  }

  function setCurrency(code: string) {
    setCurrencyState(code);
    storageSet(StorageKeys.defaultCurrency, code);
    setShowCurrencyList(false);
  }

  function setMeasurement(v: MeasurementSystem) {
    setMeasurementState(v);
    storageSet(StorageKeys.measurementSystem, v);
  }

  const currencyOption = CURRENCIES.find((c) => c.code === currency);

  return (
    <div className="screen">
      <ScreenHeader title="Time & Formats" subtitle="Clock, date, first day of week, currency and units." onBack={back} />
      <div className="pf__body pf__body--settings">
        <div className="pf__group">
          <span className="pf__group-label" style={{ color: 'var(--text-secondary)' }}>
            CLOCK FORMAT
          </span>
          <div className="pf__theme-toggle">
            <button
              type="button"
              className={`pf__theme-btn${clockFormat === '12h' ? ' pf__theme-btn--active' : ''}`}
              onClick={() => setClockFormat('12h')}
            >
              12-hour
            </button>
            <button
              type="button"
              className={`pf__theme-btn${clockFormat === '24h' ? ' pf__theme-btn--active' : ''}`}
              onClick={() => setClockFormat('24h')}
            >
              24-hour
            </button>
          </div>
        </div>

        <div className="pf__group">
          <span className="pf__group-label" style={{ color: 'var(--text-secondary)' }}>
            DATE FORMAT
          </span>
          <div className="pf__card">
            {(Object.keys(DATE_FORMAT_LABELS) as DateFormat[]).map((fmt, i) => (
              <div key={fmt}>
                <button type="button" className="pf__row pf__row--static" onClick={() => setDateFormat(fmt)}>
                  <span className="pf__row-text">
                    <strong>{DATE_FORMAT_LABELS[fmt]}</strong>
                  </span>
                  {dateFormat === fmt && <Icon name="check" size={18} style={{ color: 'var(--accent)' }} />}
                </button>
                {i < 2 && <div className="pf__divider" />}
              </div>
            ))}
          </div>
        </div>

        <div className="pf__group">
          <span className="pf__group-label" style={{ color: 'var(--text-secondary)' }}>
            FIRST DAY OF WEEK
          </span>
          <div className="pf__theme-toggle">
            <button
              type="button"
              className={`pf__theme-btn${firstDay === 'sun' ? ' pf__theme-btn--active' : ''}`}
              onClick={() => setFirstDay('sun')}
            >
              Sunday
            </button>
            <button
              type="button"
              className={`pf__theme-btn${firstDay === 'mon' ? ' pf__theme-btn--active' : ''}`}
              onClick={() => setFirstDay('mon')}
            >
              Monday
            </button>
          </div>
        </div>

        <div className="pf__group">
          <span className="pf__group-label" style={{ color: 'var(--text-secondary)' }}>
            DEFAULT CURRENCY
          </span>
          <div className="pf__card">
            <button
              type="button"
              className="pf__row"
              onClick={() => setShowCurrencyList((v) => !v)}
            >
              <span className="pf__row-text">
                <strong>
                  {currencyOption ? `${currencyOption.flag} ${currencyOption.code}` : currency}
                </strong>
                <span>Used as the starting currency for Budget, Expenses, Subscriptions and Debt.</span>
              </span>
              <Icon name="chevron-right" size={18} className="pf__row-chevron" />
            </button>
            {showCurrencyList && (
              <>
                <div className="pf__divider" />
                <div className="pf__currency-list">
                  {CURRENCIES.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      className="pf__row pf__row--static"
                      onClick={() => setCurrency(c.code)}
                    >
                      <span className="pf__row-text">
                        <strong>
                          {c.flag} {c.code}
                        </strong>
                        <span>{c.name}</span>
                      </span>
                      {currency === c.code && <Icon name="check" size={18} style={{ color: 'var(--accent)' }} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="pf__group">
          <span className="pf__group-label" style={{ color: 'var(--text-secondary)' }}>
            MEASUREMENT SYSTEM
          </span>
          <div className="pf__theme-toggle">
            <button
              type="button"
              className={`pf__theme-btn${measurement === 'metric' ? ' pf__theme-btn--active' : ''}`}
              onClick={() => setMeasurement('metric')}
            >
              Metric
            </button>
            <button
              type="button"
              className={`pf__theme-btn${measurement === 'imperial' ? ' pf__theme-btn--active' : ''}`}
              onClick={() => setMeasurement('imperial')}
            >
              Imperial
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProfileNotifications() {
  const { back } = useRouter();
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);
  const [exactAlarmGranted, setExactAlarmGranted] = useState<boolean | null>(null);

  function refreshPermissions() {
    AlarmPlugin.checkNotificationPermission()
      .then(({ granted }) => setNotifGranted(granted))
      .catch(() => setNotifGranted(null));
    AlarmPlugin.checkExactAlarmPermission()
      .then(({ granted }) => setExactAlarmGranted(granted))
      .catch(() => setExactAlarmGranted(null));
  }

  useEffect(() => {
    refreshPermissions();
    // "Allow" for exact alarms opens a system settings screen; what the user chose there is only
    // visible once they come back, so re-read on resume.
    const listener = CapacitorApp.addListener('resume', refreshPermissions);
    return () => {
      listener.then((l) => l.remove()).catch(() => {});
    };
  }, []);

  async function requestNotif() {
    try {
      const { granted } = await AlarmPlugin.requestNotificationPermission();
      setNotifGranted(granted);
    } catch {
      refreshPermissions();
    }
  }

  async function requestExactAlarm() {
    try {
      await AlarmPlugin.requestExactAlarmPermission();
    } catch {
      // unavailable here; the resume re-check below covers the real device
    }
    refreshPermissions();
  }

  return (
    <div className="screen">
      <ScreenHeader title="Notifications" subtitle="App, alarm, reminders and more." onBack={back} />
      <div className="pf__body pf__body--settings">
        <div className="pf__card">
          <div className="pf__row pf__row--static">
            <span className="pf__row-text">
              <strong>Notifications</strong>
              <span>Needed for Alarm and Sleep Mode to ring and alert you.</span>
            </span>
            {notifGranted === null ? (
              <span className="pf__row-value">—</span>
            ) : notifGranted ? (
              <span className="pf__row-value" style={{ color: 'var(--green)' }}>
                Allowed
              </span>
            ) : (
              <button type="button" className="pf__row-value" style={{ color: 'var(--accent)' }} onClick={requestNotif}>
                Allow
              </button>
            )}
          </div>
          <div className="pf__divider" />
          <div className="pf__row pf__row--static">
            <span className="pf__row-text">
              <strong>Alarms &amp; Reminders</strong>
              <span>Lets Omni Hub schedule alarms that ring at the exact time.</span>
            </span>
            {exactAlarmGranted === null ? (
              <span className="pf__row-value">—</span>
            ) : exactAlarmGranted ? (
              <span className="pf__row-value" style={{ color: 'var(--green)' }}>
                Allowed
              </span>
            ) : (
              <button
                type="button"
                className="pf__row-value"
                style={{ color: 'var(--accent)' }}
                onClick={requestExactAlarm}
              >
                Allow
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type AppLockStep = 'settings' | 'setupPin' | 'confirmPin';

export function ProfileAppLock() {
  const { back } = useRouter();
  const [enabled, setEnabledState] = useState(() => storageGet(StorageKeys.appLockEnabled, false));
  const [biometricEnabled, setBiometricEnabledState] = useState(() =>
    storageGet(StorageKeys.appLockBiometricEnabled, false),
  );
  const biometrics = useBiometricCheck();
  const [step, setStep] = useState<AppLockStep>('settings');
  const [pinInput, setPinInput] = useState('');
  const [pendingPin, setPendingPin] = useState('');
  const [error, setError] = useState('');

  async function completeSetup(pin: string) {
    const salt = randomSalt();
    const hash = await hashPin(pin, salt);
    storageSet(StorageKeys.appLockPinSalt, salt);
    storageSet(StorageKeys.appLockPinHash, hash);
    storageSet(StorageKeys.appLockEnabled, true);
    setEnabledState(true);
    hapticSuccess();
    setStep('settings');
    setPinInput('');
    setPendingPin('');
  }

  function onPinChange(value: string) {
    setPinInput(value);
    if (value.length !== 4) return;

    if (step === 'setupPin') {
      setPendingPin(value);
      setPinInput('');
      setError('');
      setStep('confirmPin');
      return;
    }

    if (step === 'confirmPin') {
      if (value === pendingPin) {
        void completeSetup(value);
      } else {
        setError("PINs didn't match. Try again.");
        setPinInput('');
        setPendingPin('');
        setStep('setupPin');
      }
    }
  }

  function startEnable() {
    setStep('setupPin');
    setPinInput('');
    setPendingPin('');
    setError('');
  }

  useBackHandler(() => setStep('settings'), step !== 'settings');

  function disable() {
    storageSet(StorageKeys.appLockEnabled, false);
    storageSet(StorageKeys.appLockPinHash, '');
    storageSet(StorageKeys.appLockPinSalt, '');
    storageSet(StorageKeys.appLockBiometricEnabled, false);
    setEnabledState(false);
    setBiometricEnabledState(false);
  }

  async function toggleBiometric() {
    if (biometricEnabled) {
      storageSet(StorageKeys.appLockBiometricEnabled, false);
      setBiometricEnabledState(false);
      return;
    }
    // Prove the phone's biometrics actually work for this user before relying on them.
    try {
      await BiometricPlugin.authenticate({
        title: 'Turn on Biometric Unlock',
        subtitle: 'Confirm with your fingerprint or face',
        negativeButtonText: 'Cancel',
      });
    } catch {
      hapticWarning();
      return;
    }
    storageSet(StorageKeys.appLockBiometricEnabled, true);
    setBiometricEnabledState(true);
    hapticSuccess();
  }

  const biometricSubtitle = !enabled
    ? 'Turn on App Lock first.'
    : biometrics?.available
      ? `${biometricLabel(biometrics.type)} instead of your PIN. The PIN still works as a backup.`
      : biometricUnavailableReason(biometrics);
  const biometricPossible = enabled && !!biometrics?.available;

  if (step === 'setupPin') {
    return (
      <div className="screen">
        <ScreenHeader title="App Lock" onBack={() => setStep('settings')} />
        <PinPad title="Set a PIN" subtitle="Create a 4-digit PIN to lock Omni Hub" value={pinInput} onChange={onPinChange} error={error} />
      </div>
    );
  }

  if (step === 'confirmPin') {
    return (
      <div className="screen">
        <ScreenHeader title="App Lock" onBack={() => setStep('settings')} />
        <PinPad title="Confirm PIN" subtitle="Enter it again to confirm" value={pinInput} onChange={onPinChange} error={error} />
      </div>
    );
  }

  return (
    <div className="screen">
      <ScreenHeader title="App Lock & Biometrics" subtitle="Lock the app with PIN, fingerprint or face unlock." onBack={back} />
      <div className="pf__body pf__body--settings">
        <div className="pf__card">
          <div className="pf__row">
            <span className="pf__row-icon pf__row-icon--purple">
              <Icon name="lock" size={18} />
            </span>
            <span className="pf__row-text">
              <strong>App Lock</strong>
              <span>Require your PIN to open Omni Hub.</span>
            </span>
            <button
              type="button"
              className={`pf__switch${enabled ? ' pf__switch--on' : ''}`}
              onClick={() => (enabled ? disable() : startEnable())}
              aria-label="Toggle app lock"
            >
              <span className="pf__switch-knob" />
            </button>
          </div>
          <div className="pf__divider" />
          <div className="pf__row">
            <span className="pf__row-icon pf__row-icon--blue">
              <Icon name="fingerprint" size={18} />
            </span>
            <span className="pf__row-text">
              <strong>Biometric Unlock</strong>
              <span>{biometricSubtitle}</span>
            </span>
            <button
              type="button"
              className={`pf__switch${biometricEnabled ? ' pf__switch--on' : ''}`}
              onClick={() => void toggleBiometric()}
              disabled={!biometricPossible && !biometricEnabled}
              aria-label="Toggle biometric unlock"
            >
              <span className="pf__switch-knob" />
            </button>
          </div>
          {enabled && (
            <>
              <div className="pf__divider" />
              <button type="button" className="pf__row" onClick={startEnable}>
                <span className="pf__row-icon pf__row-icon--orange">
                  <Icon name="lock" size={18} />
                </span>
                <span className="pf__row-text">
                  <strong>Change PIN</strong>
                </span>
                <Icon name="chevron-right" size={18} className="pf__row-chevron" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const VAULT_AUTO_LOCK_OPTIONS = [
  { value: 0, label: 'Immediately' },
  { value: 1, label: 'After 1 minute' },
  { value: 5, label: 'After 5 minutes' },
  { value: -1, label: 'Never' },
];

export function ProfileVaultSecurity() {
  const { back, navigate } = useRouter();
  const [autoLock, setAutoLockState] = useState(vaultAutoLockMinutes);
  const [biometricEnabled, setBiometricEnabledState] = useState(isVaultBiometricEnabled);
  const biometrics = useBiometricCheck();
  const vaultExists = storageGet<string | null>(StorageKeys.vaultSalt, null) !== null;
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  function setAutoLock(v: number) {
    setAutoLockState(v);
    storageSet(StorageKeys.vaultAutoLockMinutes, v);
  }

  function toggleBiometric() {
    if (biometricEnabled) {
      void disableVaultBiometric();
      setBiometricEnabledState(false);
      return;
    }
    setPinInput('');
    setPinError('');
    setVerifyingPin(true);
  }

  useBackHandler(() => setVerifyingPin(false), verifyingPin);

  async function onVerifyPinChange(value: string) {
    setPinInput(value);
    if (value.length !== 4) return;
    const result = await enableVaultBiometric(value);
    if (result === 'ok') {
      hapticSuccess();
      setBiometricEnabledState(true);
      setVerifyingPin(false);
      return;
    }
    hapticWarning();
    setPinInput('');
    setPinError(
      result === 'wrong-pin'
        ? 'Incorrect PIN'
        : result === 'locked-out'
          ? 'Too many attempts. Try again later.'
          : result === 'no-vault'
            ? 'Set up the Vault first.'
            : "Couldn't turn on biometric unlock on this phone.",
    );
  }

  const biometricSubtitle = !vaultExists
    ? 'Set up the Vault first.'
    : biometrics?.available
      ? `${biometricLabel(biometrics.type)} instead of your Vault PIN. The PIN still works as a backup.`
      : biometricUnavailableReason(biometrics);
  const biometricPossible = vaultExists && !!biometrics?.available;

  if (verifyingPin) {
    return (
      <div className="screen">
        <ScreenHeader title="Vault Security" onBack={() => setVerifyingPin(false)} />
        <PinPad
          title="Enter Vault PIN"
          subtitle="Confirm your PIN once to turn on fingerprint or face unlock"
          value={pinInput}
          onChange={(v) => void onVerifyPinChange(v)}
          error={pinError}
        />
      </div>
    );
  }

  return (
    <div className="screen">
      <ScreenHeader title="Vault Security" subtitle="PIN, auto-lock timing and biometrics." onBack={back} />
      <div className="pf__body pf__body--settings">
        <div className="pf__card">
          <button type="button" className="pf__row" onClick={() => navigate('/tools/vault')}>
            <span className="pf__row-icon pf__row-icon--teal">
              <Icon name="archive" size={18} />
            </span>
            <span className="pf__row-text">
              <strong>Open Vault</strong>
              <span>Change your PIN or reset the Vault from its own settings.</span>
            </span>
            <Icon name="chevron-right" size={18} className="pf__row-chevron" />
          </button>
          <div className="pf__divider" />
          <div className="pf__row">
            <span className="pf__row-icon pf__row-icon--blue">
              <Icon name="fingerprint" size={18} />
            </span>
            <span className="pf__row-text">
              <strong>Biometric Unlock</strong>
              <span>{biometricSubtitle}</span>
            </span>
            <button
              type="button"
              className={`pf__switch${biometricEnabled ? ' pf__switch--on' : ''}`}
              onClick={toggleBiometric}
              disabled={!biometricPossible && !biometricEnabled}
              aria-label="Toggle Vault biometric unlock"
            >
              <span className="pf__switch-knob" />
            </button>
          </div>
        </div>

        <div className="pf__group">
          <span className="pf__group-label" style={{ color: 'var(--text-secondary)' }}>
            AUTO-LOCK TIMING
          </span>
          <div className="pf__card">
            {VAULT_AUTO_LOCK_OPTIONS.map((opt, i) => (
              <div key={opt.value}>
                <button type="button" className="pf__row pf__row--static" onClick={() => setAutoLock(opt.value)}>
                  <span className="pf__row-text">
                    <strong>{opt.label}</strong>
                  </span>
                  {autoLock === opt.value && <Icon name="check" size={18} style={{ color: 'var(--accent)' }} />}
                </button>
                {i < VAULT_AUTO_LOCK_OPTIONS.length - 1 && <div className="pf__divider" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
