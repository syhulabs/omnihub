import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { shareText } from '../../share/saveFile';
import { formatClockDate } from '../../settings/formats';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon } from '../../components/Icon';
import { hapticSelect, hapticSuccess, hapticTap, hapticWarning } from '../../haptics';
import { useBackHandler } from '../../app/useBackHandler';
import type { Checklist, ChecklistItem } from './types';

interface ChecklistDetailProps {
  list: Checklist;
  onChange: (list: Checklist) => void;
  onDelete: () => void;
  onClose: () => void;
  onDuplicate: (copy: Checklist) => void;
}

interface DragState {
  id: string;
  /** Index of the dragged row when the drag began, and where it would land if dropped now. */
  startIndex: number;
  targetIndex: number;
  offsetY: number;
  startY: number;
  /** Height of one row plus the gap between rows. */
  slot: number;
  /** Vertical centre of every row as it lay when the drag began. */
  mids: number[];
}

function formatDue(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  const time = formatClockDate(date);
  if (isToday) return `Today, ${time}`;
  if (isTomorrow) return `Tomorrow, ${time}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

function toLocalInputValue(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ChecklistDetail({ list, onChange, onDelete, onClose, onDuplicate }: ChecklistDetailProps) {
  const [newItemText, setNewItemText] = useState('');
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [editingDueId, setEditingDueId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const dragRef = useRef<DragState | null>(null);
  const listRef = useRef(list);
  listRef.current = list;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Leaving the screen mid-drag drops the drag: no window listeners outlive it, nothing is saved.
  const detachDragRef = useRef<(() => void) | null>(null);
  useEffect(() => () => detachDragRef.current?.(), []);

  useBackHandler(() => {
    if (confirmingDelete) setConfirmingDelete(false);
    else if (confirmingClear) setConfirmingClear(false);
    else if (showMore) setShowMore(false);
    else if (editingDueId) setEditingDueId(null);
    else onClose();
  }, true);

  function update(patch: Partial<Checklist>) {
    onChange({ ...list, ...patch, updatedAt: Date.now() });
  }

  function addItem() {
    const text = newItemText.trim();
    if (!text) return;
    const item: ChecklistItem = { id: `${Date.now()}`, text, checked: false };
    update({ items: [...list.items, item] });
    setNewItemText('');
  }

  function toggleItem(id: string) {
    const items = list.items.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i));
    update({ items });
    if (items.length > 0 && items.every((i) => i.checked)) {
      hapticSuccess();
    } else {
      hapticSelect();
    }
  }

  function removeItem(id: string) {
    update({ items: list.items.filter((i) => i.id !== id) });
  }

  function setItemDue(id: string, dueAt: number | undefined) {
    update({ items: list.items.map((i) => (i.id === id ? { ...i, dueAt } : i)) });
  }

  function sortAlphabetically() {
    hapticTap();
    update({ items: [...list.items].sort((a, b) => a.text.localeCompare(b.text)) });
  }

  function clearAll() {
    hapticWarning();
    update({ items: [] });
    setConfirmingClear(false);
  }

  async function shareList() {
    hapticTap();
    const text = [
      list.name || 'Checklist',
      ...list.items.map((i) => `${i.checked ? '☑' : '☐'} ${i.text}`),
    ].join('\n');
    try {
      const how = await shareText(list.name || 'Checklist', text);
      if (how === 'copied') {
        hapticSuccess();
        setCopiedNotice(true);
        window.setTimeout(() => setCopiedNotice(false), 1800);
      }
    } catch {
      // user cancelled the share sheet, or clipboard unavailable — nothing to do
    }
  }

  function duplicateList() {
    hapticTap();
    const now = Date.now();
    const copy: Checklist = {
      ...list,
      id: `${now}`,
      name: `${list.name || 'Untitled List'} (Copy)`,
      items: list.items.map((i) => ({ ...i, id: `${now}-${i.id}` })),
      createdAt: now,
      updatedAt: now,
    };
    onDuplicate(copy);
    setShowMore(false);
  }

  /* Reordering keeps the DOM order untouched while a row is dragged: the dragged row follows the
     finger by transform and the rows it passes slide one slot aside, and the list is only
     rewritten on drop. Moving the row in the DOM mid-drag (the earlier approach) made the browser
     drop the pointer capture, which froze the drag and lost the new order. The listeners live on
     the window for the same reason: they must not depend on any one element surviving. */
  function startDrag(id: string, e: ReactPointerEvent<HTMLButtonElement>) {
    const startIndex = list.items.findIndex((i) => i.id === id);
    if (startIndex < 0 || dragRef.current) return;
    const pointerId = e.pointerId;
    const rects = list.items.map((i) => itemRefs.current[i.id]?.getBoundingClientRect() ?? null);
    const own = rects[startIndex];
    if (!own) return;
    // One slot = the dragged row plus the gap between rows.
    const next = rects[startIndex + 1];
    const prev = rects[startIndex - 1];
    const gap = next ? next.top - own.bottom : prev ? own.top - prev.bottom : 0;
    const drag: DragState = {
      id,
      startIndex,
      targetIndex: startIndex,
      offsetY: 0,
      startY: e.clientY,
      slot: own.height + gap,
      mids: rects.map((r) => (r ? r.top + r.height / 2 : 0)),
    };
    dragRef.current = drag;
    setDragState(drag);
    hapticTap();

    const onMove = (ev: PointerEvent) => {
      const current = dragRef.current;
      if (!current || ev.pointerId !== pointerId) return; // a second finger doesn't move the row
      const offsetY = ev.clientY - current.startY;
      const draggedMid = current.mids[current.startIndex] + offsetY;
      let targetIndex = 0;
      current.mids.forEach((mid, index) => {
        if (index !== current.startIndex && draggedMid > mid) targetIndex++;
      });
      if (targetIndex !== current.targetIndex) hapticSelect();
      const nextState = { ...current, offsetY, targetIndex };
      dragRef.current = nextState;
      setDragState(nextState);
    };
    const detach = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      detachDragRef.current = null;
    };
    const onEnd = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return; // only the dragging finger ends the drag
      detach();
      const current = dragRef.current;
      dragRef.current = null;
      setDragState(null);
      if (!current || current.targetIndex === current.startIndex) return;
      const items = [...listRef.current.items];
      const from = items.findIndex((i) => i.id === current.id);
      if (from < 0) return;
      const [moved] = items.splice(from, 1);
      items.splice(Math.min(current.targetIndex, items.length), 0, moved);
      // The latest list and change handler, not the ones from when the drag began: a sync that
      // landed mid-drag must not be overwritten with the older copy.
      onChangeRef.current({ ...listRef.current, items, updatedAt: Date.now() });
    };
    detachDragRef.current = detach;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  }

  /** Where a row sits while a drag is in progress: with the finger, or one slot aside. */
  function dragTransform(index: number): string | undefined {
    if (!dragState) return undefined;
    if (index === dragState.startIndex) return `translateY(${dragState.offsetY}px)`;
    if (dragState.startIndex < index && index <= dragState.targetIndex) return `translateY(${-dragState.slot}px)`;
    if (dragState.targetIndex <= index && index < dragState.startIndex) return `translateY(${dragState.slot}px)`;
    return undefined;
  }

  const doneCount = list.items.filter((i) => i.checked).length;

  return (
    <div className="screen">
      <ScreenHeader
        title={list.name || 'Checklist'}
        subtitle={list.items.length ? `${doneCount} of ${list.items.length} done` : undefined}
        onBack={onClose}
        action={
          <button
            type="button"
            className="cl-detail__icon-btn"
            onClick={() => setConfirmingDelete(true)}
            aria-label="Delete list"
          >
            <Icon name="trash" size={18} />
          </button>
        }
      />
      {copiedNotice && <p className="cl__copied">Copied to clipboard</p>}

      {confirmingDelete && (
        <div className="cl-detail__confirm">
          <p>Delete "{list.name || 'this list'}"? This can't be undone.</p>
          <div className="cl-detail__confirm-actions">
            <button type="button" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </button>
            <button type="button" className="cl-detail__confirm-delete" onClick={onDelete}>
              Delete
            </button>
          </div>
        </div>
      )}

      {confirmingClear && (
        <div className="cl-detail__confirm">
          <p>Remove all {list.items.length} items from this list?</p>
          <div className="cl-detail__confirm-actions">
            <button type="button" onClick={() => setConfirmingClear(false)}>
              Cancel
            </button>
            <button type="button" className="cl-detail__confirm-delete" onClick={clearAll}>
              Clear All
            </button>
          </div>
        </div>
      )}

      <div className="cl-detail__scroll">
        <div className="cl-detail__name-row">
          <input
            className="cl-detail__name"
            value={list.name}
            placeholder="List name"
            onChange={(e) => update({ name: e.target.value })}
          />
        </div>

        <div className="cl-detail__desc-row">
          <Icon name="note" size={16} />
          <input
            className="cl-detail__desc-input"
            value={list.description ?? ''}
            placeholder="Add description (optional)..."
            onChange={(e) => update({ description: e.target.value })}
          />
        </div>

        <div className="cl-detail__add-row">
          <input
            className="cl-detail__add-input"
            value={newItemText}
            placeholder="Add a new item..."
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addItem();
            }}
          />
          <button type="button" className="cl-detail__add-btn" onClick={addItem} aria-label="Add item">
            <Icon name="plus" size={18} />
          </button>
        </div>

        {list.items.length === 0 ? (
          <p className="cl-detail__empty">No items yet. Add your first one above.</p>
        ) : (
          <ul className="cl-detail__items">
            {list.items.map((item, index) => (
              <li
                key={item.id}
                ref={(el) => {
                  itemRefs.current[item.id] = el;
                }}
                className={`cl-detail__item${dragState?.id === item.id ? ' cl-detail__item--dragging' : ''}`}
                style={dragState ? { transform: dragTransform(index) } : undefined}
              >
                <button
                  type="button"
                  className={`cl-detail__checkbox${item.checked ? ' cl-detail__checkbox--checked' : ''}`}
                  onClick={() => toggleItem(item.id)}
                  aria-label={item.checked ? 'Mark as not done' : 'Mark as done'}
                >
                  {item.checked && <Icon name="check" size={14} strokeWidth={3} />}
                </button>
                <div className="cl-detail__item-main">
                  <span className={`cl-detail__item-text${item.checked ? ' cl-detail__item-text--checked' : ''}`}>
                    {item.text}
                  </span>
                  {editingDueId === item.id ? (
                    <input
                      type="datetime-local"
                      className="cl-detail__due-input"
                      autoFocus
                      defaultValue={item.dueAt ? toLocalInputValue(item.dueAt) : ''}
                      onBlur={(e) => {
                        const val = e.target.value;
                        setItemDue(item.id, val ? new Date(val).getTime() : undefined);
                        setEditingDueId(null);
                      }}
                    />
                  ) : item.dueAt ? (
                    <button type="button" className="cl-detail__due-badge" onClick={() => setEditingDueId(item.id)}>
                      <Icon name="clock" size={11} />
                      {formatDue(item.dueAt)}
                    </button>
                  ) : null}
                </div>
                <div className="cl-detail__item-actions">
                  {!item.dueAt && (
                    <button
                      type="button"
                      onClick={() => setEditingDueId(item.id)}
                      aria-label="Set due date"
                    >
                      <Icon name="clock" size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="cl-detail__handle"
                    onPointerDown={(e) => startDrag(item.id, e)}
                    aria-label="Drag to reorder"
                  >
                    <Icon name="sort" size={15} />
                  </button>
                  <button type="button" onClick={() => removeItem(item.id)} aria-label="Remove item">
                    <Icon name="x" size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="cl-detail__toolbar">
        <button type="button" onClick={() => setConfirmingClear(true)} disabled={list.items.length === 0}>
          <Icon name="trash" size={18} />
          Clear all
        </button>
        <button type="button" onClick={sortAlphabetically} disabled={list.items.length < 2}>
          <Icon name="sort" size={18} />
          Sort
        </button>
        <button type="button" onClick={shareList} disabled={list.items.length === 0}>
          <Icon name="upload" size={18} />
          Share
        </button>
        <button
          type="button"
          onClick={() => {
            hapticTap();
            setShowMore(true);
          }}
        >
          <Icon name="more-dots" size={18} />
          More
        </button>
      </div>

      {showMore && (
        <div className="cl-detail__sheet-overlay" onClick={() => setShowMore(false)}>
          <div className="cl-detail__sheet" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="cl-detail__sheet-item" onClick={duplicateList}>
              <Icon name="note" size={18} />
              Duplicate List
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
