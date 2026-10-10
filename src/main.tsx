import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Bundled so the Crafting Station headline doesn't depend on a network fetch from Google Fonts.
import '@fontsource/baloo-2/600.css'
import '@fontsource/baloo-2/700.css'
import '@fontsource/baloo-2/800.css'
import './index.css'
import './cloud/firebaseWeb.ts'
import App from './app/App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
