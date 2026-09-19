/**
 * واجهة سجل فريق صيانة المحطات الخارجية.
 *
 * القراءة مفتوحة عبر read-public، والكتابة خلف تسجيل الدخول والصلاحية.
 * الشيت نفسه يبقى غير مشارَك: الواجهة تقرأ نيابة عن الزائر، فلا يصل أحد إلى
 * الملف الخام ولا إلى أوراق المستخدمين والجلسات.
 *
 * لإقفال القراءة أيضاً: اجعل CONFIG.publicRead = false.
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
  // القراءة العامة: يقرأ الزائر السجل بلا حساب، والكتابة تبقى خلف تسجيل الدخول.
  // اجعلها false ليصبح كل شيء — القراءة أيضاً — خلف تسجيل الدخول.
  publicRead: true,
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

  // القراءة العامة: الإجراء الوحيد الذي يعمل بلا جلسة، ويخدم تبويبات البيانات وحدها.
  // أوراق المستخدمين والجلسات ليست في TABS فلا تصلها هذه الدالة أصلاً.
  if (action === 'read-public') {
    if (!CONFIG.publicRead) throw new Error('القراءة العامة معطّلة. سجّل الدخول.');
    return readAll({username: 'زائر', name: '', role: 'viewer'}, body.tabs, true);
  }

  // ما بعد هذا السطر لا يُنفَّذ بلا جلسة صالحة.
  var user = requireUser(body.token);
  if (action === 'read') return readAll(user, body.tabs);

  // الكتابة تحتاج صلاحية أعلى من القراءة. viewer يقرأ ولا يكتب.
  if (action === 'followup-create') return createRow(requireWriter(user), 'followups', body.fields);
  if (action === 'followup-update') return updateRow(requireWriter(user), 'followups', body.id, body.fields, body.expectedUpdatedAt);
  if (action === 'letter-create') return createRow(requireWriter(user), 'letters', body.fields);
  if (action === 'letter-update') return updateRow(requireWriter(user), 'letters', body.id, body.fields, body.expectedUpdatedAt);
  if (action === 'close') return closeRow(requireWriter(user), body.kind, body.id, body.closeDate, body.closeProof, body.expectedUpdatedAt);
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

function readAll(user, wanted, isPublic) {
  var requested = Array.isArray(wanted) && wanted.length ? wanted : Object.keys(TABS);
  var payload = {ok: true, readAt: new Date().toISOString(), tabs: {}, missing: [], "public": Boolean(isPublic)};
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
  // القراءات العامة لا تُدوَّن: هوية الزائر غير معروفة، وتدوينها يغرق سجل الوصول
  // بصفوف بلا معنى فيخفي الدخول والكتابة وهي ما يُراجَع فعلاً.
  if (!isPublic) audit(user, 'قراءة السجل', requested.join('، ') + ' — ' + total + ' صفاً');
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


/* ————— الكتابة ————— */

/** الأعمدة التي يملكها الموقع. ما عداها — المعرّف وأعمدة المعادلات — لا يُكتب. */
var WRITABLE = {
  followups: ['Type', 'Subject', 'Station', 'Reference', 'Recorded_Status', 'Evidence_Date',
    'Owner_Per_Source', 'Next_Action', 'Needs_Review', 'Due_Date', 'Closed', 'Sources', 'Notes',
    'PR_Stage', 'Related_Daily_IDs', 'Priority', 'PR_Number', 'Waiting_On',
    'Closed_Date', 'Closing_Evidence'],
  // الاتجاه ليس هنا عمداً: يُثبت عند الإنشاء ولا يتغيّر بالتعديل.
  letters: ['Number', 'Date', 'Subject', 'Party', 'Action', 'Parent_ID', 'Closed', 'Sources',
    'Notes', 'Reply_To_ID', 'Closed_Date', 'Closing_Evidence', 'Letter_File']
};

var BOOLEAN_FIELDS = {Needs_Review: true, Closed: true, Date_Verified: true, Location_Only: true};
var DATE_FIELDS = {Evidence_Date: true, Due_Date: true, Closed_Date: true, Date: true,
  Approval_Date: true, LPO_Date: true, Delivery_Due: true, Receipt_Date: true};

var ID_PREFIX = {followups: 'NEW-', letters: 'LTR-'};

function requireWriter(user) {
  if (user.role !== 'editor' && user.role !== 'admin') {
    throw new Error('صلاحيتك للقراءة فقط. التعديل يحتاج صلاحية editor أو admin.');
  }
  return user;
}

function headerMap(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var name = String(headers[i]).trim();
    if (name) map[name] = i + 1;
  }
  return map;
}

function rowById(sheet, keyColumn, id) {
  var map = headerMap(sheet);
  var column = map[keyColumn];
  if (!column) throw new Error('عمود المعرّف غير موجود في الورقة.');
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var values = sheet.getRange(2, column, last - 1, 1).getValues();
  var wanted = String(id).trim();
  for (var i = 0; i < values.length; i++) if (String(values[i][0]).trim() === wanted) return i + 2;
  return 0;
}

/** يحوّل قيمة الموقع إلى ما تفهمه الورقة: منطقية، أو تاريخاً، أو نصاً. */
function writeValue(field, value) {
  if (BOOLEAN_FIELDS[field]) return value === true || /^(true|نعم|1)$/i.test(String(value));
  if (DATE_FIELDS[field]) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    var iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    var dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
    if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    throw new Error('تاريخ غير مفهوم في ' + field + ': ' + raw);
  }
  return value == null ? '' : String(value);
}

/**
 * التحقق في الخادم لا في المتصفح: الإغلاق يتطلب تاريخاً ودليلاً معاً.
 * يُفحص الدمج بين الموجود والوارد، حتى لا يمر إغلاق بتغيير حقل واحد.
 */
function validate(kind, merged) {
  if (kind === 'followups' || kind === 'letters') {
    var closed = merged.Closed === true || /^(true|نعم|1)$/i.test(String(merged.Closed || ''));
    if (closed) {
      if (!String(merged.Closed_Date || '').trim()) throw new Error('الإغلاق يتطلب تاريخ إغلاق.');
      if (!String(merged.Closing_Evidence || '').trim()) throw new Error('الإغلاق يتطلب دليل إغلاق.');
    }
  }
  if (kind === 'followups') {
    if (!String(merged.Subject || '').trim()) throw new Error('الموضوع مطلوب.');
    if (!String(merged.Recorded_Status || '').trim()) throw new Error('الحالة مطلوبة.');
  }
  if (kind === 'letters') {
    if (!String(merged.Subject || '').trim()) throw new Error('موضوع الكتاب مطلوب.');
    if (!String(merged.Number || '').trim()) throw new Error('رقم الكتاب مطلوب.');
  }
}

function currentRecord(sheet, row) {
  var map = headerMap(sheet);
  var values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  var record = {};
  for (var name in map) record[name] = values[map[name] - 1];
  return record;
}

function createRow(user, kind, fields) {
  var tab = TABS[kind];
  var sheet = sheetByName(tab.name);
  if (!sheet) throw new Error('الورقة غير موجودة: ' + tab.name);
  var map = headerMap(sheet);
  fields = fields || {};

  var id = String(fields[tab.key] || '').trim();
  if (id) {
    if (!/^[A-Za-z0-9._\/-]+$/.test(id)) throw new Error('المعرّف يقبل الحروف والأرقام والشرطة فقط.');
    if (rowById(sheet, tab.key, id)) throw new Error('المعرّف مستخدم من قبل: ' + id);
  } else {
    id = (ID_PREFIX[kind] || 'NEW-') + Utilities.formatDate(new Date(), CONFIG.timeZone, 'yyMMdd-HHmmss');
  }

  var merged = {};
  var allowed = WRITABLE[kind];
  for (var i = 0; i < allowed.length; i++) {
    if (fields.hasOwnProperty(allowed[i])) merged[allowed[i]] = fields[allowed[i]];
  }
  // الاتجاه يُقبل عند الإنشاء وحده، ثم يصير ثابتاً.
  if (kind === 'letters') merged.Direction = fields.Direction === 'outgoing' ? 'outgoing' : 'incoming';
  validate(kind, merged);

  var row = sheet.getLastRow() + 1;
  var stamp = now();
  sheet.getRange(row, map[tab.key]).setValue(id);
  for (var field in merged) {
    if (map[field]) sheet.getRange(row, map[field]).setValue(writeValue(field, merged[field]));
  }
  if (map.Updated_At) sheet.getRange(row, map.Updated_At).setValue(stamp);
  if (map.Updated_By) sheet.getRange(row, map.Updated_By).setValue(user.name || user.username);

  audit(user, 'إضافة', tab.name + ' · ' + id + ' · ' + (merged.Subject || ''));
  return {ok: true, id: id, updatedAt: stamp};
}

function updateRow(user, kind, id, fields, expectedUpdatedAt) {
  var tab = TABS[kind];
  var sheet = sheetByName(tab.name);
  if (!sheet) throw new Error('الورقة غير موجودة: ' + tab.name);
  var row = rowById(sheet, tab.key, id);
  if (!row) throw new Error('السجل غير موجود: ' + id);
  var map = headerMap(sheet);
  var before = currentRecord(sheet, row);

  // منع الكتابة فوق تعديل شخص آخر: من حمّل نسخة قديمة يُطلب منه التحديث أولاً.
  if (map.Updated_At && expectedUpdatedAt !== undefined && expectedUpdatedAt !== null) {
    var stored = String(before.Updated_At || '').trim();
    if (stored && stored !== String(expectedUpdatedAt).trim()) {
      throw new Error('عُدّل السجل من جهة أخرى بتاريخ ' + stored + '. حدّث الصفحة ثم أعد المحاولة.');
    }
  }

  var allowed = WRITABLE[kind];
  var merged = {};
  for (var name in before) merged[name] = before[name];
  var applied = {};
  fields = fields || {};
  for (var i = 0; i < allowed.length; i++) {
    var field = allowed[i];
    if (!fields.hasOwnProperty(field)) continue;
    applied[field] = fields[field];
    merged[field] = fields[field];
  }
  if (kind === 'letters' && fields.hasOwnProperty('Direction')
      && String(fields.Direction) !== String(before.Direction)) {
    throw new Error('اتجاه الكتاب ثابت. الرد يُسجَّل كتاباً آخر مرتبطاً.');
  }
  validate(kind, merged);

  var changed = [];
  var stamp = now();
  for (var key in applied) {
    if (!map[key]) continue;
    var next = writeValue(key, applied[key]);
    var old = before[key];
    if (String(old) === String(next)) continue;
    sheet.getRange(row, map[key]).setValue(next);
    changed.push(key);
  }
  if (!changed.length) return {ok: true, id: id, updatedAt: String(before.Updated_At || ''), changed: []};

  if (map.Updated_At) sheet.getRange(row, map.Updated_At).setValue(stamp);
  if (map.Updated_By) sheet.getRange(row, map.Updated_By).setValue(user.name || user.username);

  audit(user, 'تعديل', tab.name + ' · ' + id + ' · ' + changed.join('، '));
  return {ok: true, id: id, updatedAt: stamp, changed: changed};
}

/**
 * الإغلاق إجراء مستقل: إغلاق الكتاب لا يمس متابعته، وإغلاق المتابعة لا يمس كتبها.
 * لا يوجد هنا أي تتابع يغيّر سجلاً آخر.
 */
function closeRow(user, kind, id, closeDate, closeProof, expectedUpdatedAt) {
  if (kind !== 'followups' && kind !== 'letters') throw new Error('نوع السجل غير معروف.');
  if (!String(closeDate || '').trim()) throw new Error('الإغلاق يتطلب تاريخ إغلاق.');
  if (!String(closeProof || '').trim()) throw new Error('الإغلاق يتطلب دليل إغلاق.');
  return updateRow(user, kind, id, {
    Closed: true, Closed_Date: closeDate, Closing_Evidence: String(closeProof).trim()
  }, expectedUpdatedAt);
}
