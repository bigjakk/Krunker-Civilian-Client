import { defineConfig } from 'vite';
import { resolve } from 'path';
import { builtinModules } from 'module';

// Both 'fs' and 'node:fs' forms must be externalized
const nodeBuiltins = builtinModules.flatMap((m) => [m, `node:${m}`]);

const isProd = process.env.NODE_ENV === 'production' || !process.argv.includes('--mode');

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js',
    },
    outDir: 'dist/main',
    emptyDirBefore: true,
    rollupOptions: {
      external: ['electron', 'electron-store', ...nodeBuiltins],
    },
    target: 'node20',
    minify: isProd,
    sourcemap: !isProd,
  },
  resolve: {
    // Treat this as a Node build — don't swap node builtins for browser stubs
    conditions: ['node'],
    mainFields: ['module', 'main'],
  },
});
