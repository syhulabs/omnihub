import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/* Handing a file to the user. Android's WebView has no download manager hooked up, so an
   `<a download>` click is silently swallowed there: on the phone the file is written to the
   app's cache and offered through the system share sheet (Files, Drive, WhatsApp...). In a
   browser the download link still works. */

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(blob);
  });
}

function downloadInBrowser(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Removes every file this module wrote for sharing. They can't be deleted right after the share
 *  sheet closes (the receiving app may still be reading), so they are cleared at the next app
 *  start and whenever the user wipes their data: decrypted Vault files and plain backups must not
 *  sit in the cache forever. */
export async function purgeSharedCache(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Filesystem.rmdir({ path: 'shared', directory: Directory.Cache, recursive: true });
  } catch {
    // nothing was ever shared
  }
}

/** True when the user cancelled the share sheet (not an error worth showing). */
export function isShareCancel(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /cancel|abort/i.test(message) || (err as { name?: string } | null)?.name === 'AbortError';
}

/** Saves or shares a file; resolves when handed off, rejects on failure (see isShareCancel). */
export async function saveOrShareFile(blob: Blob, filename: string, title: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    downloadInBrowser(blob, filename);
    return;
  }
  const path = `shared/${filename}`;
  await Filesystem.writeFile({ path, data: await blobToBase64(blob), directory: Directory.Cache, recursive: true });
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
  await Share.share({ title, url: uri, dialogTitle: title });
}

/** Shares plain text through the system sheet on the phone, the Web Share API in a browser,
 *  and the clipboard as a last resort. Resolves to how it went out. */
export async function shareText(title: string, text: string): Promise<'shared' | 'copied'> {
  if (Capacitor.isNativePlatform()) {
    await Share.share({ title, text, dialogTitle: title });
    return 'shared';
  }
  if (navigator.share) {
    await navigator.share({ title, text });
    return 'shared';
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
}
