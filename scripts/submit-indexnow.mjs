#!/usr/bin/env node
// Submits all URLs in sitemap.xml to the universal IndexNow endpoint (Bing, Yandex, Naver, Seznam, Yep).
// Run AFTER deploying dist/ so https://mergenscope.com/<key>.txt is live.
// Usage:
//   node scripts/submit-indexnow.mjs --dry-run
//   node scripts/submit-indexnow.mjs

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const HOST = "mergenscope.com";
const KEY = "d46aa9de7cff5aefedfca297c656b43d";
const ENDPOINT = "https://api.indexnow.org/indexnow";

const root = resolve(import.meta.dirname, "..");
const keyFile = resolve(root, `${KEY}.txt`);
const sitemapFile = resolve(root, "sitemap.xml");

const storedKey = readFileSync(keyFile, "utf8").trim();
if (storedKey !== KEY) {
  console.error(`Key mismatch: ${keyFile} contains ${JSON.stringify(storedKey)}, expected ${JSON.stringify(KEY)}.`);
  process.exit(1);
}

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
  key: KEY,
  keyLocation: `https://${HOST}/${KEY}.txt`,
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
