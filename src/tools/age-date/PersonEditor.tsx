import { useRef, useState } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon } from '../../components/Icon';
import { hapticSelect, hapticTap } from '../../haptics';
import { ageBreakdown, nextBirthday, parseISODate, toISODate } from './dateMath';
import { CalendarPicker } from './CalendarPicker';
import { AVATAR_PRESETS, RELATIONSHIPS, type AvatarPreset, type Person, type Relationship } from './types';

interface PersonEditorProps {
  person?: Person;
  isMe: boolean;
  onSave: (person: Person) => void;
  onDelete?: () => void;
  onClose: () => void;
}

const AVATAR_ICON: Record<AvatarPreset, 'user' | 'heart' | 'star' | 'paw'> = {
  blue: 'user',
  pink: 'heart',
  orange: 'star',
  green: 'paw',
};

function formatShort(iso: string): string {
  const d = parseISODate(iso);
  if (!d) return 'Select date of birth';
  return `${String(d.getDate()).padStart(2, '0')} ${
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]
  } ${d.getFullYear()}`;
}

export function PersonEditor({ person, isMe, onSave, onDelete, onClose }: PersonEditorProps) {
  const today = new Date();
  const [name, setName] = useState(person?.name ?? (isMe ? 'Me' : ''));
  const [birthISO, setBirthISO] = useState(person?.birthISO ?? '');
  const [relationship, setRelationship] = useState<Relationship | undefined>(person?.relationship);
  const [avatar, setAvatar] = useState<AvatarPreset>(person?.avatar ?? 'blue');
  const [photo, setPhoto] = useState<string | undefined>(person?.photo);
  const [reminderEnabled, setReminderEnabled] = useState(person?.reminderEnabled ?? true);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showRelationship, setShowRelationship] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const birth = parseISODate(birthISO);
  const isFuture = birth && birth.getTime() > today.getTime();
  const valid = Boolean(name.trim()) && Boolean(birth) && !isFuture;

  const breakdown = birth && !isFuture ? ageBreakdown(birth, today) : null;
  const next = birth && !isFuture ? nextBirthday(birth, today) : null;

  /** Stores the photo as a small centre-cropped JPEG (about 20 KB). The original was kept as a
   *  full-size data URL in localStorage: one 4 MB camera photo filled the WebView's entire quota,
   *  failed to save, and left every other tool unable to save either. */
  function pickPhoto(file: File) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const size = 256;
      const scale = Math.max(size / img.width, size / img.height);
      const width = img.width * scale;
      const height = img.height * scale;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, (size - width) / 2, (size - height) / 2, width, height);
        setPhoto(canvas.toDataURL('image/jpeg', 0.82));
      }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  function save() {
    if (!valid || !birth) return;
    hapticTap();
    onSave({
      id: person?.id ?? `${Date.now()}`,
      name: name.trim(),
      birthISO,
      relationship,
      avatar,
      photo,
      reminderEnabled,
      favorited: person?.favorited,
      createdAt: person?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    });
  }

  return (
    <div className="screen">
      <ScreenHeader
        title={isMe ? 'My Details' : person ? 'Edit Person' : 'Add Person'}
        subtitle={isMe ? 'Set your birth date to calculate your age' : 'Save their birth date to calculate age'}
        onBack={onClose}
        action={
          <button type="button" className="pe__save-check" onClick={save} disabled={!valid} aria-label="Save">
            <Icon name="check" size={18} />
          </button>
        }
      />

      <div className="pe__body">
        <div className="pe__photo-row">
          <button
            type="button"
            className="pe__photo"
            style={{ '--avatar-color': `var(--${avatar})` } as React.CSSProperties}
            onClick={() => fileInputRef.current?.click()}
          >
            {photo ? <img src={photo} alt="" /> : <Icon name={AVATAR_ICON[avatar]} size={30} />}
            <span className="pe__photo-badge">
              <Icon name="camera" size={13} />
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) pickPhoto(file);
              e.target.value = '';
            }}
          />
          <div>
            <span className="pe__photo-label">Profile Photo</span>
            <div className="pe__avatar-presets">
              {AVATAR_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`pe__avatar-chip${avatar === preset && !photo ? ' pe__avatar-chip--active' : ''}`}
                  style={{ '--avatar-color': `var(--${preset})` } as React.CSSProperties}
                  onClick={() => {
                    hapticSelect();
                    setAvatar(preset);
                    setPhoto(undefined);
                  }}
                >
                  <Icon name={AVATAR_ICON[preset]} size={16} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="pe__field">
          <label className="pe__label">Name *</label>
          <div className="pe__input-row">
            <Icon name="user" size={16} />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter name (e.g. Mom, Alex)" />
          </div>
        </div>

        <div className="pe__field">
          <label className="pe__label">Date of Birth *</label>
          <button type="button" className="pe__input-row pe__input-row--button" onClick={() => setShowCalendar((v) => !v)}>
            <Icon name="calendar" size={16} />
            <span>{formatShort(birthISO)}</span>
            <Icon name="chevron-down" size={16} className="pe__chevron" />
          </button>
          {showCalendar && (
            <CalendarPicker
              selectedISO={birthISO || toISODate(today)}
              onSelect={(iso) => {
                setBirthISO(iso);
                setShowCalendar(false);
              }}
              accentColor="var(--blue)"
            />
          )}
        </div>

        {!isMe && (
          <div className="pe__field">
            <label className="pe__label">Relationship (Optional)</label>
            <button
              type="button"
              className="pe__input-row pe__input-row--button"
              onClick={() => setShowRelationship((v) => !v)}
            >
              <Icon name="heart" size={16} />
              <span>{relationship ?? 'Select relationship'}</span>
              <Icon name="chevron-down" size={16} className="pe__chevron" />
            </button>
            {showRelationship && (
              <div className="pe__relationship-grid">
                {RELATIONSHIPS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`pe__relationship-chip${relationship === r ? ' pe__relationship-chip--active' : ''}`}
                    onClick={() => {
                      hapticSelect();
                      setRelationship(r);
                      setShowRelationship(false);
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <label className="pe__toggle-row">
          <span className="pe__toggle-icon">
            <Icon name="bell" size={16} />
          </span>
          <div>
            <strong>Birthday Reminder</strong>
            <span>Highlight this birthday here when it's within 7 days</span>
          </div>
          <button
            type="button"
            className={`pe__switch${reminderEnabled ? ' pe__switch--on' : ''}`}
            onClick={() => {
              hapticSelect();
              setReminderEnabled((v) => !v);
            }}
            aria-label="Toggle birthday reminder"
          >
            <span className="pe__switch-knob" />
          </button>
        </label>

        {isFuture && <p className="pe__error">Date of birth can't be in the future.</p>}

        <div className="pe__preview">
          <div className="pe__preview-header">
            <span>Preview</span>
            {breakdown && (
              <span className="pe__preview-live">
                <i /> Live calculation
              </span>
            )}
          </div>

          <div className="pe__preview-card" style={{ '--avatar-color': `var(--${avatar})` } as React.CSSProperties}>
            <span className="pe__preview-avatar">
              {photo ? <img src={photo} alt="" /> : <Icon name={AVATAR_ICON[avatar]} size={22} />}
            </span>
            <div>
              <strong>{name.trim() || 'Name'}</strong>
              <span>{birthISO ? `Born ${formatShort(birthISO)}` : 'Born —'}</span>
            </div>
          </div>

          {breakdown && next ? (
            <>
              <div className="pe__preview-stats">
                <div className="pe__preview-stat">
                  <strong>{breakdown.years}</strong>
                  <span>Years</span>
                </div>
                <div className="pe__preview-stat">
                  <strong>{breakdown.months}</strong>
                  <span>Months</span>
                </div>
                <div className="pe__preview-stat">
                  <strong>{breakdown.days}</strong>
                  <span>Days</span>
                </div>
                <div className="pe__preview-next">
                  <span>Next Birthday</span>
                  <strong>{next.daysUntil === 0 ? 'Today!' : next.daysUntil}</strong>
                  {next.daysUntil !== 0 && <em>days left</em>}
                </div>
              </div>

              <div className="pe__more-details">
                <strong>More Details</strong>
                <div className="pe__detail-row">
                  <Icon name="calendar" size={14} />
                  <span>Total days lived</span>
                  <strong>{breakdown.totalDays.toLocaleString()} days</strong>
                </div>
                <div className="pe__detail-row">
                  <Icon name="cake" size={14} />
                  <span>Next birthday in</span>
                  <strong>
                    {next.daysUntil} days ({formatShort(toISODate(next.date))})
                  </strong>
                </div>
                <div className="pe__detail-row">
                  <Icon name="shield" size={14} />
                  <span>Age in months</span>
                  <strong>{(breakdown.years * 12 + breakdown.months).toLocaleString()} months</strong>
                </div>
                <div className="pe__detail-row">
                  <Icon name="clock" size={14} />
                  <span>Age in weeks</span>
                  <strong>{Math.floor(breakdown.totalDays / 7).toLocaleString()} weeks</strong>
                </div>
                <div className="pe__detail-row">
                  <Icon name="history" size={14} />
                  <span>Age in hours (approx)</span>
                  <strong>{(breakdown.totalDays * 24).toLocaleString()} hours</strong>
                </div>
              </div>
            </>
          ) : (
            <p className="pe__preview-empty">Fill in a name and date of birth to see the live preview.</p>
          )}
        </div>

        <button type="button" className="pe__save" disabled={!valid} onClick={save}>
          <Icon name="download" size={18} />
          Save {isMe ? 'Details' : 'Person'}
        </button>

        {onDelete && !isMe && (
          <button type="button" className="pe__delete" onClick={onDelete}>
            <Icon name="trash" size={16} />
            Remove Person
          </button>
        )}
      </div>
    </div>
  );
}
