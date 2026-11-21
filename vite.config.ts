import { build, defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve } from "path";
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

/**
 * Build the on-demand PDF modules separately. Rollup must never make one of them
 * import the app entry module, because that entry is inlined into app.html.
 */
function lazyPaperPdf(): Plugin {
  const pdfEntry = resolve(__dirname, "src/components/chart/export/export-pdf.ts");
  const virtual = "\0mergen-paper-pdf";
  let entryFile: string | undefined;

  return {
    name: "mergen:lazy-paper-pdf",
    apply: "build",
    enforce: "pre",
    async buildStart() {
      const result = await build({
        configFile: false,
        root: __dirname,
        publicDir: false,
        logLevel: "warn",
        build: {
          write: false,
          modulePreload: false,
          rollupOptions: {
            preserveEntrySignatures: "strict",
            input: { "export-pdf": pdfEntry },
            output: { entryFileNames: "lazy/[name]-[hash].js", chunkFileNames: "lazy/[name]-[hash].js" },
          },
        },
      });
      const outputs = Array.isArray(result) ? result : "output" in result ? [result] : [];
      for (const output of outputs) {
        for (const item of output.output) {
          if (item.type !== "chunk") continue;
          if (item.isEntry) entryFile = item.fileName;
          this.emitFile({ type: "asset", fileName: item.fileName, source: item.code });
        }
      }
      if (!entryFile) this.error("The lazy PDF build did not produce an entry module.");
    },
    resolveId(source) {
      if (source === "./export-pdf") return virtual;
    },
    load(id) {
      if (id !== virtual) return;
      return `export async function paperPdf(...args) {
        const url = new URL(${JSON.stringify(`./${entryFile}`)}, document.baseURI);
        const { paperPdf } = await import(/* @vite-ignore */ url.href);
        return paperPdf(...args);
      }`;
    },
  };
}

// Copies the static pages and runtime assets into dist/ after the build.
// Only needed in production since dev serves everything from the root.
function copyRuntimeAssets(): Plugin {
  let outputDir: string;
  const staticFiles = [
    "index.html",
    "mergen-scope-icon.svg",
    "mergen-scope-icon.png",
    "favicon.ico",
    "mergen-scope-preview.png",
    "_headers",
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
    configResolved(config) {
      outputDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      mkdirSync(outputDir, { recursive: true });
      for (const file of staticFiles) {
        const src = resolve(__dirname, file);
        if (existsSync(src)) {
          const dest = resolve(outputDir, file);
          if (file === "index.html") {
            const { version } = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")) as { version: string };
            // Landing assets retain a long cache lifetime. A release must use
            // the stylesheet, script and examples that belong to its HTML.
            const html = readFileSync(src, "utf8").replace(
              /"(landing-assets\/(?:landing\.(?:css|js)|img\/[\w.-]+))"/g,
              (_match, asset: string) => {
                const revision = createHash("sha256").update(readFileSync(resolve(__dirname, asset))).digest("hex").slice(0, 12);
                return `"${asset}?v=${revision}"`;
              },
            );
            // Every <span data-version> (hero and footer) shows the package version.
            const versionSpan = /(<span\b[^>]*\bdata-version\b[^>]*>)[^<]*(<\/span>)/g;
            if (versionSpan.test(html)) {
              writeFileSync(
                dest,
                html.replace(versionSpan, (_match, openingTag: string, closingTag: string) => `${openingTag}v${version}${closingTag}`),
                "utf8",
              );
            } else {
              console.warn("Could not update app version: index.html does not contain a span with data-version.");
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
          cpSync(src, resolve(outputDir, dir), { recursive: true });
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(mode === "production" ? [lazyPaperPdf(), viteSingleFile({ inlinePattern: ["app-*.js", "*.css"] }), copyRuntimeAssets()] : []),
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
