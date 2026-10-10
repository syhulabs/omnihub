import { useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { createSyncEngine, type SyncEngine, type SyncItem } from './sync';

export function useCloudSync<T extends SyncItem>(
  collection: string,
  items: T[],
  rawPersist: (next: T[]) => void,
): { persist: (next: T[]) => void } {
  const { user } = useAuth();
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const rawPersistRef = useRef(rawPersist);
  rawPersistRef.current = rawPersist;
  const engineRef = useRef<SyncEngine<T> | null>(null);
  const uidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      engineRef.current = null;
      uidRef.current = null;
      return;
    }
    const engine = createSyncEngine<T>({
      collection,
      getLocal: () => itemsRef.current,
      setLocal: (next) => rawPersistRef.current(next),
    });
    engineRef.current = engine;
    uidRef.current = user.uid;
    engine.start(user.uid);
    return () => {
      engine.stop();
      engineRef.current = null;
      uidRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, collection]);

  function persist(next: T[]) {
    const prevMap = new Map(itemsRef.current.map((i) => [i.id, i]));
    rawPersist(next);
    // Two persists in one handler must diff against each other, not the stale render snapshot.
    itemsRef.current = next;

    const engine = engineRef.current;
    const uid = uidRef.current;
    if (!engine || !uid) return;

    const nextIds = new Set(next.map((i) => i.id));
    for (const item of next) {
      const prev = prevMap.get(item.id);
      if (!prev || prev.updatedAt !== item.updatedAt) {
        engine.pushUpsert(uid, item);
      }
    }
    for (const [id] of prevMap) {
      if (!nextIds.has(id)) {
        engine.pushDelete(uid, id, Date.now());
      }
    }
  }

  return { persist };
}
