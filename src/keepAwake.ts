import { registerPlugin, WebPlugin } from '@capacitor/core';

interface KeepAwakePluginInterface {
  setEnabled(options: { enabled: boolean }): Promise<void>;
}

class KeepAwakePluginWeb extends WebPlugin implements KeepAwakePluginInterface {
  async setEnabled(): Promise<void> {
    // no-op in browser
  }
}

const KeepAwakePlugin = registerPlugin<KeepAwakePluginInterface>('KeepAwakePlugin', {
  web: () => new KeepAwakePluginWeb(),
});

export function setKeepAwake(enabled: boolean) {
  void KeepAwakePlugin.setEnabled({ enabled }).catch(() => {
    // Plugin unavailable (web, etc.) — ignore.
  });
}
