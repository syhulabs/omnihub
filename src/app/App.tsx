import { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { BottomNav } from './BottomNav';
import { RouterProvider, useRouter } from './Router';
import { runTopBackHandler } from './useBackHandler';
import { Home } from '../screens/Home/Home';
import { Tools } from '../screens/Tools/Tools';
import { Craft } from '../screens/Craft/Craft';
import { SyxdiAi } from '../screens/SyxdiAi/SyxdiAi';
import { Profile } from '../screens/Profile/Profile';
import {
  ProfileAccount,
  ProfileSettings,
  ProfileAppearance,
  ProfileDataSync,
  ProfilePrivacy,
  ProfileAbout,
  ProfileTextSize,
  ProfileTimeFormats,
  ProfileNotifications,
  ProfileAppLock,
  ProfileVaultSecurity,
} from '../screens/Profile/ProfileSections';
import { ToolRoute } from '../tools/ToolRoute';
import { PhoneCenter } from '../screens/PhoneCenter/PhoneCenter';
import { DeviceInfo } from '../screens/PhoneCenter/DeviceInfo';
import { StorageDetails } from '../screens/PhoneCenter/StorageDetails';
import { HealthCheck } from '../screens/PhoneCenter/HealthCheck';
import { PrivacyPolicy } from '../screens/PrivacyPolicy/PrivacyPolicy';
import { storageGet, StorageKeys } from '../storage/db';
import { StorageErrorToast } from '../storage/StorageErrorToast';
import { hapticTap } from '../haptics';
import { AuthProvider } from '../cloud/AuthContext';
import { SettingsProvider } from '../settings/SettingsContext';
import { AppLockGate } from '../applock/AppLockGate';
import { useIsLightTheme } from '../theme/useTheme';
import { setStatusBarStyle, initStatusBarOverlay } from '../theme/statusBar';
import './App.css';

const TOP_LEVEL_PATHS = new Set(['/', '/tools', '/ai', '/craft', '/profile']);

function Screen() {
  const { path } = useRouter();

  if (path === '/') return <Home />;
  if (path === '/tools') return <Tools />;
  if (path === '/ai') return <SyxdiAi />;
  if (path === '/craft') return <Craft />;
  if (path === '/profile') return <Profile />;
  if (path === '/profile/account') return <ProfileAccount />;
  if (path === '/profile/settings') return <ProfileSettings />;
  if (path === '/profile/settings/text-size') return <ProfileTextSize />;
  if (path === '/profile/settings/time-formats') return <ProfileTimeFormats />;
  if (path === '/profile/settings/notifications') return <ProfileNotifications />;
  if (path === '/profile/settings/app-lock') return <ProfileAppLock />;
  if (path === '/profile/settings/vault-security') return <ProfileVaultSecurity />;
  if (path === '/profile/appearance') return <ProfileAppearance />;
  if (path === '/profile/data-sync') return <ProfileDataSync />;
  if (path === '/profile/privacy') return <ProfilePrivacy />;
  if (path === '/profile/about') return <ProfileAbout />;
  if (path === '/phone-center') return <PhoneCenter />;
  if (path === '/device-info') return <DeviceInfo />;
  if (path === '/storage-details') return <StorageDetails />;
  if (path === '/health-check') return <HealthCheck />;
  if (path === '/privacy-policy') return <PrivacyPolicy />;
  if (path.startsWith('/tools/')) {
    return <ToolRoute toolId={path.slice('/tools/'.length)} />;
  }
  return <Home />;
}

function Shell() {
  const { path, navigate, back } = useRouter();
  const showNav = TOP_LEVEL_PATHS.has(path);

  useEffect(() => {
    const listener = CapacitorApp.addListener('backButton', () => {
      if (runTopBackHandler()) return;
      if (!TOP_LEVEL_PATHS.has(path)) {
        back();
      } else if (path !== '/') {
        navigate('/', { replace: true });
      } else {
        CapacitorApp.exitApp();
      }
    });
    return () => {
      listener.then((l) => l.remove());
    };
  }, [path, navigate, back]);

  return (
    <div className="app-shell">
      <div className="app-shell__content">
        <Screen />
      </div>
      {showNav && <BottomNav />}
      <StorageErrorToast />
    </div>
  );
}

function App() {
  const isLight = useIsLightTheme();

  useEffect(() => {
    const theme = storageGet<'dark' | 'light'>(StorageKeys.theme, 'dark');
    document.documentElement.dataset.theme = theme;
    initStatusBarOverlay();
  }, []);

  useEffect(() => {
    setStatusBarStyle(isLight);
  }, [isLight]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement;
      const button = target.closest('button');
      if (button && !button.disabled) hapticTap();
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  return (
    <SettingsProvider>
      <AppLockGate>
        <AuthProvider>
          <RouterProvider>
            <Shell />
          </RouterProvider>
        </AuthProvider>
      </AppLockGate>
    </SettingsProvider>
  );
}

export default App;
