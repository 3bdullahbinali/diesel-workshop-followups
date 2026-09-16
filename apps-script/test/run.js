const {book, Sheet, api} = require('./harness.js');
const post = body => JSON.parse(api.doPost({postData:{contents:JSON.stringify(body)}}).getContent());
const get = () => JSON.parse(api.doGet().getContent());
let pass=0, fail=0;
const check=(label,cond,extra='')=>{ (cond?pass++:fail++); console.log((cond?'✓':'✗')+' '+label+(cond?'':' — '+extra)); };

// الأوراق كما في الملف الحقيقي
const main = new Sheet('المتابعات', api.CONFIG.mainSheetId);
main.appendRow(api.HEADERS);
main.appendRow(['base-1','مروحة تبريد متنقلة','عالية','يحتاج إجراء','متابعة الطلب','أحمد','01/09/2026','','800','','حالة مسجلة','م. منير','طلبات تحتاج إجراء','','14/09/2026 12:06:04','SMRF-05','ملاحظة','','','','','','']);
const refs = new Sheet('المراجع والسجل', api.CONFIG.sourceSheetId);
refs.appendRow(api.SOURCE_HEADERS);
refs.appendRow(['base-1','مرجع','01/09/2026','رسالة','واتساب']);
book.sheets.push(main, refs);

console.log('— الإعداد —');
check('setup ينجح', api.setup().includes('تم الإعداد'));
check('أنشأ أوراق المستخدمين والجلسات والسجل', ['المستخدمون','الجلسات','سجل التعديلات'].every(n=>book.getSheetByName(n)));
check('ضبط المنطقة الزمنية', book.getSpreadsheetTimeZone()==='Asia/Dubai');
check('addUser ينجح', api.addUser('abdullah','عبدالله','admin','workshop12345').includes('تم حفظ'));
api.addUser('sami','سامي','editor','editor123456');
check('كلمة المرور غير مخزّنة كنص', !JSON.stringify(book.getSheetByName('المستخدمون').rows).includes('workshop12345'));

console.log('\n— الدخول —');
check('كلمة مرور خاطئة تُرفض', post({action:'login',username:'abdullah',password:'wrong'}).ok===false);
const login = post({action:'login',username:'abdullah',password:'workshop12345'});
check('دخول صحيح', login.ok===true, JSON.stringify(login));
check('يعيد الصلاحية والاسم', login.user.role==='admin'&&login.user.name==='عبدالله');
check('يبلّغ بحالة الأعمدة التشغيلية', login.features && login.features.operational===false);
const token = login.token;
check('الجلسة صالحة', post({action:'session',token}).ok===true);
check('رمز غير صحيح يُرفض', post({action:'session',token:'x'}).ok===false);

console.log('\n— الإضافة —');
const created = post({action:'create',token,item:{title:'بند جديد من الموقع',priority:'high',stage:'quotes',group:'quotes',action:'طلب عروض',owner:'عبدالله',informationDate:'2026-09-16',status:'قيد الإعداد',followUpWith:'المشتريات',reference:'REF-1',notes:'',area:'procurement',actionAt:'me',blocker:'بانتظار الموازنة'}});
check('الإضافة تنجح', created.ok===true, JSON.stringify(created));
check('تولّد معرّفاً جديداً', created.id==='web-1', created.id);
const row = main.rows[main.getLastRow()-1];
check('كُتب الموضوع والأولوية بالعربية', row[1]==='بند جديد من الموقع'&&row[2]==='عالية', JSON.stringify(row.slice(0,4)));
check('كُتبت الحالة كنص عربي', row[3]==='بانتظار العروض', row[3]);
check('تاريخ المعلومة كتاريخ', row[6] instanceof Date, String(row[6]));
check('وقت التعديل بصيغة الإمارات', /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(row[14]), String(row[14]));
check('الحقول التشغيلية أُهملت بلا عمود', row.length<=api.HEADERS.length, 'width='+row.length);
check('سُجّل في سجل التعديلات', book.getSheetByName('سجل التعديلات').getLastRow()===2);

console.log('\n— القيم غير المقبولة —');
check('حالة غير معروفة تُرفض', post({action:'create',token,item:{title:'x',priority:'high',stage:'غير موجودة',group:'quotes',action:'a',owner:'o',informationDate:'2026-09-16'}}).ok===false);
check('تصنيف غير معروف يُرفض', post({action:'create',token,item:{title:'x',priority:'high',stage:'quotes',group:'nope',action:'a',owner:'o',informationDate:'2026-09-16'}}).ok===false);
check('تاريخ بصيغة خاطئة يُرفض', post({action:'create',token,item:{title:'x',priority:'high',stage:'quotes',group:'quotes',action:'a',owner:'o',informationDate:'16/09/2026'}}).ok===false);
check('موضوع فارغ يُرفض', post({action:'create',token,item:{title:'  ',priority:'high',stage:'quotes',group:'quotes',action:'a',owner:'o',informationDate:'2026-09-16'}}).ok===false);

console.log('\n— الأعمدة التشغيلية —');
check('addOperationalColumns يضيفها', api.addOperationalColumns().includes('أُضيفت'));
check('العناوين الثلاثة في الصف الأول', ['المجال','الإجراء عند','العائق'].every(h=>main.rows[0].includes(h)), JSON.stringify(main.rows[0].slice(23)));
check('تكرار التشغيل لا يضاعفها', api.addOperationalColumns().includes('موجودة مسبقاً'));
check('الخدمة تبلّغ بالدعم الآن', post({action:'session',token}).features.operational===true);
const created2 = post({action:'create',token,item:{title:'بند بالحقول التشغيلية',priority:'medium',stage:'coordination',group:'vehicles',action:'متابعة',owner:'سامي',informationDate:'2026-09-16',area:'vehicles',actionAt:'external',blocker:'بانتظار التصريح'}});
const row2 = main.rows[main.getLastRow()-1];
check('كُتب المجال', row2[23]==='مركبات الإدارة والسائقون', String(row2[23]));
check('كُتب الإجراء عند', row2[24]==='بانتظار جهة أخرى', String(row2[24]));
check('كُتب العائق', row2[25]==='بانتظار التصريح', String(row2[25]));

console.log('\n— التعديل والتزامن —');
const target = 'base-1';
const stale = post({action:'update',token,id:target,item:{title:'محدّث',priority:'high',stage:'action',group:'purchase-action',action:'a',owner:'o',informationDate:'2026-09-16'},expectedUpdatedAt:'2020-01-01T00:00:00.000Z'});
check('طابع قديم يُرفض', stale.ok===false && stale.error.includes('عُدّل هذا البند'), JSON.stringify(stale));
const fresh = post({action:'update',token,id:target,item:{title:'محدّث من الموقع',priority:'high',stage:'action',group:'purchase-action',action:'متابعة جديدة',owner:'عبدالله',informationDate:'2026-09-16'},expectedUpdatedAt:'2026-09-14T08:06:04.000Z'});
check('الطابع الصحيح (ISO) يُقبل', fresh.ok===true, JSON.stringify(fresh));
check('تغيّر الموضوع فعلياً', main.rows[1][1]==='محدّث من الموقع', String(main.rows[1][1]));
check('سجّل التغييرات بالتفصيل', String(book.getSheetByName('سجل التعديلات').rows.at(-1)[5]).includes('الموضوع'));

console.log('\n— الصلاحيات والحذف —');
const editor = post({action:'login',username:'sami',password:'editor123456'});
check('المحرر يضيف', post({action:'create',token:editor.token,item:{title:'من المحرر',priority:'low',stage:'coordination',group:'coordination',action:'a',owner:'سامي',informationDate:'2026-09-16',area:'admin',actionAt:'team'}}).ok===true);
check('المحرر لا يحذف', post({action:'delete',token:editor.token,id:'web-1'}).ok===false);
const before = main.getLastRow();
const del = post({action:'delete',token,id:'web-1'});
check('المدير يحذف', del.ok===true, JSON.stringify(del));
check('نقص صف من الورقة', main.getLastRow()===before-1);
check('أُضيف سطر «محذوف» في المراجع', refs.rows.some(r=>r[0]==='web-1'&&r[1]==='محذوف'));
check('حذف بند غير موجود يُرفض', post({action:'delete',token,id:'لا-يوجد'}).ok===false);

console.log('\n— الفحص الذاتي والخروج —');
const status = get();
check('doGet يرى الورقة', status.ok===true && status.sheet==='المتابعات', JSON.stringify(status));
check('يعرض العدد والجاهزية', status.records>0 && status.ready===true && status.operational===true, JSON.stringify(status));
check('الخروج يبطل الجلسة', post({action:'logout',token}).ok===true && post({action:'session',token}).ok===false);

console.log('\n'+(fail? `فشل ${fail} من ${pass+fail}` : `نجحت جميع الاختبارات (${pass})`));
process.exit(fail?1:0);
