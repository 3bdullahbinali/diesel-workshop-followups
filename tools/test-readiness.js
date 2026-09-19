'use strict';
/** اختبارات قارئ سجل الجاهزية: node tools/test-readiness.js */
const fs = require('fs');
const path = require('path');
const sandbox = {document:{}};
const load = file => new Function('globalThis', fs.readFileSync(path.join(__dirname, '..', file), 'utf8'))(sandbox);
load('sheets.js');
load('readiness-model.js');
const M = sandbox.WorkshopReadinessModel;
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

// صف معدة: هوية فقط، وهو ما سيبدو عليه الشيت يوم إنشائه.
const bare = over => Object.assign(new Array(23).fill(''), {0:'EQ-0001', 1:'SY/6-33', 2:'مضخة', 3:'6', 4:'Sykes', 21:'معدة', 22:'دائم'}, over);
const one = over => M.equipmentEntries([bare(over)])[0];

// ١) الشيت الفارغ لا يسقط ولا يُخمَّن
check('صف بهوية فقط يُقرأ', one().asset === 'SY/6-33');
check('الحالة الفنية الفارغة null لا صفر', one().technical === null);
check('الجهة الفارغة null', one().place === null && one().sector === null);
check('التاريخ الفارغ null', one().handoverDate === null && one().lastMaintenance === null);
check('المقاس يُقرأ رقماً', one().size === 6);
check('وحدة السد بلا مقاس مقبولة', M.equipmentEntries([bare({2:'وحدة سد', 3:''})])[0].size === null);

// ٢) القيم المكتوبة تُقرأ بصرامة
check('الحالة الفنية بالعربية تُقرأ مفتاحاً', one({7:'تحتاج صيانة'}).technical === 'needs_maintenance');
check('الحالة الفنية بالمفتاح تُقرأ', one({7:'ready'}).technical === 'ready');
check('حالة التشغيل تُقرأ', one({8:'احتياط'}).operation === 'standby');
check('حالة التسليم تُقرأ', one({12:'مسلّمة'}).handover === 'delivered');
throws('قيمة فنية غير معروفة تُرفض', () => one({7:'جاهز'}), 'قيمة غير معروفة');
throws('الرفض يذكر رقم المعدة', () => one({8:'شغالة'}), 'SY/6-33');
throws('مقاس غير رقمي يُرفض', () => one({3:'ستة'}), 'قيمة رقمية غير صالحة');
check('الأرقام العربية تُقرأ', one({15:'١٢٥٠'}).operatingHours === 1250);

// ٣) القطاع يُشتق، والتناقض يُرفَض
check('القطاع يُشتق من الجهة', one({9:'القطاع ٣'}).sector === 'SEC-3');
check('رمز القطاع المطابق مقبول', one({9:'القطاع ٣', 10:'SEC-3'}).sector === 'SEC-3');
throws('رمز قطاع مخالف للجهة يُرفض', () => one({9:'القطاع ٣', 10:'SEC-2'}), 'لا يطابق');
throws('رمز قطاع غير معروف يُرفض', () => one({10:'SEC-9'}), 'رمز قطاع غير معروف');
check('الورشة ليست قطاعاً', one({9:'الورشة'}).sector === null);

// ٤) الهوية
throws('رقم معدة مفقود يُرفض', () => M.equipmentEntries([bare({1:''})]), 'رقم المعدة مفقود');
throws('معرف مكرر يُرفض', () => M.equipmentEntries([bare(), bare({1:'SY/6-34'})]), 'مكرر');
check('معرفان مختلفان مقبولان', M.equipmentEntries([bare(), bare({0:'EQ-0002', 1:'SY/6-34'})]).length === 2);

// ٥) العدّادات تحمل مقامها
const fleet = M.equipmentEntries([
  bare({0:'A', 1:'A', 7:'جاهزة',      9:'الورشة',       12:'غير مسلّمة'}),
  bare({0:'B', 1:'B', 7:'جاهزة',      9:'القطاع ١',     12:'مسلّمة'}),
  bare({0:'C', 1:'C', 7:'تحتاج صيانة', 9:'الورشة',       12:'غير مسلّمة'}),
  bare({0:'D', 1:'D', 7:'تحت الصيانة', 9:'الورشة',       12:'غير مسلّمة'}),
  bare({0:'E', 1:'E', 7:'جاهزة',      9:'الورشة',       12:'مسلّمة'}),
  bare({0:'F', 1:'F', 7:'تحتاج فحصًا', 9:'المستودع'}),
  bare({0:'G', 1:'G'})
]);
const s = M.summary(fleet);
check('الإجمالي يشمل غير المدخل', s.total === 7);
check('المُدخل والمعلّق يكملان الإجمالي', s.entered === 6 && s.pending === 1);
check('جاهزة للتسليم = سليمة + بالورشة + غير مسلّمة', s.readyToHandOver === 1, String(s.readyToHandOver));
check('المسلّمة تُحسب بالعهدة لا بالمكان', s.delivered === 2, String(s.delivered));
check('داخل الورشة يشمل الجاهزة وتحت الصيانة', s.workshop === 4, String(s.workshop));
check('الصيانة تجمع «تحتاج» و«تحت»', s.maintenance === 2, String(s.maintenance));
check('بلا جهة مُحصاة صراحة', s.placeless === 1);
check('القطاعات خمسة دائماً', s.sectors.length === 5 && s.sectors[0].count === 1);

// معدة مسلّمة وعائدة للورشة للصيانة ليست جاهزة للتسليم
check('مسلّمة داخل الورشة لا تُعد جاهزة للتسليم',
  M.summary(M.equipmentEntries([bare({7:'جاهزة', 9:'الورشة', 12:'مسلّمة'})])).readyToHandOver === 0);

// ٦) المرشّحات
check('مرشّح «لم تُدخل حالتها» يلتقط الفارغ', fleet.filter(M.filters.pending).length === 1);
check('مرشّح الجاهزة يطابق العدّاد', fleet.filter(M.filters.ready).length === s.readyToHandOver);
check('مرشّح المسلّمة يطابق العدّاد', fleet.filter(M.filters.delivered).length === s.delivered);

// ٧) تجميع المقاسات
const groups = M.sizeGroups(M.equipmentEntries([
  bare({0:'a', 1:'a', 3:'12'}), bare({0:'b', 1:'b', 3:'6'}), bare({0:'c', 1:'c', 3:'6'}),
  bare({0:'d', 1:'d', 2:'وحدة سد', 3:''}), bare({0:'e', 1:'e', 3:''})
]));
check('المقاسات مرتبة تصاعدياً', groups.map(g => g.key).join(',') === '6,12,dam,unknown', groups.map(g => g.key).join(','));
check('عدّ المقاس صحيح', groups[0].count === 2);

// ٨) الخراطيم والدليل والقطاعات
const hose = M.hoseEntries([Object.assign(new Array(17).fill(''), {0:'HS-1', 1:'14040793', 2:'خرطوم طرد', 3:'4', 4:'100', 6:'لفة', 7:'3'})])[0];
check('الخرطوم يُقرأ', hose.kind === 'discharge' && hose.unit === 'roll' && hose.quantity === 3);
check('الكمية الفارغة null لا صفر', M.hoseEntries([Object.assign(new Array(17).fill(''), {0:'HS-2', 1:'x'})])[0].quantity === null);
throws('نوع خرطوم غير معروف يُرفض', () => M.hoseEntries([Object.assign(new Array(17).fill(''), {0:'HS-3', 2:'خرطوم ضخ'})]), 'قيمة غير معروفة');
check('دليل الخراطيم يُقرأ', M.catalogEntries([['14040815', 'خرطوم سحب', '6', '6', 'Bauer', 'عدد', '']])[0].size === 6);
check('القطاعات تُقرأ', M.sectorEntries([['SEC-2', 'القطاع ٢', 'فلان', '', '', '', '', '']])[0].owner === 'فلان');
throws('رمز قطاع خاطئ في ورقة القطاعات يُرفض', () => M.sectorEntries([['S2', '', '', '', '', '', '', '']]), 'رمز قطاع غير معروف');

// ٩) رؤوس الأعمدة تطابق القالب المسلَّم للفريق
check('رؤوس المعدات ٢٣ عموداً', M.equipmentHeaders.length === 23);
check('أول رأس معرف السجل وآخره نوع رقم المعدة',
  M.equipmentHeaders[0] === 'معرف السجل' && M.equipmentHeaders[22] === 'نوع رقم المعدة');
check('رؤوس الخراطيم ١٧ عموداً', M.hoseHeaders.length === 17);

console.log(failures ? `\nفشل ${failures} اختباراً.` : `\nنجحت كل الاختبارات.`);
process.exit(failures ? 1 : 0);
