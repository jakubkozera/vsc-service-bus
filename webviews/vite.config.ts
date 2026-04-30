import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { readdirSync, statSync, existsSync } from 'fs';

function getEntries(): Record<string, string> {
  const srcDir = resolve(__dirname, 'src');
  const entries: Record<string, string> = {};
  if (!existsSync(srcDir)) return entries;
  for (const dir of readdirSync(srcDir)) {
    const dirPath = resolve(srcDir, dir);
    if (statSync(dirPath).isDirectory() && dir !== 'shared') {
      const indexPath = resolve(dirPath, 'index.html');
      if (existsSync(indexPath)) entries[dir] = indexPath;
    }
  }
  return entries;
}

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: getEntries(),
      output: {
        entryFileNames: '[name]/assets/[name]-[hash].js',
        chunkFileNames: (chunkInfo) => {
          if (chunkInfo.name?.includes('monaco') || chunkInfo.moduleIds?.some((id: string) => id.includes('monaco-editor'))) {
            return 'monaco/[name]-[hash].js';
          }
          return 'shared/[name]-[hash].js';
        },
        assetFileNames: (info) => {
          if (info.name?.endsWith('.css')) return '[name]/assets/[name]-[hash][extname]';
          return 'shared/[name]-[hash][extname]';
        },
        manualChunks(id) {
          if (id.includes('monaco-editor')) {
            return 'monaco-editor';
          }
        }
      }
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 3000
  },
  resolve: {
    alias: { '@shared': resolve(__dirname, 'src/shared') }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/shared/test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } }
  }
});
