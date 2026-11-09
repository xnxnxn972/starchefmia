import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works both at starchefmia.com/ and at xnxnxn972.github.io/starchefmia/.
// GitHub Pages serves main:/docs, so the build goes there (committed on purpose).
export default defineConfig({
  base: './',
  build: { outDir: 'docs', emptyOutDir: true },
  plugins: [react()],
  test: { environment: 'node' },
} as never);
