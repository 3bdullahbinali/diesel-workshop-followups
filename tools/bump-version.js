'use strict';
/** يرفع إصدار كل ملفات الموقع في index.html دفعة واحدة: node tools/bump-version.js */
const fs = require('fs');
const path = require('path');
const files = ['index.html', 'readiness.html', 'resources.html'].map(name => path.join(__dirname, '..', name));
const now = new Date();
const token = now.toISOString().slice(0, 10) + '-' + String(now.getUTCHours() * 60 + now.getUTCMinutes()).padStart(4, '0');
let count = 0;
for (const file of files) {
  const after = fs.readFileSync(file, 'utf8')
    // صفحات HTML تُستثنى: ختمها بإصدار يجعل كل نشر عنواناً جديداً ويُبطل المرجعيات.
    .replace(/(src|href)="\.\/([^"?]+)(?:\?v=[^"]*)?"/g,
      (m, attr, asset) => asset.endsWith('.html') ? `${attr}="./${asset}"` : `${attr}="./${asset}?v=${token}"`);
  fs.writeFileSync(file, after);
  count += [...after.matchAll(/\?v=/g)].length;
}
console.log(`إصدار ${token} على ${count} رابطاً في ${files.length} صفحات.`);
