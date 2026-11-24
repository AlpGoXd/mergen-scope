#!/usr/bin/env node
// Submits all URLs in sitemap.xml to the universal IndexNow endpoint (Bing, Yandex, Naver, Seznam, Yep).
// Requires INDEXNOW_KEY in the environment (matching the Cloudflare Pages build env var).
// Run AFTER deploying dist/ so https://mergenscope.com/<INDEXNOW_KEY>.txt is live.
//
// PowerShell usage:
//   $env:INDEXNOW_KEY = "<your-key>"
//   node scripts/submit-indexnow.mjs --dry-run
//   node scripts/submit-indexnow.mjs

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const HOST = "mergenscope.com";
const ENDPOINT = "https://api.indexnow.org/indexnow";

const key = process.env.INDEXNOW_KEY?.trim();
if (!key) {
  console.error("Missing INDEXNOW_KEY environment variable. Set it to the same key configured in Cloudflare Pages.");
  process.exit(1);
}
if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) {
  console.error("Invalid INDEXNOW_KEY: must be 8-128 characters using only a-z, A-Z, 0-9, and '-'.");
  process.exit(1);
}

const root = resolve(import.meta.dirname, "..");
const sitemapFile = resolve(root, "sitemap.xml");
const sitemap = readFileSync(sitemapFile, "utf8");
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
if (urlList.length === 0) {
  console.error("No <loc> entries found in sitemap.xml.");
  process.exit(1);
}
for (const url of urlList) {
  const parsed = new URL(url);
  if (parsed.hostname !== HOST) {
    console.error(`Refusing URL outside ${HOST}: ${url}`);
    process.exit(1);
  }
}

const payload = {
  host: HOST,
  key,
  keyLocation: `https://${HOST}/${key}.txt`,
  urlList,
};

if (process.argv.includes("--dry-run")) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const response = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(payload),
});

const body = await response.text();
console.log(`IndexNow response: HTTP ${response.status} ${response.statusText}${body ? `\n${body}` : ""}`);
if (!response.ok) {
  process.exit(1);
}
