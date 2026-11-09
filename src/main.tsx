import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { initTelemetry } from './telemetry';
import { loadRun } from './engine/persist';

initTelemetry();

// Installable app + offline play. Production builds only: the dev server has no sw.js.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* no offline mode; the game itself is unaffected */
    });
  });
}

const root = document.getElementById('root')!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// The build pre-renders the title screen into #root (tools/prerender.mjs). A visitor with
// nothing saved sees exactly that screen first, so React adopts the existing markup
// (hydration) instead of laying the page out a second time. With a saved game (or a
// failed restore notice) the first screen differs, so start clean.
if (root.firstElementChild && loadRun().kind === 'none') {
  hydrateRoot(root, app);
} else {
  root.textContent = '';
  createRoot(root).render(app);
}
