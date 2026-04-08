import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve } from "path";
import { copyFileSync, existsSync } from "fs";

// Copies the static landing page and its assets into dist/ after the build.
// Only needed in production since dev serves everything from the root.
function copyLandingAssets(): Plugin {
  const staticFiles = [
    "index.html",
    "mergen-scope-icon.svg",
    "mergen-scope-icon.png",
    "mergen-scope-preview.png",
    "robots.txt",
    "sitemap.xml",
  ];
  return {
    name: "copy-landing-assets",
    apply: "build",
    closeBundle() {
      for (const file of staticFiles) {
        const src = resolve(__dirname, file);
        if (existsSync(src)) {
          copyFileSync(src, resolve(__dirname, "dist", file));
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(mode === "production" ? [viteSingleFile(), copyLandingAssets()] : []),
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
