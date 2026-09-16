/**
 * واجهة الكتابة لسجل متابعات شعبة ورشة الديزل.
 *
 * يعمل من مشروع مستقل على script.google.com أو من مشروع مرتبط بالملف؛
 * الوصول إلى الجدول عبر المعرّف في CONFIG.spreadsheetId.
 *   نشر ← عملية نشر جديدة ← تطبيق ويب ← التنفيذ باسمي ← الوصول: أي شخص.
 * ثم يوضع رابط /exec في admin-config.json داخل مستودع الموقع.
 *
 * القراءة تبقى عامة كما هي عبر Google Sheets؛ هذا السكربت للكتابة فقط،
 * ولا يكتب شيئاً قبل التحقق من اسم المستخدم وكلمة المرور والصلاحية.
 */

var CONFIG = {
  // معرّف ملف المتابعات في Google Sheets (من رابط الملف).
  spreadsheetId: '1f8rYNHHe6KjvgQgThMXRi3cOrHGLJWmvLYURqzdbh_0',
  mainSheetId: 208260119,      // gid ورقة المتابعات
  sourceSheetId: 1153309683,   // gid ورقة المراجع والسجل
  usersSheet: 'المستخدمون',
  sessionsSheet: 'الجلسات',
  auditSheet: 'سجل التعديلات',
  timeZone: 'Asia/Dubai',
  sessionHours: 12,
  hashRounds: 4000,
  maxAttempts: 5,
  lockMinutes: 15
};

var HEADERS = ['معرّف البند','الموضوع','الأولوية','الحالة','الإجراء المطلوب','المسؤول','تاريخ المعلومة','رقم PR','القيمة بالدرهم','بند الموازنة','تفاصيل الحالة','جهة المتابعة','التصنيف','الموعد المرتبط','آخر تعديل بتوقيت الإمارات','المرجع','الملاحظات','نوع طلب الشراء','مرحلة الشراء','نوع الرقم','رقم LPO','أساس القيمة','ملاحظة القيمة'];
var SOURCE_HEADERS = ['معرّف البند','نوع المرجع','تاريخ المصدر','العنوان','التفاصيل'];
// أعمدة تشغيلية تُضاف بتشغيل addOperationalColumns؛ قبل إضافتها يعمل كل شيء بدونها.
var OPTIONAL_HEADERS = ['المجال','الإجراء عند','العائق'];
var AREAS = {procurement:'المشتريات والموازنة',maintenance:'الصيانة والفحص والدعم الفني',rain:'جاهزية الأمطار والقطاعات',inventory:'المخزون والأصول',vehicles:'مركبات الإدارة والسائقون',admin:'الشؤون الإدارية والموظفون'};
var ACTION_AT = {me:'عندي',team:'عند الفريق',external:'بانتظار جهة أخرى',unassigned:'لم يحدد'};

// القيم المسموحة — نسخة مطابقة لما يقبله الموقع عند القراءة.
var PRIORITIES = {high:'عالية', medium:'متوسطة', low:'منخفضة'};
var STAGES = {preparation:'قيد الإعداد',approvals:'بانتظار الموافقات',number_pending:'بانتظار رقم طلب الشراء',action:'يحتاج إجراء',pr_team_approval:'بانتظار موافقة فريق طلبات الشراء',warehouse_approval:'بانتظار موافقات المستودع',quotes:'بانتظار العروض',offers_received:'وصلت العروض',evaluation:'تحت التقييم',lpo_pending:'بانتظار LPO',delivery:'بانتظار التوريد',partial_delivery:'استلام جزئي',received:'مستلم بالكامل ومغلق',closed_unreceived:'مغلق — المتبقي غير مستلم',in_progress:'قيد التنفيذ',coordination:'بانتظار المتابعة',on_hold:'مؤجل',closure:'بانتظار الإغلاق',completed:'مكتمل',cancelled:'ملغى'};
var GROUPS = {'purchase-action':'طلبات تحتاج إجراء', quotes:'بانتظار العروض', coordination:'التنسيق والجاهزية', vehicles:'المركبات', future:'خطط مستقبلية'};
var PR_KINDS = {pr:'طلب شراء', unnumbered:'طلب غير مرقم', planning:'خطة مستقبلية', linked:'بند مرتبط', lpo:'أمر توريد'};
var BASES = {estimated:'تقديرية', quoted:'عرض سعر', recorded:'مسجلة'};

/* ————— الإعداد لمرة واحدة ————— */

/** يضيف أعمدة المجال والإجراء عند والعائق إلى ورقة المتابعات. شغّلها مرة واحدة. */
function addOperationalColumns() {
  var sheet = mainSheet();
  var existing = optionalColumns(sheet);
  var added = [];
  for (var i = 0; i < OPTIONAL_HEADERS.length; i++) {
    var header = OPTIONAL_HEADERS[i];
    if (existing[header]) continue;
    var column = Math.max(sheet.getLastColumn(), HEADERS.length) + 1;
    sheet.getRange(1, column).setValue(header);
    existing[header] = column;
    added.push(header);
  }
  return added.length ? 'أُضيفت الأعمدة: ' + added.join('، ') : 'الأعمدة موجودة مسبقاً.';
}

/** أعمدة الحقول التشغيلية الموجودة فعلياً في الورقة، بأرقامها. */
function optionalColumns(sheet) {
  var width = sheet.getLastColumn();
  var map = {};
  if (width <= HEADERS.length) return map;
  var row = sheet.getRange(1, 1, 1, width).getValues()[0];
  for (var i = HEADERS.length; i < width; i++) {
    var label = text(row[i]);
    if (OPTIONAL_HEADERS.indexOf(label) >= 0) map[label] = i + 1;
  }
  return map;
}

function hasOperational(sheet) {
  var columns = optionalColumns(sheet);
  return Boolean(columns[OPTIONAL_HEADERS[0]] && columns[OPTIONAL_HEADERS[1]] && columns[OPTIONAL_HEADERS[2]]);
}

/** يكتب الحقول التشغيلية في أعمدتها إن وُجدت، ويتجاهلها بهدوء إن لم تُضف بعد. */
function writeOptional(sheet, row, item) {
  var columns = optionalColumns(sheet);
  if (columns['المجال']) sheet.getRange(row, columns['المجال']).setValue(item.area ? label(item.area, AREAS, 'المجال') : '');
  if (columns['الإجراء عند']) sheet.getRange(row, columns['الإجراء عند']).setValue(item.actionAt ? label(item.actionAt, ACTION_AT, 'الإجراء عند') : '');
  if (columns['العائق']) sheet.getRange(row, columns['العائق']).setValue(text(item.blocker).slice(0, 500));
}

/** شغّل هذه مرة واحدة بعد لصق السكربت: تنشئ أوراق الصلاحيات وتضبط المنطقة الزمنية. */
function setup() {
  var file = book();
  if (file.getSpreadsheetTimeZone() !== CONFIG.timeZone) file.setSpreadsheetTimeZone(CONFIG.timeZone);
  ensureSheet(CONFIG.usersSheet, ['اسم المستخدم','الاسم','الصلاحية','مفعّل','الملح','بصمة كلمة المرور','آخر دخول','محاولات فاشلة','موقوف حتى'], true);
  ensureSheet(CONFIG.sessionsSheet, ['بصمة الجلسة','اسم المستخدم','بدأت','تنتهي','آخر نشاط'], true);
  ensureSheet(CONFIG.auditSheet, ['الوقت','المستخدم','الإجراء','معرّف البند','الموضوع','التفاصيل'], false);
  mainSheet(); sourceSheet();
  return 'تم الإعداد. أضف مستخدماً بتشغيل addUser.';
}

/** أضف مستخدماً: غيّر القيم ثم شغّل الدالة من المحرر. لا تكتب كلمة المرور في أي ملف. */
function addUser() {
  var username = 'abdullah';
  var name = 'عبدالله';
  var role = 'admin';            // admin = إضافة وتعديل وحذف · editor = إضافة وتعديل
  var password = 'غيّر-كلمة-المرور-هنا';
  return saveUser(username, name, role, password);
}

/** يعرض الحسابات في سجل التنفيذ بلا كلمات مرور. */
function listUsers() {
  var sheet = sheetByName(CONFIG.usersSheet);
  if (!sheet || sheet.getLastRow() < 2) return 'لا يوجد أي حساب. شغّل addUser.';
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  var lines = rows.map(function (row) {
    return '· ' + row[0] + ' — ' + (row[1] || '') + ' — ' + (row[2] === 'admin' ? 'مدير' : 'محرر') +
      ' — ' + (String(row[3]).trim() === 'نعم' ? 'مفعّل' : 'موقوف') +
      (row[6] ? ' — آخر دخول ' + cellText(row[6]) : '');
  });
  var report = 'الحسابات (' + rows.length + '):\n' + lines.join('\n');
  Logger.log(report);
  return report;
}

/** غيّر اسم الدخول مع الاحتفاظ بكلمة المرور نفسها. */
function renameUser() {
  var current = 'AbdullaBinAli';
  var next = 'abdullah';
  var sheet = sheetByName(CONFIG.usersSheet);
  var row = findUserRow(sheet, current);
  if (!row) throw new Error('لا يوجد مستخدم باسم ' + current + '.');
  if (findUserRow(sheet, next)) throw new Error('الاسم ' + next + ' مستخدم بالفعل.');
  if (!/^[A-Za-z0-9_.-]{3,40}$/.test(next)) throw new Error('اسم الدخول: حروف إنجليزية وأرقام و _ . - فقط.');
  sheet.getRange(row, 1).setValue(next);
  // الجلسات القديمة مرتبطة بالاسم السابق فتُغلق.
  var sessions = sheetByName(CONFIG.sessionsSheet);
  var values = sessions.getDataRange().getValues();
  for (var i = values.length - 1; i >= 1; i--) if (String(values[i][1]) === current) sessions.deleteRow(i + 1);
  return 'صار اسم الدخول ' + next + '. سجّل الدخول من جديد بكلمة المرور نفسها.';
}

/** أوقف حساباً أو أعد تفعيله بلا حذف سجلّه. */
function setUserActive() {
  var username = 'sami';
  var active = false;            // true = مفعّل · false = موقوف
  var sheet = sheetByName(CONFIG.usersSheet);
  var row = findUserRow(sheet, username);
  if (!row) throw new Error('لا يوجد مستخدم باسم ' + username + '.');
  sheet.getRange(row, 4).setValue(active ? 'نعم' : 'لا');
  if (!active) {
    var sessions = sheetByName(CONFIG.sessionsSheet);
    var values = sessions.getDataRange().getValues();
    for (var i = values.length - 1; i >= 1; i--) if (String(values[i][1]) === username) sessions.deleteRow(i + 1);
  }
  return username + (active ? ' مفعّل.' : ' موقوف، وأُغلقت جلساته.');
}

/** غيّر كلمة مرور مستخدم قائم. */
function resetPassword() {
  var username = 'abdullah';
  var password = 'كلمة-المرور-الجديدة';
  var sheet = sheetByName(CONFIG.usersSheet);
  var row = findUserRow(sheet, username);
  if (!row) throw new Error('لا يوجد مستخدم بهذا الاسم.');
  var salt = Utilities.getUuid();
  sheet.getRange(row, 5, 1, 2).setValues([[salt, hashPassword(password, salt)]]);
  sheet.getRange(row, 8, 1, 2).setValues([['', '']]);
  return 'تم تغيير كلمة المرور.';
}

function saveUser(username, name, role, password) {
  if (!username || !password) throw new Error('اسم المستخدم وكلمة المرور مطلوبان.');
  if (String(password).length < 8) throw new Error('كلمة المرور أقصر من 8 أحرف.');
  if (role !== 'admin' && role !== 'editor') throw new Error('الصلاحية admin أو editor.');
  var sheet = sheetByName(CONFIG.usersSheet);
  if (!sheet) throw new Error('شغّل setup أولاً.');
  var salt = Utilities.getUuid();
  var values = [String(username).trim(), name, role, 'نعم', salt, hashPassword(password, salt), '', '', ''];
  var row = findUserRow(sheet, username);
  if (row) sheet.getRange(row, 1, 1, values.length).setValues([values]);
  else sheet.appendRow(values);
  return 'تم حفظ المستخدم ' + username + '.';
}

/* ————— نقطة الدخول ————— */

/** افتح رابط /exec في المتصفح للتأكد أن الخدمة ترى الملف قبل ربط الموقع. */
function doGet() {
  var report = {ok:true, service:'متابعات شعبة ورشة الديزل', time:now()};
  try {
    var sheet = mainSheet();
    report.sheet = sheet.getName();
    report.records = Math.max(sheet.getLastRow() - 1, 0);
    report.operational = hasOperational(sheet);
    var users = sheetByName(CONFIG.usersSheet);
    report.users = users ? Math.max(users.getLastRow() - 1, 0) : 0;
    report.ready = report.users > 0;
    if (!report.users) report.next = 'شغّل setup ثم addUser من محرر Apps Script.';
    else if (!report.operational) report.next = 'اختياري: شغّل addOperationalColumns لإضافة أعمدة المجال والإجراء عند والعائق.';
  } catch (error) {
    report.ok = false;
    report.error = String(error && error.message ? error.message : error);
  }
  return json(report);
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e && e.postData ? e.postData.contents : '{}'); }
  catch (error) { return json({ok:false, error:'طلب غير مفهوم.'}); }
  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(25000)) return json({ok:false, error:'الخادم مشغول، أعد المحاولة.'});
    return json(handle(body || {}));
  } catch (error) {
    return json({ok:false, error:String(error && error.message ? error.message : error)});
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function handle(body) {
  var action = String(body.action || '');
  if (action === 'login') return login(body.username, body.password);
  if (action === 'session') return sessionInfo(body.token);
  if (action === 'logout') return logout(body.token);

  var user = requireUser(body.token);
  if (action === 'create') return createItem(user, body.item);
  if (action === 'update') return updateItem(user, body.id, body.item, body.expectedUpdatedAt);
  if (action === 'delete') {
    if (user.role !== 'admin') throw new Error('الحذف متاح لصلاحية المدير فقط.');
    return deleteItem(user, body.id, body.expectedUpdatedAt);
  }
  throw new Error('إجراء غير معروف.');
}

/* ————— الدخول والجلسات ————— */

function login(username, password) {
  username = String(username || '').trim();
  var sheet = sheetByName(CONFIG.usersSheet);
  var row = sheet ? findUserRow(sheet, username) : 0;
  if (!row || !password) return {ok:false, error:'اسم المستخدم أو كلمة المرور غير صحيحة.'};
  var values = sheet.getRange(row, 1, 1, 9).getValues()[0];
  if (String(values[3]).trim() !== 'نعم') return {ok:false, error:'الحساب موقوف.'};
  var lockedUntil = values[8] ? new Date(values[8]) : null;
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    return {ok:false, error:'الحساب موقوف مؤقتاً بعد محاولات خاطئة. أعد المحاولة بعد قليل.'};
  }
  if (hashPassword(String(password), String(values[4])) !== String(values[5])) {
    var attempts = Number(values[7] || 0) + 1;
    var until = attempts >= CONFIG.maxAttempts ? new Date(Date.now() + CONFIG.lockMinutes * 60000) : '';
    sheet.getRange(row, 8, 1, 2).setValues([[attempts, until]]);
    return {ok:false, error:'اسم المستخدم أو كلمة المرور غير صحيحة.'};
  }
  sheet.getRange(row, 7, 1, 3).setValues([[now(), 0, '']]);
  var token = Utilities.getUuid() + Utilities.getUuid();
  var expires = new Date(Date.now() + CONFIG.sessionHours * 3600000);
  sheetByName(CONFIG.sessionsSheet).appendRow([digest(token), username, now(), expires, now()]);
  cleanSessions();
  return {ok:true, token:token, expiresAt:expires.toISOString(), features:features(), user:{username:username, name:values[1] || username, role:values[2]}};
}

function sessionInfo(token) {
  try { var user = requireUser(token); return {ok:true, user:{username:user.username, name:user.name, role:user.role}, features:features(), expiresAt:user.expiresAt}; }
  catch (error) { return {ok:false, error:String(error.message || error)}; }
}

function logout(token) {
  if (!token) return {ok:true};
  var sheet = sheetByName(CONFIG.sessionsSheet);
  var rows = sheet.getDataRange().getValues();
  var hash = digest(String(token));
  for (var i = rows.length - 1; i >= 1; i--) if (String(rows[i][0]) === hash) sheet.deleteRow(i + 1);
  return {ok:true};
}

function requireUser(token) {
  if (!token) throw new Error('يلزم تسجيل الدخول.');
  var sessions = sheetByName(CONFIG.sessionsSheet);
  var rows = sessions.getDataRange().getValues();
  var hash = digest(String(token));
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== hash) continue;
    var expires = new Date(rows[i][3]);
    if (expires.getTime() <= Date.now()) { sessions.deleteRow(i + 1); throw new Error('انتهت الجلسة، سجّل الدخول من جديد.'); }
    var users = sheetByName(CONFIG.usersSheet);
    var userRow = findUserRow(users, rows[i][1]);
    if (!userRow) throw new Error('الحساب لم يعد موجوداً.');
    var values = users.getRange(userRow, 1, 1, 4).getValues()[0];
    if (String(values[3]).trim() !== 'نعم') throw new Error('الحساب موقوف.');
    sessions.getRange(i + 1, 5).setValue(now());
    return {username:values[0], name:values[1] || values[0], role:values[2], expiresAt:expires.toISOString()};
  }
  throw new Error('انتهت الجلسة، سجّل الدخول من جديد.');
}

function features() {
  try { return {operational: hasOperational(mainSheet())}; } catch (error) { return {operational:false}; }
}

function cleanSessions() {
  var sheet = sheetByName(CONFIG.sessionsSheet);
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    var expires = rows[i][3] ? new Date(rows[i][3]).getTime() : 0;
    if (!expires || expires <= Date.now()) sheet.deleteRow(i + 1);
  }
}

/* ————— الكتابة في السجل ————— */

function createItem(user, item) {
  var sheet = mainSheet();
  var values = rowValues(item, null);
  var ids = idColumn(sheet);
  var id = String(item && item.id ? item.id : '').trim();
  if (id) {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('معرّف البند يقبل الحروف والأرقام والشرطة فقط.');
    if (ids.indexOf(id) >= 0) throw new Error('المعرّف مستخدم من قبل.');
  } else {
    id = nextId(ids);
  }
  values[0] = id;
  values[14] = stamp();
  sheet.appendRow(values);
  formatRow(sheet, sheet.getLastRow(), values[14]);
  writeOptional(sheet, sheet.getLastRow(), item);
  audit(user, 'إضافة', id, values[1], summary(item));
  return {ok:true, id:id, updatedAt:values[14]};
}

function updateItem(user, id, item, expectedUpdatedAt) {
  var sheet = mainSheet();
  var row = rowById(sheet, id);
  if (!row) throw new Error('البند غير موجود في السجل.');
  var current = sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0];
  guardConflict(current[14], expectedUpdatedAt);
  var values = rowValues(item, current);
  values[0] = String(current[0]);
  values[14] = stamp();
  sheet.getRange(row, 1, 1, HEADERS.length).setValues([values]);
  formatRow(sheet, row, values[14]);
  writeOptional(sheet, row, item);
  audit(user, 'تعديل', values[0], values[1], changes(current, values));
  return {ok:true, id:values[0], updatedAt:values[14]};
}

function deleteItem(user, id, expectedUpdatedAt) {
  var sheet = mainSheet();
  var row = rowById(sheet, id);
  if (!row) throw new Error('البند غير موجود في السجل.');
  var current = sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0];
  guardConflict(current[14], expectedUpdatedAt);
  var sources = sourceSheet();
  var sourceRows = sources.getDataRange().getValues();
  for (var i = sourceRows.length - 1; i >= 1; i--) if (String(sourceRows[i][0]).trim() === String(id)) sources.deleteRow(i + 1);
  sheet.deleteRow(row);
  // سطر «محذوف» يُبقي القارئ مطمئناً أن الغياب مقصود لا فقدان بيانات.
  sources.appendRow([String(id), 'محذوف', new Date(), user.name || user.username, 'حُذف من الموقع']);
  audit(user, 'حذف', String(id), String(current[1]), 'حُذف البند وسطور مراجعه.');
  return {ok:true, id:String(id)};
}

function guardConflict(currentStamp, expected) {
  if (!expected) return;
  var a = stampMinutes(currentStamp), b = stampMinutes(expected);
  if (a === null || b === null || a !== b) {
    throw new Error('عُدّل هذا البند من جهة أخرى بعد فتحك له. حدّث الصفحة ثم أعد المحاولة.');
  }
}

/* ————— تحويل البيانات إلى صف ————— */

function rowValues(item, current) {
  item = item || {};
  var row = [];
  for (var i = 0; i < HEADERS.length; i++) row.push(current ? current[i] : '');
  row[1] = required(item.title, 'الموضوع');
  row[2] = label(item.priority, PRIORITIES, 'الأولوية');
  row[3] = label(item.stage, STAGES, 'الحالة');
  row[4] = required(item.action, 'الإجراء المطلوب');
  row[5] = required(item.owner, 'المسؤول');
  row[6] = dateCell(item.informationDate, 'تاريخ المعلومة', true);
  row[10] = text(item.status);
  row[11] = text(item.followUpWith);
  row[12] = label(item.group, GROUPS, 'التصنيف');
  row[13] = dateCell(item.dueDate, 'الموعد المرتبط', false);
  row[15] = text(item.reference);
  row[16] = text(item.notes);
  var meta = item.procurement;
  if (meta && meta.enabled) {
    row[7] = text(meta.prNumber);
    row[8] = amount(meta.amountAed);
    row[9] = text(meta.budgetCode);
    row[17] = label(meta.kind, PR_KINDS, 'نوع طلب الشراء');
    row[18] = label(meta.stage || item.stage, STAGES, 'مرحلة الشراء');
    row[19] = text(meta.numberType);
    row[20] = text(meta.lpoNumber);
    row[21] = meta.amountBasis ? label(meta.amountBasis, BASES, 'أساس القيمة') : '';
    row[22] = text(meta.amountNote);
  } else if (meta && meta.enabled === false && current) {
    // لا يُسمح بإفراغ بيانات شراء قائمة من الموقع حتى لا تختفي من تبويب الطلبات.
    throw new Error('لا يمكن إزالة بيانات طلب الشراء من الموقع؛ عدّلها في الشيت مباشرة.');
  }
  return row;
}

function label(value, map, field) {
  var raw = text(value);
  if (!raw) throw new Error('اختر ' + field + '.');
  if (map[raw]) return map[raw];
  for (var key in map) if (map[key] === raw) return raw;
  throw new Error('قيمة غير مقبولة في ' + field + ': ' + raw);
}

function required(value, field) {
  var raw = text(value);
  if (!raw) throw new Error(field + ' مطلوب.');
  if (raw.length > 2000) throw new Error(field + ' أطول من المسموح.');
  return raw;
}

function amount(value) {
  if (value === '' || value === null || value === undefined) return '';
  var number = Number(String(value).replace(/,/g, ''));
  if (!isFinite(number) || number < 0) throw new Error('القيمة بالدرهم غير صالحة.');
  return number;
}

function dateCell(value, field, isRequired) {
  var raw = text(value);
  if (!raw) {
    if (isRequired) throw new Error(field + ' مطلوب.');
    return '';
  }
  var parts = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) throw new Error(field + ' يجب أن يكون بصيغة سنة-شهر-يوم.');
  var date = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), 12, 0, 0);
  if (isNaN(date.getTime())) throw new Error(field + ' تاريخ غير صالح.');
  return date;
}

function stamp() {
  return Utilities.formatDate(new Date(), CONFIG.timeZone, 'dd/MM/yyyy HH:mm:ss');
}

/** يحوّل أي صيغة لوقت التعديل إلى دقائق منذ 1970 لمقارنة موحّدة مع ما يرسله الموقع. */
function stampMinutes(value) {
  var date = null;
  if (value instanceof Date) date = value;
  else {
    var raw = text(value);
    if (!raw) return null;
    var parts = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    // النص مكتوب بتوقيت الإمارات (+4) كما يقرأه الموقع.
    if (parts) date = new Date(Date.UTC(Number(parts[3]), Number(parts[2]) - 1, Number(parts[1]), Number(parts[4] || 0), Number(parts[5] || 0)) - 4 * 3600000);
    else { var parsed = Date.parse(raw); if (!isNaN(parsed)) date = new Date(parsed); }
  }
  return date ? Math.floor(date.getTime() / 60000) : null;
}

function formatRow(sheet, row, stampText) {
  sheet.getRange(row, 7).setNumberFormat('dd/mm/yyyy');
  sheet.getRange(row, 14).setNumberFormat('dd/mm/yyyy');
  var cell = sheet.getRange(row, 15);
  cell.setNumberFormat('@');
  cell.setValue(stampText);
}

/* ————— أدوات ————— */

function mainSheet() { return sheetById(CONFIG.mainSheetId, HEADERS, 'ورقة المتابعات'); }
function sourceSheet() { return sheetById(CONFIG.sourceSheetId, SOURCE_HEADERS, 'ورقة المراجع والسجل'); }

function sheetById(id, headers, name) {
  var sheets = book().getSheets();
  for (var i = 0; i < sheets.length; i++) if (sheets[i].getSheetId() === id) {
    var first = sheets[i].getRange(1, 1, 1, headers.length).getValues()[0];
    for (var c = 0; c < headers.length; c++) {
      if (String(first[c]).trim() !== headers[c]) throw new Error('عناوين ' + name + ' لا تطابق المتوقع: ' + headers[c]);
    }
    return sheets[i];
  }
  throw new Error('لم يُعثر على ' + name + '.');
}

function sheetByName(name) { return book().getSheetByName(name); }

/** ملف المتابعات: بالمعرّف أولاً، ويرجع إلى الملف المرتبط إن كان السكربت بداخله. */
function book() {
  if (CONFIG.spreadsheetId) return SpreadsheetApp.openById(CONFIG.spreadsheetId);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('ضع معرّف ملف المتابعات في CONFIG.spreadsheetId.');
  return active;
}

function ensureSheet(name, headers, hidden) {
  var file = book();
  var sheet = file.getSheetByName(name);
  if (!sheet) {
    sheet = file.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    if (hidden) sheet.hideSheet();
  }
  return sheet;
}

function idColumn(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, 1).getValues().map(function (row) { return String(row[0]).trim(); });
}

function rowById(sheet, id) {
  var ids = idColumn(sheet);
  var index = ids.indexOf(String(id || '').trim());
  return index < 0 ? 0 : index + 2;
}

function nextId(ids) {
  var top = 0;
  for (var i = 0; i < ids.length; i++) {
    var match = /^web-(\d+)$/.exec(ids[i]);
    if (match) top = Math.max(top, Number(match[1]));
  }
  return 'web-' + (top + 1);
}

function findUserRow(sheet, username) {
  if (!sheet) return 0;
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var names = sheet.getRange(2, 1, last - 1, 1).getValues();
  var wanted = String(username || '').trim().toLowerCase();
  for (var i = 0; i < names.length; i++) if (String(names[i][0]).trim().toLowerCase() === wanted) return i + 2;
  return 0;
}

function hashPassword(plain, salt) {
  var bytes = Utilities.newBlob(String(salt) + '|' + String(plain)).getBytes();
  for (var i = 0; i < CONFIG.hashRounds; i++) bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return Utilities.base64Encode(bytes);
}

function digest(value) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value)));
}

function audit(user, action, id, title, details) {
  var sheet = ensureSheet(CONFIG.auditSheet, ['الوقت','المستخدم','الإجراء','معرّف البند','الموضوع','التفاصيل'], false);
  sheet.appendRow([now(), user.username + ' (' + (user.name || '') + ')', action, id, title, details]);
}

function changes(before, after) {
  var parts = [];
  for (var i = 0; i < HEADERS.length; i++) {
    if (i === 14) continue;
    var a = cellText(before[i]), b = cellText(after[i]);
    if (a !== b) parts.push(HEADERS[i] + ': «' + a + '» ← «' + b + '»');
  }
  return parts.length ? parts.join(' · ') : 'بلا تغيير في الحقول.';
}

function summary(item) {
  return 'الأولوية ' + text(item.priority) + ' · الحالة ' + text(item.stage) + ' · التصنيف ' + text(item.group);
}

function cellText(value) {
  if (value instanceof Date) return Utilities.formatDate(value, CONFIG.timeZone, 'dd/MM/yyyy');
  return String(value === null || value === undefined ? '' : value).trim();
}

function text(value) { return String(value === null || value === undefined ? '' : value).trim(); }
function now() { return Utilities.formatDate(new Date(), CONFIG.timeZone, 'dd/MM/yyyy HH:mm:ss'); }
function json(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
