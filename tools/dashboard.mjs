/**
 * 5-Star Chef Restaurant — build the analytics dashboard.
 *
 *   npm run dashboard            (token from SC_TOKEN, .sc-token, or ../chasing-p1/.cp1-token)
 *
 * Fetches sc_games and sc_loads through the token-protected admin functions,
 * aggregates them, and writes dashboard.html (self-contained, numbers baked in)
 * and dashboard.data.json. Both are gitignored. Publish dashboard.html to the
 * same Artifact URL each time.
 *
 * Why baked in: a published Artifact cannot fetch Supabase (CSP), and a live
 * page would have to carry the admin token.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE_URL = 'https://hmvxanqkorcfxwsdusuj.supabase.co';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtdnhhbnFrb3JjZnh3c2R1c3VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjI4OTgsImV4cCI6MjA5NTI5ODg5OH0.7o7OnhikQdgApqPTEIbhjOZ-YcKDU1fBFpcLXPXtEtA';
const PAGE = 1000;
const DISH_NAME = new Map(
  JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'chef-catalog.json'), 'utf8')).dishes.map((d) => [d.id, `${d.name} (${d.cuisine})`]),
);
const MAX_PAGES = 200;

function readToken() {
  if (process.env.SC_TOKEN) return process.env.SC_TOKEN.trim();
  for (const f of [join(ROOT, '.sc-token'), join(ROOT, '..', 'chasing-p1', '.cp1-token')]) {
    if (existsSync(f)) return readFileSync(f, 'utf8').trim();
  }
  return null;
}

async function fetchAll(fn, token) {
  const rows = [];
  let before = null;
  let truncated = true;
  for (let i = 0; i < MAX_PAGES; i++) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ p_token: token, p_limit: PAGE, p_before: before }),
    });
    if (!res.ok) throw new Error(`${fn}: HTTP ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) {
      truncated = false;
      break;
    }
    before = page[page.length - 1].created_at;
  }
  return { rows, truncated };
}

/* ---------- classification ---------- */

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|yandex|baidu|startpage|qwant|brave|naver|seznam)\./i;
const SOCIAL = [
  [/facebook\.|fb\.|messenger\./i, 'Facebook'],
  [/instagram\./i, 'Instagram'],
  [/(^|\.)t\.co$|twitter\.|(^|\.)x\.com$/i, 'X / Twitter'],
  [/reddit\./i, 'Reddit'],
  [/tiktok\./i, 'TikTok'],
  [/linkedin\.|lnkd\.in/i, 'LinkedIn'],
  [/youtube\.|youtu\.be/i, 'YouTube'],
  [/pinterest\./i, 'Pinterest'],
  [/whatsapp\./i, 'WhatsApp'],
  [/threads\.net/i, 'Threads'],
];
const BOT_REF = /semrush|ahrefs|crawler|spider|bot\./i;
const OWN = /starchefmia\.com$|xnxnxn972\.github\.io$|localhost$/i;

function host(ref) {
  try {
    return new URL(ref).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Channel + detail for one arrival. Link tags beat the referrer: they survive chat apps. */
function classify(referrer, meta = {}) {
  const src = (meta.src || meta.utm_source || '').toLowerCase();
  if (src === 'share') return ['Shared menu', 'share link'];
  if (src) return ['Tagged link', src];
  if (meta.display === 'standalone') return ['Home-screen app', 'standalone'];
  const h = referrer ? host(referrer) : null;
  if (!h || OWN.test(h)) return ['Direct / unknown', 'no referrer'];
  if (SEARCH.test(h + '.')) return ['Search', h.split('.').slice(-2, -1)[0] || h];
  for (const [re, name] of SOCIAL) if (re.test(h)) return ['Social', name];
  return ['Other sites', h];
}

const regionName = (() => {
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    return (c) => (c ? dn.of(c) || c : 'Unknown');
  } catch {
    return (c) => c || 'Unknown';
  }
})();

/* ---------- aggregation ---------- */

function countBy(items, key) {
  const m = new Map();
  for (const it of items) {
    const k = key(it);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function top(entries, n) {
  if (entries.length <= n) return entries;
  const rest = entries.slice(n).reduce((s, [, v]) => s + v, 0);
  return [...entries.slice(0, n), ['Other', rest]];
}

const day = (iso) => iso.slice(0, 10);
const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// SC_INCLUDE_DEV=1 includes our own localhost test rows: only for checking the layout.
const INCLUDE_DEV = process.env.SC_INCLUDE_DEV === '1';

function aggregate(games, loads) {
  const envOk = (r) => r.env === 'prod' || INCLUDE_DEV;
  const g = games.filter((r) => envOk(r) && !BOT_REF.test(r.referrer || ''));
  const l = loads.filter((r) => envOk(r) && !r.webdriver && !BOT_REF.test(r.referrer || ''));

  const loadByVisit = new Map(l.map((r) => [r.visit_id, r]));
  const gamesByVisit = new Map();
  for (const r of g) {
    if (!gamesByVisit.has(r.visit_id)) gamesByVisit.set(r.visit_id, []);
    gamesByVisit.get(r.visit_id).push(r);
  }

  // A visit = an arrival, or a sitting we only know from its games (load lost / blocked).
  const visitIds = new Set([...loadByVisit.keys(), ...gamesByVisit.keys()]);
  const visits = [...visitIds].map((id) => {
    const load = loadByVisit.get(id);
    const vg = gamesByVisit.get(id) || [];
    const first = load || vg.slice().sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    const [channel, detail] = classify(first.referrer, first.meta || {});
    return {
      id,
      at: first.created_at,
      country: first.country || vg.find((x) => x.country)?.country || null,
      device: first.device || 'unknown',
      platform: first.platform || 'unknown',
      channel,
      detail,
      games: vg.length,
      finished: vg.filter((x) => x.finished).length,
      shared: vg.some((x) => x.shared),
    };
  });

  const playing = visits.filter((v) => v.games > 0);
  const finished = g.filter((r) => r.finished);
  const activeS = g.map((r) => Number(r.meta?.active_s) || 0);
  const scores = finished.map((r) => r.score_hundredths).filter((x) => Number.isFinite(x));

  const days = [];
  if (visits.length || g.length) {
    const allDays = [...visits.map((v) => day(v.at)), ...g.map((r) => day(r.created_at))].sort();
    for (let d = new Date(allDays[0] + 'T00:00:00Z'); day(d.toISOString()) <= allDays[allDays.length - 1]; d.setUTCDate(d.getUTCDate() + 1))
      days.push(day(d.toISOString()));
  }
  const perDay = (rows, at) => {
    const m = new Map(days.map((d) => [d, 0]));
    for (const r of rows) m.set(day(at(r)), (m.get(day(at(r))) || 0) + 1);
    return days.map((d) => [d, m.get(d) || 0]);
  };

  const gpv = countBy(playing, (v) => (v.games >= 5 ? '5+' : String(v.games)));
  const gpvOrdered = ['1', '2', '3', '4', '5+'].map((k) => [k, gpv.find(([x]) => x === k)?.[1] || 0]);

  const dishCounts = countBy(
    g.flatMap((r) => (Array.isArray(r.meta?.dishes) ? r.meta.dishes : [])),
    (x) => DISH_NAME.get(x) || x,
  );

  const scoreBins = new Map();
  for (const s of scores) {
    const b = (Math.floor(s / 10) / 10).toFixed(1);
    scoreBins.set(b, (scoreBins.get(b) || 0) + 1);
  }
  const binKeys = scores.length
    ? Array.from({ length: Math.round((Math.floor(Math.max(...scores) / 10) - Math.floor(Math.min(...scores) / 10))) + 1 }, (_, i) =>
        ((Math.floor(Math.min(...scores) / 10) + i) / 10).toFixed(1),
      )
    : [];

  const returning = g.filter((r) => Number(r.meta?.player_visits) > 1).length;
  const players = new Set(g.map((r) => r.meta?.player_id).filter(Boolean)).size;

  return {
    totals: {
      arrivals: l.length,
      visits: visits.length,
      playingVisits: playing.length,
      bounceRate: visits.length ? 1 - playing.length / visits.length : 0,
      games: g.length,
      finishedGames: finished.length,
      finishRate: g.length ? finished.length / g.length : 0,
      gamesPerPlayingVisit: playing.length ? g.length / playing.length : 0,
      medianActiveS: median(activeS.filter((x) => x > 0)),
      hoursPlayed: activeS.reduce((s, x) => s + x, 0) / 3600,
      avgScore: scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length / 100 : null,
      sharedGames: g.filter((r) => r.shared).length,
      players,
      returningGameShare: g.length ? returning / g.length : 0,
    },
    funnel: [
      ['Arrived', visits.length],
      ['Started a game', playing.length],
      ['Finished a game', visits.filter((v) => v.finished > 0).length],
      ['Shared a menu', visits.filter((v) => v.shared).length],
    ],
    perDayVisits: perDay(visits, (v) => v.at),
    perDayGames: perDay(g, (r) => r.created_at),
    gamesPerVisit: gpvOrdered,
    channels: countBy(visits, (v) => v.channel),
    sourceDetail: top(countBy(visits.filter((v) => v.channel !== 'Direct / unknown'), (v) => `${v.channel}: ${v.detail}`), 12),
    countries: top(countBy(visits, (v) => regionName(v.country)), 15),
    devices: countBy(visits, (v) => v.device),
    platforms: countBy(visits, (v) => v.platform),
    shareResults: countBy(g.filter((r) => r.share_result), (r) => r.share_result),
    scoreHistogram: binKeys.map((k) => [k, scoreBins.get(k) || 0]),
    topDishes: top(dishCounts, 10).filter(([k]) => k !== 'Other'),
  };
}

/* ---------- rendering ---------- */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pct = (x) => `${Math.round(x * 100)}%`;

function barList(title, entries, { total, note } = {}) {
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const sum = total ?? entries.reduce((s, [, v]) => s + v, 0);
  const rows = entries.length
    ? entries
        .map(
          ([k, v]) => `<li title="${esc(k)}: ${v} (${sum ? pct(v / sum) : '0%'})">
        <span class="bl-label">${esc(k)}</span>
        <span class="bl-track"><span class="bl-bar" style="width:${(v / max) * 100}%"></span></span>
        <span class="bl-val">${v}<small>${sum ? pct(v / sum) : ''}</small></span></li>`,
        )
        .join('')
    : '<li class="empty">No data yet</li>';
  return `<section class="card"><h2>${esc(title)}</h2>${note ? `<p class="note">${esc(note)}</p>` : ''}<ul class="barlist">${rows}</ul></section>`;
}

function columnChart(title, entries, { note, fmtLabel = (k) => k } = {}) {
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const cols = entries.length
    ? entries
        .map(
          ([k, v]) => `<div class="col" title="${esc(k)}: ${v}">
        <span class="col-val">${v || ''}</span>
        <span class="col-bar" style="height:${(v / max) * 100}%"></span>
        <span class="col-label">${esc(fmtLabel(k))}</span></div>`,
        )
        .join('')
    : '<p class="empty">No data yet</p>';
  return `<section class="card wide"><h2>${esc(title)}</h2>${note ? `<p class="note">${esc(note)}</p>` : ''}<div class="cols">${cols}</div></section>`;
}

function tile(label, value, sub = '') {
  return `<div class="tile"><span class="tile-label">${esc(label)}</span><span class="tile-value">${esc(value)}</span>${sub ? `<span class="tile-sub">${esc(sub)}</span>` : ''}</div>`;
}

function render(d, meta) {
  const t = d.totals;
  const shortDay = (k) => k.slice(5);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Star Chef Dashboard</title>
<style>
:root{--bg:#f7f1ea;--card:#fffdf9;--ink:#2b1a22;--ink2:#6d5a62;--line:#e6d9c8;--bar:#5a2343;--track:#efe5d8;--warn:#9a5b00}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#1b1418;--card:#261c22;--ink:#f3e9ee;--ink2:#b9a6af;--line:#3a2c33;--bar:#d58ab2;--track:#33262d;--warn:#f0b35a}}
:root[data-theme="dark"]{--bg:#1b1418;--card:#261c22;--ink:#f3e9ee;--ink2:#b9a6af;--line:#3a2c33;--bar:#d58ab2;--track:#33262d;--warn:#f0b35a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.4 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1100px;margin:0 auto;padding:20px 16px 40px}
h1{font:700 1.6rem Georgia,serif;margin:0}h2{font-size:.95rem;margin:0 0 10px}
.meta{color:var(--ink2);font-size:.85rem;margin:4px 0 16px}.banner{border:1px solid var(--warn);color:var(--warn);padding:8px 12px;border-radius:10px;margin-bottom:12px}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:14px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:2px}
.tile-label{font-size:.78rem;color:var(--ink2)}.tile-value{font-size:1.55rem;font-weight:700;font-variant-numeric:tabular-nums}.tile-sub{font-size:.75rem;color:var(--ink2)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;min-width:0}.card.wide{grid-column:1/-1}
.note{color:var(--ink2);font-size:.8rem;margin:-4px 0 10px}
.barlist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:7px}
.barlist li{display:grid;grid-template-columns:minmax(90px,38%) 1fr auto;align-items:center;gap:8px;font-size:.85rem;border-radius:6px}
.barlist li:hover{background:var(--track)}
.bl-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bl-track{height:10px;background:var(--track);border-radius:0 4px 4px 0}
.bl-bar{display:block;height:100%;background:var(--bar);border-radius:0 4px 4px 0;min-width:2px}
.bl-val{font-variant-numeric:tabular-nums;font-weight:600;text-align:right;min-width:64px}.bl-val small{color:var(--ink2);font-weight:400;margin-left:6px}
.cols{display:flex;align-items:flex-end;gap:2px;height:180px;padding-top:18px;overflow-x:auto}
.col{flex:1 0 18px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;position:relative}
.col:hover .col-bar{opacity:.75}.col-bar{width:70%;max-width:34px;background:var(--bar);border-radius:4px 4px 0 0;min-height:1px}
.col-val{font-size:.7rem;color:var(--ink2);font-variant-numeric:tabular-nums}.col-label{font-size:.65rem;color:var(--ink2);margin-top:4px;white-space:nowrap}
.empty{color:var(--ink2);font-size:.85rem}
footer{color:var(--ink2);font-size:.75rem;margin-top:18px}
</style></head><body><main>
<h1>Star Chef Dashboard</h1>
<p class="meta">starchefmia.com · generated ${esc(meta.generatedAt)} UTC · ${meta.games} game rows, ${meta.loads} arrival rows (${INCLUDE_DEV ? 'INCLUDING DEV TEST ROWS' : 'production only; bots and our own ?dev=1 browsers excluded'})</p>
${meta.truncated ? '<p class="banner">Row cap reached: some older rows were not fetched. Numbers undercount.</p>' : ''}
<div class="tiles">
${tile('Visits', t.visits, `${t.arrivals} arrivals logged`)}
${tile('Started a game', t.playingVisits, `${pct(1 - t.bounceRate)} of visits`)}
${tile('Games played', t.games, `${t.finishedGames} finished · ${pct(t.finishRate)}`)}
${tile('Games per visit', t.gamesPerPlayingVisit.toFixed(2), 'visits that played')}
${tile('Time per game', `${Math.round(t.medianActiveS)}s`, 'median, tab visible')}
${tile('Hours played', t.hoursPlayed.toFixed(1))}
${tile('Average score', t.avgScore == null ? '–' : t.avgScore.toFixed(2), 'finished games')}
${tile('Shares', t.sharedGames, t.games ? `${pct(t.sharedGames / t.games)} of games` : '')}
${tile('Players', t.players, `${pct(t.returningGameShare)} of games by returning players`)}
</div>
<div class="grid">
${columnChart('Visits per day', d.perDayVisits, { fmtLabel: shortDay, note: 'UTC days' })}
${columnChart('Games per day', d.perDayGames, { fmtLabel: shortDay })}
${barList('Funnel (visits)', d.funnel, { total: d.funnel[0][1] })}
${columnChart('Games per visit', d.gamesPerVisit, { note: 'Visits that started at least one game' })}
${barList('Traffic sources', d.channels, { note: 'Shared menus are tagged ?s=share; chat apps send no referrer' })}
${barList('Source detail', d.sourceDetail)}
${barList('Countries', d.countries, { note: 'From the request (Cloudflare), no IP stored' })}
${barList('Devices', d.devices)}
${barList('Platforms', d.platforms)}
${barList('Share outcomes', d.shareResults, { note: 'Per game; "cancelled" = share sheet closed' })}
${columnChart('Final scores', d.scoreHistogram, { note: 'Finished games, by 0.1 star' })}
${barList('Most-served dishes', d.topDishes, { note: 'Every course served, all games' })}
</div>
<footer>Visit = one sitting (ends after 30 idle minutes). Visits known only from games (arrival not logged) are included.</footer>
</main></body></html>`;
}

/* ---------- main ---------- */

const token = readToken();
if (!token) {
  console.error('No admin token. Set SC_TOKEN, or create .sc-token (gitignored). It is the Chasing P1 token: select token from public.cp_admin where id = 1;');
  process.exit(1);
}
let gamesRes, loadsRes;
try {
  [gamesRes, loadsRes] = await Promise.all([fetchAll('sc_games_admin', token), fetchAll('sc_loads_admin', token)]);
} catch (e) {
  const msg = String(e.message || e);
  console.error(
    /PGRST202|schema cache/.test(msg)
      ? 'The sc_* functions are not in Supabase yet: run supabase/starchef-telemetry.sql in the SQL editor first.'
      : /not authorised/.test(msg)
        ? 'Admin token rejected. It must match public.cp_admin (the Chasing P1 token).'
        : msg,
  );
  process.exitCode = 1;
}
if (gamesRes && loadsRes) {
const data = aggregate(gamesRes.rows, loadsRes.rows);
const meta = {
  generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
  games: gamesRes.rows.length,
  loads: loadsRes.rows.length,
  truncated: gamesRes.truncated || loadsRes.truncated,
};
writeFileSync(join(ROOT, 'dashboard.data.json'), JSON.stringify({ meta, ...data }, null, 2));
writeFileSync(join(ROOT, 'dashboard.html'), render(data, meta));
console.log(
  `fetched ${meta.games} game rows, ${meta.loads} arrival rows${meta.truncated ? ' (TRUNCATED)' : ''} -> ${data.totals.visits} visits, ${data.totals.games} games, ${data.totals.finishedGames} finished`,
);
}
