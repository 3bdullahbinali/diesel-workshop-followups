/**
 * واجهة القراءة الموثقة لسجل فريق صيانة المحطات الخارجية.
 *
 * تختلف عن واجهة ورشة الديزل في نقطة جوهرية: هناك القراءة عامة والسكربت للكتابة،
 * وهنا القراءة نفسها موثقة. لا يُقرأ صف واحد قبل التحقق من الجلسة، ولا يُفتح الملف
 * بالرابط للعموم.
 *
 * النشر: نشر ← عملية نشر جديدة ← تطبيق ويب ← التنفيذ: باسمي ← الوصول: أي شخص.
 *   «أي شخص» هنا تعني أن الرابط يستقبل الطلب، لا أن البيانات مكشوفة؛
 *   كل طلب قراءة يمر على requireUser قبل أن يعيد شيئاً.
 * ثم يوضع رابط /exec في stations/api-config.json.
 *
 * بعد النشر: شغّل setup ثم addUser من محرر Apps Script، ولا تشارك الملف نفسه.
 */

var CONFIG = {
  spreadsheetId: '1nUVhyx2UreJ3TftmMHdqx8ZLJN5oti4EFycWoF6u-Gc',
  usersSheet: 'المستخدمون',
  sessionsSheet: 'الجلسات',
  auditSheet: 'سجل الوصول',
  timeZone: 'Asia/Dubai',
  sessionHours: 12,
  hashRounds: 4000,
  maxAttempts: 5,
  lockMinutes: 15
};

/** تبويبات البيانات وعمود المعرّف الذي يميّز الصف الحقيقي عن صف القالب الفارغ. */
var TABS = {
  followups:   {name: 'Followups',        key: 'ID'},
  procurement: {name: 'PurchaseRequests', key: 'Followup_ID'},
  daily:       {name: 'DailyActivities',  key: 'Activity_ID'},
  letters:     {name: 'Correspondence',   key: 'Letter_ID'},
  stations:    {name: 'Stations',         key: 'Reference_ID'},
  issues:      {name: 'DataReview',       key: 'Finding_ID'},
  sources:     {name: 'Sources',          key: 'Source_ID'},
  items:       {name: 'PR_Items',         key: 'Item_ID'}
};

var ROLES = {viewer: 'قراءة فقط', editor: 'قراءة وتحديث', admin: 'إدارة كاملة'};

/* ————— الإعداد لمرة واحدة ————— */

/** ينشئ أوراق المستخدمين والجلسات وسجل الوصول. شغّلها مرة واحدة بعد النشر. */
function setup() {
  ensureSheet(CONFIG.usersSheet,
    ['اسم المستخدم', 'الاسم', 'الصلاحية', 'مفعّل', 'الملح', 'البصمة', 'محاولات فاشلة', 'موقوف حتى', 'آخر دخول'], true);
  ensureSheet(CONFIG.sessionsSheet, ['بصمة الجلسة', 'اسم المستخدم', 'بدأت', 'تنتهي', 'آخر نشاط'], true);
  ensureSheet(CONFIG.auditSheet, ['الوقت', 'المستخدم', 'الإجراء', 'التفاصيل'], false);
  return 'تم إنشاء الأوراق. شغّل addUser لإضافة أول حساب.';
}

/**
 * يضيف حساباً. عدّل القيم هنا ثم شغّل الدالة، ثم أعد كلمة المرور إلى فراغ.
 * لا تترك كلمة مرور مكتوبة في الملف بعد التشغيل.
 */
function addUser() {
  var username = 'abdullah';
  var name = 'عبدالله بن علي';
  var role = 'admin';
  var password = '';
  if (!password) throw new Error('ضع كلمة مرور مؤقتة في addUser ثم شغّلها، ثم امسحها.');
  return saveUser(username, name, role, password);
}

function saveUser(username, name, role, password) {
  var sheet = ensureSheet(CONFIG.usersSheet,
    ['اسم المستخدم', 'الاسم', 'الصلاحية', 'مفعّل', 'الملح', 'البصمة', 'محاولات فاشلة', 'موقوف حتى', 'آخر دخول'], true);
  if (!ROLES[role]) throw new Error('الصلاحية viewer أو editor أو admin.');
  if (String(password).length < 8) throw new Error('كلمة المرور ثمانية أحرف على الأقل.');
  var clean = String(username).trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(clean)) throw new Error('اسم المستخدم يقبل الحروف والأرقام والنقطة والشرطة.');
  var salt = Utilities.getUuid();
  var values = [clean, name, role, 'نعم', salt, hashPassword(password, salt), '', '', ''];
  var row = findUserRow(sheet, clean);
  if (row) sheet.getRange(row, 1, 1, values.length).setValues([values]);
  else sheet.appendRow(values);
  return 'تم حفظ الحساب: ' + clean + ' (' + ROLES[role] + ')';
}

/* ————— نقطة الدخول ————— */

/** فحص صحة: يؤكد أن الخدمة ترى الملف، دون أن يكشف أي بيانات. */
function doGet() {
  var report = {ok: true, service: 'متابعات فريق صيانة المحطات الخارجية', time: now()};
  try {
    var users = sheetByName(CONFIG.usersSheet);
    report.users = users ? Math.max(users.getLastRow() - 1, 0) : 0;
    report.ready = report.users > 0;
    report.tabs = {};
    for (var key in TABS) {
      var sheet = sheetByName(TABS[key].name);
      report.tabs[TABS[key].name] = sheet ? Math.max(sheet.getLastRow() - 1, 0) : 'الورقة غير موجودة';
    }
    if (!report.users) report.next = 'شغّل setup ثم addUser من محرر Apps Script.';
  } catch (error) {
    report.ok = false;
    report.error = message(error);
  }
  return json(report);
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e && e.postData ? e.postData.contents : '{}'); }
  catch (error) { return json({ok: false, error: 'طلب غير مفهوم.'}); }
  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(25000)) return json({ok: false, error: 'الخادم مشغول، أعد المحاولة.'});
    return json(handle(body || {}));
  } catch (error) {
    return json({ok: false, error: message(error)});
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function handle(body) {
  var action = String(body.action || '');
  if (action === 'login') return login(body.username, body.password);
  if (action === 'session') return sessionInfo(body.token);
  if (action === 'logout') return logout(body.token);

  // ما بعد هذا السطر لا يُنفَّذ بلا جلسة صالحة. القراءة نفسها تمر من هنا.
  var user = requireUser(body.token);
  if (action === 'read') return readAll(user, body.tabs);
  throw new Error('إجراء غير معروف.');
}

/* ————— الهوية والجلسات ————— */

function login(username, password) {
  var sheet = sheetByName(CONFIG.usersSheet);
  var row = findUserRow(sheet, username);
  // رسالة واحدة للاسم الخاطئ وكلمة المرور الخاطئة، حتى لا تُستدل الحسابات الموجودة.
  if (!row) return {ok: false, error: 'بيانات الدخول غير صحيحة.'};

  var values = sheet.getRange(row, 1, 1, 9).getValues()[0];
  if (String(values[3]).trim() !== 'نعم') return {ok: false, error: 'الحساب موقوف.'};

  var lockedUntil = values[7] ? new Date(values[7]).getTime() : 0;
  if (lockedUntil && lockedUntil > Date.now()) {
    var minutes = Math.ceil((lockedUntil - Date.now()) / 60000);
    return {ok: false, error: 'الحساب موقوف مؤقتاً. أعد المحاولة بعد ' + minutes + ' دقيقة.'};
  }

  if (hashPassword(String(password), String(values[4])) !== String(values[5])) {
    var attempts = Number(values[6] || 0) + 1;
    var until = attempts >= CONFIG.maxAttempts ? new Date(Date.now() + CONFIG.lockMinutes * 60000) : '';
    sheet.getRange(row, 7, 1, 2).setValues([[attempts, until]]);
    audit({username: String(username || '—'), name: ''}, 'محاولة دخول فاشلة', 'المحاولة رقم ' + attempts);
    return {ok: false, error: 'بيانات الدخول غير صحيحة.'};
  }

  sheet.getRange(row, 7, 1, 3).setValues([['', '', now()]]);
  cleanSessions();
  var token = Utilities.getUuid() + Utilities.getUuid();
  var expires = new Date(Date.now() + CONFIG.sessionHours * 3600000);
  // تُحفظ بصمة الرمز لا الرمز نفسه؛ تسريب الورقة لا يعطي جلسات صالحة.
  sheetByName(CONFIG.sessionsSheet).appendRow([digest(token), values[0], now(), expires, now()]);
  audit({username: values[0], name: values[1]}, 'تسجيل دخول', '');
  return {
    ok: true, token: token, expiresAt: expires.toISOString(),
    user: {username: values[0], name: values[1] || values[0], role: values[2], roleLabel: ROLES[values[2]] || values[2]}
  };
}

function sessionInfo(token) {
  try {
    var user = requireUser(token);
    return {ok: true, user: {username: user.username, name: user.name, role: user.role,
      roleLabel: ROLES[user.role] || user.role}, expiresAt: user.expiresAt};
  } catch (error) {
    return {ok: false, error: message(error)};
  }
}

function logout(token) {
  if (!token) return {ok: true};
  var sheet = sheetByName(CONFIG.sessionsSheet);
  var rows = sheet.getDataRange().getValues();
  var hash = digest(String(token));
  for (var i = rows.length - 1; i >= 1; i--) if (String(rows[i][0]) === hash) sheet.deleteRow(i + 1);
  return {ok: true};
}

function requireUser(token) {
  if (!token) throw new Error('يلزم تسجيل الدخول.');
  var sessions = sheetByName(CONFIG.sessionsSheet);
  if (!sessions) throw new Error('لم تُنشأ أوراق الحسابات بعد. شغّل setup.');
  var rows = sessions.getDataRange().getValues();
  var hash = digest(String(token));
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== hash) continue;
    var expires = new Date(rows[i][3]);
    if (expires.getTime() <= Date.now()) {
      sessions.deleteRow(i + 1);
      throw new Error('انتهت الجلسة، سجّل الدخول من جديد.');
    }
    var users = sheetByName(CONFIG.usersSheet);
    var userRow = findUserRow(users, rows[i][1]);
    if (!userRow) throw new Error('الحساب لم يعد موجوداً.');
    var values = users.getRange(userRow, 1, 1, 4).getValues()[0];
    if (String(values[3]).trim() !== 'نعم') throw new Error('الحساب موقوف.');
    sessions.getRange(i + 1, 5).setValue(now());
    return {username: values[0], name: values[1] || values[0], role: values[2], expiresAt: expires.toISOString()};
  }
  throw new Error('انتهت الجلسة، سجّل الدخول من جديد.');
}

function cleanSessions() {
  var sheet = sheetByName(CONFIG.sessionsSheet);
  if (!sheet) return;
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    var expires = rows[i][3] ? new Date(rows[i][3]).getTime() : 0;
    if (!expires || expires <= Date.now()) sheet.deleteRow(i + 1);
  }
}

/* ————— القراءة الموثقة ————— */

function readAll(user, wanted) {
  var requested = Array.isArray(wanted) && wanted.length ? wanted : Object.keys(TABS);
  var payload = {ok: true, readAt: new Date().toISOString(), tabs: {}, missing: []};
  var total = 0;
  for (var i = 0; i < requested.length; i++) {
    var key = requested[i];
    var tab = TABS[key];
    if (!tab) continue;
    var sheet = sheetByName(tab.name);
    if (!sheet) { payload.missing.push(tab.name); continue; }
    var rows = tabRows(sheet, tab.key);
    payload.tabs[key] = rows;
    total += rows.length;
  }
  payload.user = {username: user.username, name: user.name, role: user.role};
  audit(user, 'قراءة السجل', requested.join('، ') + ' — ' + total + ' صفاً');
  return payload;
}

/** يحوّل الورقة إلى صفوف مفهرسة بالعناوين، ويسقط صفوف القالب الفارغة. */
function tabRows(sheet, keyColumn) {
  var range = sheet.getDataRange().getValues();
  if (range.length < 2) return [];
  var headers = range[0].map(function (cell) { return String(cell).trim(); });
  var keyIndex = headers.indexOf(keyColumn);
  var out = [];
  for (var r = 1; r < range.length; r++) {
    if (keyIndex >= 0 && !String(range[r][keyIndex]).trim()) continue;
    var record = {};
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      record[headers[c]] = cellValue(range[r][c]);
    }
    out.push(record);
  }
  return out;
}

/** التواريخ تُرسل بصيغة yyyy-MM-dd حتى لا يُخمّن العميل ترتيب اليوم والشهر. */
function cellValue(value) {
  if (value instanceof Date) return Utilities.formatDate(value, CONFIG.timeZone, 'yyyy-MM-dd');
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  return String(value).trim();
}

/* ————— أدوات ————— */

function sheetByName(name) { return book().getSheetByName(name); }

function book() {
  if (CONFIG.spreadsheetId) return SpreadsheetApp.openById(CONFIG.spreadsheetId);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('ضع معرّف الملف في CONFIG.spreadsheetId.');
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

function findUserRow(sheet, username) {
  if (!sheet) return 0;
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var names = sheet.getRange(2, 1, last - 1, 1).getValues();
  var wanted = String(username || '').trim().toLowerCase();
  for (var i = 0; i < names.length; i++) {
    if (String(names[i][0]).trim().toLowerCase() === wanted) return i + 2;
  }
  return 0;
}

function hashPassword(plain, salt) {
  var bytes = Utilities.newBlob(String(salt) + '|' + String(plain)).getBytes();
  for (var i = 0; i < CONFIG.hashRounds; i++) {
    bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  }
  return Utilities.base64Encode(bytes);
}

function digest(value) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value)));
}

function audit(user, action, details) {
  var sheet = ensureSheet(CONFIG.auditSheet, ['الوقت', 'المستخدم', 'الإجراء', 'التفاصيل'], false);
  sheet.appendRow([now(), user.username + (user.name ? ' (' + user.name + ')' : ''), action, details || '']);
}

function now() { return Utilities.formatDate(new Date(), CONFIG.timeZone, 'dd/MM/yyyy HH:mm:ss'); }
function message(error) { return String(error && error.message ? error.message : error); }
function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
