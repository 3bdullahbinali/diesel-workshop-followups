'use strict';
/** اختبارات قارئ الموارد: node tools/test-resources.js */
const fs = require('fs');
const path = require('path');
const sandbox = {document:{}};
const load = file => new Function('globalThis', fs.readFileSync(path.join(__dirname, '..', file), 'utf8'))(sandbox);
load('sheets.js'); load('readiness-model.js'); load('resources-model.js');
const M = sandbox.WorkshopResourcesModel;
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log((ok ? '✓ ' : '✗ ') + label + (ok ? '' : ' — ' + detail));
  if (!ok) failures++;
};
const throws = (label, fn, fragment) => {
  let message = null;
  try { fn(); } catch (error) { message = error.message; }
  check(label, message != null && message.includes(fragment), message == null ? 'لم يرفض' : message);
};

const item = over => Object.assign(new Array(22).fill(''), {0:'14041068', 1:'قطع غيار',
  2:'MECHANICAL SEAL', 9:'عدد', 10:'كمي', 12:'لم يُجرد بعد'}, over);
const stock = over => Object.assign(new Array(23).fill(''), {0:'REF-1', 1:'14041068',
  2:'MECHANICAL SEAL', 3:'قطع غيار', 5:'عدد', 17:'لم يكتمل الجرد', 21:'مرجعية غير متحققة'}, over);
const need = over => Object.assign(new Array(23).fill(''), {0:'NEED-0001', 1:'SEC-1',
  2:'Sector 1', 3:'مضخة', 4:'6', 5:'عدد', 6:'2', 10:'قيد الدراسة', 13:'مرجعية غير متحققة'}, over);
const one = over => M.catalogEntries([item(over)])[0];

// ١) الدليل
check('الصنف يُقرأ', one().code === '14041068' && one().group === 'spare');
check('الوحدة وطريقة التتبع تُقرآن', one().unit === 'piece' && one().tracking === 'quantity');
check('رقم القطعة وكود SAP يُقرآن', (x => x.partNumber === '4810081163' && x.sapCode === '14041068')
  (one({4:'4810081163', 13:'14041068'})));
check('القطر الفارغ null لا صفر', one().size === null);
throws('مجموعة غير معروفة تُرفض', () => one({1:'قطع'}), 'قيمة غير معروفة');
throws('الرفض يذكر كود الصنف', () => one({9:'حبة'}), '14041068');
throws('كود مكرر يُرفض', () => M.catalogEntries([item(), item()]), 'مكرر');
throws('كود مفقود يُرفض', () => M.catalogEntries([item({0:''})]), 'كود صنف مفقود');

// ٢) المخزون: الفراغ «لم يُجرد» لا صفر
check('سطر المخزون يُقرأ', M.stockEntries([stock()])[0].state === 'incomplete');
check('الرصيد الفارغ null لا صفر', M.stockEntries([stock()])[0].onHand === null);
check('الرصيد المكتوب يُقرأ', M.stockEntries([stock({7:'12', 8:'9'})])[0].onHand === 12);
check('صفر مكتوب يبقى صفراً', M.stockEntries([stock({7:'0'})])[0].onHand === 0);
check('الرصيد التاريخي منفصل عن الجرد',
  (x => x.priorBalance === 5 && x.onHand === null)(M.stockEntries([stock({18:'5'})])[0]));
throws('كود الصنف مفقود في المخزون يُرفض', () => M.stockEntries([stock({1:''})]), 'كود الصنف مفقود');

// ٣) الاحتياجات
check('الاحتياج يُقرأ', (x => x.kind === 'pump' && x.size === 6 && x.wanted === 2)(M.needEntries([need()])[0]));
check('خرطوم الطرد بالمتر', (x => x.kind === 'discharge' && x.unit === 'metre')
  (M.needEntries([need({3:'خرطوم طرد', 5:'متر', 6:'300'})])[0]));
check('بند بلا قطاع مقبول', M.needEntries([need({1:''})])[0].sector === null);
throws('رمز قطاع غير معروف يُرفض', () => M.needEntries([need({1:'SEC-9'})]), 'رمز قطاع غير معروف');
throws('نوع احتياج غير معروف يُرفض', () => M.needEntries([need({3:'ونش'})]), 'قيمة غير معروفة');
// المتبقي لا يُختلق: بلا تسليم مسجل يبقى الاحتياج كاملاً، وبلا كمية يبقى مجهولاً
check('المتبقي بلا تسليم = الكمية', M.remaining(M.needEntries([need()])[0]) === 2);
check('المتبقي بعد تسليم جزئي', M.remaining(M.needEntries([need({7:'1'})])[0]) === 1);
check('المتبقي بلا كمية مجهول', M.remaining(M.needEntries([need({6:''})])[0]) === null);

// ٤) العدّادات
const cat = M.catalogEntries([item(), item({0:'A', 1:'معدات'}), item({0:'B', 1:'أدوات'})]);
const st  = M.stockEntries([stock(), stock({0:'REF-2', 1:'A', 7:'4'})]);
const nd  = M.needEntries([need(), need({0:'N2', 1:'SEC-3', 3:'خرطوم طرد', 5:'متر', 6:'300'}),
                           need({0:'N3', 1:'', 6:'5'})]);
const s = M.summary(cat, st, nd);
check('عدّ الأصناف', s.items === 3);
check('المجرود يُحسب بكتابة الرصيد لا بوجود السطر', s.counted === 1 && s.uncounted === 1, `${s.counted}/${s.uncounted}`);
check('صنف بلا سطر جرد يُحصى', s.unlisted === 1, String(s.unlisted));
check('بنود الاحتياج', s.needs === 3 && s.placeless === 1);
// جمع مضخة إلى متر خرطوم رقم بلا معنى، فتُجمع كل وحدة وحدها
check('الكميات تُجمع بالوحدة لا جملةً',
  (w => w.length === 2 && w.find(x => x.unit === 'metre').total === 300
     && w.find(x => x.unit === 'piece').total === 7)(s.wanted),
  JSON.stringify(s.wanted));
check('القطاعات خمسة دائماً', s.sectors.length === 5 && s.sectors[0].count === 1);
check('المجموعات تُحصى', s.groups.length === 3);

// ٥) تجميع الاحتياج بالنوع والمقاس
const groups = M.needGroups(nd);
check('أكبر مجموعة أولاً', groups[0].total === 300 && groups[0].kind === 'discharge');
check('المجموعة تحمل وحدتها وعدد قطاعاتها',
  groups[0].unit === 'metre' && groups[0].sectors === 1);
check('المضخات ٦ بوصة مجموعة واحدة',
  (g => g && g.count === 2 && g.total === 7)(groups.find(x => x.kind === 'pump' && x.size === 6)),
  JSON.stringify(groups.map(g => g.label + '=' + g.total)));

// ٦) الرؤوس تطابق الشيت القائم
check('رؤوس الدليل ٢٢ والمخزون ٢٣ والاحتياجات ٢٣',
  M.catalogHeaders.length === 22 && M.stockHeaders.length === 23 && M.needHeaders.length === 23);
check('أول رأس في كل ورقة',
  M.catalogHeaders[0] === 'كود الصنف' && M.stockHeaders[0] === 'معرف سجل المورد'
  && M.needHeaders[0] === 'معرف الاحتياج');

console.log(failures ? `\nفشل ${failures} اختباراً.` : `\nنجحت كل الاختبارات.`);
process.exit(failures ? 1 : 0);
