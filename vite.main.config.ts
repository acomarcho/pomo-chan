import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  optimizeDeps: {
    exclude: ['better-sqlite3'],
  },
  build: {
    rollupOptions: {
      external: ['better-sqlite3'],
    },
  },
});
