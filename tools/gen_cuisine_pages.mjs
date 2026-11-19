/**
 * Static, crawlable cuisine pages: public/cuisine/<slug>/index.html (6 pages), plus their
 * entries in public/sitemap.xml. Runs before `vite build` (see package.json), which copies
 * public/ into docs/. Every number on these pages is computed from src/data/chef-catalog.json,
 * so the pages can never disagree with the game.
 *
 * Links into the game carry ?s=cuisine_<slug> so the dashboard credits these pages.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SITE = 'https://starchefmia.com';
const catalog = JSON.parse(readFileSync('src/data/chef-catalog.json', 'utf8'));
const BUDGET = catalog.config.budgetCents;
const COURSES = ['appetizer', 'soup', 'salad', 'main', 'dessert'];
const COURSE_LABEL = { appetizer: 'Appetizer', soup: 'Soup', salad: 'Salad', main: 'Main course', dessert: 'Dessert' };
const COURSE_PLURAL = { appetizer: 'Appetizers', soup: 'Soups', salad: 'Salads', main: 'Main courses', dessert: 'Desserts' };

/** Hand-written intros: one true paragraph per cuisine about its dishes in the game. */
const INTRO = {
  Italian:
    'From crisp tomato bruschetta to coffee-soaked tiramisu, the Italian kitchen in 5-Star Chef Restaurant is built on tomato, lemon, mushroom and slow-cooked beef. Its best dishes are expensive: the braised beef costs almost half the budget, so an Italian five-star dinner is a lesson in where to splurge.',
  French:
    'The French menu leans on cream, cheese, mushrooms and butter: gougères, French onion soup, a silky mushroom velouté and a classic beef bourguignon. The chocolate mousse is the secret weapon, a perfect 5.0 dessert that costs less than the crème brûlée.',
  Japanese:
    'Japanese dishes in the game run from edamame and miso soup to glazed salmon teriyaki and mochi. The standout is the spinach sesame salad: a 5.0 rating for just $7, one of the best-value dishes in the whole game.',
  Indian:
    'The Indian kitchen brings warm spice, yogurt, paneer and coconut: paneer tikka, butter chicken, Goan fish curry and saffron kulfi. It also hides the cheapest perfect dish in the game, a $4 tomato shorba rated 5.0, which frees up money for a big main course.',
  Mexican:
    'Mexican dishes are built on corn, beans, tomato and chocolate: tostadas, chicken tortilla soup, chicken mole and beef barbacoa tacos, finished with chocolate churros. The barbacoa tacos earn a perfect 5.0 but take half the budget.',
  American:
    'The American menu is comfort food: corn fritters, chowder, mac and cheese, steak and mash and a chocolate brownie sundae. Two dishes rate a perfect 5.0, but the steak alone costs $27, so an all-American five-star dinner needs careful saving.',
};

/**
 * Hand-written strategy tips, three per cuisine. Every number here was checked against
 * chef-catalog.json (catalog v1); if dish prices or ratings change, re-check these.
 */
const TIPS = {
  Italian: [
    'Splurge on the starter, not the main. Mushroom Arancini is a perfect 5.0 for $12, half the price of the 5.0 Italian Braised Beef.',
    'The best Italian dinner takes the cheapest main, Spaghetti Pomodoro, and spends the savings on the arancini and a 4.8 porcini soup.',
    'Soup is the best-value upgrade: $5 more turns a 3.8 minestrone into a 4.8 Creamy Porcini Soup.',
  ],
  French: [
    'Always take the Chocolate Mousse. It is a perfect 5.0 for $9, cheaper than the 4.9 crème brûlée, and the best upgrade on the French menu.',
    'Beef Bourguignon is a 5.0, but at $26 it eats over half the budget. The best French menu skips it for the $11 Mushroom Galette.',
    'Mushroom Velouté adds a full star over Potato and Leek Soup for just $5 more.',
  ],
  Japanese: [
    'Spinach Sesame Salad is the best upgrade in the whole game: a perfect 5.0 for $7, only $3 more than the 3.9 sunomono.',
    'Skip the $24 Salmon Teriyaki Bowl. The $10 Tamagoyaki Rice Bowl leaves room for shrimp tempura and a 4.7 chicken mushroom broth.',
    'The best Japanese menu spends exactly $50, so there is no slack: one pricier pick means a cheaper course somewhere else.',
  ],
  Indian: [
    'Tomato Shorba is the cheapest soup and the best one: a perfect 5.0 for $4. Never pay more for an Indian soup.',
    'Butter Chicken (5.0, $18) beats the Goan Fish Curry (4.9, $24). Indian is the only kitchen where the top-rated main is not the most expensive.',
    'Indian has the highest-scoring possible menu of all six cuisines, ★ 4.76, thanks to two perfect dishes that cost $22 together.',
  ],
  Mexican: [
    'Beef Barbacoa Tacos are a perfect 5.0 but cost $25, half the budget. The best Mexican menu takes the $10 Bean Enchiladas instead.',
    'Shrimp Corn Chowder adds a full star over Sopa de Fideo for $7 more, and it is the soup in the best Mexican dinner.',
    'Corn appears in 7 of the 15 Mexican dishes, far more than in any other kitchen. When Chef Mia reveals Mexican and corn, you can fill any course except dessert.',
  ],
  American: [
    'American is the hardest kitchen: its best possible menu scores ★ 4.50, the lowest of the six, and it needs every dollar of the $50.',
    'Steak and Mash is a 5.0 but costs $27. Roast Chicken with Mash (4.7, $18) is the main in the best American dinner.',
    'The Chocolate Brownie Sundae is a perfect 5.0, but at $13 it is the priciest dessert in the game. The 4.6 strawberry shortcake saves $4.',
  ],
};

const slug = (c) => c.toLowerCase();
const money = (cents) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
const stars = (tenths) => (tenths / 10).toFixed(1);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Mean of five dish ratings, to two decimals, the same way the game scores a menu. */
const menuScore = (dishes) => (dishes.reduce((s, d) => s + d.ratingTenths, 0) / 10 / dishes.length).toFixed(2);

/** The highest-rated one-dish-per-course menu of this cuisine within the $50 budget (ties: cheaper wins). */
function bestMenu(dishes) {
  const byCourse = COURSES.map((c) => dishes.filter((d) => d.course === c));
  let best = null;
  const walk = (i, picked, cost, rating) => {
    if (cost > BUDGET) return;
    if (i === COURSES.length) {
      if (!best || rating > best.rating || (rating === best.rating && cost < best.cost)) best = { picked: [...picked], cost, rating };
      return;
    }
    for (const d of byCourse[i]) walk(i + 1, [...picked, d], cost + d.costCents, rating + d.ratingTenths);
  };
  walk(0, [], 0, 0);
  return best;
}

/** Per-cuisine numbers used by the comparison table (computed once for all six). */
const STATS = Object.fromEntries(
  catalog.cuisines.map((c) => {
    const ds = catalog.dishes.filter((d) => d.cuisine === c);
    const best = bestMenu(ds);
    return [
      c,
      {
        avgPrice: ds.reduce((s, d) => s + d.costCents, 0) / ds.length,
        avgRating: ds.reduce((s, d) => s + d.ratingTenths, 0) / ds.length / 10,
        bestScore: Number(menuScore(best.picked)),
        perfect: ds.filter((d) => d.ratingTenths === 50).length,
      },
    ];
  }),
);
/** "the best" / "the second-best" style phrases for a 1-based rank among the six cuisines. */
const ranked = (n, word, last) =>
  n === 1 ? `the ${word}` : n === 6 ? `the ${last}` : `the ${['second', 'third', 'fourth', 'fifth'][n - 2]}-${word}`;

/** Cheapest vs top-rated dish in each course: how many stars each extra dollar buys. */
function upgrades(dishes) {
  return COURSES.map((c) => {
    const inCourse = dishes.filter((d) => d.course === c);
    const cheap = [...inCourse].sort((a, b) => a.costCents - b.costCents || b.ratingTenths - a.ratingTenths)[0];
    const top = [...inCourse].sort((a, b) => b.ratingTenths - a.ratingTenths || a.costCents - b.costCents)[0];
    const extra = top.costCents - cheap.costCents;
    const gain = (top.ratingTenths - cheap.ratingTenths) / 10;
    return { course: c, cheap, top, extra, gain, perDollar: extra > 0 ? gain / (extra / 100) : Infinity };
  });
}

function dishCard(d) {
  const sm = d.imageSrc ? `/${d.imageSrc.replace('dishes/', 'dishes/sm/')}` : null;
  return `<li class="dish">
          ${sm ? `<img src="${sm}" alt="${esc(d.imageAlt.replace(', with a transparent background', ''))}" width="128" height="128" loading="lazy" decoding="async" />` : ''}
          <div>
            <h4>${esc(d.name)}</h4>
            <p>${esc(d.description.replace(/; .*$/, '.'))}</p>
            <p class="meta"><span>${money(d.costCents)}</span> · <span>★ ${stars(d.ratingTenths)}</span></p>
          </div>
        </li>`;
}

function page(cuisine) {
  const s = slug(cuisine);
  const url = `${SITE}/cuisine/${s}/`;
  const play = `/?s=cuisine_${s}`;
  const dishes = catalog.dishes.filter((d) => d.cuisine === cuisine);
  const best = bestMenu(dishes);
  const perfect = dishes.filter((d) => d.ratingTenths === 50);
  const value = [...dishes].sort((a, b) => b.ratingTenths / b.costCents - a.ratingTenths / a.costCents)[0];
  const cheapest = COURSES.map((c) => dishes.filter((d) => d.course === c).sort((a, b) => a.costCents - b.costCents)[0]);
  const cheapCost = cheapest.reduce((s, d) => s + d.costCents, 0);
  const others = catalog.cuisines.filter((c) => c !== cuisine);
  const title = `${cuisine} Dinner Menu Game – Five Courses for $50 | 5-Star Chef Restaurant`;
  const description = `Plan a five-course ${cuisine} dinner on a $50 budget. See all 15 ${cuisine} dishes, their prices and star ratings, and the best ${cuisine} menu you can serve. Free browser game.`;
  const firstImg = best.picked[0].imageSrc ? `${SITE}/${best.picked[0].imageSrc}` : `${SITE}/og-image.jpg`;
  const ups = upgrades(dishes);
  const paid = ups.filter((u) => u.extra > 0).sort((a, b) => b.perDollar - a.perDollar);
  const free = ups.filter((u) => u.extra <= 0);
  const priciest = [...dishes].sort((a, b) => b.costCents - a.costCents)[0];
  const pairs = catalog.supportedPairs
    .filter((p) => p.cuisine === cuisine)
    .map((p) => ({ ...p, label: catalog.ingredients.find((i) => i.id === p.ingredient)?.label ?? p.ingredient }))
    .sort((a, b) => b.dishIds.length - a.dishIds.length || a.label.localeCompare(b.label));
  const dishName = (id) => catalog.dishes.find((d) => d.id === id).name;
  const rank = (key, desc) =>
    [...catalog.cuisines].sort((a, b) => (desc ? STATS[b][key] - STATS[a][key] : STATS[a][key] - STATS[b][key])).indexOf(cuisine) + 1;
  const me = STATS[cuisine];
  const faq = [
    [
      `What is the best ${cuisine} menu for $50?`,
      `${best.picked.map((d) => d.name).join(', ')}. It costs ${money(best.cost)} and rates ★ ${menuScore(best.picked)}, ${ranked(rank('bestScore', true), 'best', 'lowest-scoring')} possible menu of the six cuisines.`,
    ],
    [
      `What is the most expensive ${cuisine} dish?`,
      `The ${priciest.name} at ${money(priciest.costCents)}, rated ★ ${stars(priciest.ratingTenths)}. That is ${Math.round((priciest.costCents / BUDGET) * 100)}% of the $50 budget for a single course.`,
    ],
    [
      `Which ${cuisine} dish gives the most stars per dollar?`,
      `The ${value.name}: ★ ${stars(value.ratingTenths)} for ${money(value.costCents)}, the most stars per dollar on the ${cuisine} menu.`,
    ],
    [
      `How many ${cuisine} dishes are rated a perfect 5.0?`,
      perfect.length
        ? `${perfect.length === 1 ? 'One' : perfect.length === 2 ? 'Two' : perfect.length}: ${perfect.map((d) => `${d.name} (${money(d.costCents)})`).join(' and ')}.`
        : `None. The top ${cuisine} dishes rate 4.9.`,
    ],
  ];
  const jsonLdFaq = {
    '@type': 'FAQPage',
    mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': url,
        url,
        name: title,
        description,
        isPartOf: { '@type': 'WebSite', name: '5-Star Chef Restaurant', url: `${SITE}/` },
        about: { '@type': 'VideoGame', name: '5-Star Chef Restaurant', url: `${SITE}/` },
        primaryImageOfPage: firstImg,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '5-Star Chef Restaurant', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: `${cuisine} menu`, item: url },
        ],
      },
      {
        '@type': 'ItemList',
        name: `${cuisine} dishes in 5-Star Chef Restaurant`,
        numberOfItems: dishes.length,
        itemListElement: dishes.map((d, i) => ({ '@type': 'ListItem', position: i + 1, name: d.name })),
      },
      jsonLdFaq,
    ],
  };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${url}" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="theme-color" content="#5a2343" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="5-Star Chef Restaurant" />
    <meta property="og:title" content="${esc(`${cuisine} dinner for $50 – can you earn five stars?`)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${SITE}/og-image.jpg" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
    <style>
      :root { --bg: #efdfd2; --card: #fffdf9; --ink: #2b1a22; --ink2: #6d5a62; --accent: #5a2343; --cta: #b5223a; --line: #e4d3c6; }
      @media (prefers-color-scheme: dark) { :root { --bg: #1d1519; --card: #2a1f25; --ink: #f3e9ee; --ink2: #c3b0b9; --accent: #e3a6c4; --cta: #d8455d; --line: #3d2f36; } }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
      main { max-width: 860px; margin: 0 auto; padding: 24px max(16px, env(safe-area-inset-left)) 48px; }
      nav.crumbs { font-size: 0.9rem; color: var(--ink2); }
      nav.crumbs a { color: var(--ink2); }
      h1, h2, h3, h4 { font-family: Georgia, serif; color: var(--accent); line-height: 1.25; }
      h1 { font-size: clamp(1.6rem, 4.5vw, 2.2rem); margin: 12px 0 8px; }
      h2 { font-size: 1.3rem; margin: 32px 0 8px; }
      h3 { font-size: 1.1rem; margin: 24px 0 8px; }
      h4 { font-size: 1rem; margin: 0 0 2px; color: var(--ink); }
      p { max-width: 68ch; }
      a { color: var(--accent); }
      .cta { display: inline-block; background: var(--cta); color: #fff; text-decoration: none; font-weight: 700; padding: 12px 22px; border-radius: 999px; margin: 8px 0; }
      .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 16px; }
      ul.dishes { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
      li.dish { display: flex; gap: 12px; align-items: center; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 10px; }
      li.dish img { width: 72px; height: 72px; object-fit: contain; flex: none; }
      li.dish p { margin: 0; font-size: 0.92rem; color: var(--ink2); }
      li.dish p.meta { color: var(--ink); font-weight: 600; margin-top: 2px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); }
      td.num, th.num { text-align: right; white-space: nowrap; }
      tfoot td { font-weight: 700; border-bottom: none; }
      ul.others, ul.tips, ul.pairs { padding-left: 20px; }
      ul.tips li, ul.pairs li { margin: 6px 0; max-width: 68ch; }
      .sub { display: block; color: var(--ink2); font-size: 0.85rem; }
      tr.me td { background: color-mix(in srgb, var(--accent) 10%, transparent); }
      .card { overflow-x: auto; }
      .fineprint { color: var(--ink2); font-size: 0.85rem; margin-top: 36px; }
    </style>
  </head>
  <body>
    <main>
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">5-Star Chef Restaurant</a> › ${cuisine} menu</nav>
      <h1>${cuisine} dinner menu game: five courses for $50</h1>
      <p>${esc(INTRO[cuisine])}</p>
      <p>In <a href="/">5-Star Chef Restaurant</a> you plan a five-course dinner (appetizer, soup, salad, main course and dessert) with $50 per guest. Each turn, Chef Mia reveals a cuisine and an ingredient, you pick a matching dish, and your menu's rating is the average of your five dishes.</p>
      <p><a class="cta" href="${play}">Play free – no download</a></p>

      <h2>The best ${cuisine} menu for $50</h2>
      <div class="card">
        <p>If the wheel only ever landed on ${cuisine}, this is the highest-rated dinner you could serve within the budget:</p>
        <table>
          <thead><tr><th>Course</th><th>Dish</th><th class="num">Price</th><th class="num">Rating</th></tr></thead>
          <tbody>
            ${best.picked.map((d) => `<tr><td>${COURSE_LABEL[d.course]}</td><td>${esc(d.name)}</td><td class="num">${money(d.costCents)}</td><td class="num">★ ${stars(d.ratingTenths)}</td></tr>`).join('\n            ')}
          </tbody>
          <tfoot><tr><td colspan="2">Total</td><td class="num">${money(best.cost)}</td><td class="num">★ ${menuScore(best.picked)}</td></tr></tfoot>
        </table>
        <p>The cheapest ${cuisine} dinner costs ${money(cheapCost)} and rates ★ ${menuScore(cheapest)}. The best value is the ${esc(value.name)}: ★ ${stars(value.ratingTenths)} for ${money(value.costCents)}.${perfect.length ? ` Perfect 5.0 ${cuisine} dishes: ${perfect.map((d) => esc(d.name)).join(', ')}.` : ''}</p>
      </div>

      <h2>Chef Mia's ${cuisine} tips</h2>
      <ul class="tips">
        ${TIPS[cuisine].map((t) => `<li>${esc(t)}</li>`).join('\n        ')}
      </ul>

      <h2>Where to splurge and where to save</h2>
      <p>For each course, the cheapest ${cuisine} dish next to the highest-rated one, and how many stars the extra money buys.</p>
      <div class="card">
        <table>
          <thead><tr><th>Course</th><th>Cheapest</th><th>Top-rated</th><th class="num">Upgrade</th></tr></thead>
          <tbody>
            ${ups
              .map(
                (u) =>
                  `<tr><td>${COURSE_LABEL[u.course]}</td><td>${esc(u.cheap.name)} <span class="sub">${money(u.cheap.costCents)} · ★ ${stars(u.cheap.ratingTenths)}</span></td><td>${esc(u.top.name)} <span class="sub">${money(u.top.costCents)} · ★ ${stars(u.top.ratingTenths)}</span></td><td class="num">${u.extra > 0 ? `+${u.gain.toFixed(1)}★ for +${money(u.extra)}` : 'Free: cheapest is best'}</td></tr>`,
              )
              .join('\n            ')}
          </tbody>
        </table>
        <p>On the ${cuisine} menu, the ${COURSE_LABEL[paid[0].course].toLowerCase()} upgrade buys the most stars per dollar (${paid[0].gain.toFixed(1)} stars for ${money(paid[0].extra)}), and the ${COURSE_LABEL[paid[paid.length - 1].course].toLowerCase()} upgrade buys the fewest (${paid[paid.length - 1].gain.toFixed(1)} stars for ${money(paid[paid.length - 1].extra)}).${free.length ? ` In the ${free.map((u) => COURSE_LABEL[u.course].toLowerCase()).join(' and ')}, the cheapest dish is already the best, so there is nothing to upgrade.` : ''}</p>
      </div>

      <h2>All 15 ${cuisine} dishes</h2>
      ${COURSES.map((c) => `<h3>${cuisine} ${COURSE_PLURAL[c].toLowerCase()}</h3>
      <ul class="dishes">
        ${dishes.filter((d) => d.course === c).map(dishCard).join('\n        ')}
      </ul>`).join('\n      ')}

      <h2>${cuisine} ingredient pairings</h2>
      <p>Each turn, Chef Mia reveals a cuisine and an ingredient, and only dishes matching both can be served. These are the ${pairs.length} ingredients that can come up with ${cuisine}, and the dishes each one unlocks.</p>
      <ul class="pairs">
        ${pairs.map((p) => `<li><strong>${cuisine} and ${esc(p.label.toLowerCase())}</strong> (${p.dishIds.length} ${p.dishIds.length === 1 ? 'dish' : 'dishes'}): ${p.dishIds.map((id) => esc(dishName(id))).join(', ')}</li>`).join('\n        ')}
      </ul>

      <h2>How the ${cuisine} kitchen compares</h2>
      <p>${cuisine} has ${ranked(rank('bestScore', true), 'best', 'lowest-scoring')} possible menu of the six cuisines and is ${ranked(rank('avgPrice', false), 'cheapest', 'most expensive')} kitchen on average, with dishes averaging ${money(Math.round(me.avgPrice))} and ★ ${me.avgRating.toFixed(2)}.</p>
      <div class="card">
        <table>
          <thead><tr><th>Cuisine</th><th class="num">Avg price</th><th class="num">Avg rating</th><th class="num">Best $50 menu</th><th class="num">5.0 dishes</th></tr></thead>
          <tbody>
            ${catalog.cuisines
              .map((c) => {
                const s = STATS[c];
                const cell = c === cuisine ? `<strong>${c}</strong>` : `<a href="/cuisine/${slug(c)}/">${c}</a>`;
                return `<tr${c === cuisine ? ' class="me"' : ''}><td>${cell}</td><td class="num">${money(Math.round(s.avgPrice))}</td><td class="num">★ ${s.avgRating.toFixed(2)}</td><td class="num">★ ${s.bestScore.toFixed(2)}</td><td class="num">${s.perfect}</td></tr>`;
              })
              .join('\n            ')}
          </tbody>
        </table>
      </div>

      <h2>${cuisine} menu FAQ</h2>
      ${faq.map(([q, a]) => `<h3>${esc(q)}</h3>\n      <p>${esc(a)}</p>`).join('\n      ')}

      <h2>Can you earn five stars?</h2>
      <p>In the game you won't get to choose only ${cuisine}: every turn brings a new cuisine and ingredient, and the game keeps enough money aside to finish every course. Knowing which dishes are worth the money is what turns a 4.3 into a 4.8.</p>
      <p><a class="cta" href="${play}">Cook a ${cuisine} dinner now</a></p>

      <h2>Explore the other cuisines</h2>
      <ul class="others">
        ${others.map((o) => `<li><a href="/cuisine/${slug(o)}/">${o} dinner menu for $50</a></li>`).join('\n        ')}
      </ul>

      <p class="fineprint">5-Star Chef Restaurant by 5 Star Studios. Dish prices and ratings are fictional game values. <a href="/privacy/">Privacy</a></p>
    </main>
  </body>
</html>
`;
}

const today = new Date().toISOString().slice(0, 10);
for (const c of catalog.cuisines) {
  const dir = `public/cuisine/${slug(c)}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/index.html`, page(c));
}

// Sitemap: home + the cuisine pages (each with its dish images).
const urls = [
  `  <url>\n    <loc>${SITE}/</loc>\n    <lastmod>${today}</lastmod>\n    <image:image><image:loc>${SITE}/og-image.jpg</image:loc></image:image>\n  </url>`,
  ...catalog.cuisines.map((c) => {
    const imgs = catalog.dishes
      .filter((d) => d.cuisine === c && d.imageSrc)
      .map((d) => `    <image:image><image:loc>${SITE}/${d.imageSrc}</image:loc></image:image>`)
      .join('\n');
    return `  <url>\n    <loc>${SITE}/cuisine/${slug(c)}/</loc>\n    <lastmod>${today}</lastmod>\n${imgs}\n  </url>`;
  }),
];
writeFileSync(
  'public/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join('\n')}\n</urlset>\n`,
);
console.log(`wrote ${catalog.cuisines.length} cuisine pages and sitemap.xml`);
