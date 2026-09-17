'use strict';
/** اختبارات قارئ الشيت: node tools/test-reader.js */
const fs = require('fs');
const path = require('path');
const sandbox = {};
new Function('globalThis', fs.readFileSync(path.join(__dirname, '..', 'sheets.js'), 'utf8'))(sandbox);
const S = sandbox.WorkshopSheets;
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log((ok ? '✓ ' : '✗ ') + label + (ok ? '' : ' — ' + detail));
  if (!ok) failures++;
};
const snap = {schemaVersion:1, items:[], groups:[{id:'all',label:'جميع المتابعات'},{id:'coordination',label:'التنسيق والجاهزية'}],
  latestInformationDate:'2026-09-01', updatedAt:'2026-09-01T00:00:00.000Z', sync:{lastReviewAt:'2026-09-01T00:00:00.000Z'}};
const row = (over = {}) => {
  const r = new Array(26).fill('');
  r[0]='x1'; r[1]='بند'; r[2]='عالية'; r[3]='بانتظار المتابعة'; r[4]='إجراء'; r[5]='مسؤول';
  r[6]='2026-09-16'; r[12]='التنسيق والجاهزية'; r[14]='16/09/2026 10:00:00';
  return Object.assign(r, over);
};
const read = over => S.merge(snap, [row(over)], []).items[0];

// الأعمدة التشغيلية ليست أعمدة شراء — هذا ما حوّل كل بند إلى طلب شراء.
check('بند بأعمدة تشغيلية فقط ليس طلب شراء',
  !read({23:'الصيانة والفحص والدعم الفني', 24:'عند الفريق', 25:'عائق'}).procurement);
check('حقوله التشغيلية تُقرأ', (r => r.area==='maintenance' && r.actionAt==='team' && r.blocker==='عائق')
  (read({23:'الصيانة والفحص والدعم الفني', 24:'عند الفريق', 25:'عائق'})));
check('رقم PR يجعله طلب شراء', Boolean(read({7:'PR10012345'}).procurement));
check('نوع الطلب وحده يجعله طلب شراء', Boolean(read({17:'طلب شراء'}).procurement));
check('نوع فارغ مع رقم PR يُستنتج طلب شراء', read({7:'PR1'}).procurement.kind === 'pr');
check('نوع فارغ مع رقم LPO يُستنتج أمر توريد', read({20:'LPO-9'}).procurement.kind === 'lpo');
check('نوع فارغ بلا أرقام يُستنتج غير مرقم', read({8:'1200'}).procurement.kind === 'unregistered');
check('مرحلة شراء فارغة ترجع لحالة البند', read({7:'PR1'}).procurement.stage === 'coordination');
try { read({17:'نوع غريب'}); check('قيمة مجهولة تُرفض', false, 'لم تُرفض'); }
catch (error) { check('قيمة مجهولة تُرفض وتذكر البند', error.message.includes('في بند x1'), error.message); }
check('سطر محذوف لا يُعدّ مرجعاً', (() => {
  const result = S.merge({...snap, items:[{id:'gone', sources:[], history:[], procurement:null}]},
    [row()], [['gone','محذوف','2026-09-16','أحد','حُذف']]);
  return result.items.length === 1;
})());

// ورقة الأعمال: تُقرأ بالاسم، وقيمها العربية تتحول إلى مفاتيح.
const jobRow = (over = {}) => Object.assign(
  ['job-1','تصليح مضخة','نقدّمه لجهة','قسم الشبكات','الأعمال المطلوب إنجازها','قيد التنفيذ','م. سالم','2026-09-10','2026-09-20','x1','ملاحظة','16/09/2026 10:00:00'], over);
check('قراءة عمل كاملة', (j => j.id==='job-1' && j.party==='outbound' && j.kind==='pending' && j.state==='in_progress'
  && j.startDate==='2026-09-10' && j.taskId==='x1')(S.jobEntries([jobRow()])[0]));
check('خلايا اختيارية فارغة مقبولة',
  S.jobEntries([jobRow({3:'',6:'',7:'',8:'',9:'',10:''})])[0].taskId === null);
check('التسمية القديمة «بيندنق جوب» تبقى مقروءة', S.jobEntries([jobRow({4:'بيندنق جوب'})])[0].kind === 'pending');
check('التسمية الوسيطة تبقى مقروءة', S.jobEntries([jobRow({4:'عمل قيد الانتظار'})])[0].kind === 'pending');
try { S.jobEntries([jobRow({2:'طرف غريب'})]); check('طرف مجهول يُرفض', false, 'لم يُرفض'); }
catch (error) { check('طرف مجهول يُرفض ويذكر العمل', error.message.includes('job-1'), error.message); }
try { S.jobEntries([jobRow(), jobRow()]); check('معرّف مكرر يُرفض', false, 'لم يُرفض'); }
catch (error) { check('معرّف مكرر يُرفض', true); }
try { S.jobEntries([jobRow({1:''})]); check('موضوع مفقود يُرفض', false, 'لم يُرفض'); }
catch (error) { check('موضوع مفقود يُرفض', error.message.includes('job-1'), error.message); }

console.log(failures ? `\nفشل ${failures} اختباراً.` : `\nنجحت جميع اختبارات القارئ.`);
process.exit(failures ? 1 : 0);
