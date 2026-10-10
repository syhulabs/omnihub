import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

interface RouterContextValue {
  path: string;
  navigate: (path: string, options?: { replace?: boolean }) => void;
  back: () => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);

function currentPath(): string {
  return window.location.hash.slice(1) || '/';
}

/** Where a tool was opened from, when that was somewhere other than Home or the Hub (Phone
 *  Center's Flashlight shortcut, Vault Security's "Open Vault"). Back then returns there. */
let toolOrigin: string | null = null;

/** The screen "back" should return to, independent of how the user actually navigated in. */
function parentPath(path: string): string {
  if (path.startsWith('/tools/')) return toolOrigin ?? '/tools';
  if (path === '/device-info') return '/phone-center';
  if (path === '/storage-details') return '/phone-center';
  if (path === '/health-check') return '/phone-center';
  if (path === '/phone-center') return '/';
  if (path === '/privacy-policy') return '/profile/privacy';
  if (path.startsWith('/profile/settings/')) return '/profile/settings';
  if (path.startsWith('/profile/')) return '/profile';
  return '/';
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = '#/';
    }
    const onHashChange = () => setPath(currentPath());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (nextPath: string, options?: { replace?: boolean }) => {
    if (nextPath.startsWith('/tools/')) {
      const from = currentPath();
      const fromTopLevel = from === '/' || from === '/tools' || from.startsWith('/tools/');
      toolOrigin = fromTopLevel ? null : from;
    }
    if (options?.replace) {
      const url = new URL(window.location.href);
      url.hash = `#${nextPath}`;
      window.location.replace(url.toString());
      setPath(nextPath);
    } else {
      window.location.hash = `#${nextPath}`;
    }
  };

  const back = () => navigate(parentPath(path), { replace: true });

  return (
    <RouterContext.Provider value={{ path, navigate, back }}>
      {children}
    </RouterContext.Provider>
  );
}

export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used within RouterProvider');
  return ctx;
}
