import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { initTelemetry } from './telemetry';
import { loadRun } from './engine/persist';

initTelemetry();

// Installable app + offline play. Production builds only: the dev server has no sw.js.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // Registered once the page is idle after loading, so the offline download never
  // competes with a first visit's own requests.
  const register = () =>
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* no offline mode; the game itself is unaffected */
    });
  window.addEventListener('load', () => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(register, { timeout: 5000 });
    else setTimeout(register, 3000);
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
