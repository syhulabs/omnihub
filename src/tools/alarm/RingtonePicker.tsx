import { useEffect, useMemo, useState } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon } from '../../components/Icon';
import { useBackHandler } from '../../app/useBackHandler';
import { AlarmPlugin, type AlarmRecord, type RingtoneEntry } from '../../alarm/plugin';
import { scheduleAlarmSynced } from '../../cloud/alarmSync';
import { formatTime, repeatLabelFor, type TimeCategory } from '../../alarm/types';
import {
  loadFavoriteUris,
  toggleFavorite,
  loadCustomSounds,
  addCustomSound,
  setCategoryDefault,
} from '../../alarm/ringtones';
import { hapticSelect, hapticSuccess } from '../../haptics';
import { CategoryDefaultsScreen } from './CategoryDefaultsScreen';
import './RingtonePicker.css';

interface RingtonePickerProps {
  mode?: 'select' | 'setDefault' | 'bulk';
  category?: TimeCategory;
  excludeAlarmId?: string | null;
  /** Required when mode is 'bulk' — the alarms to apply the chosen sound to directly. */
  alarmIds?: string[];
  onSelect: (sound: { uri: string | null; name: string | null }) => void;
  onClose: () => void;
}

export function RingtonePicker({ mode = 'select', category, excludeAlarmId, alarmIds, onSelect, onClose }: RingtonePickerProps) {
  const [sounds, setSounds] = useState<RingtoneEntry[]>([]);
  const [customSounds, setCustomSounds] = useState<RingtoneEntry[]>(loadCustomSounds());
  const [favorites, setFavorites] = useState<string[]>(loadFavoriteUris());
  const [loading, setLoading] = useState(true);
  const [previewingUri, setPreviewingUri] = useState<string | null>(null);
  const [showDefaults, setShowDefaults] = useState(false);
  const [pendingSound, setPendingSound] = useState<{ uri: string | null; name: string | null } | null>(null);
  const [otherAlarms, setOtherAlarms] = useState<AlarmRecord[]>([]);
  const [selectedBulkIds, setSelectedBulkIds] = useState<Set<string>>(new Set());

  useBackHandler(() => {
    if (pendingSound) {
      setPendingSound(null);
    } else if (showDefaults) {
      setShowDefaults(false);
    } else {
      onClose();
    }
  }, true);

  useEffect(() => {
    AlarmPlugin.listRingtones().then(({ sounds: list }) => {
      setSounds(list);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    return () => {
      AlarmPlugin.stopPreview();
    };
  }, []);

  const allSounds = useMemo(() => [...customSounds, ...sounds], [customSounds, sounds]);
  const favoriteSounds = useMemo(
    () => allSounds.filter((s) => favorites.includes(s.uri)),
    [allSounds, favorites]
  );

  async function handlePreview(uri: string) {
    if (previewingUri === uri) {
      await AlarmPlugin.stopPreview();
      setPreviewingUri(null);
      return;
    }
    hapticSelect();
    setPreviewingUri(uri);
    await AlarmPlugin.previewSound({ uri });
    setTimeout(() => setPreviewingUri((cur) => (cur === uri ? null : cur)), 12000);
  }

  function handleToggleFavorite(uri: string) {
    hapticSelect();
    setFavorites(toggleFavorite(uri));
  }

  async function handleImportCustom() {
    const result = await AlarmPlugin.importCustomAudio();
    if (result.cancelled || !result.uri) return;
    const entry: RingtoneEntry = { uri: result.uri, name: result.name || 'Custom audio' };
    setCustomSounds(addCustomSound(entry));
    hapticSuccess();
  }

  async function handleRowSelect(sound: RingtoneEntry) {
    await AlarmPlugin.stopPreview();
    const chosen = { uri: sound.uri, name: sound.name };

    if (mode === 'setDefault') {
      if (category) setCategoryDefault(category, sound);
      hapticSuccess();
      onSelect(chosen);
      return;
    }

    if (mode === 'bulk') {
      const { alarms } = await AlarmPlugin.list();
      for (const id of alarmIds ?? []) {
        const alarm = alarms.find((a) => a.id === id);
        if (!alarm) continue;
        await scheduleAlarmSynced({ ...alarm, soundUri: chosen.uri, soundName: chosen.name });
      }
      hapticSuccess();
      onSelect(chosen);
      return;
    }

    const { alarms } = await AlarmPlugin.list();
    const others = alarms.filter((a) => a.id !== excludeAlarmId);
    if (others.length === 0) {
      onSelect(chosen);
      return;
    }
    setOtherAlarms(others);
    setSelectedBulkIds(new Set());
    setPendingSound(chosen);
  }

  function toggleBulkId(id: string) {
    hapticSelect();
    setSelectedBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleApplyBulk() {
    if (!pendingSound) return;
    const { alarms } = await AlarmPlugin.list();
    // The sheet says the sound "is set for this alarm", so a saved alarm being edited gets it
    // now too; otherwise backing out of the editor would leave only the others changed.
    const ids = new Set(selectedBulkIds);
    if (excludeAlarmId) ids.add(excludeAlarmId);
    for (const id of ids) {
      const alarm = alarms.find((a) => a.id === id);
      if (!alarm) continue;
      await scheduleAlarmSynced({
        ...alarm,
        soundUri: pendingSound.uri,
        soundName: pendingSound.name,
      });
    }
    hapticSuccess();
    onSelect(pendingSound);
  }

  function handleSkipBulk() {
    if (!pendingSound) return;
    onSelect(pendingSound);
  }

  if (showDefaults) {
    return <CategoryDefaultsScreen onClose={() => setShowDefaults(false)} />;
  }

  if (pendingSound) {
    return (
      <div className="screen">
        <ScreenHeader title="Apply to other alarms?" onBack={() => setPendingSound(null)} />
        <div className="ringtone-picker__content">
          <p className="ringtone-picker__bulk-intro">
            "{pendingSound.name}" is set for this alarm. Apply it to other alarms too?
          </p>
          <ul className="ringtone-picker__bulk-list">
            {otherAlarms.map((a) => (
              <li key={a.id}>
                <button type="button" className="ringtone-picker__bulk-row" onClick={() => toggleBulkId(a.id)}>
                  <span
                    className={`ringtone-picker__checkbox${selectedBulkIds.has(a.id) ? ' ringtone-picker__checkbox--checked' : ''}`}
                  >
                    {selectedBulkIds.has(a.id) && <Icon name="check" size={13} strokeWidth={3} />}
                  </span>
                  <span className="ringtone-picker__bulk-row-text">
                    <span className="ringtone-picker__bulk-row-time">{formatTime(a.hour, a.minute)}</span>
                    <span className="ringtone-picker__bulk-row-meta">
                      {a.label ? `${a.label} · ` : ''}
                      {repeatLabelFor(a.repeatMode, a.hour, a.minute)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="ringtone-picker__bulk-actions">
            <button type="button" className="ringtone-picker__bulk-skip" onClick={handleSkipBulk}>
              Just This One
            </button>
            <button
              type="button"
              className="ringtone-picker__bulk-apply"
              onClick={handleApplyBulk}
              disabled={selectedBulkIds.size === 0}
            >
              Apply to {selectedBulkIds.size || ''} Selected
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <ScreenHeader
        title={
          mode === 'setDefault' && category
            ? `Default — ${category[0].toUpperCase()}${category.slice(1)}`
            : mode === 'bulk'
              ? `Choose Sound for ${alarmIds?.length ?? 0} Alarm${alarmIds?.length === 1 ? '' : 's'}`
              : 'Choose Sound'
        }
        onBack={onClose}
        action={
          mode === 'select' && (
            <button
              type="button"
              className="ringtone-picker__defaults-btn"
              onClick={() => setShowDefaults(true)}
              aria-label="Manage default sounds by time of day"
            >
              <Icon name="settings" size={20} />
            </button>
          )
        }
      />

      <div className="ringtone-picker__content">
        <button type="button" className="ringtone-picker__import" onClick={handleImportCustom}>
          <Icon name="music" size={18} />
          <span>Import custom audio…</span>
        </button>

        {loading ? null : (
          <>
            {favoriteSounds.length > 0 && (
              <>
                <h2 className="ringtone-picker__section-title">Favorites</h2>
                <ul className="ringtone-picker__list">
                  {favoriteSounds.map((s) => (
                    <RingtoneRow
                      key={`fav-${s.uri}`}
                      sound={s}
                      isFavorite
                      isPreviewing={previewingUri === s.uri}
                      onSelect={() => handleRowSelect(s)}
                      onPreview={() => handlePreview(s.uri)}
                      onToggleFavorite={() => handleToggleFavorite(s.uri)}
                    />
                  ))}
                </ul>
              </>
            )}

            {customSounds.length > 0 && (
              <>
                <h2 className="ringtone-picker__section-title">Custom</h2>
                <ul className="ringtone-picker__list">
                  {customSounds.map((s) => (
                    <RingtoneRow
                      key={`custom-${s.uri}`}
                      sound={s}
                      isFavorite={favorites.includes(s.uri)}
                      isPreviewing={previewingUri === s.uri}
                      onSelect={() => handleRowSelect(s)}
                      onPreview={() => handlePreview(s.uri)}
                      onToggleFavorite={() => handleToggleFavorite(s.uri)}
                    />
                  ))}
                </ul>
              </>
            )}

            <h2 className="ringtone-picker__section-title">All Sounds</h2>
            <ul className="ringtone-picker__list">
              {sounds.map((s) => (
                <RingtoneRow
                  key={s.uri}
                  sound={s}
                  isFavorite={favorites.includes(s.uri)}
                  isPreviewing={previewingUri === s.uri}
                  onSelect={() => handleRowSelect(s)}
                  onPreview={() => handlePreview(s.uri)}
                  onToggleFavorite={() => handleToggleFavorite(s.uri)}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function RingtoneRow({
  sound,
  isFavorite,
  isPreviewing,
  onSelect,
  onPreview,
  onToggleFavorite,
}: {
  sound: RingtoneEntry;
  isFavorite: boolean;
  isPreviewing: boolean;
  onSelect: () => void;
  onPreview: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <li>
      <div className="ringtone-picker__row">
        <button type="button" className="ringtone-picker__row-preview" onClick={onPreview} aria-label="Preview">
          <Icon name={isPreviewing ? 'stop' : 'play'} size={16} />
        </button>
        <button type="button" className="ringtone-picker__row-main" onClick={onSelect}>
          <span>{sound.name}</span>
          {sound.isDefault && <span className="ringtone-picker__row-badge">Default</span>}
        </button>
        <button
          type="button"
          className="ringtone-picker__row-fav"
          onClick={onToggleFavorite}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Icon name="star" size={17} style={isFavorite ? { fill: 'var(--yellow)', color: 'var(--yellow)' } : undefined} />
        </button>
      </div>
    </li>
  );
}
