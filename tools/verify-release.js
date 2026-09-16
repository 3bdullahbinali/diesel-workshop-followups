'use strict';
/**
 * فحص ما قبل النشر. شغّله دائماً قبل الدمج إلى main:
 *   node tools/verify-release.js
 * يمنع ثلاثة أخطاء وقعت فعلاً في هذا المشروع:
 *  1) ملف مشار إليه وغير موجود  ← صفحة مكسورة.
 *  2) إصدارات مختلفة في روابط الملفات ← متصفح يبقى على نسخة قديمة.
 *  3) اختلاف قيم مسموحة بين قارئ الموقع وخدمة الكتابة ← رفض التعديل.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log((ok ? '✓ ' : '✗ ') + label + (ok ? '' : ' — ' + detail));
  if (!ok) failures++;
};

const html = read('index.html');
const refs = [...html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map(m => m[1]);

const missing = refs.map(r => r.split('?')[0]).filter(f => !fs.existsSync(path.join(root, f)));
check('كل ملف مشار إليه موجود', missing.length === 0, missing.join('، '));

const versions = new Set(refs.map(r => (r.includes('?v=') ? r.split('?v=')[1] : 'بلا إصدار')));
check('إصدار واحد لكل الملفات', versions.size === 1 && !versions.has('بلا إصدار'), [...versions].join(' / '));

const between = (source, start, end) => {
  const from = source.indexOf(start);
  if (from < 0) return null;
  const to = source.indexOf(end, from + start.length);
  return to < 0 ? null : source.slice(from + start.length, to);
};
const site = read('sheets.js');
const service = read('apps-script/workshop-api.gs');
const pairs = [
  ['المراحل', between(site, 'const stages={', '};'), between(service, 'var STAGES = {', '};')],
  ['المجالات', between(site, 'const areas={', '};'), between(service, 'var AREAS = {', '};')],
  ['الإجراء عند', between(site, 'const actions={', '};'), between(service, 'var ACTION_AT = {', '};')],
  ['اتجاه الكتاب', between(site, 'const directions={', '};'), between(service, 'var DIRECTIONS = {', '};')],
  ['حالة العمل', between(site, 'const workStates={', '};'), between(service, 'var WORK_STATES = {', '};')],
  ['حالة الرد', between(site, 'const replyStates={', '};'), between(service, 'var REPLY_STATES = {', '};')],
  ['حالة الكتاب', between(site, 'const closureStates={', '};'), between(service, 'var CLOSURE_STATES = {', '};')],
  ['مرحلة العمل الفني', between(site, 'const phases={', '};'), between(service, 'var PHASES = {', '};')],
  ['حالة التسليم', between(site, 'const handovers={', '};'), between(service, 'var HANDOVERS = {', '};')],
  ['طرف العمل', between(site, 'const parties={', '};'), between(service, 'var PARTIES = {', '};')],
  ['نوع العمل', between(site, 'const jobKinds={', '};'), between(service, 'var JOB_KINDS = {', '};')],
  ['حالة العمل في الأعمال', between(site, 'const jobStates={', '};'), between(service, 'var JOB_STATES = {', '};')]
];
// تُقارن الأزواج مفتاحاً بقيمة بعد إزالة المسافات وعلامات الاقتباس.
const normalise = block => block == null ? null :
  block.replace(/\s|'/g, '').split(',').filter(Boolean).sort().join('|');
for (const [label, a, b] of pairs) {
  check('تطابق ' + label + ' بين الموقع والخدمة', a != null && b != null && normalise(a) === normalise(b),
    a == null ? 'لم يُعثر عليها في sheets.js' : b == null ? 'لم يُعثر عليها في الخدمة' : 'مختلفة');
}

const headerPairs = [
  ['رؤوس المتابعات', between(site, 'const headers=[', '];'), between(service, 'var HEADERS = [', '];')],
  ['رؤوس المراجع', between(site, 'const sourceHeaders=[', '];'), between(service, 'var SOURCE_HEADERS = [', '];')],
  ['رؤوس المراسلات', between(site, 'const letterHeaders=[', '];'), between(service, 'var LETTER_HEADERS = [', '];')],
  ['رؤوس المعدات', between(site, 'const equipmentHeaders=[', '];'), between(service, 'var EQUIPMENT_HEADERS = [', '];')],
  ['رؤوس الأعمال', between(site, 'const jobHeaders=[', '];'), between(service, 'var JOB_HEADERS = [', '];')],
  ['الأعمدة الاختيارية', between(site, 'const optionalHeaders=[', '];'), between(service, 'var OPTIONAL_HEADERS = [', '];')]
];
for (const [label, a, b] of headerPairs) {
  check('تطابق ' + label, a != null && b != null && a.replace(/\s|'/g, '') === b.replace(/\s|'/g, ''),
    a == null || b == null ? 'مفقودة' : 'مختلفة');
}

console.log(failures ? `\nفشل ${failures} فحصاً — لا تنشر قبل إصلاحها.` : '\nجاهز للنشر.');
process.exit(failures ? 1 : 0);
