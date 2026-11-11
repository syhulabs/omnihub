import { useEffect, useRef, useState } from 'react';
import { isShareCancel, saveOrShareFile } from '../share/saveFile';
import { Icon } from '../components/Icon';
import { encryptBytes, decryptBytes } from './crypto';
import { putFile, getAllFiles, deleteFile, type VaultFileRecord } from './fileStore';
import { exportFilesZip, importFilesZip } from './backup';
import { hapticSuccess, hapticWarning } from '../haptics';
import { useBackHandler } from '../app/useBackHandler';
import { expectVaultExternalActivity } from './session';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A file is read, encrypted and stored as whole in-memory copies; past this size that runs the
 *  WebView out of memory and takes the app down with it. */
const MAX_FILE_BYTES = 100 * 1024 * 1024;

function isImage(mime: string): boolean {
  return mime.startsWith('image/');
}

interface VaultFilesProps {
  vaultKey: CryptoKey;
}

export function VaultFiles({ vaultKey }: VaultFilesProps) {
  const [files, setFiles] = useState<VaultFileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getAllFiles().then((records) => {
      if (!cancelled) {
        setFiles(records.sort((a, b) => b.createdAt - a.createdAt));
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(timer);
  }, [status]);

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    let added = 0;
    let tooBig = 0;
    let failed = 0;
    try {
      for (const file of Array.from(fileList)) {
        if (file.size > MAX_FILE_BYTES) {
          tooBig++;
          continue;
        }
        try {
          const bytes = await file.arrayBuffer();
          const { iv, data } = await encryptBytes(vaultKey, bytes);
          const record: VaultFileRecord = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: file.name,
            mime: file.type || 'application/octet-stream',
            size: file.size,
            iv,
            data,
            createdAt: Date.now(),
          };
          await putFile(record);
          setFiles((prev) => [record, ...prev]);
          added++;
        } catch {
          failed++; // usually the phone's storage quota
        }
      }
    } finally {
      // Always release the screen: a failed save used to leave +, Export and Import disabled.
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
    if (tooBig > 0) {
      setStatus(`${tooBig === 1 ? 'One file is' : `${tooBig} files are`} over 100 MB and can't be stored in the Vault.`);
      hapticWarning();
    } else if (failed > 0) {
      setStatus(`Couldn't save ${failed === 1 ? 'that file' : `${failed} files`}. Your phone may be out of space.`);
      hapticWarning();
    } else if (added > 0) {
      hapticSuccess();
    }
  }

  async function openFile(record: VaultFileRecord) {
    setBusy(true);
    try {
      const plain = await decryptBytes(vaultKey, record.iv, record.data);
      const blob = new Blob([plain], { type: record.mime });
      if (isImage(record.mime)) {
        setPreview({ url: URL.createObjectURL(blob), name: record.name });
      } else {
        expectVaultExternalActivity();
        await saveOrShareFile(blob, record.name, record.name);
      }
    } catch (err) {
      if (!isShareCancel(err)) {
        setStatus("Couldn't open that file.");
        hapticWarning();
      }
    } finally {
      setBusy(false);
    }
  }

  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  // Hardware back closes the photo or the delete confirmation instead of leaving the Vault.
  useBackHandler(closePreview, !!preview);
  useBackHandler(() => setConfirmingDeleteId(null), !preview && confirmingDeleteId !== null);

  async function handleDelete(id: string) {
    await deleteFile(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setConfirmingDeleteId(null);
    hapticWarning();
  }

  async function handleExport() {
    setBusy(true);
    try {
      expectVaultExternalActivity();
      const { count } = await exportFilesZip(vaultKey);
      setStatus(count === 0 ? 'No files to export yet.' : `Export ready: ${count} file${count === 1 ? '' : 's'} in one zip.`);
      if (count > 0) hapticSuccess();
    } catch (err) {
      // Closing the share sheet without choosing anything is not a failure.
      if (!isShareCancel(err)) {
        setStatus('Export failed. Try again.');
        hapticWarning();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleImportZip(zipFile: File | null) {
    if (!zipFile) return;
    setBusy(true);
    try {
      const { imported } = await importFilesZip(vaultKey, zipFile);
      const records = await getAllFiles();
      setFiles(records.sort((a, b) => b.createdAt - a.createdAt));
      setStatus(imported === 0 ? "That file didn't contain any importable files." : `Imported ${imported} file${imported === 1 ? '' : 's'}.`);
      if (imported > 0) hapticSuccess();
    } catch {
      setStatus("Couldn't read that backup file.");
      hapticWarning();
    } finally {
      setBusy(false);
      if (backupInputRef.current) backupInputRef.current.value = '';
    }
  }

  if (preview) {
    return (
      <div className="vault-preview">
        <button
          type="button"
          className="vault-preview__close"
          onClick={closePreview}
          aria-label="Close preview"
        >
          <Icon name="x" size={20} />
        </button>
        <img src={preview.url} alt={preview.name} className="vault-preview__img" />
        <p className="vault-preview__name">{preview.name}</p>
      </div>
    );
  }

  return (
    <div className="vault__content">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="vault-files__input"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />
      <input
        ref={backupInputRef}
        type="file"
        accept=".zip,application/zip"
        className="vault-files__input"
        onChange={(e) => handleImportZip(e.target.files?.[0] ?? null)}
      />

      <div className="vault-files__toolbar">
        <button type="button" className="vault-files__toolbar-btn" onClick={handleExport} disabled={busy}>
          <Icon name="download" size={15} />
          Export
        </button>
        <button
          type="button"
          className="vault-files__toolbar-btn"
          onClick={() => {
            expectVaultExternalActivity();
            backupInputRef.current?.click();
          }}
          disabled={busy}
        >
          <Icon name="upload" size={15} />
          Import
        </button>
      </div>

      {status && <p className="vault-files__status">{status}</p>}

      {loading ? null : files.length === 0 ? (
        <p className="vault__empty">No private files yet. Tap + to add photos or files.</p>
      ) : (
        <ul className="vault-files__list">
          {files.map((f) => (
            <li key={f.id} className="vault-files__row">
              <button type="button" className="vault-files__item" onClick={() => openFile(f)}>
                <span className={`vault-files__icon${isImage(f.mime) ? ' vault-files__icon--image' : ''}`}>
                  <Icon name={isImage(f.mime) ? 'image' : 'file'} size={18} />
                </span>
                <span className="vault-files__meta">
                  <span className="vault-files__name">{f.name}</span>
                  <span className="vault-files__size">{formatSize(f.size)}</span>
                </span>
              </button>
              {confirmingDeleteId === f.id ? (
                <div className="vault-files__confirm">
                  <button type="button" onClick={() => setConfirmingDeleteId(null)} aria-label="Cancel">
                    <Icon name="x" size={16} />
                  </button>
                  <button type="button" className="vault-files__confirm-delete" onClick={() => handleDelete(f.id)} aria-label="Confirm delete">
                    <Icon name="check" size={16} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="vault-files__delete"
                  onClick={() => setConfirmingDeleteId(f.id)}
                  aria-label={`Delete ${f.name}`}
                >
                  <Icon name="trash" size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className={`vault__fab${busy ? ' vault__fab--busy' : ''}`}
        onClick={() => {
          expectVaultExternalActivity();
          inputRef.current?.click();
        }}
        aria-label="Add photos or files"
        disabled={busy}
      >
        <Icon name="plus" size={24} />
      </button>
    </div>
  );
}
