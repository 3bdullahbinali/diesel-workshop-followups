'use strict';
/** يرفع إصدار كل ملفات الموقع في index.html دفعة واحدة: node tools/bump-version.js */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'index.html');
const now = new Date();
const token = now.toISOString().slice(0, 10) + '-' + String(now.getUTCHours() * 60 + now.getUTCMinutes()).padStart(4, '0');
const before = fs.readFileSync(file, 'utf8');
const after = before.replace(/(src|href)="\.\/([^"?]+)(?:\?v=[^"]*)?"/g, (m, attr, asset) => `${attr}="./${asset}?v=${token}"`);
fs.writeFileSync(file, after);
const count = [...after.matchAll(/\?v=/g)].length;
console.log(`إصدار ${token} على ${count} ملفاً.`);
