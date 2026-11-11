import { useEffect, useState } from 'react';
import { isShareCancel, saveOrShareFile } from '../../../share/saveFile';
import { Capacitor } from '@capacitor/core';
import { isIOS } from '../../../platform';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { Icon } from '../../../components/Icon';
import { hapticTap, hapticSuccess, hapticWarning } from '../../../haptics';
import { playBuffer, stopPlayback, decodeBlob } from '../playback';
import { deleteClip, renameClip, setFavorite } from '../clipStorage';
import { extensionForBlob } from '../audioEffects';
import { RingtonePlugin } from '../ringtonePlugin';
import { SHARE_TARGET_IMAGES } from '../../../assets/voice-changer';
import { SHARE_TARGET_IMAGES_LIGHT } from '../../../assets/voice-changer/lightIndex';
import { useIsLightTheme } from '../../../theme/useTheme';
import type { VcApi } from '../types';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Quick-access tiles into the same share flow below — tapping any of them opens the one real
 *  share mechanism (the OS share sheet via handleShare), same as tapping "Share" itself. There's
 *  no reliable cross-platform way to deep-link a file share straight into one specific app, so
 *  these are a recognizable visual shortcut into that sheet rather than a guaranteed direct route
 *  — the sheet that opens will show WhatsApp/Telegram/Gmail/etc. if the device has them installed. */
const SHARE_TARGETS: { id: string; label: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'gmail', label: 'Gmail' },
  { id: 'bluetooth', label: 'Bluetooth' },
  { id: 'more', label: 'More' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ShareScreen({ api }: { api: VcApi }) {
  // Leaving this screen stops its clip; it used to keep playing on the next screen with no stop control.
  useEffect(() => () => stopPlayback(), []);
  const isLight = useIsLightTheme();
  const shareTargetImages = isLight ? SHARE_TARGET_IMAGES_LIGHT : SHARE_TARGET_IMAGES;
  const clip = api.shareClip;
  const [isPlaying, setIsPlaying] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(clip?.name ?? '');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ringtoneStatus, setRingtoneStatus] = useState<'idle' | 'busy' | 'needs-permission' | 'success'>('idle');

  if (!clip) {
    return (
      <div className="screen">
        <ScreenHeader title="Share / Export" onBack={api.popBack} />
        <div className="vch__body vch__body--center">
          <p className="vch__hint">Nothing to share yet.</p>
        </div>
      </div>
    );
  }

  const isSaved = clip.id !== 'unsaved';

  async function handlePlay() {
    if (!clip) return;
    if (isPlaying) {
      stopPlayback();
      setIsPlaying(false);
      return;
    }
    try {
      const buffer = await decodeBlob(clip.blob);
      await playBuffer(buffer, () => setIsPlaying(false));
      setIsPlaying(true);
    } catch {
      setError("Couldn't play that clip.");
    }
  }

  async function handleShare() {
    if (!clip) return;
    hapticTap();
    setError(null);
    try {
      const filename = `${clip.name}.${extensionForBlob(clip.blob)}`;
      const file = new File([clip.blob], filename, { type: clip.blob.type });
      if (!Capacitor.isNativePlatform() && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: clip.name });
      } else {
        // On the phone this is the system share sheet (WhatsApp, Telegram, Drive...).
        await saveOrShareFile(clip.blob, filename, clip.name);
      }
      hapticSuccess();
    } catch (e) {
      if (!isShareCancel(e)) {
        hapticWarning();
        setError("Couldn't share that clip — try again.");
      }
    }
  }

  async function handleRenameSave() {
    if (!clip || !isSaved) return;
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== clip.name) {
      await renameClip(clip.id, trimmed);
      api.setShareClip({ ...clip, name: trimmed });
      api.bumpHistoryToken();
    }
    setRenaming(false);
  }

  async function handleDelete() {
    if (!clip || !isSaved) return;
    hapticWarning();
    await deleteClip(clip.id);
    api.bumpHistoryToken();
    api.setShareClip(null);
    api.reset('home');
  }

  async function handleToggleFavorite() {
    if (!clip || !isSaved) return;
    hapticTap();
    const next = !clip.favorite;
    await setFavorite(clip.id, next);
    api.setShareClip({ ...clip, favorite: next });
    api.bumpHistoryToken();
  }

  async function handleSetRingtone() {
    if (!clip) return;
    hapticTap();
    setError(null);
    setRingtoneStatus('busy');
    try {
      const { granted } = await RingtonePlugin.checkWriteSettingsPermission();
      if (!granted) {
        setRingtoneStatus('needs-permission');
        return;
      }
      const base64 = await blobToBase64(clip.blob);
      const result = await RingtonePlugin.setAsRingtone({
        base64,
        fileName: `${clip.name}.${extensionForBlob(clip.blob)}`,
        mimeType: clip.blob.type,
      });
      if (result.needsPermission) {
        setRingtoneStatus('needs-permission');
      } else {
        hapticSuccess();
        setRingtoneStatus('success');
      }
    } catch (e) {
      hapticWarning();
      setError(e instanceof Error ? e.message : "Couldn't set that as your ringtone.");
      setRingtoneStatus('idle');
    }
  }

  async function handleGrantRingtonePermission() {
    hapticTap();
    await RingtonePlugin.requestWriteSettingsPermission();
    // The user grants this from a system Settings screen and comes back — nothing to await here,
    // they just tap "Set as Ringtone" again once they're back.
  }

  return (
    <div className="screen">
      <ScreenHeader title="Share / Export" onBack={api.popBack} />
      <div className="vch__body">
        <div className="vch__success-banner">
          <span className="vch__success-icon">
            <Icon name="check" size={18} />
          </span>
          <div>
            {/* isSaved only reflects whether it landed in History — this still shows for a clip
                that was saved to device but not history (or neither), since either way arriving
                here means Preview & Save's Save button already ran and something is ready to go. */}
            <strong>{isSaved ? 'Saved Successfully!' : 'Ready to Share'}</strong>
            <span>
              {clip.name}.{extensionForBlob(clip.blob)} · {formatDuration(clip.durationSeconds)} · {formatBytes(clip.blob.size)}
            </span>
          </div>
        </div>

        {error && (
          <div className="vch__error">
            <Icon name="info" size={16} />
            <span>{error}</span>
          </div>
        )}

        {!renaming && (
          <>
          <span className="vch__section-title">Share to</span>
          <div className="vch__share-grid">
            {SHARE_TARGETS.map((t) => (
              <button key={t.id} type="button" className="vch__share-target" onClick={() => void handleShare()}>
                <span className="vch__share-target-icon">
                  <img src={shareTargetImages[t.id]} alt="" />
                </span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
          </>
        )}

        {renaming && (
          <div className="vch__field">
            <input
              type="text"
              className="vch__text-input"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={60}
              autoFocus
            />
            <div className="vch__actions">
              <button type="button" className="vch__action vch__action--secondary" onClick={() => setRenaming(false)}>
                Cancel
              </button>
              <button type="button" className="vch__action vch__action--primary" onClick={() => void handleRenameSave()}>
                Save Name
              </button>
            </div>
          </div>
        )}

        {!renaming && (
          <div className="vch__menu-list">
            <button type="button" className="vch__menu-row" onClick={() => void handlePlay()}>
              <Icon name={isPlaying ? 'stop' : 'play'} size={17} />
              <span>{isPlaying ? 'Stop' : 'Play'}</span>
            </button>
            {isSaved && (
              <button type="button" className="vch__menu-row" onClick={() => setRenaming(true)}>
                <Icon name="edit" size={17} />
                <span>Rename</span>
              </button>
            )}
            {/* iOS has no API for an app to set the ringtone. */}
            {Capacitor.isNativePlatform() && !isIOS && (
              <button type="button" className="vch__menu-row" onClick={() => void handleSetRingtone()} disabled={ringtoneStatus === 'busy'}>
                <Icon name="bell" size={17} />
                <span>
                  {ringtoneStatus === 'success' ? 'Set as your ringtone ✓' : ringtoneStatus === 'busy' ? 'Setting ringtone…' : 'Set as Ringtone'}
                </span>
              </button>
            )}
            {ringtoneStatus === 'needs-permission' && (
              <div className="vch__confirm">
                <p>Setting a ringtone needs the "Modify system settings" permission. Grant it, then tap Set as Ringtone again.</p>
                <div className="vch__actions">
                  <button type="button" className="vch__action vch__action--secondary" onClick={() => setRingtoneStatus('idle')}>
                    Cancel
                  </button>
                  <button type="button" className="vch__action vch__action--primary" onClick={() => void handleGrantRingtonePermission()}>
                    Open Settings
                  </button>
                </div>
              </div>
            )}
            {isSaved && (
              <button type="button" className="vch__menu-row" onClick={() => void handleToggleFavorite()}>
                <Icon name="bookmark" size={17} style={clip.favorite ? { fill: 'currentColor' } : undefined} />
                <span>{clip.favorite ? 'Remove from Saved' : 'Add to Saved'}</span>
              </button>
            )}
            {isSaved && !confirmingDelete && (
              <button type="button" className="vch__menu-row vch__menu-row--danger" onClick={() => setConfirmingDelete(true)}>
                <Icon name="trash" size={17} />
                <span>Delete</span>
              </button>
            )}
            {isSaved && confirmingDelete && (
              <div className="vch__confirm">
                <p>Delete "{clip.name}"? This can't be undone.</p>
                <div className="vch__actions">
                  <button type="button" className="vch__action vch__action--secondary" onClick={() => setConfirmingDelete(false)}>
                    Cancel
                  </button>
                  <button type="button" className="vch__action vch__action--danger" onClick={() => void handleDelete()}>
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
