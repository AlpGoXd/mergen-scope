const { chromium } = require('playwright');
(async () => {
 const browser=await chromium.launch({headless:true}); const page=await browser.newPage(); const requests=[];
 page.on('request', r => requests.push(r.url()));
 await page.goto('http://localhost:5192/app.html');
 await page.evaluate(async () => { await Promise.all([document.fonts.load('400 12px "IBM Plex Sans"'),document.fonts.load('600 12px "IBM Plex Sans"'),document.fonts.load('700 12px "IBM Plex Sans"'),document.fonts.load('400 11px "JetBrains Mono"')]); });
 const fonts=await page.evaluate(() => [...document.fonts].map(f=>({family:f.family,weight:f.weight,status:f.status})));
 if (requests.some(u=>!u.startsWith('http://localhost:5192/')) || fonts.some(f=>f.status!=='loaded')) throw Error(JSON.stringify({requests,fonts}));
 console.log(JSON.stringify({requests,fonts})); await browser.close();
})();
