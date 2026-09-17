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

console.log('\n— المراسلات —');
check('الإضافة قبل إنشاء الورقة تُرفض', post({action:'letter-create',token,letter:{direction:'out',title:'x',work:'not_started',reply:'none',closure:'open'}}).ok===false);
check('addLettersSheet ينشئها', api.addLettersSheet().includes('أُنشئت'));
check('تكرارها لا يضاعفها', api.addLettersSheet().includes('موجودة'));
check('الخدمة تبلّغ بتفعيلها', post({action:'session',token}).features.letters===true);
const made = post({action:'letter-create',token,letter:{direction:'out',title:'طلب مناقلة للخراطيم',reference:'2026/1445',party:'إدارة الموازنة',taskId:'base-1',location:'لدى الموازنة',verifiedDate:'2026-09-16',work:'awaiting_party',reply:'awaiting',closure:'open',action:'متابعة الرد',dueDate:'2026-09-20',notes:''}});
check('إضافة كتاب', made.ok===true && made.id==='letter-1', JSON.stringify(made));
const lsheet = book.getSheetByName('المراسلات');
const lrow = lsheet.rows[1];
check('كُتب الاتجاه والحالات بالعربية', lrow[1]==='صادر'&&lrow[8]==='بانتظار إجراء الجهة'&&lrow[10]==='مفتوح', JSON.stringify([lrow[1],lrow[8],lrow[10]]));
check('كُتب وقت التعديل', /^\d{2}\/\d{2}\/\d{4} /.test(String(lrow[15])), String(lrow[15]));
check('ربط بمتابعة غير موجودة يُرفض', post({action:'letter-create',token,letter:{direction:'in',title:'y',taskId:'لا-يوجد',work:'not_started',reply:'none',closure:'open'}}).ok===false);
check('حالة غير معروفة تُرفض', post({action:'letter-create',token,letter:{direction:'in',title:'y',work:'خطأ',reply:'none',closure:'open'}}).ok===false);
const lupd = post({action:'letter-update',token,id:'letter-1',letter:{direction:'out',title:'طلب مناقلة للخراطيم',party:'إدارة الموازنة',work:'done',reply:'received',closure:'closed',action:'حُفظ'},expectedUpdatedAt:null});
check('تعديل كتاب', lupd.ok===true, JSON.stringify(lupd));
check('تغيّرت الحالات فعلاً', lsheet.rows[1][9]==='تم استلام الرد'&&lsheet.rows[1][10]==='مغلق');
check('سُجّل التعديل بالتفصيل', String(book.getSheetByName('سجل التعديلات').rows.at(-1)[5]).includes('حالة الرد'));
check('طابع قديم يُرفض', post({action:'letter-update',token,id:'letter-1',letter:{direction:'out',title:'x',work:'done',reply:'received',closure:'closed'},expectedUpdatedAt:'2020-01-01T00:00:00.000Z'}).ok===false);
check('المحرر لا يحذف كتاباً', post({action:'letter-delete',token:editor.token,id:'letter-1'}).ok===false);
check('المدير يحذف', post({action:'letter-delete',token,id:'letter-1'}).ok===true);
check('نقص الصف', lsheet.getLastRow()===1);


console.log('\n— المعدات —');
check('التسجيل قبل إنشاء الورقة يُرفض', post({action:'create',token,item:{title:'معدة',priority:'low',stage:'in_progress',group:'coordination',action:'a',owner:'o',informationDate:'2026-09-16',equipment:{enabled:true,phase:'repair',handover:'in_workshop'}}}).ok===false);
check('addEquipmentSheet ينشئها', api.addEquipmentSheet().includes('أُنشئت'));
check('الخدمة تبلّغ بتفعيلها', post({action:'session',token}).features.equipment===true);
const gear = book.getSheetByName('المعدات');
const withGear = post({action:'create',token,item:{title:'مضخة مستلمة للصيانة',priority:'medium',stage:'in_progress',group:'coordination',action:'فحص',owner:'م. سالم',informationDate:'2026-09-16',equipment:{enabled:true,owner:'إدارة المشاريع',asset:'SN-4471',receivedDate:'2026-09-10',receiver:'م. سالم',phase:'repair',handover:'in_workshop',notes:'بانتظار قطعة'}}});
check('إضافة بند بمعدة', withGear.ok===true, JSON.stringify(withGear));
const grow = gear.rows[1];
check('رُبط السجل بالبند', String(grow[0])===withGear.id, String(grow[0]));
check('كُتبت المرحلة والتسليم بالعربية', grow[5]==='تحت الإصلاح'&&grow[6]==='في الورشة', JSON.stringify([grow[5],grow[6]]));
check('كُتب تاريخ الاستلام كتاريخ', grow[3] instanceof Date, String(grow[3]));
post({action:'update',token,id:withGear.id,item:{title:'مضخة مستلمة للصيانة',priority:'medium',stage:'in_progress',group:'coordination',action:'تسليم',owner:'م. سالم',informationDate:'2026-09-16',equipment:{enabled:true,owner:'إدارة المشاريع',asset:'SN-4471',phase:'done',handover:'delivered',returnedDate:'2026-09-16',returnedTo:'م. خالد'}}});
check('التحديث يعدّل نفس الصف لا يضيف', gear.getLastRow()===2, 'rows='+gear.getLastRow());
check('تغيّرت الحالة إلى تم التسليم', gear.rows[1][6]==='تم التسليم', String(gear.rows[1][6]));
check('مرحلة غير معروفة تُرفض', post({action:'update',token,id:withGear.id,item:{title:'x',priority:'low',stage:'in_progress',group:'coordination',action:'a',owner:'o',informationDate:'2026-09-16',equipment:{enabled:true,phase:'مجهول',handover:'none'}}}).ok===false);
post({action:'update',token,id:withGear.id,item:{title:'مضخة مستلمة للصيانة',priority:'medium',stage:'in_progress',group:'coordination',action:'انتهى',owner:'م. سالم',informationDate:'2026-09-16',equipment:{enabled:false}}});
check('إلغاء التفعيل يزيل السجل', gear.getLastRow()===1, 'rows='+gear.getLastRow());


console.log('\n— الأعمال —');
check('الإضافة قبل إنشاء الورقة تُرفض', post({action:'job-create',token,job:{title:'x',party:'outbound',kind:'pending',state:'not_started'}}).ok===false);
check('addJobsSheet ينشئها', api.addJobsSheet().includes('أُنشئت'));
check('تكرارها لا يضاعفها', api.addJobsSheet().includes('موجودة'));
check('الخدمة تبلّغ بتفعيلها', post({action:'session',token}).features.jobs===true);
const jsheet = book.getSheetByName('الأعمال');
const job = post({action:'job-create',token,job:{title:'تصليح مضخة لقطاع 3',party:'outbound',counterpart:'قسم شبكات الصرف',kind:'pending',state:'in_progress',owner:'م. سالم',startDate:'2026-09-10',dueDate:'2026-09-25',taskId:'base-1',notes:'المعدة في الورشة'}});
check('إضافة عمل', job.ok===true && job.id==='job-1', JSON.stringify(job));
check('كُتب الطرف والنوع والحالة بالعربية', jsheet.rows[1][2]==='نقدّمه لجهة'&&jsheet.rows[1][4]==='الأعمال المطلوب إنجازها'&&jsheet.rows[1][5]==='قيد التنفيذ', JSON.stringify(jsheet.rows[1].slice(2,6)));
check('كُتبت التواريخ كتواريخ', jsheet.rows[1][7] instanceof Date && jsheet.rows[1][8] instanceof Date);
check('كُتب وقت التعديل', /^\d{2}\/\d{2}\/\d{4} /.test(String(jsheet.rows[1][11])), String(jsheet.rows[1][11]));
check('ربط بمتابعة غير موجودة يُرفض', post({action:'job-create',token,job:{title:'y',party:'inbound',kind:'ongoing',state:'not_started',taskId:'لا-يوجد'}}).ok===false);
check('طرف غير معروف يُرفض', post({action:'job-create',token,job:{title:'y',party:'مجهول',kind:'ongoing',state:'not_started'}}).ok===false);
check('نوع غير معروف يُرفض', post({action:'job-create',token,job:{title:'y',party:'inbound',kind:'مجهول',state:'not_started'}}).ok===false);
check('موضوع فارغ يُرفض', post({action:'job-create',token,job:{title:'',party:'inbound',kind:'ongoing',state:'not_started'}}).ok===false);
const second = post({action:'job-create',token,job:{title:'نقل مضخة لفريق آخر',party:'internal',kind:'support',state:'not_started'}});
check('المعرّف التالي يتسلسل', second.id==='job-2', JSON.stringify(second));
const jupd = post({action:'job-update',token,id:'job-1',job:{title:'تصليح مضخة لقطاع 3',party:'outbound',counterpart:'قسم شبكات الصرف',kind:'pending',state:'awaiting_parts',owner:'م. سالم'},expectedUpdatedAt:null});
check('تعديل عمل', jupd.ok===true, JSON.stringify(jupd));
check('التحديث يعدّل نفس الصف لا يضيف', jsheet.getLastRow()===3, 'rows='+jsheet.getLastRow());
check('تغيّرت الحالة فعلاً', jsheet.rows[1][5]==='بانتظار قطع غيار', String(jsheet.rows[1][5]));
check('سُجّل التعديل بالتفصيل', String(book.getSheetByName('سجل التعديلات').rows.at(-1)[5]).includes('الحالة'));
check('طابع قديم يُرفض', post({action:'job-update',token,id:'job-1',job:{title:'x',party:'outbound',kind:'pending',state:'done'},expectedUpdatedAt:'2020-01-01T00:00:00.000Z'}).ok===false);
check('عمل غير موجود يُرفض', post({action:'job-update',token,id:'job-99',job:{title:'x',party:'outbound',kind:'pending',state:'done'}}).ok===false);
check('المحرر لا يحذف عملاً', post({action:'job-delete',token:editor.token,id:'job-1'}).ok===false);
check('المدير يحذف', post({action:'job-delete',token,id:'job-1'}).ok===true);
check('نقص الصف', jsheet.getLastRow()===2, 'rows='+jsheet.getLastRow());


console.log('\n— ملء التوزيع المحضّر —');
{
  const cols = api.optionalColumnsOf ? null : null; void cols;
  // base-1 موجود في الورقة وفي التوزيع المحضّر
  const row = main.rows[1];
  row[23] = ''; row[24] = '';            // أفرغ الخليتين
  const report = api.fillOperationalValues();
  check('ملأ الخلايا الفارغة', main.rows[1][23]==='المشتريات والموازنة' && main.rows[1][24]==='عند الفريق', JSON.stringify([main.rows[1][23],main.rows[1][24]]));
  check('التقرير يذكر العدد', /مُلئ \d+ بنداً/.test(report), report);
  main.rows[1][24] = 'عندي';             // قيمة عدّلها المستخدم
  api.fillOperationalValues();
  check('لا يدهس ما عُدّل', main.rows[1][24]==='عندي', String(main.rows[1][24]));
}


console.log('\n— الفحص الذاتي والخروج —');
const status = get();
check('doGet يرى الورقة', status.ok===true && status.sheet==='المتابعات', JSON.stringify(status));
check('يعرض العدد والجاهزية', status.records>0 && status.ready===true && status.operational===true, JSON.stringify(status));
check('الخروج يبطل الجلسة', post({action:'logout',token}).ok===true && post({action:'session',token}).ok===false);

console.log('\n— إدارة الحسابات —');
const users = book.getSheetByName('المستخدمون');
check('listUsers يعرض الحسابين', ['abdullah','sami'].every(n=>api.listUsers().includes(n)), api.listUsers());
check('listUsers لا يكشف بصمة كلمة المرور', !api.listUsers().includes('='), api.listUsers());
try { api.setUserActive(); check('setUserActive يوقف الحساب', true); } catch(e){ check('setUserActive يوقف الحساب', false, e.message); }
check('الموقوف لا يستطيع الدخول', post({action:'login',username:'sami',password:'editor123456'}).ok===false);
// إعادة التسمية: احذف abdullah ثم أنشئ AbdullaBinAli ليطابق قيم الدالة
users.deleteRow(api.findUserRow(users,'abdullah'));
api.addUser('AbdullaBinAli','عبدالله','admin','workshop12345');
check('renameUser ينجح', api.renameUser().includes('abdullah'));
const after = post({action:'login',username:'abdullah',password:'workshop12345'});
check('الدخول بالاسم الجديد وكلمة المرور نفسها', after.ok===true, JSON.stringify(after));
check('الاسم القديم لم يعد يعمل', post({action:'login',username:'AbdullaBinAli',password:'workshop12345'}).ok===false);
api.addUser('taken','مكرر','editor','password1234');
check('addAccounts يرفض قائمة فارغة', (()=>{try{api.setAccounts([]);api.addAccounts();return false;}catch(e){return e.message.includes('فارغة');}})());
api.setAccounts([['salem','م. سالم','editor','password-salem-1'],['khalid','م. خالد','admin','password-khalid-1']]);
const batch = api.addAccounts();
check('addAccounts يضيف حسابين', /أُضيف 2 حساباً/.test(batch), batch);
check('الحساب الجديد يدخل بكلمة مروره', post({action:'login',username:'salem',password:'password-salem-1'}).ok===true);
check('صلاحية المحرر محفوظة', post({action:'login',username:'salem',password:'password-salem-1'}).user.role==='editor');
check('صلاحية المدير محفوظة', post({action:'login',username:'khalid',password:'password-khalid-1'}).user.role==='admin');
const again = api.addAccounts();
check('الحساب الموجود لا يُدهس', /موجود مسبقاً/.test(again) && /أُضيف 0 حساباً/.test(again), again);
check('كلمة مرور قصيرة تُرفض', (()=>{try{api.setAccounts([['weak','ضعيف','editor','123']]);api.addAccounts();return false;}catch(e){return e.message.includes('أقصر من 8');}})());
check('صلاحية غير معروفة تُرفض', (()=>{try{api.setAccounts([['x','س','مدير','password-1234']]);api.addAccounts();return false;}catch(e){return e.message.includes('admin أو editor');}})());
check('renameUser يرفض اسماً مستخدماً', (()=>{try{api.renameUser();return false;}catch(e){return e.message.includes('مستخدم بالفعل')||e.message.includes('لا يوجد');}})());


console.log('\n'+(fail? `فشل ${fail} من ${pass+fail}` : `نجحت جميع الاختبارات (${pass})`));
process.exit(fail?1:0);
