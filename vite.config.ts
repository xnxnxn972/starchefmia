import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const BUILD_ID = new Date().toISOString().slice(0, 16).replace('T', ' ');

/**
 * Write docs/sw.js from sw-template.js after each build, with this release's
 * version and app-shell file list. Dish photos are deliberately left out of the
 * precache (they are cached as they are shown).
 */
function serviceWorker(): Plugin {
  let outDir = 'docs';
  return {
    name: 'starchef-service-worker',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const f of readdirSync(dir)) {
          const p = join(dir, f);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(relative(outDir, p).replace(/\\/g, '/'));
        }
      };
      walk(outDir);
      const precache = [
        './',
        ...files
          // Not for players: crawler/link-preview files, and dishes (cached as they are shown).
          .filter((f) => !f.startsWith('dishes/') && !['index.html', 'sw.js', 'CNAME', '404.html', 'robots.txt', 'sitemap.xml', 'og-image.jpg'].includes(f))
          .map((f) => `./${f}`),
      ];
      const sw = readFileSync('sw-template.js', 'utf8')
        .replace('__VERSION__', BUILD_ID.replace(/\D/g, ''))
        .replace('__PRECACHE__', JSON.stringify(precache, null, 2));
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}

/**
 * The catalog JSON keeps the full per-dish art prompts (the source of truth for future
 * art), but the game never shows them. Strip them from what ships: ~60 KB less to download.
 */
function slimCatalog(): Plugin {
  return {
    name: 'starchef-slim-catalog',
    enforce: 'pre',
    transform(code, id) {
      if (!id.split('\\').join('/').endsWith('/src/data/chef-catalog.json')) return null;
      const cat = JSON.parse(code);
      for (const d of cat.dishes) delete d.imagePrompt;
      delete cat.artReferences;
      return { code: JSON.stringify(cat), map: null };
    },
  };
}

// Relative base so the build works both at starchefmia.com/ and at xnxnxn972.github.io/starchefmia/.
// GitHub Pages serves main:/docs, so the build goes there (committed on purpose).
export default defineConfig({
  base: './',
  build: { outDir: 'docs', emptyOutDir: true },
  // Every log row carries the build that produced it.
  define: { __APP_VERSION__: JSON.stringify(BUILD_ID) },
  plugins: [slimCatalog(), react(), serviceWorker()],
  test: { environment: 'node' },
} as never);
