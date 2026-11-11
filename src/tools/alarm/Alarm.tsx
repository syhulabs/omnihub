import { useEffect, useState } from 'react';
import { isIOS } from '../../platform';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon } from '../../components/Icon';
import { SwipeToDelete } from '../../components/SwipeToDelete';
import { useRouter } from '../../app/Router';
import { useBackHandler } from '../../app/useBackHandler';
import { useAuth } from '../../cloud/AuthContext';
import { startAlarmSync, stopAlarmSync, scheduleAlarmSynced, cancelAlarmSynced } from '../../cloud/alarmSync';
import { AlarmPlugin, type AlarmRecord } from '../../alarm/plugin';
import { formatTime, repeatLabelFor } from '../../alarm/types';
import { hapticSelect, hapticTap, hapticWarning } from '../../haptics';
import { AlarmEditor, type AlarmEditorInitial } from './AlarmEditor';
import { CrashLogView } from './CrashLogView';
import { RingtonePicker } from './RingtonePicker';
import './Alarm.css';

const SUGGESTIONS: {
  icon: 'sun' | 'wallet' | 'moon' | 'star';
  title: string;
  subtitle: string;
  color: string;
  initial: AlarmEditorInitial;
}[] = [
  {
    icon: 'sun',
    title: 'Wake Up',
    subtitle: 'Start your day',
    color: 'var(--yellow)',
    initial: { hour: 7, minute: 0, category: 'morning', repeatMode: 'daily' },
  },
  {
    icon: 'wallet',
    title: 'Stay Productive',
    subtitle: 'Manage your time',
    color: 'var(--blue)',
    initial: { hour: 13, minute: 0, category: 'afternoon', repeatMode: 'weekdays', label: 'Focus time' },
  },
  {
    icon: 'moon',
    title: 'Sleep Better',
    subtitle: 'Keep a routine',
    color: 'var(--purple)',
    initial: { hour: 22, minute: 0, category: 'night', repeatMode: 'daily', label: 'Wind down' },
  },
  {
    icon: 'star',
    title: 'Never Miss',
    subtitle: 'What matters',
    color: 'var(--orange)',
    initial: { hour: 9, minute: 0, repeatMode: 'daily', label: 'Reminder' },
  },
];

function AlarmHeroIllustration() {
  return (
    <svg className="alarm__hero-svg" viewBox="0 0 160 160" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="alarmGlow" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="alarmBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <circle cx="80" cy="80" r="78" fill="url(#alarmGlow)" />
      <path d="M40 30 L26 44 M120 30 L134 44" stroke="url(#alarmBody)" strokeWidth="7" strokeLinecap="round" />
      <path d="M22 60 L10 56 M138 60 L150 56 M22 100 L10 104 M138 100 L150 104" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" opacity="0.6" />
      <circle cx="80" cy="88" r="52" fill="var(--bg-elevated)" stroke="url(#alarmBody)" strokeWidth="6" />
      <circle cx="80" cy="88" r="52" fill="none" stroke="var(--accent)" strokeWidth="1" opacity="0.4" />
      <rect x="70" y="22" width="20" height="12" rx="4" fill="url(#alarmBody)" />
      <path d="M80 60 L80 90 L100 100" stroke="var(--text-primary)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="80" cy="88" r="4.5" fill="var(--text-primary)" />
    </svg>
  );
}

export function Alarm() {
  const { back } = useRouter();
  const { user } = useAuth();
  const [alarms, setAlarms] = useState<AlarmRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState<AlarmEditorInitial | true | false>(false);
  const [showCrashLog, setShowCrashLog] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkSound, setShowBulkSound] = useState(false);

  async function refresh() {
    const { alarms: list } = await AlarmPlugin.list();
    setAlarms([...list].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)));
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!user) return;
    startAlarmSync(user.uid, refresh);
    return () => {
      stopAlarmSync();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  function exitSelecting() {
    setSelecting(false);
    setSelectedIds(new Set());
  }

  useBackHandler(exitSelecting, selecting);
  useBackHandler(() => setShowMenu(false), showMenu);

  function toggleSelected(id: string) {
    hapticSelect();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggleEnabled(alarm: AlarmRecord) {
    hapticSelect();
    const turningOn = !alarm.enabled;
    if (turningOn) {
      try {
        // Same rule as saving in the editor: an alarm that can't post its notification can't
        // ring properly, so the switch asks first and stays off if the answer is no.
        let { granted } = await AlarmPlugin.checkNotificationPermission();
        if (!granted) granted = (await AlarmPlugin.requestNotificationPermission()).granted;
        if (!granted) {
          hapticWarning();
          setEditingId(alarm.id); // the editor explains what is missing when Save is tapped
          return;
        }
      } catch {
        // web fallback / unsupported platform — proceed anyway
      }
      try {
        const check = await AlarmPlugin.checkExactAlarmPermission();
        if (!check.granted) {
          hapticWarning();
          await AlarmPlugin.requestExactAlarmPermission();
          return;
        }
      } catch {
        // web fallback / unsupported platform — proceed anyway
      }
    }
    await scheduleAlarmSynced({ ...alarm, enabled: turningOn });
    refresh();
  }

  async function handleDelete(id: string) {
    hapticWarning();
    await cancelAlarmSynced(id);
    setCreatingNew(false);
    setEditingId(null);
    refresh();
  }

  if (creatingNew || editingId) {
    return (
      <AlarmEditor
        alarmId={editingId}
        initial={typeof creatingNew === 'object' ? creatingNew : undefined}
        onClose={() => {
          setCreatingNew(false);
          setEditingId(null);
          refresh();
        }}
        onDelete={editingId ? () => handleDelete(editingId) : undefined}
      />
    );
  }

  if (showCrashLog) {
    return <CrashLogView onClose={() => setShowCrashLog(false)} />;
  }

  if (showBulkSound) {
    return (
      <RingtonePicker
        mode="bulk"
        alarmIds={[...selectedIds]}
        onSelect={() => {
          setShowBulkSound(false);
          exitSelecting();
          refresh();
        }}
        onClose={() => setShowBulkSound(false)}
      />
    );
  }

  return (
    <div className="screen">
      <ScreenHeader
        title="Alarm"
        subtitle={selecting ? `${selectedIds.size} selected` : 'Wake up to a better you'}
        onBack={selecting ? exitSelecting : back}
        action={
          selecting ? (
            <>
              {selectedIds.size > 0 && !isIOS && (
                <button type="button" className="alarm__header-btn" onClick={() => setShowBulkSound(true)}>
                  Change Sound
                </button>
              )}
              <button type="button" className="alarm__header-btn" onClick={exitSelecting}>
                Cancel
              </button>
            </>
          ) : isIOS ? undefined : (
            <button
              type="button"
              className="alarm__debug-btn"
              onClick={() => {
                hapticTap();
                setShowMenu(true);
              }}
              aria-label="More options"
            >
              <Icon name="more-dots" size={20} />
            </button>
          )
        }
      />

      {showMenu && (
        <div className="alarm__menu-overlay" onClick={() => setShowMenu(false)}>
          <div className="alarm__menu-sheet" onClick={(e) => e.stopPropagation()}>
            {alarms.length > 0 && (
              <button
                type="button"
                className="alarm__menu-item"
                onClick={() => {
                  setShowMenu(false);
                  setSelecting(true);
                }}
              >
                <Icon name="checklist" size={18} />
                Select Alarms
              </button>
            )}
            <button
              type="button"
              className="alarm__menu-item"
              onClick={() => {
                setShowMenu(false);
                setShowCrashLog(true);
              }}
            >
              <Icon name="info" size={18} />
              View Crash Log
            </button>
            <button type="button" className="alarm__menu-cancel" onClick={() => setShowMenu(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="alarm__content">
        {loading ? null : alarms.length === 0 ? (
          <div className="alarm__hero">
            <AlarmHeroIllustration />
            <h2 className="alarm__hero-title">No alarms yet</h2>
            <p className="alarm__hero-subtitle">Tap + to create your first alarm and never miss a moment.</p>
            <div className="alarm__suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.title}
                  type="button"
                  className="alarm__suggestion"
                  style={{ '--sugg-color': s.color } as React.CSSProperties}
                  onClick={() => {
                    hapticTap();
                    setCreatingNew(s.initial);
                  }}
                >
                  <span className="alarm__suggestion-icon">
                    <Icon name={s.icon} size={20} />
                  </span>
                  <strong>{s.title}</strong>
                  <span>{s.subtitle}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="alarm__list">
            {alarms.map((a) => {
              const card = (
                <div className={`alarm__card${a.enabled ? '' : ' alarm__card--disabled'}`}>
                  <button
                    type="button"
                    className="alarm__card-main"
                    onClick={() => (selecting ? toggleSelected(a.id) : setEditingId(a.id))}
                  >
                    <span className="alarm__card-time">{formatTime(a.hour, a.minute)}</span>
                    <span className="alarm__card-meta">
                      {a.label ? `${a.label} · ` : ''}
                      {repeatLabelFor(a.repeatMode, a.hour, a.minute)}
                      {a.backupEnabled ? ' · Backup' : ''}
                    </span>
                  </button>
                  {selecting ? (
                    <button
                      type="button"
                      className={`alarm__checkbox${selectedIds.has(a.id) ? ' alarm__checkbox--checked' : ''}`}
                      onClick={() => toggleSelected(a.id)}
                      aria-label={selectedIds.has(a.id) ? 'Deselect alarm' : 'Select alarm'}
                    >
                      {selectedIds.has(a.id) && <Icon name="check" size={14} strokeWidth={3} />}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`alarm__switch${a.enabled ? ' alarm__switch--on' : ''}`}
                      onClick={() => toggleEnabled(a)}
                      role="switch"
                      aria-checked={a.enabled}
                      aria-label={a.enabled ? 'Disable alarm' : 'Enable alarm'}
                    >
                      <span className="alarm__switch-knob" />
                    </button>
                  )}
                </div>
              );

              return (
                <li key={a.id}>
                  {selecting ? (
                    card
                  ) : (
                    <SwipeToDelete
                      id={a.id}
                      openId={openSwipeId}
                      onOpenChange={setOpenSwipeId}
                      onDelete={() => handleDelete(a.id)}
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

      {!selecting && (
        <button type="button" className="alarm__fab" onClick={() => setCreatingNew(true)} aria-label="New alarm">
          <Icon name="plus" size={24} />
        </button>
      )}
    </div>
  );
}
