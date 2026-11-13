import { TOOLS } from '../tools/registry';
import type { ToolMeta } from '../types';

export interface SearchResult {
  tool: ToolMeta;
  score: number;
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'do', 'does', 'is', 'are', 'i', 'my', 'me',
  'how', 'much', 'many', 'for', 'and', 'or', 'in', 'on', 'at', 'up',
]);

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function wordSet(text: string): string[] {
  return text.split(/[^a-z0-9]+/).filter(Boolean);
}

function hasWordMatch(words: string[], token: string): boolean {
  return words.some((word) => word === token || word.startsWith(token));
}

function isLocked(tool: ToolMeta): boolean {
  return tool.locked === true;
}

/** True when `needle` begins `text` or begins one of its words. */
function startsAWord(text: string, needle: string): boolean {
  return text.startsWith(needle) || wordSet(text).some((word) => word.startsWith(needle)) || ` ${text}`.includes(` ${needle}`);
}

/** True when the whole `phrase` appears in `text` on word boundaries. */
function containsPhrase(text: string, phrase: string): boolean {
  return ` ${wordSet(text).join(' ')} `.includes(` ${wordSet(phrase).join(' ')} `);
}

function scoreTool(tool: ToolMeta, query: string, tokens: string[]): number {
  const name = normalize(tool.name);
  const description = normalize(tool.shortDescription);
  const keywords = tool.keywords.map(normalize);
  const nameWords = wordSet(name);
  const descriptionWords = wordSet(description);

  let score = 0;

  // Matches start at a word: "qr" finds QR Scanner, not Scientific Calculator through "sqrt", and
  // "age" finds Age Calculator, not Percentage Calculator.
  if (name === query) score += 100;
  else if (name.startsWith(query)) score += 60;
  else if (startsAWord(name, query)) score += 40;

  // The best keyword counts once. Summing every hit let a tool with many keywords starting with
  // the same letter outrank the tool whose own name starts with it.
  let keywordScore = 0;
  for (const keyword of keywords) {
    if (keyword === query) keywordScore = Math.max(keywordScore, 90);
    else if (startsAWord(keyword, query) || containsPhrase(query, keyword)) keywordScore = Math.max(keywordScore, 50);
  }
  score += keywordScore;

  if (startsAWord(description, query)) score += 20;

  const meaningfulTokens = tokens.filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  for (const token of meaningfulTokens) {
    if (hasWordMatch(nameWords, token)) score += 12;
    if (keywords.some((keyword) => hasWordMatch(wordSet(keyword), token))) score += 10;
    if (hasWordMatch(descriptionWords, token)) score += 5;
  }

  return score;
}

export function searchTools(query: string, limit = 8): SearchResult[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  const tokens = normalized.split(/\s+/).filter(Boolean);

  const results = TOOLS.map((tool) => ({
    tool,
    // Locked "coming soon" tools count for half, so a tool that opens wins a close call (with
    // eight slots, "c" used to fill up with locked tools and miss Calculator), while a search
    // that names a locked tool, like "qr generator", still finds it first.
    score: scoreTool(tool, normalized, tokens) * (isLocked(tool) ? 0.5 : 1),
  }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
}
