import type { SavedClip } from './clipStorage';

export type VcScreenName =
  | 'home'
  | 'tools'
  | 'record'
  | 'effects'
  | 'autotune'
  | 'pitch-speed'
  | 'echo-reverb'
  | 'mixer'
  | 'preview'
  | 'share'
  | 'history'
  | 'saved';

/** Shared state + navigation every screen needs, threaded down from the root VoiceChanger
 *  component as one props object rather than context — small, fixed set of screens, so the extra
 *  indirection of context wouldn't pay for itself here. */
export interface VcApi {
  original: AudioBuffer | null;
  setOriginal: (buffer: AudioBuffer) => void;
  processed: AudioBuffer | null;
  processedLabel: string;
  setResult: (buffer: AudioBuffer, label: string) => void;
  goto: (screen: VcScreenName) => void;
  /** Swaps the current screen for another instead of pushing — used after recording/importing
   *  finishes, so the back button from wherever that led doesn't return to a stale Record screen. */
  replace: (screen: VcScreenName) => void;
  reset: (screen: VcScreenName) => void;
  popBack: () => void;
  /** Where to land after a recording/import finishes when the user tapped a tool tile with no
   *  audio loaded yet (e.g. Home → Auto-Tune with nothing recorded → Record → back to Auto-Tune). */
  pendingScreen: VcScreenName | null;
  setPendingScreen: (screen: VcScreenName | null) => void;
  shareClip: SavedClip | null;
  setShareClip: (clip: SavedClip | null) => void;
  refreshHistoryToken: number;
  bumpHistoryToken: () => void;
}
