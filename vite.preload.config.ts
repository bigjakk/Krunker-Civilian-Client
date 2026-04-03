import { defineConfig } from 'vite';
import { resolve } from 'path';

const isProd = process.env.NODE_ENV === 'production' || !process.argv.includes('--mode');

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/preload/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js',
    },
    outDir: 'dist/preload',
    emptyDirBefore: true,
    rollupOptions: {
      external: ['electron'],
    },
    target: 'node20',
    minify: isProd,
    sourcemap: !isProd,
  },
});
