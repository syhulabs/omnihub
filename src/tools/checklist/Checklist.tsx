import { useMemo, useRef, useState } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SearchBar } from '../../components/SearchBar';
import { Icon } from '../../components/Icon';
import { useRouter } from '../../app/Router';
import { storageGet, storageSet, StorageKeys } from '../../storage/db';
import { hapticTap } from '../../haptics';
import { useCloudSync } from '../../cloud/useCloudSync';
import { ChecklistDetail } from './ChecklistDetail';
import { CHECKLIST_CATEGORIES, type Checklist as ChecklistType } from './types';
import './Checklist.css';

function newList(category?: string): ChecklistType {
  const now = Date.now();
  return { id: `${now}`, name: '', items: [], category, createdAt: now, updatedAt: now };
}

function ChecklistHeroIllustration() {
  return (
    <svg className="cl__hero-svg" viewBox="0 0 160 160" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="clGlow" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="clBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <circle cx="80" cy="80" r="78" fill="url(#clGlow)" />
      <path d="M28 60 L14 56 M132 60 L146 56 M28 100 L14 104 M132 100 L146 104" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" opacity="0.6" />
      <rect x="38" y="26" width="84" height="112" rx="14" fill="var(--bg-elevated)" stroke="url(#clBody)" strokeWidth="6" />
      <rect x="62" y="18" width="36" height="18" rx="8" fill="url(#clBody)" />
      <path d="M54 66 L64 76 L82 56" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="90" y="64" width="22" height="6" rx="3" fill="url(#clBody)" opacity="0.85" />
      <path d="M54 98 L64 108 L82 88" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="90" y="96" width="22" height="6" rx="3" fill="url(#clBody)" opacity="0.85" />
    </svg>
  );
}

export function Checklist() {
  const { back } = useRouter();
  const [lists, setLists] = useState<ChecklistType[]>(() => storageGet(StorageKeys.checklists, []));
  const [draft, setDraft] = useState<ChecklistType | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [customCategories, setCustomCategories] = useState<string[]>(() =>
    storageGet(StorageKeys.checklistCategories, []),
  );

  function rawPersist(next: ChecklistType[]) {
    setLists(next);
    storageSet(StorageKeys.checklists, next);
  }

  const { persist } = useCloudSync('checklists', lists, rawPersist);

  const allCategories = useMemo(
    () => [...CHECKLIST_CATEGORIES, ...customCategories],
    [customCategories],
  );

  const visibleLists = useMemo(() => {
    const q = query.trim().toLowerCase();
    let filtered = lists;
    if (category !== 'All') filtered = filtered.filter((l) => l.category === category);
    if (q) filtered = filtered.filter((l) => l.name.toLowerCase().includes(q));
    return [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [lists, query, category]);

  const openList = openId ? (draft?.id === openId ? draft : lists.find((l) => l.id === openId)) : null;

  // The list created by the detail screen that is open now: emptied again before closing, it is
  // discarded instead of left behind as an empty "Untitled" list.
  const newListIdRef = useRef<string | null>(null);

  function createList() {
    const list = newList(category !== 'All' ? category : undefined);
    newListIdRef.current = list.id;
    setDraft(list);
    setOpenId(list.id);
  }

  function addCustomCategory() {
    const name = window.prompt('New category name');
    const trimmed = name?.trim();
    if (!trimmed || allCategories.includes(trimmed)) return;
    hapticTap();
    const next = [...customCategories, trimmed];
    setCustomCategories(next);
    storageSet(StorageKeys.checklistCategories, next);
    setCategory(trimmed);
  }

  function handleChange(updated: ChecklistType) {
    if (draft?.id === updated.id) {
      // Stored as soon as it has a name or an item (see Notes): a new list used to exist only in
      // memory until Back was pressed.
      if (updated.name.trim() || updated.items.length > 0) {
        persist([updated, ...lists]);
        setDraft(null);
      } else {
        setDraft(updated);
      }
    } else {
      persist(lists.map((l) => (l.id === updated.id ? updated : l)));
    }
  }

  function closeDetail() {
    if (draft) {
      if (draft.name.trim() || draft.items.length > 0) {
        persist([draft, ...lists]);
      }
      setDraft(null);
    } else if (openId && openId === newListIdRef.current) {
      const saved = lists.find((l) => l.id === openId);
      if (saved && !saved.name.trim() && saved.items.length === 0) persist(lists.filter((l) => l.id !== openId));
    }
    newListIdRef.current = null;
    setOpenId(null);
  }

  function deleteOpen() {
    if (draft) {
      setDraft(null);
    } else if (openId) {
      persist(lists.filter((l) => l.id !== openId));
    }
    setOpenId(null);
  }

  function duplicateList(copy: ChecklistType) {
    persist([copy, ...lists]);
  }

  if (openList) {
    return (
      <ChecklistDetail
        list={openList}
        onChange={handleChange}
        onDelete={deleteOpen}
        onClose={closeDetail}
        onDuplicate={duplicateList}
      />
    );
  }

  return (
    <div className="screen">
      <ScreenHeader title="Checklist" subtitle="Stay organized, get things done" onBack={back} />

      <div className="cl__search">
        <SearchBar value={query} onChange={setQuery} placeholder="Search checklists..." />
      </div>

      <div className="cl__tabs">
        <button
          type="button"
          className={`cl__tab${category === 'All' ? ' cl__tab--active' : ''}`}
          onClick={() => setCategory('All')}
        >
          All
        </button>
        {allCategories.map((c) => (
          <button
            key={c}
            type="button"
            className={`cl__tab${category === c ? ' cl__tab--active' : ''}`}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
        <button type="button" className="cl__tab-add" onClick={addCustomCategory} aria-label="Add category">
          <Icon name="plus" size={16} />
        </button>
      </div>

      <div className="cl__content">
        {visibleLists.length === 0 ? (
          lists.length === 0 && !query && category === 'All' ? (
            <div className="cl__hero">
              <ChecklistHeroIllustration />
              <h2 className="cl__hero-title">No checklists yet</h2>
              <p className="cl__hero-subtitle">Tap + to create your first checklist and start being productive.</p>
            </div>
          ) : (
            <p className="cl__empty">No checklists match here.</p>
          )
        ) : (
          <ul className="cl__list">
            {visibleLists.map((list) => {
              const done = list.items.filter((i) => i.checked).length;
              return (
                <li key={list.id}>
                  <button type="button" className="cl__card" onClick={() => setOpenId(list.id)}>
                    <span className="cl__card-main">
                      <span className="cl__card-name">{list.name || 'Untitled List'}</span>
                      {list.category && <span className="cl__card-category">{list.category}</span>}
                    </span>
                    <span className="cl__card-progress">
                      {list.items.length ? `${done}/${list.items.length}` : 'Empty'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <button type="button" className="cl__fab" onClick={createList} aria-label="New list">
        <Icon name="plus" size={24} />
      </button>
    </div>
  );
}
