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
- **Sharing**: `navigator.share` with a PNG card made from your real menu, when the browser supports it. Otherwise the game shows **Copy text** and **Download image**. The card shows the real dishes, prices and score only: no reviews, rankings or percentiles.

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

## Not in this version (by design)

No spin/reroll controls, no audio (the settings say so), no backend or accounts, no daily challenge or leaderboard.
