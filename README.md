# 5-Star Chef Restaurant

A mobile-first web game by 5 Star Studios. You have $50 per guest to build a five-course opening-night dinner. Each turn, Chef Mia's "Today's inspiration" shows a cuisine and an ingredient; you pick a matching dish for any open course. After five picks, the restaurant's rating is the plain average of the five dish ratings.

Built from `5-Star-Chef-Restaurant-Claude-Code-Brief.md` (catalog `chef-v2-2026-11-08`).

## Run, test, build

Node is at `C:\Program Files\nodejs` on this machine and isn't on PATH by default.

```bash
npm install
npm run dev        # http://localhost:5173 (the games folder's .claude/launch.json runs it on port 5175)
npm test           # engine + catalog tests (vitest)
npm run build      # typecheck + production build into docs/ (what Pages serves)
npm run preview    # serve the production build
```

The build uses a relative base (`./`), so `docs/` works at the domain root and at the github.io project path.

**Live:** https://starchefmia.com (GitHub Pages from `main:/docs` in [xnxnxn972/starchefmia](https://github.com/xnxnxn972/starchefmia)). `docs/` is the committed build output: run `npm run build` and commit `docs/` before pushing.

## Layout

| Path | What it is |
|---|---|
| `src/data/chef-catalog.json` | **Catalog source of truth**: 90 dishes, 6 cuisines, 25 ingredients and 91 supported pairs. The only change from the starter is `imageSrc`/`artStatus` on the 10 dishes that now have art. |
| `src/data/catalog-validation.json` | Starter fixtures (sample run 4.48, perfect menu 5.00). The tests check against them. |
| `src/engine/` | Pure engine with no DOM or timers: `catalog.ts` (types, indexes, validation), `engine.ts` (rules, offers, scoring, restore checks), `rng.ts` (seeded mulberry32), `persist.ts` (localStorage). |
| `src/engine/engine.test.ts` | Tests (see below). |
| `src/App.tsx` | Phase state machine (reducer) plus turn timers. |
| `src/components/` | Table, Inspiration (the two label drums), Offers, Results, Dialogs. |
| `src/art/` | Course placeholders (fallback only), empty plates, flags, ingredient icons. |
| `src/config.ts` | `CHEF_NAME` and all timings. |
| `src/copy.ts` | Mia's state-based lines, reserve messages and announcements. |
| `public/dishes/` | Dish art for all 90 dishes (transparent WebP, 512×512). |
| `references/` | Original concept boards. Not loaded at runtime. |

## How the rules are implemented

- **Budget**: integer cents. A dish is legal only if `cost + Σ(cheapest catalog dish for each other open course) ≤ remaining`. The engine checks this again on confirm. If a dish fits your cash but breaks this reserve, it shows as disabled with "Keep $X for your remaining N courses."
- **Offers**: each turn picks one supported pair. It prefers pairs with at least 2 legal dishes across at least 2 different open courses, then pairs with at least 2 legal dishes, and only then a single legal dish. The offer lists every matching dish for the open courses (3 at first, "Show all N" for the rest). Dishes the reserve blocks are listed, disabled, with the reason.
- **Turn flow**: `choosing → (confirm) serving → revealing → choosing`; the fifth pick goes `serving → results`. The purchase **and** the next offer are computed together in one reducer step and saved *before* any animation. Timers only move the phase forward, and those steps do nothing if repeated. So a double click, StrictMode double effects, a refresh during a reveal, or a refresh mid-serve never charges twice or re-draws. Preview, help, settings, resizing and refocus don't touch the engine state.
- **Restore**: on load, the saved run is checked against the catalog version, the purchases, the money spent and the offer's legality. If any check fails, the title screen offers a clean new run with a notice; dishes are never quietly swapped.
- **Score**: `sum(ratingTenths) × 2` hundredths, shown to two decimals (`4.48 / 5`). Money saved is shown separately and doesn't change the score. Mia's lines come only from the game state and never affect scoring.
- **Personal best**: stored locally (stars first, then money saved).
- **Sharing**: `navigator.share` with a PNG card made from your real menu, when the browser supports it. Otherwise the game shows **Copy text** and **Download image**. The card shows the real dishes, prices and score only: no reviews, rankings or percentiles. The share text (`src/shareText.ts`) is four short lines: name and score, a Wordle-style emoji row of the five courses in menu order, one sentence saying what the game is plus the "Can you beat my menu?" challenge, and `https://starchefmia.com/?s=share`. The full menu stays in the picture card, and the link's preview card shows the game.

## Tests performed

Automated (`npm test`, 12 tests):
- Catalog validates: unique IDs, known ingredients and cuisines, every course covered, positive integer costs, ratings 3.0–5.0, and every pair's dishes match their cuisine and tag. Counts match `catalog-validation.json`, and every `imageSrc` file exists.
- Fixtures: the sample run is $46 / 4.48 and the perfect menu is $50 / 5.00. The sample run can also be bought in the brief's order under the reserve rule.
- Start gives exactly one revealing offer for pick 1. The same seed and the same purchases reproduce the same run. Purchases during a reveal, duplicate purchases and stale double confirms are all rejected. Main and Dessert can each be bought first. The reserve message carries the right amount. Restore rejects a wrong version, a tampered spend or unknown dishes.
- Simulation: 3,000 seeded runs mixing random, highest-rating and cheapest strategies. None hit an empty pool, none went into negative money, and every run filled five different courses.

Manual, in the browser at 390×844, 360×740, 1280×800 and an ~800px-wide short landscape window:
- Full five-pick run: a triple-clicked Serve charged once, and the fifth pick went straight to results with no sixth reveal.
- Refresh during a reveal kept the same offer and RNG position. Refresh right after Serve charged exactly once and resumed at the next reveal.
- An old catalog version in storage showed the "couldn't be restored" notice. Reduced motion skips the label strip, and the reveal settles in about 120 ms.
- Share without `navigator.share` showed the copy/download fallback. The PNG card is generated at 1080×1350.
- No horizontal overflow at any width tested, and no console errors.

Not tested: real iOS/Android devices, native share sheets, or a screen reader end to end. Live regions, labels and focus handling are in place but haven't been checked with VoiceOver or TalkBack.

## Art coverage

- **All 90 dishes have production art** (5 Star Studios dish art v1, 8 Nov 2026). Each was generated on its own as a transparent cutout with its plate or bowl. The originals were 1254×1254 RGBA PNGs (about 1.4 MB each, 123 MB in total). The game ships them as **512×512 WebP with alpha** in `public/dishes/<id>.webp`, about 44 KB each and 3.9 MB for all 90. The browser loads them lazily, only when a dish appears.
- The art fields in the catalog (`imageSrc`, `imageAlt`, `imagePrompt`, `artStatus`) come from the art package's catalog. `imageSrc` stays relative (`dishes/<id>.webp`, not the package's `/assets/...`) so the GitHub Pages subfolder works. All other gameplay data is unchanged.
- `references/asset-manifest.json` (hashes and sizes of the source PNGs) and `references/generation-prompts.json` are kept so future art can match the style. The source PNGs aren't in the repo.
- The course placeholders in `src/art/FoodArt.tsx` are kept only as a fallback if an image fails to load. Unfilled courses still show an empty plate.
- **Chef Mia and the restaurant** come from one painted background (`public/scene/table-mia.webp`, 1024×1536, plus a 640px version for 1× screens). The wall and Mia fill the top 33.4% of the image, and the table edge sits exactly there; the plates sit on the painted linen. Her speech bubble and name tag are live HTML placed over the wall. Her mood (welcome, curious, thoughtful, serving, celebrate) now shows only through what she says and the bubble's style, since the painting has a single pose.
- To replace a dish's art: export a square transparent PNG and convert it to 512×512 WebP at quality 82, saved over `public/dishes/<id>.webp`.

## Leaderboards

- **Four boards:** Today, This week, This month and All time, all in UTC (day from midnight, week from Monday, month from the 1st). Modelled on Chasing P1's weekly board. SQL: [`supabase/starchef-leaderboard.sql`](supabase/starchef-leaderboard.sql). It's generated: edit `supabase/starchef-leaderboard.template.sql`, then run `python tools/gen_board_sql.py .` to refresh the dish rows from the catalog.
- **One entry per player per board:** a player is a browser (`sc.board.player.v1`), shown by its restaurant name, and each board keeps the player's best score in that window. Ties go to whoever posted first. Names are unique (case-insensitive) and stay with the first player to post them; posting under a new name renames that player's entry.
- **Opt-in:** players post from the results screen ("Your 4.52 would place #2 today" → Post as <name>). The title screen has a read-only Leaderboard dialog. Client code is in `src/board.ts` and `src/components/Leaderboard.tsx`. Every call fails quietly, and an unreachable board just doesn't show.
- **Scores can't be faked:** the browser sends the five dish ids, and `sc_board_post` checks five different courses within $50, then computes the score from `sc_dishes`. Offensive names are blocked with the same list as Chasing P1. `env = 'dev'` (localhost) stays off the public boards, and `player_id` is never returned.
- **Moderation:** `sc_board_admin(token, days)` lists posts with names (Chasing P1 admin token). Removal SQL is at the bottom of the SQL file.

## Sound

- **The reveal sound** (`src/sound.ts`) is a kitchen-timer dial: six soft clicks that slow down with the rolling labels, then a tiny "tink" as the inspiration settles. It's synthesised with Web Audio, so there are no audio files.
- **On by default.** The speaker button in the top bar (or Settings, then Sound effects) mutes it, and the choice is remembered (`muted` in prefs). Mute toggles are logged as `meta.sound_muted`.
- **When it plays:** only for reveals the player caused (Start cooking, Serve). It doesn't play for a game restored on load or with reduced motion, and it respects the iPhone silent switch (`audioSession` is set to `ambient`). Browsers allow audio only after a tap, so `unlockAudio()` runs on those taps.

## Search and link previews

- **Pre-rendered HTML:** `npm run build` ends with `tools/prerender.mjs`, which renders the title screen (`src/prerender.tsx`) into `docs/index.html`. Crawlers and link previews get real text without running JavaScript: the headline, the Start button, the sample table and an About section with how to play and what's in the game. `main.tsx` then renders the same screen over it. Keep the About text true to the game.
- **Head** (`index.html`): keyword-bearing title (60 characters) and description, canonical `https://starchefmia.com/`, Open Graph and Twitter tags with `public/og-image.jpg` (1200×630), and JSON-LD for `WebSite` and `VideoGame`/`WebApplication` (free, browser, single player).
- **Crawl files:** `public/robots.txt` points to `public/sitemap.xml`; the prerender step stamps the sitemap's `lastmod` on each build. `public/404.html` is a branded "not found" page marked `noindex`. `favicon.ico` is included for crawlers that ask for it.
- **Speed:**
  - The painted scene is preloaded, with the same screen-density rule as the CSS so only one size downloads.
  - Google Fonts load without blocking the first paint.
  - Dish photos come in 256px (`public/dishes/sm/`) and 512px versions, chosen by `srcset`/`sizes`.
  - The art prompts are stripped from the shipped catalog by a plugin in `vite.config.ts`.
- **Not controllable on GitHub Pages:** cache headers (10 minutes on every file). The service worker covers repeat visits.

## Installable app (PWA)

- **Manifest:** `public/manifest.webmanifest` sets the name "Star Chef", standalone display and portrait orientation. Its start address is `./?s=pwa`, so every launch from the home screen arrives tagged.
- **Icons:** cropped from Chef Mia's portrait in the scene art: 192, 512, a maskable 512 for Android shapes, the 180px apple-touch-icon and a favicon.
- **Offline play:** `docs/sw.js` is generated at build time from `sw-template.js` by a small plugin in `vite.config.ts`, which stamps it with that release's version and file list.
  - **Page:** network first, so a new release appears at once.
  - **App shell** (code, scene art, icons): precached on install.
  - **Dish photos:** cached as they appear rather than precached, and refreshed in the background.
  - **Google Fonts:** cached after first use.
  - **Supabase calls:** never intercepted.
  - **Offline fallback:** an uncached dish shows its course illustration.
- **In the play log:** a home-screen launch starts a new visit tagged `src: pwa`; the dashboard counts it as "Home-screen app". Any arrival through a differently tagged link starts a new visit too, as analytics tools do. Installs seen on Chrome, Edge and Android (`appinstalled`) are flagged as `meta.installed` on the next game; iOS doesn't report installs.

## Play log and dashboard

Modelled on Chasing P1's telemetry, in the same shared Supabase project.

- **Tables:** `sc_games` has one row per game (five picks), updated as the game goes: picks, finished, score, spend, share outcome. `sc_loads` has one row per arrival, so people who land and leave are counted. Schema and functions are in [`supabase/starchef-telemetry.sql`](supabase/starchef-telemetry.sql); run it in the Supabase SQL editor (safe to re-run).
- **Client:** [`src/telemetry.ts`](src/telemetry.ts). It never blocks the game and fails silently. It sends no IP and makes no location lookup; country is read server-side from Cloudflare's header. Nothing the player types is sent (a restaurant name is logged only as `named: true/false`). Bots, local files and previews are skipped.
- **Excluding your own testing:** open `https://starchefmia.com/?dev=1` once in every browser you test with (`?dev=0` undoes it). `?tel=force` forces logging from an automated browser to verify the write path.
- **Visits:** a visit is a sitting that ends after 30 idle minutes. A refreshed game keeps its own row (the id comes from the run's seed). A persistent `player_id` in localStorage gives returning players.
- **Sources:** links inside shared menus carry `?s=share`, because WhatsApp and iMessage strip the referrer. Any `?s=`, `utm_*`, `src` or `ref` tag is recorded, so a post can use its own tag (for example `?s=reddit`).
- **Dashboard:** `npm run dashboard` writes `dashboard.html` and `dashboard.data.json`, both gitignored. Reads use the Chasing P1 admin token (`public.cp_admin`), taken from `SC_TOKEN`, `.sc-token` or `../chasing-p1/.cp1-token`.

## Not in this version (by design)

No spin/reroll controls, no backend or accounts, no daily challenge or leaderboard.
