import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works both at starchefmia.com/ and at xnxnxn972.github.io/starchefmia/.
// GitHub Pages serves main:/docs, so the build goes there (committed on purpose).
export default defineConfig({
  base: './',
  build: { outDir: 'docs', emptyOutDir: true },
  // Every log row carries the build that produced it.
  define: { __APP_VERSION__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')) },
  plugins: [react()],
  test: { environment: 'node' },
} as never);
