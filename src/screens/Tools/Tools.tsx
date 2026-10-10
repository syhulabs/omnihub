import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useBackHandler } from '../../app/useBackHandler';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SearchBar } from '../../components/SearchBar';
import { ToolTile } from '../../components/ToolTile';
import { Icon } from '../../components/Icon';
import { useRouter } from '../../app/Router';
import { CATEGORY_LABELS, TOOLS } from '../../tools/registry';
import { searchTools } from '../../search/searchIndex';
import { storageGet, storageSet, StorageKeys } from '../../storage/db';
import { hapticSelect, hapticSuccess, hapticWarning } from '../../haptics';
import { TOOL_ICON_IMAGES } from '../../assets/tool-icons';
import { TOOL_ICON_IMAGES_LIGHT } from '../../assets/tool-icons/lightIndex';
import { useIsLightTheme } from '../../theme/useTheme';
import { loadPinnedToolIds, savePinnedToolIds, MAX_PINNED_TOOLS } from '../../tools/pinnedTools';
import type { ToolCategory, ToolMeta } from '../../types';
import './Tools.css';

const SUPPORT_EMAIL = 'syhu.inc@gmail.com';

type CategoryFilter = 'all' | ToolCategory;
type SortMode = 'default' | 'alpha' | 'category';

const CATEGORIES: CategoryFilter[] = ['all', 'essentials', 'productivity', 'finance', 'more', 'coming-soon'];
const CATEGORY_ORDER: ToolCategory[] = ['essentials', 'productivity', 'finance', 'more', 'coming-soon'];
const SORT_CYCLE: SortMode[] = ['default', 'alpha', 'category'];
const SORT_LABELS: Record<SortMode, string> = { default: 'Sort', alpha: 'A–Z', category: 'By Category' };

const FEATURED_TOOL_IDS = ['calculator', 'timer', 'checklist'];
const COMING_SOON_PREVIEW_IDS = ['voice-changer', 'password-generator', 'journal'];

export function Tools() {
  const { navigate } = useRouter();
  const isLight = useIsLightTheme();
  const toolIconImages = isLight ? TOOL_ICON_IMAGES_LIGHT : TOOL_ICON_IMAGES;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [suggestOpen, setSuggestOpen] = useState(false);
  useBackHandler(() => setSuggestOpen(false), suggestOpen);
  const [suggestText, setSuggestText] = useState('');
  const [suggestSent, setSuggestSent] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<string[]>(loadPinnedToolIds);
  const [longPressedId, setLongPressedId] = useState<string | null>(null);

  const visibleTools = useMemo(() => {
    if (sortMode === 'category') return [];
    const base = query
      ? searchTools(query, 20)
          .map((r) => r.tool)
          .filter((t) => category === 'all' || t.category === category)
      : category === 'all'
        ? TOOLS
        : TOOLS.filter((t) => t.category === category);
    return sortMode === 'alpha' ? [...base].sort((a, b) => a.name.localeCompare(b.name)) : base;
  }, [query, category, sortMode]);

  const categorizedGroups = useMemo(() => {
    if (sortMode !== 'category') return null;
    const base = query ? searchTools(query, 50).map((r) => r.tool) : TOOLS;
    return CATEGORY_ORDER.map((cat) => ({
      cat,
      tools: base.filter((t) => t.category === cat),
    })).filter((g) => g.tools.length > 0);
  }, [query, sortMode]);

  useEffect(() => {
    setLongPressedId(null);
  }, [category, sortMode, query]);

  const openTool = (id: string) => navigate(`/tools/${id}`);

  function toggleSort() {
    hapticSelect();
    setSortMode((v) => SORT_CYCLE[(SORT_CYCLE.indexOf(v) + 1) % SORT_CYCLE.length]);
  }

  function togglePin(id: string) {
    const isPinned = pinnedIds.includes(id);
    if (!isPinned && pinnedIds.length >= MAX_PINNED_TOOLS) {
      hapticWarning();
      return;
    }
    const next = isPinned ? pinnedIds.filter((p) => p !== id) : [...pinnedIds, id];
    setPinnedIds(next);
    savePinnedToolIds(next);
    hapticSuccess();
    setLongPressedId(null);
  }

  const pinLimitReached = pinnedIds.length >= MAX_PINNED_TOOLS;

  function renderTile(tool: ToolMeta) {
    return (
      <ToolTile
        key={tool.id}
        tool={tool}
        onClick={() => (longPressedId === tool.id ? setLongPressedId(null) : openTool(tool.id))}
        onLongPress={() => setLongPressedId(tool.id)}
        showPinBadge={longPressedId === tool.id}
        pinned={pinnedIds.includes(tool.id)}
        onTogglePin={() => togglePin(tool.id)}
        pinLimitReached={pinLimitReached}
      />
    );
  }

  function handleSuggestSubmit() {
    const text = suggestText.trim();
    if (!text) return;
    const existing = storageGet<string[]>(StorageKeys.toolSuggestions, []);
    storageSet(StorageKeys.toolSuggestions, [...existing, text]);
    hapticSuccess();
    setSuggestText('');
    setSuggestOpen(false);
    setSuggestSent(true);
    setTimeout(() => setSuggestSent(false), 3500);
    // Nothing reads the local list, so the idea has to leave the phone: open an email draft to
    // the owner's support address with the suggestion filled in.
    const subject = encodeURIComponent('Omni Hub tool suggestion');
    const body = encodeURIComponent(`${text}\n\n— sent from Omni Hub`);
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  }

  return (
    <div className="screen">
      <ScreenHeader title="Hub" subtitle="All tools in one place." />

      <div className="tools__search">
        <SearchBar value={query} onChange={setQuery} placeholder="Search tools..." />
      </div>

      {sortMode !== 'category' && (
        <div className="tools__tabs">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`tools__tab${category === cat ? ' tools__tab--active' : ''}`}
              onClick={() => setCategory(cat)}
            >
              {cat === 'all' ? 'All' : CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      )}

      <div className="tools__content">
        {category === 'coming-soon' && sortMode !== 'category' ? (
          <div className="tools__featured tools__featured--soon">
            <div className="tools__featured-glow" />
            <div className="tools__featured-icons">
              {COMING_SOON_PREVIEW_IDS.map((id, i) => (
                <img
                  key={id}
                  src={toolIconImages[id]}
                  alt=""
                  className="tools__featured-chip"
                  style={{ '--i': i } as CSSProperties}
                />
              ))}
            </div>
            <span className="tools__featured-badge">
              <Icon name="clock" size={10} />
              Coming Soon
            </span>
            <h2 className="tools__featured-title">
              More Tools
              <br />
              On The Way.
            </h2>
            <p className="tools__featured-text">We&rsquo;re cooking up new tools for Omni Hub.</p>
          </div>
        ) : (
          <div className="tools__featured">
            <div className="tools__featured-glow" />
            <div className="tools__featured-icons">
              {FEATURED_TOOL_IDS.map((id, i) => (
                <img
                  key={id}
                  src={toolIconImages[id]}
                  alt=""
                  className="tools__featured-chip"
                  style={{ '--i': i } as CSSProperties}
                />
              ))}
            </div>
            <span className="tools__featured-badge">Featured</span>
            <h2 className="tools__featured-title">
              Productivity
              <br />
              Starts Here.
            </h2>
            <p className="tools__featured-text">Tools to make your everyday life easier.</p>
          </div>
        )}

        {sortMode === 'category' ? (
          categorizedGroups && categorizedGroups.length > 0 ? (
            <>
              <div className="tools__section-header">
                <h2>All Tools</h2>
                <button type="button" className="tools__sort-btn" onClick={toggleSort}>
                  <Icon name="sort" size={14} />
                  {SORT_LABELS[sortMode]}
                </button>
              </div>
              {categorizedGroups.map((group) => (
                <div key={group.cat} className="tools__category-group">
                  <h3 className="tools__category-heading">{CATEGORY_LABELS[group.cat]}</h3>
                  <div className="tools__grid">{group.tools.map(renderTile)}</div>
                </div>
              ))}
            </>
          ) : (
            <p className="tools__empty">
              No tools found{query ? ` for "${query}"` : ''}. Try another search term.
            </p>
          )
        ) : visibleTools.length === 0 ? (
          <p className="tools__empty">
            No tools found{query ? ` for "${query}"` : ''}. Try another category or search term.
          </p>
        ) : (
          <>
            <div className="tools__section-header">
              <h2>{category === 'coming-soon' ? 'Coming Soon' : 'All Tools'}</h2>
              <button type="button" className="tools__sort-btn" onClick={toggleSort}>
                <Icon name="sort" size={14} />
                {SORT_LABELS[sortMode]}
              </button>
            </div>
            <div className="tools__grid">{visibleTools.map(renderTile)}</div>
          </>
        )}

        <div className="tools__suggest">
          <span className="tools__suggest-icon">
            <Icon name="lightbulb" size={20} />
          </span>
          <div className="tools__suggest-text">
            <strong>Have an idea for a new tool?</strong>
            <p>We're always adding new tools to make your life easier.</p>
          </div>
          <button type="button" className="tools__suggest-btn" onClick={() => setSuggestOpen(true)}>
            Suggest
            <Icon name="chevron-right" size={14} />
          </button>
        </div>

        {suggestSent && <p className="tools__suggest-thanks">Thanks! Finish sending it in your email app.</p>}
      </div>

      {suggestOpen && (
        <div className="tools__suggest-sheet" onClick={() => setSuggestOpen(false)}>
          <div className="tools__suggest-form" onClick={(e) => e.stopPropagation()}>
            <h2>Suggest a tool</h2>
            <textarea
              placeholder="What tool would make your day easier?"
              value={suggestText}
              onChange={(e) => setSuggestText(e.target.value)}
              autoFocus
            />
            <div className="tools__suggest-form-actions">
              <button type="button" onClick={() => setSuggestOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="tools__suggest-form-send"
                onClick={handleSuggestSubmit}
                disabled={!suggestText.trim()}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
