/**
 * After `vite build`: render the title screen (src/prerender.tsx) and put the HTML
 * inside <div id="root"> in docs/index.html, so crawlers get real content.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { render } = await vite.ssrLoadModule('/src/prerender.tsx');
  // The SSR dev server resolves the './' base to '/'; keep the page's asset paths relative.
  const html = render().replace(/(src|srcSet|srcset)="\/(dishes|scene)\//g, '$1="./$2/').replace(/, \/dishes\//g, ', ./dishes/');
  const file = 'docs/index.html';
  const page = readFileSync(file, 'utf8');
  if (!page.includes('<div id="root"></div>')) throw new Error('docs/index.html has no empty #root to fill');
  writeFileSync(file, page.replace('<div id="root"></div>', `<div id="root">${html}</div>`));
  console.log(`prerendered title screen into ${file} (${html.length} chars)`);
  // Sitemap lastmod = this build's date.
  const sm = 'docs/sitemap.xml';
  writeFileSync(sm, readFileSync(sm, 'utf8').replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>`));
} finally {
  await vite.close();
}
