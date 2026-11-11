import { useMemo, useState } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SearchBar } from '../../components/SearchBar';
import { Icon } from '../../components/Icon';
import { SwipeToDelete } from '../../components/SwipeToDelete';
import { useRouter } from '../../app/Router';
import { useBackHandler } from '../../app/useBackHandler';
import { storageGet, storageSet, StorageKeys } from '../../storage/db';
import { hapticSelect, hapticTap, hapticWarning } from '../../haptics';
import { useCloudSync } from '../../cloud/useCloudSync';
import { NoteEditor } from './NoteEditor';
import type { Note } from './types';
import { formatClockDate, formatNumericDate } from '../../settings/formats';
import './Notes.css';

type Tab = 'all' | 'pinned' | 'favorites' | 'trash';
type SortMode = 'newest' | 'oldest' | 'title';

const SORT_LABELS: Record<SortMode, string> = { newest: 'Newest', oldest: 'Oldest', title: 'Title A–Z' };
const SORT_CYCLE: SortMode[] = ['newest', 'oldest', 'title'];

function newNote(): Note {
  const now = Date.now();
  return { id: `${now}`, title: '', body: '', pinned: false, createdAt: now, updatedAt: now };
}

function preview(body: string): string {
  const trimmed = body.trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
}

/** The time for a note touched today, the date otherwise: a note edited three weeks ago and one
 *  edited a minute ago used to both read "1:21 PM". */
function formatCardTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toDateString() === new Date().toDateString() ? formatClockDate(date) : formatNumericDate(date);
}

export function Notes() {
  const { back } = useRouter();
  const [notes, setNotes] = useState<Note[]>(() => storageGet(StorageKeys.notes, []));
  const [draft, setDraft] = useState<Note | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [menuNoteId, setMenuNoteId] = useState<string | null>(null);

  useBackHandler(() => setMenuNoteId(null), menuNoteId !== null);

  function rawPersist(next: Note[]) {
    setNotes(next);
    storageSet(StorageKeys.notes, next);
  }

  const { persist } = useCloudSync('notes', notes, rawPersist);

  const nonTrashed = useMemo(() => notes.filter((n) => !n.trashedAt), [notes]);
  const counts = useMemo(
    () => ({
      all: nonTrashed.length,
      pinned: nonTrashed.filter((n) => n.pinned).length,
      favorites: nonTrashed.filter((n) => n.favorited).length,
      trash: notes.length - nonTrashed.length,
    }),
    [notes, nonTrashed],
  );

  const visibleNotes = useMemo(() => {
    const base =
      tab === 'trash'
        ? notes.filter((n) => n.trashedAt)
        : tab === 'pinned'
          ? nonTrashed.filter((n) => n.pinned)
          : tab === 'favorites'
            ? nonTrashed.filter((n) => n.favorited)
            : nonTrashed;
    const q = query.trim().toLowerCase();
    const filtered = q
      ? base.filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
      : base;
    return [...filtered].sort((a, b) => {
      if (tab === 'trash') return (b.trashedAt ?? 0) - (a.trashedAt ?? 0);
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sortMode === 'title') return (a.title || 'Untitled').localeCompare(b.title || 'Untitled');
      if (sortMode === 'oldest') return a.updatedAt - b.updatedAt;
      return b.updatedAt - a.updatedAt;
    });
  }, [notes, nonTrashed, tab, query, sortMode]);

  const editingNote = editingId ? (draft?.id === editingId ? draft : notes.find((n) => n.id === editingId)) : null;

  function openNew() {
    const note = newNote();
    setDraft(note);
    setEditingId(note.id);
  }

  function openExisting(note: Note) {
    setDraft(null);
    setEditingId(note.id);
  }

  function handleChange(updated: Note) {
    if (draft?.id === updated.id) {
      // A new note is stored as soon as it has content, then saves per keystroke like any other.
      // It used to live only in memory until the editor closed, so Android killing the app in
      // the background lost everything typed.
      if (updated.title.trim() || updated.body.trim()) {
        persist([updated, ...notes]);
        setDraft(null);
      } else {
        setDraft(updated);
      }
    } else {
      persist(notes.map((n) => (n.id === updated.id ? updated : n)));
    }
  }

  function closeEditor() {
    if (draft) {
      const hasContent = draft.title.trim() || draft.body.trim();
      if (hasContent) {
        persist([draft, ...notes]);
      }
      setDraft(null);
    }
    setEditingId(null);
  }

  function deleteEditing() {
    if (draft) {
      setDraft(null);
    } else if (editingId) {
      trashNote(editingId);
    }
    setEditingId(null);
  }

  function trashNote(id: string) {
    hapticWarning();
    persist(notes.map((n) => (n.id === id ? { ...n, trashedAt: Date.now(), updatedAt: Date.now() } : n)));
  }

  function restoreNote(id: string) {
    hapticSelect();
    persist(notes.map((n) => (n.id === id ? { ...n, trashedAt: undefined, updatedAt: Date.now() } : n)));
  }

  function deleteForever(id: string) {
    hapticWarning();
    persist(notes.filter((n) => n.id !== id));
  }

  function toggleFavorite(id: string) {
    hapticSelect();
    persist(notes.map((n) => (n.id === id ? { ...n, favorited: !n.favorited, updatedAt: Date.now() } : n)));
  }

  function togglePinned(id: string) {
    hapticSelect();
    persist(notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned, updatedAt: Date.now() } : n)));
  }

  if (editingNote) {
    return (
      <NoteEditor
        note={editingNote}
        onChange={handleChange}
        onDelete={deleteEditing}
        onClose={closeEditor}
        onTogglePinned={() => handleChange({ ...editingNote, pinned: !editingNote.pinned, updatedAt: Date.now() })}
        onToggleFavorite={() =>
          handleChange({ ...editingNote, favorited: !editingNote.favorited, updatedAt: Date.now() })
        }
      />
    );
  }

  const menuNote = notes.find((n) => n.id === menuNoteId) ?? null;

  return (
    <div className="screen">
      <ScreenHeader
        title="Notes"
        subtitle="Capture your thoughts, anytime"
        onBack={back}
        action={
          <button
            type="button"
            className="notes__header-btn"
            onClick={() => {
              hapticTap();
              setSortMode((m) => SORT_CYCLE[(SORT_CYCLE.indexOf(m) + 1) % SORT_CYCLE.length]);
            }}
            aria-label={`Sort: ${SORT_LABELS[sortMode]}`}
            title={`Sort: ${SORT_LABELS[sortMode]}`}
          >
            <Icon name="sort" size={18} />
          </button>
        }
      />

      <div className="notes__search">
        <SearchBar value={query} onChange={setQuery} placeholder="Search notes..." />
      </div>

      <div className="notes__tabs">
        {(['all', 'pinned', 'favorites', 'trash'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`notes__tab${tab === t ? ' notes__tab--active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'all' ? 'All' : t === 'pinned' ? 'Pinned' : t === 'favorites' ? 'Favorites' : 'Trash'} (
            {counts[t]})
          </button>
        ))}
      </div>

      <div className="notes__content">
        {visibleNotes.length === 0 ? (
          query ? (
            <p className="notes__empty">No notes match "{query}".</p>
          ) : (
            <div className="notes__hero">
              <span className="notes__hero-icon">
                <Icon name="note" size={40} />
              </span>
              <h2 className="notes__hero-title">
                {tab === 'trash'
                  ? 'Trash is empty'
                  : tab === 'favorites'
                    ? 'No favorites yet'
                    : tab === 'pinned'
                      ? 'No pinned notes yet'
                      : 'No notes yet'}
              </h2>
              <p className="notes__hero-subtitle">
                {tab === 'trash'
                  ? 'Deleted notes show up here.'
                  : tab === 'favorites'
                    ? 'Tap the star on a note to add one.'
                    : tab === 'pinned'
                      ? 'Pin a note to keep it at the top.'
                      : 'Tap + to write your first one.'}
              </p>
            </div>
          )
        ) : (
          <ul className="notes__list">
            {visibleNotes.map((note) => {
              const card = (
                <div className="notes__card">
                  <button type="button" className="notes__card-main" onClick={() => openExisting(note)}>
                    <span className={`notes__card-icon notes__card-icon--${note.color ?? 'blue'}`}>
                      <Icon name="note" size={18} />
                    </span>
                    <span className="notes__card-body">
                      <span className="notes__card-header">
                        <span className="notes__card-title">{note.title || 'Untitled'}</span>
                        {note.pinned && <Icon name="pin" size={12} className="notes__pin-icon" />}
                      </span>
                      {note.body && <span className="notes__card-preview">{preview(note.body)}</span>}
                      <span className="notes__card-time">
                        {formatCardTime(tab === 'trash' ? note.trashedAt ?? note.updatedAt : note.updatedAt)}
                      </span>
                    </span>
                  </button>
                  <span className="notes__card-actions">
                    {tab !== 'trash' && (
                      <button
                        type="button"
                        className={`notes__star-btn${note.favorited ? ' notes__star-btn--active' : ''}`}
                        onClick={() => toggleFavorite(note.id)}
                        aria-label={note.favorited ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Icon name="star" size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="notes__more-btn"
                      onClick={() => {
                        hapticTap();
                        setMenuNoteId(note.id);
                      }}
                      aria-label="More options"
                    >
                      <Icon name="more-dots" size={16} />
                    </button>
                  </span>
                </div>
              );

              return (
                <li key={note.id}>
                  {tab === 'trash' ? (
                    <SwipeToDelete
                      id={note.id}
                      openId={openSwipeId}
                      onOpenChange={setOpenSwipeId}
                      onDelete={() => deleteForever(note.id)}
                      deleteLabel="Delete Forever"
                    >
                      {card}
                    </SwipeToDelete>
                  ) : (
                    <SwipeToDelete
                      id={note.id}
                      openId={openSwipeId}
                      onOpenChange={setOpenSwipeId}
                      onDelete={() => trashNote(note.id)}
                      deleteLabel="Delete"
                    >
                      {card}
                    </SwipeToDelete>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {tab !== 'trash' && (
        <button type="button" className="notes__fab" onClick={openNew} aria-label="New note">
          <Icon name="plus" size={24} />
        </button>
      )}

      {menuNote && (
        <div className="notes__menu-overlay" onClick={() => setMenuNoteId(null)}>
          <div className="notes__menu-sheet" onClick={(e) => e.stopPropagation()}>
            {menuNote.trashedAt ? (
              <>
                <button
                  type="button"
                  className="notes__menu-item"
                  onClick={() => {
                    restoreNote(menuNote.id);
                    setMenuNoteId(null);
                  }}
                >
                  <Icon name="repeat" size={18} />
                  Restore
                </button>
                <button
                  type="button"
                  className="notes__menu-item notes__menu-item--danger"
                  onClick={() => {
                    deleteForever(menuNote.id);
                    setMenuNoteId(null);
                  }}
                >
                  <Icon name="trash" size={18} />
                  Delete Forever
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="notes__menu-item"
                  onClick={() => {
                    togglePinned(menuNote.id);
                    setMenuNoteId(null);
                  }}
                >
                  <Icon name="pin" size={18} />
                  {menuNote.pinned ? 'Unpin' : 'Pin to Top'}
                </button>
                <button
                  type="button"
                  className="notes__menu-item"
                  onClick={() => {
                    toggleFavorite(menuNote.id);
                    setMenuNoteId(null);
                  }}
                >
                  <Icon name="star" size={18} />
                  {menuNote.favorited ? 'Remove Favorite' : 'Add to Favorites'}
                </button>
                <button
                  type="button"
                  className="notes__menu-item notes__menu-item--danger"
                  onClick={() => {
                    trashNote(menuNote.id);
                    setMenuNoteId(null);
                  }}
                >
                  <Icon name="trash" size={18} />
                  Move to Trash
                </button>
              </>
            )}
            <button type="button" className="notes__menu-cancel" onClick={() => setMenuNoteId(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
