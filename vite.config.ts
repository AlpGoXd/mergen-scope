import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve } from "path";
import { copyFileSync, cpSync, existsSync } from "fs";

// Copies the static pages and runtime assets into dist/ after the build.
// Only needed in production since dev serves everything from the root.
function copyRuntimeAssets(): Plugin {
  const staticFiles = [
    "index.html",
    "mergen-scope-icon.svg",
    "mergen-scope-icon.png",
    "mergen-scope-preview.png",
    "robots.txt",
    "sitemap.xml",
  ];
  const staticDirs = [
    "demo-assets",
    "landing-assets",
  ];
  return {
    name: "copy-runtime-assets",
    apply: "build",
    closeBundle() {
      for (const file of staticFiles) {
        const src = resolve(__dirname, file);
        if (existsSync(src)) {
          copyFileSync(src, resolve(__dirname, "dist", file));
        }
      }
      for (const dir of staticDirs) {
        const src = resolve(__dirname, dir);
        if (existsSync(src)) {
          cpSync(src, resolve(__dirname, "dist", dir), { recursive: true });
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(mode === "production" ? [viteSingleFile(), copyRuntimeAssets()] : []),
  ],
  base: mode === "production" ? "./" : "/",
  build: {
    outDir: "dist",
    sourcemap: mode !== "production",
    rollupOptions: {
      input:
        mode === "production"
          ? { app: resolve(__dirname, "app.html") }
          : {
              main: resolve(__dirname, "index.html"),
              app: resolve(__dirname, "app.html"),
            },
    },
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
}));
