import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { catalog, COURSE_LABEL, COURSES, Course, getDish } from './engine/catalog';
import { CoursePlaceholder } from './art/FoodArt';
import { formatMoney, formatRating, formatStars, scoreHundredths } from './engine/engine';

const BASE = import.meta.env.BASE_URL;

function orderedDishes(picks: string[]) {
  return COURSES.map((c) => picks.map(getDish).find((d) => d.course === c)!).filter(Boolean);
}

export function shareText(picks: string[], restaurantName: string, url: string): string {
  const spent = picks.reduce((s, id) => s + getDish(id).costCents, 0);
  const name = restaurantName.trim() || 'My restaurant';
  const lines = orderedDishes(picks).map(
    (d) => `${COURSE_LABEL[d.course]}: ${d.name} (${formatMoney(d.costCents)}, ★${formatRating(d.ratingTenths)})`,
  );
  return [
    `${name}: opening night`,
    `★ ${formatStars(scoreHundredths(picks))} / 5 · spent ${formatMoney(spent)} of ${formatMoney(catalog.config.budgetCents)}`,
    ...lines,
    `${catalog.gameTitle} by ${catalog.studio}`,
    url,
  ].join('\n');
}

/** The same course illustration the game shows for dishes without art, as an image URL. */
function placeholderSrc(course: Course): string {
  const host = document.createElement('div');
  const root = createRoot(host);
  flushSync(() => root.render(createElement(CoursePlaceholder, { course })));
  const svg = host.innerHTML;
  root.unmount();
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Draws a share card from the actual menu and score. */
export async function shareImage(picks: string[], restaurantName: string): Promise<Blob | null> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  try {
    // Weights only the card uses aren't loaded by the page, so request them explicitly.
    await Promise.all(['800 140px Inter', '700 76px Fraunces', '600 40px Fraunces'].map((f) => document.fonts.load(f)));
    await document.fonts?.ready;
  } catch {
    /* ignore */
  }
  const serif = '"Fraunces", Georgia, serif';
  const sans = '"Inter", system-ui, sans-serif';

  ctx.fillStyle = '#f6efe3';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#5a2343';
  ctx.fillRect(0, 0, W, 16);
  ctx.fillRect(0, H - 16, W, 16);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#5a2343';
  ctx.font = `600 34px ${sans}`;
  ctx.fillText(catalog.gameTitle.toUpperCase(), W / 2, 92);
  ctx.font = `700 76px ${serif}`;
  ctx.fillStyle = '#3a1a2c';
  const name = restaurantName.trim() || 'Opening night';
  ctx.fillText(name.length > 26 ? name.slice(0, 25) + '…' : name, W / 2, 188);

  const score = formatStars(scoreHundredths(picks));
  ctx.font = `800 140px ${sans}`; // Fraunces turns hairline-thin at display sizes
  ctx.fillStyle = '#b8323a';
  ctx.fillText(score, W / 2 - 40, 355);
  ctx.font = `600 56px ${sans}`;
  ctx.fillStyle = '#6d5a62';
  ctx.fillText('/ 5', W / 2 + 170, 355);

  const spent = picks.reduce((s, id) => s + getDish(id).costCents, 0);
  ctx.font = `500 34px ${sans}`;
  ctx.fillText(
    `Spent ${formatMoney(spent)} of ${formatMoney(catalog.config.budgetCents)} · ${formatMoney(catalog.config.budgetCents - spent)} saved`,
    W / 2,
    420,
  );

  const dishes = orderedDishes(picks);
  const [imgs, placeholders] = await Promise.all([
    Promise.all(dishes.map((d) => (d.imageSrc ? loadImage(BASE + d.imageSrc) : Promise.resolve(null)))),
    Promise.all(dishes.map((d) => loadImage(placeholderSrc(d.course)))),
  ]);
  const rowH = 160;
  let y = 480;
  dishes.forEach((d, i) => {
    ctx.fillStyle = '#fffaf2';
    roundRect(ctx, 70, y, W - 140, rowH - 18, 28);
    ctx.fill();
    const img = imgs[i];
    const cx = 160;
    const cy = y + (rowH - 18) / 2;
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 62, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, cx - 72, cy - 72, 144, 144);
      ctx.restore();
    } else if (placeholders[i]) {
      // Real art failed or doesn't exist yet: draw the course illustration, as in the game.
      ctx.drawImage(placeholders[i]!, cx - 72, cy - 72, 144, 144);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, 58, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e3dbcf';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#c7a98a';
      ctx.font = `700 40px ${serif}`;
      ctx.textAlign = 'center';
      ctx.fillText(COURSE_LABEL[d.course][0], cx, cy + 14);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8a7480';
    ctx.font = `600 26px ${sans}`;
    ctx.fillText(COURSE_LABEL[d.course].toUpperCase(), 250, cy - 16);
    ctx.fillStyle = '#2b1a22';
    ctx.font = `600 40px ${serif}`;
    ctx.fillText(d.name, 250, cy + 32);
    ctx.textAlign = 'right';
    ctx.font = `700 36px ${sans}`;
    ctx.fillText(formatMoney(d.costCents), W - 230, cy + 14);
    ctx.fillStyle = '#c8901f';
    ctx.fillText(`★ ${formatRating(d.ratingTenths)}`, W - 100, cy + 14);
    y += rowH;
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = '#8a7480';
  ctx.font = `500 28px ${sans}`;
  ctx.fillText(`by ${catalog.studio} · fictional prices and ratings`, W / 2, H - 52);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export type ShareOutcome = 'shared' | 'cancelled' | 'unsupported';

export async function nativeShare(text: string, image: Blob | null): Promise<ShareOutcome> {
  if (typeof navigator.share !== 'function') return 'unsupported';
  try {
    if (image) {
      const file = new File([image], 'my-opening-night-menu.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ text, files: [file] });
        return 'shared';
      }
    }
    await navigator.share({ text });
    return 'shared';
  } catch (e) {
    return (e as Error)?.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
