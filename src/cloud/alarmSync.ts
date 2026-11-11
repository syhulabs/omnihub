import { AlarmPlugin, type AlarmRecord, type ScheduleOptions } from '../alarm/plugin';
import { createSyncEngine, type SyncEngine } from './sync';

let engine: SyncEngine<AlarmRecord> | null = null;
let currentUid: string | null = null;
let onRemoteChange: (() => void) | null = null;

async function getLocal(): Promise<AlarmRecord[]> {
  const { alarms } = await AlarmPlugin.list();
  return alarms;
}

/**
 * Applies the merged set back to native storage - only touching alarms whose updatedAt actually
 * changed, since calling applyFromSync unconditionally would re-arm every alarm on every merge
 * (including ones that didn't change) for no reason.
 */
async function setLocal(items: AlarmRecord[]): Promise<void> {
  const current = (await AlarmPlugin.list()).alarms;
  const currentMap = new Map(current.map((a) => [a.id, a]));
  const nextIds = new Set(items.map((a) => a.id));
  let changed = false;

  for (const item of items) {
    const cur = currentMap.get(item.id);
    if (!cur || cur.updatedAt !== item.updatedAt) {
      await AlarmPlugin.applyFromSync({ ...item });
      changed = true;
    }
  }
  for (const [id] of currentMap) {
    if (!nextIds.has(id)) {
      await AlarmPlugin.cancel({ id });
      changed = true;
    }
  }
  if (changed) onRemoteChange?.();
}

export async function startAlarmSync(uid: string, onChange: () => void): Promise<void> {
  onRemoteChange = onChange;
  engine = createSyncEngine<AlarmRecord>({ collection: 'alarms', getLocal, setLocal });
  currentUid = uid;
  await engine.start(uid);
  onChange(); // reflect whatever the initial merge just applied
}

export async function stopAlarmSync(): Promise<void> {
  // Cleared before the await: leaving and re-entering Alarm quickly starts a new engine while
  // this stop is still in flight, and clearing afterwards would wipe out the new one.
  const stopping = engine;
  engine = null;
  currentUid = null;
  onRemoteChange = null;
  await stopping?.stop();
}

/** Use instead of AlarmPlugin.schedule() for user-initiated edits, so the change also reaches other signed-in devices. */
export async function scheduleAlarmSynced(options: ScheduleOptions): Promise<{ id: string; armed: boolean }> {
  const result = await AlarmPlugin.schedule(options);
  if (engine && currentUid) {
    const { alarms } = await AlarmPlugin.list();
    const saved = alarms.find((a) => a.id === result.id);
    if (saved) void engine.pushUpsert(currentUid, saved);
  }
  return result;
}

/** Use instead of AlarmPlugin.cancel() for user-initiated deletes, so the deletion also reaches other signed-in devices. */
export async function cancelAlarmSynced(id: string): Promise<void> {
  await AlarmPlugin.cancel({ id });
  if (engine && currentUid) {
    // Not awaited: offline, Firestore only settles the write once the server acknowledges it, so
    // waiting here left the editor open and the deleted alarm on screen until the phone was online.
    void engine.pushDelete(currentUid, id, Date.now());
  }
}
