import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: ["better-sqlite3", "get-windows"],
  },
  build: {
    rollupOptions: {
      external: ["better-sqlite3", "get-windows"],
    },
  },
});
