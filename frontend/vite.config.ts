import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    // Honour a PORT supplied by the environment. Without this Vite silently picks the next free
    // port when 5173 is taken (another project's dev server, say), and anything expecting the
    // assigned port finds nothing listening.
    port: Number(process.env.PORT) || 5173,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // This app deploys as a SINGLE inlined bundle (scripts/sync-dist-to-gas.mjs inlines only the
    // entry chunk into the Apps Script HTML). Code-splitting would emit chunks that never get
    // inlined and break the deploy, so the bundle is intentionally one file — raise the advisory
    // threshold to silence the benign >500 kB chunk-size warning.
    chunkSizeWarningLimit: 1000,
  },
});
