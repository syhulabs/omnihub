import { useState, useEffect } from 'react';
import { stopPlayback } from './playback';
import { useRouter } from '../../app/Router';
import { useBackHandler } from '../../app/useBackHandler';
import type { VcApi, VcScreenName } from './types';
import type { SavedClip } from './clipStorage';
import { VoiceChangerTabBar, type VcTab } from './VoiceChangerTabBar';
import { HomeScreen } from './screens/HomeScreen';
import { ToolsScreen } from './screens/ToolsScreen';
import { RecordScreen } from './screens/RecordScreen';
import { EffectsScreen } from './screens/EffectsScreen';
import { AutoTuneScreen } from './screens/AutoTuneScreen';
import { PitchSpeedScreen } from './screens/PitchSpeedScreen';
import { EchoReverbScreen } from './screens/EchoReverbScreen';
import { MixerScreen } from './screens/MixerScreen';
import { PreviewScreen } from './screens/PreviewScreen';
import { ShareScreen } from './screens/ShareScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import './VoiceChanger.css';

const TAB_SCREENS = new Set<VcScreenName>(['home', 'tools', 'history', 'saved']);

export function VoiceChanger() {
  const { back: exitTool } = useRouter();
  const [stack, setStack] = useState<VcScreenName[]>(['home']);
  const [original, setOriginalState] = useState<AudioBuffer | null>(null);
  const [processed, setProcessed] = useState<AudioBuffer | null>(null);
  const [processedLabel, setProcessedLabel] = useState('Original');
  const [pendingScreen, setPendingScreen] = useState<VcScreenName | null>(null);
  const [shareClip, setShareClip] = useState<SavedClip | null>(null);
  const [refreshHistoryToken, setRefreshHistoryToken] = useState(0);

  const screen = stack[stack.length - 1];

  function goto(next: VcScreenName) {
    setStack((s) => [...s, next]);
  }

  function replace(next: VcScreenName) {
    setStack((s) => [...s.slice(0, -1), next]);
  }

  /** Throws the whole stack away, e.g. after deleting the clip a Share screen was showing. */
  function reset(next: VcScreenName) {
    setStack([next]);
  }

  function popBack() {
    if (stack.length > 1) {
      setStack((s) => s.slice(0, -1));
      return;
    }
    // At the root of a non-Home tab, back returns to Home rather than exiting the tool — only
    // Home's own root exits, matching how a tab bar's back behavior normally works.
    if (screen !== 'home') {
      setStack(['home']);
      return;
    }
    exitTool();
  }

  function selectTab(tab: VcTab) {
    setStack([tab]);
  }

  useBackHandler(popBack, screen !== 'home');

  // Leaving the tool must not leave a preview playing with nothing on screen to stop it.
  useEffect(() => () => stopPlayback(), []);

  function setOriginal(buffer: AudioBuffer) {
    setOriginalState(buffer);
    setProcessed(buffer);
    setProcessedLabel('Original');
  }

  function setResult(buffer: AudioBuffer, label: string) {
    setProcessed(buffer);
    setProcessedLabel(label);
  }

  const api: VcApi = {
    original,
    setOriginal,
    processed,
    processedLabel,
    setResult,
    goto,
    replace,
    reset,
    popBack,
    pendingScreen,
    setPendingScreen,
    shareClip,
    setShareClip,
    refreshHistoryToken,
    bumpHistoryToken: () => setRefreshHistoryToken((t) => t + 1),
  };

  let body: React.ReactNode;
  switch (screen) {
    case 'tools':
      body = <ToolsScreen api={api} />;
      break;
    case 'record':
      body = <RecordScreen api={api} />;
      break;
    case 'effects':
      body = <EffectsScreen api={api} />;
      break;
    case 'autotune':
      body = <AutoTuneScreen api={api} />;
      break;
    case 'pitch-speed':
      body = <PitchSpeedScreen api={api} />;
      break;
    case 'echo-reverb':
      body = <EchoReverbScreen api={api} />;
      break;
    case 'mixer':
      body = <MixerScreen api={api} />;
      break;
    case 'preview':
      body = <PreviewScreen api={api} />;
      break;
    case 'share':
      body = <ShareScreen api={api} />;
      break;
    case 'history':
      body = <HistoryScreen api={api} />;
      break;
    case 'saved':
      body = <HistoryScreen api={api} favoritesOnly />;
      break;
    case 'home':
    default:
      body = <HomeScreen api={api} />;
  }

  return (
    <div className="vch-app">
      {body}
      {TAB_SCREENS.has(screen) && <VoiceChangerTabBar active={screen as VcTab} onSelect={selectTab} />}
    </div>
  );
}
