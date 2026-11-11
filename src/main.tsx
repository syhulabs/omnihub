import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Bundled so the Crafting Station headline doesn't depend on a network fetch from Google Fonts.
import '@fontsource/baloo-2/600.css'
import '@fontsource/baloo-2/700.css'
import '@fontsource/baloo-2/800.css'
import './index.css'
import './cloud/firebaseWeb.ts'
import App from './app/App.tsx'
import { purgeSharedCache } from './share/saveFile'

// Before the first paint, so a light-theme user doesn't get a dark frame (and a dark App Lock
// pad) flashed at every launch. App.tsx keeps the attribute in sync afterwards.
try {
  const storedTheme = JSON.parse(localStorage.getItem('omnihub:theme') ?? 'null')
  if (storedTheme === 'light' || storedTheme === 'dark') document.documentElement.dataset.theme = storedTheme
} catch {
  // unreadable value: App.tsx falls back to its default
}

// Files left over from earlier share sheets (see purgeSharedCache).
void purgeSharedCache()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
