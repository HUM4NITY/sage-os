import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main.ts') },
      },
      outDir: 'out/main',
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload.ts') },
      },
      outDir: 'out/preload',
    },
  },
  renderer: {
    root: resolve(__dirname),
    plugins: [react()],
    assetsInclude: ['**/*.glsl', '**/*.vert', '**/*.frag'],
    resolve: {
      alias: { '@': resolve(__dirname, 'src') },
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'index.html') },
      },
      outDir: 'out/renderer',
    },
    server: { port: 5173 },
  },
});
