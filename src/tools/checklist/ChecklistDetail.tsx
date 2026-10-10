import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
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
  items: ChecklistItem[];
  offsetY: number;
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
  const dragStartY = useRef(0);

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

  function startDrag(id: string, e: ReactPointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartY.current = e.clientY;
    setDragState({ id, items: list.items, offsetY: 0 });
    hapticTap();
  }

  function moveDrag(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragState) return;
    const offsetY = e.clientY - dragStartY.current;
    const others = dragState.items.filter((i) => i.id !== dragState.id);
    let targetIndex = 0;
    for (const it of others) {
      const rect = itemRefs.current[it.id]?.getBoundingClientRect();
      if (!rect) continue;
      const mid = rect.top + rect.height / 2;
      if (e.clientY > mid) targetIndex++;
    }
    const currentIndex = dragState.items.findIndex((i) => i.id === dragState.id);
    let items = dragState.items;
    if (targetIndex !== currentIndex) {
      items = [...dragState.items];
      const [moved] = items.splice(currentIndex, 1);
      items.splice(targetIndex, 0, moved);
      hapticSelect();
    }
    setDragState({ id: dragState.id, items, offsetY });
  }

  function endDrag() {
    if (!dragState) return;
    update({ items: dragState.items });
    setDragState(null);
  }

  const doneCount = list.items.filter((i) => i.checked).length;
  const displayItems = dragState?.items ?? list.items;

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
      {copiedNotice && <p className="cl__copied">Copied to clipboard</p>}
          </button>
        }
      />

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
            {displayItems.map((item) => (
              <li
                key={item.id}
                ref={(el) => {
                  itemRefs.current[item.id] = el;
                }}
                className={`cl-detail__item${dragState?.id === item.id ? ' cl-detail__item--dragging' : ''}`}
                style={dragState?.id === item.id ? { transform: `translateY(${dragState.offsetY}px)` } : undefined}
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
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
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
