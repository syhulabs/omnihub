import { registerPlugin, WebPlugin } from '@capacitor/core';

export interface DeviceStats {
  deviceModel: string;
  manufacturer: string;
  batteryPercent: number;
  isCharging: boolean;
  batteryTempC: number;
  storageTotalBytes: number;
  storageFreeBytes: number;
  ramTotalBytes: number;
  ramAvailBytes: number;
  wifiConnected: boolean;
  hasInternetConnection: boolean;
  ipAddress: string;
  wifiRxMbps: number;
  wifiTxMbps: number;
  /** 0-4, -1 if unavailable (e.g. location permission not granted). */
  wifiSignalBars: number;
}

/** Audio only: photos and videos are not read (Play's Photo and Video Permissions policy). */
export interface StorageBreakdown {
  audioBytes: number;
  audioCount: number;
}

export interface DeviceInfo {
  deviceModel: string;
  manufacturer: string;
  androidVersion: string;
  buildNumber: string;
  socManufacturer: string;
  socModel: string;
  screenWidthPx: number;
  screenHeightPx: number;
  refreshRateHz: number;
  screenSizeInches: number;
  ramTotalBytes: number;
  storageTotalBytes: number;
  uptimeMillis: number;
}

export interface DeviceStatsPluginInterface {
  getStats(): Promise<DeviceStats>;
  getDeviceInfo(): Promise<DeviceInfo>;
  checkMediaPermission(): Promise<{ granted: boolean }>;
  requestMediaPermission(): Promise<{ granted: boolean }>;
  getStorageBreakdown(): Promise<StorageBreakdown>;
  openStorageSettings(): Promise<void>;
  openWifiPanel(): Promise<void>;
  openSoundPanel(): Promise<void>;
  openAppSettings(): Promise<void>;
}

// Best-effort browser equivalents, only for the web preview — real numbers come from the native
// plugin (android/.../devicestats/DeviceStatsPlugin.java) on-device. Several of these (deviceMemory,
// getBattery) are unavailable or approximate in most browsers, so this is never meant to be exact.
class DeviceStatsPluginWeb extends WebPlugin implements DeviceStatsPluginInterface {
  async getStats(): Promise<DeviceStats> {
    let batteryPercent = 100;
    let isCharging = false;
    try {
      const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> };
      if (nav.getBattery) {
        const battery = await nav.getBattery();
        batteryPercent = Math.round(battery.level * 100);
        isCharging = battery.charging;
      }
    } catch {
      // Battery Status API unsupported — keep the default
    }

    let storageTotalBytes = 0;
    let storageFreeBytes = 0;
    try {
      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        storageTotalBytes = estimate.quota ?? 0;
        storageFreeBytes = (estimate.quota ?? 0) - (estimate.usage ?? 0);
      }
    } catch {
      // Storage Manager API unsupported — keep zeros
    }

    const ramGb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;

    return {
      deviceModel: 'Web Preview',
      manufacturer: 'Browser',
      batteryPercent,
      isCharging,
      batteryTempC: 0,
      storageTotalBytes,
      storageFreeBytes,
      ramTotalBytes: ramGb * 1024 * 1024 * 1024,
      ramAvailBytes: 0,
      wifiConnected: navigator.onLine,
      hasInternetConnection: navigator.onLine,
      ipAddress: '',
      wifiRxMbps: 0,
      wifiTxMbps: 0,
      wifiSignalBars: -1,
    };
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    const ramGb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
    let storageTotalBytes = 0;
    try {
      if (navigator.storage?.estimate) {
        storageTotalBytes = (await navigator.storage.estimate()).quota ?? 0;
      }
    } catch {
      // Storage Manager API unsupported — keep zero
    }

    return {
      deviceModel: 'Web Preview',
      manufacturer: 'Browser',
      androidVersion: '—',
      buildNumber: navigator.userAgent.slice(0, 40),
      socManufacturer: '',
      socModel: '',
      screenWidthPx: window.screen.width,
      screenHeightPx: window.screen.height,
      refreshRateHz: 60,
      screenSizeInches: 0,
      ramTotalBytes: ramGb * 1024 * 1024 * 1024,
      storageTotalBytes,
      uptimeMillis: performance.now(),
    };
  }

  async checkMediaPermission(): Promise<{ granted: boolean }> {
    return { granted: true };
  }

  async requestMediaPermission(): Promise<{ granted: boolean }> {
    return { granted: true };
  }

  async getStorageBreakdown(): Promise<StorageBreakdown> {
    // No real media index in a browser — zeros rather than a fabricated breakdown.
    return { audioBytes: 0, audioCount: 0 };
  }

  async openStorageSettings(): Promise<void> {
    // no-op in browser
  }

  async openWifiPanel(): Promise<void> {
    // no-op in browser
  }

  async openSoundPanel(): Promise<void> {
    // no-op in browser
  }

  async openAppSettings(): Promise<void> {
    // no-op in browser
  }
}

export const DeviceStatsPlugin = registerPlugin<DeviceStatsPluginInterface>('DeviceStatsPlugin', {
  web: () => new DeviceStatsPluginWeb(),
});
