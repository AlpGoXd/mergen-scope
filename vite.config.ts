import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve } from "path";
import { copyFileSync, cpSync, existsSync, readFileSync, writeFileSync } from "fs";

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
          const dest = resolve(__dirname, "dist", file);
          if (file === "index.html") {
            const { version } = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")) as { version: string };
            const html = readFileSync(src, "utf8");
            const versionSpan = /(<span\b[^>]*\bid="version"[^>]*>)[^<]*(<\/span>)/;
            if (versionSpan.test(html)) {
              writeFileSync(
                dest,
                html.replace(versionSpan, (_match, openingTag: string, closingTag: string) => `${openingTag}v${version}${closingTag}`),
                "utf8",
              );
            } else {
              console.warn("Could not update app version: index.html does not contain a span with id=\"version\".");
              writeFileSync(dest, html, "utf8");
            }
          } else {
            copyFileSync(src, dest);
          }
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
