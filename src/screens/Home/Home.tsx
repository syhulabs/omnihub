import { useMemo, useState } from 'react';
import { fillColor } from '../../theme/fill';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SearchBar } from '../../components/SearchBar';
import { Icon } from '../../components/Icon';
import { useRouter } from '../../app/Router';
import { TOOLS, getToolById } from '../../tools/registry';
import { searchTools } from '../../search/searchIndex';
import { storageGet, storageSet, StorageKeys } from '../../storage/db';
import { loadPinnedToolIds, savePinnedToolIds, MAX_PINNED_TOOLS } from '../../tools/pinnedTools';
import { hapticWarning } from '../../haptics';
import { PinnedToolsGrid } from './PinnedToolsGrid';
import { PhoneStatusCard } from './PhoneStatusCard';
import type { ToolMeta } from '../../types';
import './Home.css';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

interface HomeSections {
  myPhone: boolean;
}

type MyPhonePosition = 'top' | 'afterPinned';

const DEFAULT_SECTIONS: HomeSections = { myPhone: true };

export function Home() {
  const { navigate } = useRouter();
  const [query, setQuery] = useState('');
  const [pinnedIds, setPinnedIds] = useState<string[]>(loadPinnedToolIds);
  const [editingPinned, setEditingPinned] = useState(false);
  const [sections, setSections] = useState<HomeSections>(() => ({
    ...DEFAULT_SECTIONS,
    ...storageGet(StorageKeys.homeSections, DEFAULT_SECTIONS),
  }));
  const [myPhonePosition, setMyPhonePosition] = useState<MyPhonePosition>(() =>
    storageGet(StorageKeys.homeMyPhonePosition, 'top' as MyPhonePosition),
  );

  function hideSection(key: keyof HomeSections) {
    const next = { ...sections, [key]: false };
    setSections(next);
    storageSet(StorageKeys.homeSections, next);
  }

  // Hiding always resets the card back to its default top position, so whenever it comes back
  // (via "Show hidden sections") it reappears where the reference design has it, rather than
  // wherever it happened to be positioned before it was hidden.
  function hideMyPhone() {
    hideSection('myPhone');
    setMyPhonePosition('top');
    storageSet(StorageKeys.homeMyPhonePosition, 'top');
  }

  function showMyPhone() {
    const next = { ...sections, myPhone: true };
    setSections(next);
    storageSet(StorageKeys.homeSections, next);
  }

  function toggleMyPhonePosition() {
    const next: MyPhonePosition = myPhonePosition === 'top' ? 'afterPinned' : 'top';
    setMyPhonePosition(next);
    storageSet(StorageKeys.homeMyPhonePosition, next);
  }

  const pinnedTools = pinnedIds.map(getToolById).filter((t): t is ToolMeta => !!t);
  const results = useMemo(() => searchTools(query), [query]);

  const openTool = (id: string) => navigate(`/tools/${id}`);

  function updatePinned(next: string[]) {
    setPinnedIds(next);
    savePinnedToolIds(next);
  }

  function unpin(id: string) {
    updatePinned(pinnedIds.filter((toolId) => toolId !== id));
  }

  function pin(id: string) {
    if (pinnedIds.includes(id)) return;
    if (pinnedIds.length >= MAX_PINNED_TOOLS) {
      hapticWarning();
      return;
    }
    updatePinned([...pinnedIds, id]);
  }

  const pinLimitReached = pinnedIds.length >= MAX_PINNED_TOOLS;
  const pinnableTools = TOOLS.filter((tool) => !tool.locked && !pinnedIds.includes(tool.id));

  return (
    <div className="screen home">
      <ScreenHeader
        title={`${greeting()} \u{1F44B}`}
        subtitle="What do you need today?"
        action={
          !sections.myPhone ? (
            <button type="button" className="home__myphone-pill" onClick={showMyPhone} aria-label="Show My Phone card">
              <Icon name="smartphone" size={18} />
            </button>
          ) : undefined
        }
      />

      {!query && sections.myPhone && myPhonePosition === 'top' && (
        <PhoneStatusCard
          atTop
          onHide={hideMyPhone}
          onTogglePosition={toggleMyPhonePosition}
          onOpen={() => navigate('/phone-center')}
        />
      )}

      <div className="home__search">
        <SearchBar value={query} onChange={setQuery} placeholder="Search tools or ask a question..." />
      </div>

      {query ? (
        <div className="home__section">
          {results.length === 0 ? (
            <p className="home__empty">
              No tools found for "{query}". Try a different word, like "split bill" or "convert".
            </p>
          ) : (
            <ul className="home__results">
              {results.map(({ tool }) => (
                <li key={tool.id}>
                  <button type="button" className="home__result" onClick={() => openTool(tool.id)}>
                    <span
                      className="home__result-icon"
                      style={{
                        background: `color-mix(in srgb, ${fillColor(tool.color)} 18%, transparent)`,
                        color: tool.color,
                      }}
                    >
                      <Icon name={tool.icon} size={18} />
                    </span>
                    <span className="home__result-text">
                      <strong>{tool.name}</strong>
                      <span>{tool.shortDescription}</span>
                    </span>
                    <Icon name="chevron-right" size={18} className="home__result-chevron" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div className="home__section">
            <div className="home__section-header">
              <h2>Pinned Tools</h2>
              <button type="button" className="home__link" onClick={() => setEditingPinned((v) => !v)}>
                {editingPinned ? 'Done' : 'Edit'}
              </button>
            </div>
            {pinnedTools.length === 0 ? (
              <p className="home__empty">No pinned tools yet. Tap Edit to add some.</p>
            ) : (
              <PinnedToolsGrid
                tools={pinnedTools}
                editing={editingPinned}
                onOpen={openTool}
                onRemove={unpin}
                onReorder={updatePinned}
              />
            )}
            {editingPinned && pinnableTools.length > 0 && (
              <div className="home__pin-picker">
                <p>
                  {pinLimitReached
                    ? `Pin limit reached (${MAX_PINNED_TOOLS}/${MAX_PINNED_TOOLS}) — unpin a tool to add another`
                    : `Add a tool (${pinnedTools.length}/${MAX_PINNED_TOOLS})`}
                </p>
                {!pinLimitReached && (
                  <div className="home__pin-picker-list">
                    {pinnableTools.map((tool) => (
                      <button
                        key={tool.id}
                        type="button"
                        className="home__pin-picker-item"
                        onClick={() => pin(tool.id)}
                      >
                        <Icon name={tool.icon} size={14} />
                        {tool.name}
                        <Icon name="plus" size={14} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {sections.myPhone && myPhonePosition === 'afterPinned' && (
            <PhoneStatusCard
              atTop={false}
              onHide={hideMyPhone}
              onTogglePosition={toggleMyPhonePosition}
              onOpen={() => navigate('/phone-center')}
            />
          )}

          <button type="button" className="home__banner" onClick={() => navigate('/tools')}>
            <div className="home__banner-glow" />
            <div className="home__banner-eyebrow">
              <span className="home__banner-mark" />
              Omni Hub
            </div>
            <div className="home__banner-text">
              <strong>Small Tools.</strong>
              <strong>Big Progress.</strong>
              <span>A simpler everyday life.</span>
            </div>
            <span className="home__banner-arrow">
              <Icon name="chevron-right" size={20} />
            </span>
          </button>
        </>
      )}
    </div>
  );
}
