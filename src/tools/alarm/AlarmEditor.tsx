import { useEffect, useRef, useState } from 'react';
import { DeviceStatsPlugin } from '../../device-stats/plugin';
import { isIOS } from '../../platform';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon, type IconName } from '../../components/Icon';
import {
  AlarmPlugin,
  type AlarmRecord,
  DEFAULT_BACKUP_OFFSETS_MIN,
  MAX_BACKUP_OFFSETS,
  MIN_BACKUP_OFFSET_MIN,
  MAX_BACKUP_OFFSET_MIN,
} from '../../alarm/plugin';
import { scheduleAlarmSynced } from '../../cloud/alarmSync';
import { formatTime, type RepeatMode, type TimeCategory, REPEAT_LABELS, repeatLabelFor } from '../../alarm/types';
import { loadPresets, addPreset, removePreset } from '../../alarm/presets';
import { loadCategoryDefaults } from '../../alarm/ringtones';
import { hapticSelect, hapticSuccess, hapticWarning } from '../../haptics';
import { useBackHandler } from '../../app/useBackHandler';
import { RingtonePicker } from './RingtonePicker';
import { WheelTimePicker } from './WheelTimePicker';
import './Alarm.css';

const CATEGORIES: { id: TimeCategory; label: string; icon: IconName; color: string }[] = [
  { id: 'morning', label: 'Morning', icon: 'sunrise', color: 'var(--blue)' },
  { id: 'afternoon', label: 'Afternoon', icon: 'sun', color: 'var(--yellow)' },
  { id: 'evening', label: 'Evening', icon: 'sunset', color: 'var(--orange)' },
  { id: 'night', label: 'Night', icon: 'moon', color: 'var(--purple)' },
];

const REPEAT_MODES: RepeatMode[] = ['today', 'daily', 'weekend', 'weekdays'];

export interface AlarmEditorInitial {
  hour: number;
  minute: number;
  category?: TimeCategory;
  repeatMode?: RepeatMode;
  label?: string;
}

interface AlarmEditorProps {
  alarmId: string | null;
  initial?: AlarmEditorInitial;
  onClose: () => void;
  onDelete?: () => void;
}

export function AlarmEditor({ alarmId, initial, onClose, onDelete }: AlarmEditorProps) {
  const [loaded, setLoaded] = useState(alarmId === null);
  const [hour, setHour] = useState(initial?.hour ?? 7);
  const [minute, setMinute] = useState(initial?.minute ?? 0);
  const [label, setLabel] = useState(initial?.label ?? '');
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(initial?.repeatMode ?? 'today');
  const [soundUri, setSoundUri] = useState<string | null>(null);
  const [soundName, setSoundName] = useState<string | null>(null);
  const [backupEnabled, setBackupEnabled] = useState(false);
  const [backupOffsets, setBackupOffsets] = useState<number[]>(DEFAULT_BACKUP_OFFSETS_MIN);
  const [backupPersistOnSnooze, setBackupPersistOnSnooze] = useState(false);
  const [backupPersistOnStop, setBackupPersistOnStop] = useState(false);
  const [openCategory, setOpenCategory] = useState<TimeCategory | null>(initial?.category ?? null);
  const [editingPresets, setEditingPresets] = useState(false);
  const [presets, setPresets] = useState(loadPresets());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [needsExactAlarmPermission, setNeedsExactAlarmPermission] = useState(false);
  const [needsNotificationPermission, setNeedsNotificationPermission] = useState(false);
  const savingRef = useRef(false);
  const [showRingtonePicker, setShowRingtonePicker] = useState(false);

  useBackHandler(() => {
    if (confirmingDelete) {
      setConfirmingDelete(false);
    } else {
      onClose();
    }
  }, !showRingtonePicker);

  useEffect(() => {
    if (alarmId === null) return;
    AlarmPlugin.list().then(({ alarms }) => {
      const existing = alarms.find((a: AlarmRecord) => a.id === alarmId);
      if (existing) {
        setHour(existing.hour);
        setMinute(existing.minute);
        setLabel(existing.label);
        setRepeatMode(existing.repeatMode);
        setSoundUri(existing.soundUri);
        setSoundName(existing.soundName);
        setBackupEnabled(existing.backupEnabled);
        setBackupOffsets(existing.backupOffsetsMin?.length ? existing.backupOffsetsMin : DEFAULT_BACKUP_OFFSETS_MIN);
        setBackupPersistOnSnooze(existing.backupPersistOnSnooze);
        setBackupPersistOnStop(existing.backupPersistOnStop);
      }
      setLoaded(true);
    });
  }, [alarmId]);

  function pickPreset(category: TimeCategory, h: number, m: number) {
    hapticSelect();
    setHour(h);
    setMinute(m);
    setOpenCategory(category);

    // Apply the category's default sound, but only if the user hasn't already picked one
    // explicitly - a category tap shouldn't clobber a sound they chose themselves.
    if (soundUri === null) {
      const categoryDefault = loadCategoryDefaults()[category];
      if (categoryDefault) {
        setSoundUri(categoryDefault.uri);
        setSoundName(categoryDefault.name);
      }
    }
  }

  function handleAddCurrentAsPreset(category: TimeCategory) {
    const next = addPreset(category, { hour, minute });
    setPresets(next);
    hapticSuccess();
  }

  function handleRemovePreset(category: TimeCategory, h: number, m: number) {
    const next = removePreset(category, { hour: h, minute: m });
    setPresets(next);
    hapticWarning();
  }

  function handleBackupOffsetChange(index: number, value: string) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return;
    const clamped = Math.max(MIN_BACKUP_OFFSET_MIN, Math.min(MAX_BACKUP_OFFSET_MIN, n));
    setBackupOffsets((prev) => prev.map((v, i) => (i === index ? clamped : v)));
  }

  function handleRemoveBackupOffset(index: number) {
    hapticWarning();
    setBackupOffsets((prev) => prev.filter((_, i) => i !== index));
  }

  function handleAddBackupOffset(incrementMin: number) {
    hapticSelect();
    setBackupOffsets((prev) => {
      const last = prev[prev.length - 1] ?? 0;
      const next = Math.min(MAX_BACKUP_OFFSET_MIN, last + incrementMin);
      return prev.includes(next) ? prev : [...prev, next];
    });
  }

  async function handleSave() {
    // One save at a time: a double tap on a new alarm (no id yet) created two alarms.
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      await save();
    } finally {
      savingRef.current = false;
    }
  }

  async function save() {
    try {
      let { granted } = await AlarmPlugin.checkNotificationPermission();
      if (!granted) granted = (await AlarmPlugin.requestNotificationPermission()).granted;
      if (!granted) {
        // Without notifications the alarm has no ringing screen and no Stop button on Android 13+
        // (it would sound for ten minutes with nothing to tap), and on iOS it never fires at all.
        hapticWarning();
        setNeedsNotificationPermission(true);
        return;
      }
      setNeedsNotificationPermission(false);
    } catch {
      // web fallback / unsupported platform — proceed anyway
    }

    try {
      const check = await AlarmPlugin.checkExactAlarmPermission();
      if (!check.granted) {
        hapticWarning();
        setNeedsExactAlarmPermission(true);
        await AlarmPlugin.requestExactAlarmPermission();
        return;
      }
    } catch {
      // web fallback / unsupported platform — proceed anyway
    }

    const { armed } = await scheduleAlarmSynced({
      id: alarmId ?? undefined,
      hour,
      minute,
      label: label.trim(),
      repeatMode,
      enabled: true,
      soundUri,
      soundName,
      backupEnabled,
      backupOffsetsMin: [...backupOffsets].sort((a, b) => a - b),
      backupPersistOnSnooze,
      backupPersistOnStop,
    });

    if (!armed) {
      hapticWarning();
      setNeedsExactAlarmPermission(true);
      return;
    }

    setNeedsExactAlarmPermission(false);
    hapticSuccess();
    onClose();
  }

  if (!loaded) {
    return <div className="screen" />;
  }

  if (showRingtonePicker) {
    return (
      <RingtonePicker
        excludeAlarmId={alarmId}
        onClose={() => setShowRingtonePicker(false)}
        onSelect={(sound) => {
          setSoundUri(sound.uri);
          setSoundName(sound.name);
          setShowRingtonePicker(false);
        }}
      />
    );
  }

  return (
    <div className="screen">
      <ScreenHeader
        title={alarmId ? 'Edit Alarm' : 'New Alarm'}
        subtitle={alarmId ? 'Update the details below' : 'Set a time, make it yours'}
        onBack={onClose}
        action={
          onDelete && (
            <button
              type="button"
              className="alarm-editor__icon-btn"
              onClick={() => setConfirmingDelete(true)}
              aria-label="Delete alarm"
            >
              <Icon name="trash" size={18} />
            </button>
          )
        }
      />

      {needsNotificationPermission && (
        <div className="alarm-editor__confirm">
          <p>
            Alarms need notifications to ring and to show their Stop button. Allow notifications for Omni Hub in
            Settings, then come back and tap Save again.
          </p>
          <div className="alarm-editor__confirm-actions">
            <button type="button" onClick={() => DeviceStatsPlugin.openAppSettings().catch(() => {})}>
              Open Settings
            </button>
          </div>
        </div>
      )}

      {needsExactAlarmPermission && (
        <div className="alarm-editor__confirm">
          <p>
            Omni Hub needs the "Alarms &amp; reminders" permission to schedule alarms. Turn it on
            in the Settings screen that just opened, then come back and tap Save again.
          </p>
          <div className="alarm-editor__confirm-actions">
            <button type="button" onClick={() => AlarmPlugin.requestExactAlarmPermission()}>
              Open Settings
            </button>
          </div>
        </div>
      )}

      {confirmingDelete && (
        <div className="alarm-editor__confirm">
          <p>Delete this alarm? This can't be undone.</p>
          <div className="alarm-editor__confirm-actions">
            <button type="button" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="alarm-editor__confirm-delete"
              onClick={() => onDelete && onDelete()}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      <div className="alarm-editor__body">
        <WheelTimePicker
          hour={hour}
          minute={minute}
          onChange={(h, m) => {
            setHour(h);
            setMinute(m);
          }}
        />

        <div className="alarm-editor__section-header">
          <h2>Quick Pick</h2>
          <button
            type="button"
            className="alarm-editor__edit-presets"
            onClick={() => setEditingPresets((v) => !v)}
          >
            {editingPresets ? 'Done' : 'Edit'}
          </button>
        </div>

        <div className="alarm-editor__categories">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`alarm-editor__category${openCategory === cat.id ? ' alarm-editor__category--open' : ''}`}
              style={{ '--cat-color': cat.color } as React.CSSProperties}
              onClick={() => setOpenCategory(openCategory === cat.id ? null : cat.id)}
            >
              <Icon name={cat.icon} size={22} />
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {openCategory && (
          <div
            className="alarm-editor__presets"
            style={{ '--cat-color': CATEGORIES.find((c) => c.id === openCategory)?.color } as React.CSSProperties}
          >
            {presets[openCategory].map((p) => (
              <div key={`${p.hour}:${p.minute}`} className="alarm-editor__preset-chip-wrap">
                <button
                  type="button"
                  className={`alarm-editor__preset-chip${hour === p.hour && minute === p.minute ? ' alarm-editor__preset-chip--active' : ''}`}
                  onClick={() => pickPreset(openCategory, p.hour, p.minute)}
                >
                  {formatTime(p.hour, p.minute)}
                </button>
                {editingPresets && (
                  <button
                    type="button"
                    className="alarm-editor__preset-remove"
                    onClick={() => handleRemovePreset(openCategory, p.hour, p.minute)}
                    aria-label={`Remove ${formatTime(p.hour, p.minute)} preset`}
                  >
                    <Icon name="x" size={11} strokeWidth={3} />
                  </button>
                )}
              </div>
            ))}
            {editingPresets && (
              <button
                type="button"
                className="alarm-editor__preset-chip alarm-editor__preset-chip--add"
                onClick={() => handleAddCurrentAsPreset(openCategory)}
              >
                <Icon name="plus" size={13} /> Add {formatTime(hour, minute)}
              </button>
            )}
          </div>
        )}

        <h2 className="alarm-editor__section-title">Repeat</h2>
        <div className="alarm-editor__repeat-row">
          {REPEAT_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={`alarm-editor__repeat-chip${repeatMode === mode ? ' alarm-editor__repeat-chip--active' : ''}`}
              onClick={() => {
                hapticSelect();
                setRepeatMode(mode);
              }}
            >
              {mode === 'today' ? repeatLabelFor('today', hour, minute) : REPEAT_LABELS[mode]}
            </button>
          ))}
        </div>

        <h2 className="alarm-editor__section-title">Label</h2>
        <input
          type="text"
          className="alarm-editor__label-input"
          placeholder="Alarm"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />

        {/* iOS alarms are notifications that can only play the device ringtone, so there is no sound to pick. */}
        {!isIOS && (
          <>
            <h2 className="alarm-editor__section-title">Sound</h2>
            <button type="button" className="alarm-editor__sound-row" onClick={() => setShowRingtonePicker(true)}>
              <span>{soundName || 'Default Alarm'}</span>
              <Icon name="chevron-right" size={18} />
            </button>
          </>
        )}

        <h2 className="alarm-editor__section-title">Backup Alarms</h2>
        <div className="alarm-editor__backup-row">
          <div className="alarm-editor__backup-text">
            <span>Ring again if ignored</span>
            <p>If you don't dismiss or snooze, we'll ring again after each of these.</p>
          </div>
          <button
            type="button"
            className={`alarm__switch${backupEnabled ? ' alarm__switch--on' : ''}`}
            onClick={() => {
              hapticSelect();
              setBackupEnabled((v) => !v);
            }}
            role="switch"
            aria-checked={backupEnabled}
            aria-label="Toggle backup alarms"
          >
            <span className="alarm__switch-knob" />
          </button>
        </div>

        {backupEnabled && (
          <div className="alarm-editor__backup-offsets">
            {backupOffsets.map((offset, index) => (
              <div key={index} className="alarm-editor__backup-offset-chip">
                <input
                  type="number"
                  inputMode="numeric"
                  min={MIN_BACKUP_OFFSET_MIN}
                  max={MAX_BACKUP_OFFSET_MIN}
                  value={offset}
                  onChange={(e) => handleBackupOffsetChange(index, e.target.value)}
                />
                <span>min</span>
                {backupOffsets.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveBackupOffset(index)}
                    aria-label={`Remove ${offset} minute backup`}
                  >
                    <Icon name="x" size={11} strokeWidth={3} />
                  </button>
                )}
              </div>
            ))}
            {backupOffsets.length < MAX_BACKUP_OFFSETS && (
              <>
                <button
                  type="button"
                  className="alarm-editor__backup-offset-add"
                  onClick={() => handleAddBackupOffset(3)}
                >
                  <Icon name="plus" size={13} /> 3 min
                </button>
                <button
                  type="button"
                  className="alarm-editor__backup-offset-add"
                  onClick={() => handleAddBackupOffset(5)}
                >
                  <Icon name="plus" size={13} /> 5 min
                </button>
                <button
                  type="button"
                  className="alarm-editor__backup-offset-add"
                  onClick={() => handleAddBackupOffset(10)}
                >
                  <Icon name="plus" size={13} /> 10 min
                </button>
              </>
            )}
          </div>
        )}

        {backupEnabled && (
          <>
            <div className="alarm-editor__backup-row alarm-editor__backup-row--persist">
              <div className="alarm-editor__backup-text">
                <span>Keep backups on Snooze</span>
                <p>Backups keep ringing on schedule even after you snooze this alarm.</p>
              </div>
              <button
                type="button"
                className={`alarm__switch${backupPersistOnSnooze ? ' alarm__switch--on' : ''}`}
                onClick={() => {
                  hapticSelect();
                  setBackupPersistOnSnooze((v) => !v);
                }}
                role="switch"
                aria-checked={backupPersistOnSnooze}
                aria-label="Toggle keeping backups after snooze"
              >
                <span className="alarm__switch-knob" />
              </button>
            </div>

            <div className="alarm-editor__backup-row alarm-editor__backup-row--persist">
              <div className="alarm-editor__backup-text">
                <span>Keep backups on Stop</span>
                <p>Backups keep ringing on schedule even after you stop/dismiss this alarm.</p>
              </div>
              <button
                type="button"
                className={`alarm__switch${backupPersistOnStop ? ' alarm__switch--on' : ''}`}
                onClick={() => {
                  hapticSelect();
                  setBackupPersistOnStop((v) => !v);
                }}
                role="switch"
                aria-checked={backupPersistOnStop}
                aria-label="Toggle keeping backups after stop"
              >
                <span className="alarm__switch-knob" />
              </button>
            </div>
          </>
        )}

        <button type="button" className="alarm-editor__save" onClick={handleSave}>
          Save Alarm
        </button>
      </div>
    </div>
  );
}
