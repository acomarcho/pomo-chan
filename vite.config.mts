import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: "electron/main.ts",
        vite: {
          build: {
            rollupOptions: {
              external: ["better-sqlite3", "get-windows"]
            }
          }
        }
      },
      preload: {
        input: "electron/preload.ts"
      },
      renderer: {}
    }),
    nodePolyfills({
      include: ["url", "path", "fs", "stream", "events", "util"],
      globals: {
        process: true
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  base: "./",
  publicDir: "public",
  build: {
    outDir: "dist",
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks: {
          pixi: ["pixi.js"],
          live2d: ["pixi-live2d-display"]
        }
      }
    }
  }
});
