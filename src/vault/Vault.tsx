import { useEffect, useRef, useState } from 'react';
import { ScreenHeader } from '../components/ScreenHeader';
import { Icon } from '../components/Icon';
import { useRouter } from '../app/Router';
import { useBackHandler } from '../app/useBackHandler';
import { useAuth } from '../cloud/AuthContext';
import { createSyncEngine, type SyncEngine } from '../cloud/sync';
import { storageGet, storageSet, storageRemove, StorageKeys } from '../storage/db';
import { hapticSuccess, hapticWarning } from '../haptics';
import {
  deriveVaultKey,
  encryptText,
  decryptText,
  encryptBytes,
  decryptBytes,
  randomSalt,
  type EncryptedPayload,
  VAULT_CANARY_TEXT,
  deriveVaultKeyBits,
  importVaultKey,
} from './crypto';
import { PinPad, PIN_LENGTH } from './PinPad';
import { VaultNoteEditor } from './VaultNoteEditor';
import { VaultFiles } from './VaultFiles';
import { clearAllFiles, getAllFiles, putFile } from './fileStore';
import type { VaultNote, VaultNoteRecord } from './types';
import { forgetVaultKey, parkVaultKey, resumeVaultKey } from './session';
import { BiometricPlugin } from '../biometric/plugin';
import {
  disableVaultBiometric,
  isVaultBiometricEnabled,
  refreshVaultBiometricSecret,
  unlockVaultWithBiometric,
} from './biometric';
import './Vault.css';

const CANARY_TEXT = VAULT_CANARY_TEXT;

type Status = 'loading' | 'setupPin' | 'confirmPin' | 'locked' | 'unlocked';
type Tab = 'notes' | 'files';

// A 4-digit PIN is only 10,000 possibilities, and nothing upstream of this screen rate-limits
// guesses -- so once someone's past the first few mistakes (a genuine typo), escalate the cost
// of guessing quickly rather than ever letting attempts run unthrottled.
const LOCKOUT_FREE_ATTEMPTS = 5;
const LOCKOUT_SCHEDULE_SEC = [30, 60, 120, 300, 600, 1800]; // 30s, 1m, 2m, 5m, 10m, 30m (cap)

function lockoutMsFor(failedAttempts: number): number {
  if (failedAttempts < LOCKOUT_FREE_ATTEMPTS) return 0;
  const tier = Math.min(failedAttempts - LOCKOUT_FREE_ATTEMPTS, LOCKOUT_SCHEDULE_SEC.length - 1);
  return LOCKOUT_SCHEDULE_SEC[tier] * 1000;
}

function newNote(): VaultNote {
  const now = Date.now();
  return { id: `${now}`, title: '', body: '', createdAt: now, updatedAt: now };
}

export function Vault() {
  const { back } = useRouter();
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>('loading');
  const [pinInput, setPinInput] = useState('');
  const [pendingPin, setPendingPin] = useState('');
  const [error, setError] = useState('');
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [notes, setNotes] = useState<VaultNote[]>([]);
  const [draft, setDraft] = useState<VaultNote | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [changingPin, setChangingPin] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [tab, setTab] = useState<Tab>('notes');
  const [lockedUntil, setLockedUntil] = useState(() => storageGet(StorageKeys.vaultLockedUntil, 0));
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [biometricReady, setBiometricReady] = useState(false);
  const biometricPromptedRef = useRef(false);

  // Only the already-PIN-encrypted records ever leave the device — the key itself never does.
  // Kept alongside `notes` (decrypted, for the UI) since that's what actually gets synced.
  const encryptedRecordsRef = useRef<VaultNoteRecord[]>(storageGet(StorageKeys.vaultNotes, []));
  const keyRef = useRef<CryptoKey | null>(null);
  keyRef.current = key;
  const syncEngineRef = useRef<SyncEngine<VaultNoteRecord> | null>(null);
  const syncUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !key) {
      syncEngineRef.current = null;
      syncUidRef.current = null;
      return;
    }
    const engine = createSyncEngine<VaultNoteRecord>({
      collection: 'vault',
      getLocal: () => encryptedRecordsRef.current,
      setLocal: (records) => {
        void applyRemoteRecords(records);
      },
    });
    syncEngineRef.current = engine;
    syncUidRef.current = user.uid;
    engine.start(user.uid);
    return () => {
      engine.stop();
      syncEngineRef.current = null;
      syncUidRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, key]);

  async function applyRemoteRecords(records: VaultNoteRecord[]) {
    const activeKey = keyRef.current;
    if (!activeKey) return;
    encryptedRecordsRef.current = records;
    storageSet(StorageKeys.vaultNotes, records);
    const decrypted = await Promise.all(
      records.map(async (r): Promise<VaultNote> => {
        try {
          const json = await decryptText(activeKey, { iv: r.iv, data: r.data });
          const { title, body } = JSON.parse(json) as { title: string; body: string };
          return { id: r.id, title, body, createdAt: r.createdAt, updatedAt: r.updatedAt };
        } catch {
          return { id: r.id, title: 'Could not decrypt', body: '', createdAt: r.createdAt, updatedAt: r.updatedAt };
        }
      }),
    );
    setNotes(decrypted);
  }

  const hasNestedState = settingsOpen || (changingPin && (status === 'setupPin' || status === 'confirmPin'));
  useBackHandler(() => {
    if (confirmingReset) {
      setConfirmingReset(false);
    } else if (settingsOpen) {
      setSettingsOpen(false);
    } else {
      setStatus('unlocked');
    }
  }, hasNestedState);

  useEffect(() => {
    const salt = storageGet<string | null>(StorageKeys.vaultSalt, null);
    const parkedKey = salt ? resumeVaultKey() : null;
    if (parkedKey) {
      void openWithKey(parkedKey);
      return;
    }
    setStatus(salt ? 'locked' : 'setupPin');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving the screen while unlocked parks the key for the auto-lock grace period (Settings >
  // Vault Security); "Immediately" (the default) parks nothing, so this is a no-op then.
  useEffect(() => () => parkVaultKey(keyRef.current), []);

  useEffect(() => {
    if (!isVaultBiometricEnabled()) return;
    let cancelled = false;
    BiometricPlugin.check()
      .then((r) => {
        if (!cancelled) setBiometricReady(r.available);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Offer the fingerprint/face prompt by itself the first time the locked screen shows, the
  // way the phone's own lock screen does; the button under the keypad covers every retry.
  useEffect(() => {
    if (status !== 'locked' || !biometricReady || biometricPromptedRef.current) return;
    if (storageGet(StorageKeys.vaultLockedUntil, 0) > Date.now()) return;
    biometricPromptedRef.current = true;
    void tryBiometricUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, biometricReady]);

  async function tryBiometricUnlock() {
    const unlockedKey = await unlockVaultWithBiometric();
    if (!unlockedKey) {
      // Cancelled, failed, or the stored key is gone: the PIN pad is still right there.
      if (!isVaultBiometricEnabled()) setBiometricReady(false);
      return;
    }
    storageSet(StorageKeys.vaultFailedAttempts, 0);
    storageRemove(StorageKeys.vaultLockedUntil);
    setLockedUntil(0);
    await openWithKey(unlockedKey);
  }

  // Only ticks while an active lockout needs a live countdown -- otherwise idle.
  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  useEffect(() => {
    if (pinInput.length < PIN_LENGTH) return;
    if (status === 'setupPin') {
      setPendingPin(pinInput);
      setPinInput('');
      setStatus('confirmPin');
    } else if (status === 'confirmPin') {
      if (pinInput === pendingPin) {
        void completeSetup(pinInput);
      } else {
        setError("PINs don't match. Try again.");
        hapticWarning();
        setPinInput('');
        setPendingPin('');
        setStatus('setupPin');
      }
    } else if (status === 'locked') {
      void attemptUnlock(pinInput);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinInput]);

  async function completeSetup(pin: string) {
    const salt = randomSalt();
    const keyBits = await deriveVaultKeyBits(pin, salt);
    const derivedKey = await importVaultKey(keyBits);
    const canary = await encryptText(derivedKey, CANARY_TEXT);
    storageSet(StorageKeys.vaultSalt, salt);
    storageSet(StorageKeys.vaultCanary, canary);
    forgetVaultKey();
    if (changingPin) {
      // Re-encrypt the existing notes and files with the new key rather than losing them.
      await persistNotes(notes, derivedKey);
      if (key) await reencryptFiles(key, derivedKey);
      await refreshVaultBiometricSecret(keyBits);
    } else {
      encryptedRecordsRef.current = [];
      storageSet(StorageKeys.vaultNotes, []);
      setNotes([]);
    }
    setKey(derivedKey);
    setError('');
    setPinInput('');
    setPendingPin('');
    setChangingPin(false);
    hapticSuccess();
    setStatus('unlocked');
  }

  async function attemptUnlock(pin: string) {
    // Re-check against storage, not the `lockedUntil` state, in case the lockout was set in a
    // different tab/reload of this screen -- the PIN pad being disabled should already prevent
    // reaching here while locked, but don't rely solely on that.
    const activeLockUntil = storageGet(StorageKeys.vaultLockedUntil, 0);
    if (activeLockUntil > Date.now()) {
      setPinInput('');
      return;
    }

    const salt = storageGet<string | null>(StorageKeys.vaultSalt, null);
    const canary = storageGet<EncryptedPayload | null>(StorageKeys.vaultCanary, null);
    if (!salt || !canary) return;

    const derivedKey = await deriveVaultKey(pin, salt);
    try {
      const plain = await decryptText(derivedKey, canary);
      if (plain !== CANARY_TEXT) throw new Error('mismatch');
    } catch {
      const failedAttempts = storageGet(StorageKeys.vaultFailedAttempts, 0) + 1;
      storageSet(StorageKeys.vaultFailedAttempts, failedAttempts);
      const lockoutMs = lockoutMsFor(failedAttempts);
      if (lockoutMs > 0) {
        const until = Date.now() + lockoutMs;
        storageSet(StorageKeys.vaultLockedUntil, until);
        setLockedUntil(until);
        // The PinPad subtitle takes over with a live countdown while locked out (see the
        // `status === 'locked'` render below) -- leaving this unset means there's nothing stale
        // left in `error` to flash once the lockout naturally expires.
        setError('');
      } else {
        setError('Incorrect PIN');
      }
      hapticWarning();
      setPinInput('');
      return;
    }

    storageSet(StorageKeys.vaultFailedAttempts, 0);
    storageRemove(StorageKeys.vaultLockedUntil);
    setLockedUntil(0);
    await openWithKey(derivedKey);
  }

  /** Decrypt the stored notes with an already-verified key and show the unlocked Vault. */
  async function openWithKey(derivedKey: CryptoKey) {
    const records = storageGet<VaultNoteRecord[]>(StorageKeys.vaultNotes, []);
    encryptedRecordsRef.current = records;
    const decrypted = await Promise.all(
      records.map(async (r): Promise<VaultNote> => {
        try {
          const json = await decryptText(derivedKey, { iv: r.iv, data: r.data });
          const { title, body } = JSON.parse(json) as { title: string; body: string };
          return { id: r.id, title, body, createdAt: r.createdAt, updatedAt: r.updatedAt };
        } catch {
          return { id: r.id, title: 'Could not decrypt', body: '', createdAt: r.createdAt, updatedAt: r.updatedAt };
        }
      }),
    );

    setKey(derivedKey);
    setNotes(decrypted);
    setError('');
    setPinInput('');
    setStatus('unlocked');
  }

  async function persistNotes(next: VaultNote[], activeKey: CryptoKey) {
    const prevRecords = encryptedRecordsRef.current;
    setNotes(next);
    const records: VaultNoteRecord[] = await Promise.all(
      next.map(async (n) => {
        const { iv, data } = await encryptText(activeKey, JSON.stringify({ title: n.title, body: n.body }));
        return { id: n.id, iv, data, createdAt: n.createdAt, updatedAt: n.updatedAt };
      }),
    );
    encryptedRecordsRef.current = records;
    storageSet(StorageKeys.vaultNotes, records);

    const engine = syncEngineRef.current;
    const uid = syncUidRef.current;
    if (engine && uid) {
      const prevMap = new Map(prevRecords.map((r) => [r.id, r]));
      const nextIds = new Set(records.map((r) => r.id));
      for (const rec of records) {
        const prev = prevMap.get(rec.id);
        if (!prev || prev.updatedAt !== rec.updatedAt) engine.pushUpsert(uid, rec);
      }
      for (const [id] of prevMap) {
        if (!nextIds.has(id)) engine.pushDelete(uid, id, Date.now());
      }
    }
  }

  async function reencryptFiles(oldKey: CryptoKey, newKey: CryptoKey) {
    const files = await getAllFiles();
    for (const f of files) {
      const plain = await decryptBytes(oldKey, f.iv, f.data);
      const { iv, data } = await encryptBytes(newKey, plain);
      await putFile({ ...f, iv, data });
    }
  }

  function lock() {
    forgetVaultKey();
    setKey(null);
    setNotes([]);
    setDraft(null);
    setEditingId(null);
    setSettingsOpen(false);
    setPinInput('');
    setError('');
    setTab('notes');
    setStatus('locked');
  }

  function openNew() {
    const note = newNote();
    setDraft(note);
    setEditingId(note.id);
  }

  function openExisting(note: VaultNote) {
    setDraft(null);
    setEditingId(note.id);
  }

  function handleChange(updated: VaultNote) {
    if (draft?.id === updated.id) {
      setDraft(updated);
    } else if (key) {
      void persistNotes(
        notes.map((n) => (n.id === updated.id ? updated : n)),
        key,
      );
    }
  }

  function closeEditor() {
    if (draft && key) {
      const hasContent = draft.title.trim() || draft.body.trim();
      if (hasContent) {
        void persistNotes([draft, ...notes], key);
      }
      setDraft(null);
    }
    setEditingId(null);
  }

  function deleteEditing() {
    if (draft) {
      setDraft(null);
    } else if (editingId && key) {
      void persistNotes(
        notes.filter((n) => n.id !== editingId),
        key,
      );
    }
    setEditingId(null);
  }

  function startChangePin() {
    setSettingsOpen(false);
    setChangingPin(true);
    setPinInput('');
    setPendingPin('');
    setError('');
    setStatus('setupPin');
  }

  function resetVault() {
    hapticWarning();
    // Tombstone the cloud copies too — otherwise the next sync (with a new PIN, and so a new
    // key) would pull these back in as undecryptable "Could not decrypt" entries, resurrecting
    // exactly what "Delete Everything" is supposed to remove.
    const engine = syncEngineRef.current;
    const uid = syncUidRef.current;
    if (engine && uid) {
      for (const rec of encryptedRecordsRef.current) {
        engine.pushDelete(uid, rec.id, Date.now());
      }
    }
    encryptedRecordsRef.current = [];
    storageRemove(StorageKeys.vaultSalt);
    storageRemove(StorageKeys.vaultCanary);
    storageRemove(StorageKeys.vaultNotes);
    storageRemove(StorageKeys.vaultFailedAttempts);
    storageRemove(StorageKeys.vaultLockedUntil);
    void clearAllFiles();
    forgetVaultKey();
    void disableVaultBiometric();
    setBiometricReady(false);
    setKey(null);
    setNotes([]);
    setDraft(null);
    setEditingId(null);
    setSettingsOpen(false);
    setConfirmingReset(false);
    setLockedUntil(0);
    setPinInput('');
    setPendingPin('');
    setError('');
    setChangingPin(false);
    setTab('notes');
    setStatus('setupPin');
  }

  const editingNote = editingId ? (draft?.id === editingId ? draft : notes.find((n) => n.id === editingId)) : null;

  if (status === 'loading') {
    return <div className="screen" />;
  }

  if (status === 'setupPin' && changingPin) {
    return (
      <div className="screen">
        <ScreenHeader title="Vault" onBack={() => setStatus('unlocked')} />
        <PinPad title="New PIN" subtitle="Choose a new 4-digit PIN" value={pinInput} onChange={setPinInput} error={error} />
      </div>
    );
  }

  if (status === 'setupPin' || status === 'confirmPin') {
    if (status === 'confirmPin' && changingPin) {
      return (
        <div className="screen">
          <ScreenHeader title="Vault" onBack={() => setStatus('unlocked')} />
          <PinPad title="Confirm New PIN" subtitle="Enter it again" value={pinInput} onChange={setPinInput} error={error} />
        </div>
      );
    }
    return (
      <div className="screen">
        <ScreenHeader title="Vault" onBack={back} />
        <PinPad
          title={status === 'setupPin' ? 'Set a PIN' : 'Confirm PIN'}
          subtitle={
            status === 'setupPin'
              ? 'Create a 4-digit PIN to lock your private notes'
              : 'Enter it again to confirm'
          }
          value={pinInput}
          onChange={setPinInput}
          error={error}
        />
      </div>
    );
  }

  if (status === 'locked') {
    const lockRemainingMs = lockedUntil - nowTick;
    const isLockedOut = lockRemainingMs > 0;
    const remainingLabel = isLockedOut
      ? `${Math.floor(lockRemainingMs / 60000)}:${String(Math.ceil((lockRemainingMs % 60000) / 1000)).padStart(2, '0')}`
      : '';
    return (
      <div className="screen">
        <ScreenHeader title="Vault" onBack={back} />
        <PinPad
          title="Enter PIN"
          subtitle={isLockedOut ? `Too many attempts. Try again in ${remainingLabel}` : 'Unlock your private notes'}
          value={pinInput}
          onChange={setPinInput}
          error={isLockedOut ? undefined : error}
          disabled={isLockedOut}
          action={
            biometricReady && !isLockedOut ? (
              <button type="button" className="vault-pin__action-btn" onClick={() => void tryBiometricUnlock()}>
                <Icon name="fingerprint" size={18} />
                Use fingerprint or face
              </button>
            ) : undefined
          }
        />
      </div>
    );
  }

  if (editingNote) {
    return (
      <VaultNoteEditor note={editingNote} onChange={handleChange} onDelete={deleteEditing} onClose={closeEditor} />
    );
  }

  return (
    <div className="screen">
      <ScreenHeader
        title="Vault"
        subtitle="Private, PIN-locked notes, photos & files"
        onBack={back}
        action={
          <div className="vault__header-actions">
            <button type="button" className="vault-editor__icon-btn" onClick={lock} aria-label="Lock vault">
              <Icon name="lock" size={18} />
            </button>
            <button
              type="button"
              className="vault-editor__icon-btn"
              onClick={() => setSettingsOpen((v) => !v)}
              aria-label="Vault settings"
            >
              <Icon name="settings" size={18} />
            </button>
          </div>
        }
      />

      {settingsOpen && (
        <div className="vault__settings">
          <button type="button" className="vault__settings-row" onClick={startChangePin}>
            <Icon name="lock" size={16} />
            Change PIN
          </button>
          {!confirmingReset ? (
            <button
              type="button"
              className="vault__settings-row vault__settings-row--danger"
              onClick={() => setConfirmingReset(true)}
            >
              <Icon name="trash" size={16} />
              Reset Vault
            </button>
          ) : (
            <div className="vault__reset-confirm">
              <p>This deletes all private notes, photos, files and your PIN. This can't be undone.</p>
              <div className="vault-editor__confirm-actions">
                <button type="button" onClick={() => setConfirmingReset(false)}>
                  Cancel
                </button>
                <button type="button" className="vault-editor__confirm-delete" onClick={resetVault}>
                  Delete Everything
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="vault__tabs">
        <button
          type="button"
          className={`vault__tab${tab === 'notes' ? ' vault__tab--active' : ''}`}
          onClick={() => setTab('notes')}
        >
          Notes
        </button>
        <button
          type="button"
          className={`vault__tab${tab === 'files' ? ' vault__tab--active' : ''}`}
          onClick={() => setTab('files')}
        >
          Photos & Files
        </button>
      </div>

      {tab === 'notes' ? (
        <>
          <div className="vault__content">
            {notes.length === 0 ? (
              <p className="vault__empty">No private notes yet. Tap + to write your first one.</p>
            ) : (
              <ul className="vault__list">
                {[...notes]
                  .sort((a, b) => b.updatedAt - a.updatedAt)
                  .map((note) => (
                    <li key={note.id}>
                      <button type="button" className="vault__card" onClick={() => openExisting(note)}>
                        <span className="vault__card-title">{note.title || 'Untitled'}</span>
                        {note.body && <p className="vault__card-preview">{note.body.slice(0, 80)}</p>}
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          <button type="button" className="vault__fab" onClick={openNew} aria-label="New private note">
            <Icon name="plus" size={24} />
          </button>
        </>
      ) : (
        key && <VaultFiles vaultKey={key} />
      )}
    </div>
  );
}
