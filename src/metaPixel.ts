/**
 * Meta Pixel (ads measurement), pixel id 1101250316215474.
 *
 * This is Meta's standard base code, loaded from here rather than pasted into index.html so it
 * follows the same rules as our own play log: it does NOT load for our own testing browsers
 * (opened once with ?dev=1), local builds, previews or automated browsers, so Meta only sees
 * real visitors. Loaded after the page itself has finished loading, so it never slows the
 * first screen. Events:
 *   PageView           every visit (Meta's default)
 *   SubmitApplication  a leaderboard post succeeded
 *   AddToWishlist      a menu was shared (share sheet completed, text copied or image saved)
 */

const PIXEL_ID = '1101250316215474';

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[][]; loaded?: boolean; version?: string; push?: unknown };

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

let enabled = false;

function skip(): boolean {
  try {
    if (localStorage.getItem('sc.dev') === '1') return true; // our own testing browsers (?dev=1)
  } catch {
    /* no storage: a real visitor */
  }
  if (location.protocol !== 'https:' && location.protocol !== 'http:') return true;
  if (/^(localhost|127\.|\[?::1)/.test(location.hostname)) return true;
  if ((navigator as Navigator & { webdriver?: boolean }).webdriver === true) return true;
  return /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit/i.test(navigator.userAgent || '');
}

/** Meta's base code, unchanged apart from formatting. */
function loadBaseCode(): void {
  /* eslint-disable */
  (function (f: Window, b: Document, e: string, v: string) {
    if (f.fbq) return;
    const n: Fbq = function (...args: unknown[]) {
      n.callMethod ? n.callMethod.apply(n, args) : n.queue!.push(args);
    } as Fbq;
    f.fbq = n;
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    const t = b.createElement(e) as HTMLScriptElement;
    t.async = true;
    t.src = v;
    const s = b.getElementsByTagName(e)[0];
    s.parentNode!.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
  window.fbq!('init', PIXEL_ID);
  window.fbq!('track', 'PageView');
}

/** Call once at startup, after the play log has processed any ?dev= flag. */
export function initMetaPixel(): void {
  if (typeof window === 'undefined' || skip()) return;
  enabled = true;
  if (document.readyState === 'complete') loadBaseCode();
  else window.addEventListener('load', loadBaseCode, { once: true });
}

/** A standard Meta event, e.g. metaTrack('SubmitApplication'). No-op where the pixel is off. */
export function metaTrack(event: 'SubmitApplication' | 'AddToWishlist'): void {
  if (!enabled) return;
  try {
    // Before the base code has loaded, queue it: the stub is created on load.
    if (window.fbq) window.fbq('track', event);
    else window.addEventListener('load', () => window.fbq?.('track', event), { once: true });
  } catch {
    /* ads measurement never affects the game */
  }
}
