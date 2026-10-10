import { zipSync, unzipSync, strToU8 } from 'fflate';
import { saveOrShareFile } from '../share/saveFile';
import { encryptBytes, decryptBytes } from './crypto';
import { getAllFiles, putFile, type VaultFileRecord } from './fileStore';

const MANIFEST_NAME = '_manifest.json';

interface ManifestEntry {
  file: string;
  name: string;
  mime: string;
  createdAt: number;
}

function uniqueZipName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let i = 2;
  let candidate = `${base} (${i})${ext}`;
  while (used.has(candidate)) {
    i++;
    candidate = `${base} (${i})${ext}`;
  }
  used.add(candidate);
  return candidate;
}

export async function exportFilesZip(key: CryptoKey): Promise<{ count: number }> {
  const records = await getAllFiles();
  if (records.length === 0) return { count: 0 };

  const entries: Record<string, Uint8Array> = {};
  const manifest: ManifestEntry[] = [];
  const used = new Set<string>();

  for (const r of records) {
    const plain = await decryptBytes(key, r.iv, r.data);
    const zipName = uniqueZipName(r.name || `file-${r.id}`, used);
    entries[zipName] = new Uint8Array(plain);
    manifest.push({ file: zipName, name: r.name, mime: r.mime, createdAt: r.createdAt });
  }
  entries[MANIFEST_NAME] = strToU8(JSON.stringify(manifest, null, 2));

  const zipped = zipSync(entries, { level: 0 });
  const blob = new Blob([zipped as BlobPart], { type: 'application/zip' });
  const date = new Date().toISOString().slice(0, 10);
  await saveOrShareFile(blob, `omni-hub-vault-files-${date}.zip`, 'Export Vault files');

  return { count: records.length };
}

export async function importFilesZip(key: CryptoKey, zipFile: File): Promise<{ imported: number }> {
  const buffer = new Uint8Array(await zipFile.arrayBuffer());
  const unzipped = unzipSync(buffer);

  let manifest: ManifestEntry[] = [];
  const manifestBytes = unzipped[MANIFEST_NAME];
  if (manifestBytes) {
    try {
      manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as ManifestEntry[];
    } catch {
      manifest = [];
    }
  }
  const manifestByFile = new Map(manifest.map((m) => [m.file, m]));

  let imported = 0;
  for (const [zipName, bytes] of Object.entries(unzipped)) {
    if (zipName === MANIFEST_NAME || zipName.endsWith('/')) continue;
    const meta = manifestByFile.get(zipName);
    const { iv, data } = await encryptBytes(key, bytes.buffer as ArrayBuffer);
    const record: VaultFileRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: meta?.name ?? zipName,
      mime: meta?.mime ?? 'application/octet-stream',
      size: bytes.byteLength,
      iv,
      data,
      createdAt: meta?.createdAt ?? Date.now(),
    };
    await putFile(record);
    imported++;
  }

  return { imported };
}
