'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const I = window.WorkshopI18n;
  const priorities = {high:'عالية', medium:'متوسطة', low:'منخفضة'};
  const kinds = {pr:'طلب شراء', unnumbered:'طلب غير مرقم', planning:'خطة مستقبلية', linked:'بند مرتبط', lpo:'أمر توريد'};
  const bases = {estimated:'تقديرية', quoted:'عرض سعر', recorded:'مسجلة'};
  const store = 'workshop-session';
  let endpoint = '', session = null, data = null, editing = null, busy = false, confirmTimer = 0;

  const read = () => { try { return JSON.parse(localStorage.getItem(store) || 'null'); } catch { return null; } };
  const write = value => { try { value ? localStorage.setItem(store, JSON.stringify(value)) : localStorage.removeItem(store); } catch {} };

  // نص عربي واحد لكل رسالة؛ الترجمة تتكفل بالإنجليزية.
  function say(id, message) {
    const node = $(id);
    node.textContent = I.t(message || '');
    node.hidden = !message;
  }
  async function api(action, payload = {}) {
    const response = await fetch(endpoint, {
      method: 'POST',
      // نص عادي حتى لا يطلب المتصفح تصريحاً مسبقاً من Google.
      headers: {'Content-Type': 'text/plain;charset=utf-8'},
      body: JSON.stringify({action, ...payload}),
      redirect: 'follow'
    });
    if (!response.ok) throw new Error('تعذر الاتصال بخدمة التعديل.');
    let result;
    try { result = await response.json(); } catch { throw new Error('رد غير مفهوم من خدمة التعديل.'); }
    if (!result.ok) throw new Error(result.error || 'تعذر تنفيذ الطلب.');
    return result;
  }
  function signedOut(message) {
    session = null;
    write(null);
    sync();
    if (message) window.WorkshopApp?.notice(message, true);
  }
  async function call(action, payload) {
    try {
      return await api(action, {token: session?.token, ...payload});
    } catch (error) {
      if (/الجلسة|تسجيل الدخول|موقوف|الحساب/.test(error.message)) signedOut(error.message);
      throw error;
    }
  }
  const canEdit = () => Boolean(session);
  const canDelete = () => session?.user?.role === 'admin';

  function sync() {
    $('admin-open').hidden = Boolean(session);
    $('admin-session').hidden = !session;
    $('admin-add').hidden = !session;
    if (session) $('admin-name').textContent = session.user.name || session.user.username;
    $('admin-role').textContent = session ? (canDelete() ? 'مدير' : 'محرر') : '';
    window.dispatchEvent(new CustomEvent('workshop-session', {detail: session}));
  }
  function options(select, map, selected) {
    select.innerHTML = '';
    for (const [value, label] of Object.entries(map)) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      if (value === selected) option.selected = true;
      select.append(option);
    }
  }
  function groups() {
    return Object.fromEntries((data?.groups || []).filter(group => group.id !== 'all').map(group => [group.id, group.label]));
  }
  function fill(item) {
    const meta = item?.procurement || null;
    options($('admin-priority'), priorities, item?.priority || 'medium');
    options($('admin-stage'), window.WorkshopSheets.stages, item?.stage || 'coordination');
    options($('admin-group'), groups(), item?.group || Object.keys(groups())[0]);
    options($('admin-pr-kind'), kinds, meta?.kind && kinds[meta.kind] ? meta.kind : 'pr');
    options($('admin-pr-stage'), window.WorkshopSheets.stages, meta?.stage || item?.stage || 'preparation');
    options($('admin-pr-basis'), {'': 'غير مسجل', ...bases}, meta?.amountBasis || '');
    $('admin-title').value = item?.title || '';
    $('admin-action').value = item?.action || '';
    $('admin-owner').value = item?.owner || 'فريق شعبة ورشة الديزل';
    $('admin-information').value = item?.informationDate || new Date().toISOString().slice(0, 10);
    $('admin-status').value = item?.status || '';
    $('admin-follow').value = item?.followUpWith || '';
    $('admin-reference').value = item?.reference || '';
    $('admin-due').value = item?.dueDate || '';
    $('admin-notes').value = item?.notes || '';
    $('admin-pr-number').value = meta?.prNumber || '';
    $('admin-pr-numbertype').value = meta?.numberType || '';
    $('admin-pr-lpo').value = meta?.lpoNumber || '';
    $('admin-pr-amount').value = meta?.amountAed ?? '';
    $('admin-pr-budget').value = meta?.budgetCode || '';
    $('admin-pr-note').value = meta?.amountNote || '';
    const has = Boolean(meta);
    $('admin-pr-enabled').checked = has;
    // بيانات الشراء القائمة لا تُزال من الموقع حتى لا يختفي البند من تبويب الطلبات.
    $('admin-pr-enabled').disabled = has;
    purchase();
  }
  function purchase() {
    $('admin-purchase').hidden = !$('admin-pr-enabled').checked;
  }
  function collect() {
    const item = {
      title: $('admin-title').value.trim(),
      priority: $('admin-priority').value,
      stage: $('admin-stage').value,
      group: $('admin-group').value,
      action: $('admin-action').value.trim(),
      owner: $('admin-owner').value.trim(),
      informationDate: $('admin-information').value,
      status: $('admin-status').value.trim(),
      followUpWith: $('admin-follow').value.trim(),
      reference: $('admin-reference').value.trim(),
      dueDate: $('admin-due').value,
      notes: $('admin-notes').value.trim()
    };
    if (!item.title) throw new Error('الموضوع مطلوب.');
    if (!item.action) throw new Error('الإجراء المطلوب مطلوب.');
    if (!item.owner) throw new Error('المسؤول مطلوب.');
    if (!item.informationDate) throw new Error('تاريخ المعلومة مطلوب.');
    if ($('admin-pr-enabled').checked) {
      item.procurement = {
        enabled: true,
        kind: $('admin-pr-kind').value,
        stage: $('admin-pr-stage').value,
        prNumber: $('admin-pr-number').value.trim(),
        numberType: $('admin-pr-numbertype').value.trim(),
        lpoNumber: $('admin-pr-lpo').value.trim(),
        amountAed: $('admin-pr-amount').value.trim(),
        amountBasis: $('admin-pr-basis').value,
        budgetCode: $('admin-pr-budget').value.trim(),
        amountNote: $('admin-pr-note').value.trim()
      };
    }
    return item;
  }
  function openEditor(item) {
    editing = item || null;
    say('admin-editor-error', '');
    $('admin-editor-title').textContent = I.t(item ? 'تعديل متابعة' : 'إضافة متابعة');
    $('admin-delete').hidden = !(item && canDelete());
    resetConfirm();
    fill(item);
    $('admin-editor').showModal();
    $('admin-title').focus();
  }
  function resetConfirm() {
    clearTimeout(confirmTimer);
    confirmTimer = 0;
    $('admin-delete').dataset.armed = 'false';
    $('admin-delete-label').textContent = I.t('حذف البند');
  }
  function working(on, label) {
    busy = on;
    for (const button of $('admin-editor').querySelectorAll('button')) button.disabled = on;
    $('admin-save-label').textContent = I.t(on ? label : 'حفظ');
  }
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    let item;
    try { item = collect(); } catch (error) { say('admin-editor-error', error.message); return; }
    say('admin-editor-error', '');
    working(true, 'جارٍ الحفظ…');
    try {
      if (editing) await call('update', {id: editing.id, item, expectedUpdatedAt: editing.updatedAt});
      else await call('create', {item});
      const message = editing ? 'تم حفظ التعديل في السجل.' : 'تمت إضافة المتابعة إلى السجل.';
      $('admin-editor').close();
      // القراءة الجديدة تكتب رسالتها، فتُعرض رسالة الحفظ بعدها.
      await window.WorkshopApp?.refresh();
      window.WorkshopApp?.notice(message);
    } catch (error) {
      say('admin-editor-error', error.message);
    } finally {
      working(false);
    }
  }
  async function remove() {
    if (busy || !editing) return;
    if ($('admin-delete').dataset.armed !== 'true') {
      $('admin-delete').dataset.armed = 'true';
      $('admin-delete-label').textContent = I.t('تأكيد الحذف نهائياً');
      confirmTimer = setTimeout(resetConfirm, 6000);
      return;
    }
    resetConfirm();
    working(true, 'جارٍ الحذف…');
    try {
      await call('delete', {id: editing.id, expectedUpdatedAt: editing.updatedAt});
      $('admin-editor').close();
      await window.WorkshopApp?.refresh();
      window.WorkshopApp?.notice('تم حذف البند من السجل.');
    } catch (error) {
      say('admin-editor-error', error.message);
    } finally {
      working(false);
    }
  }
  async function signIn(event) {
    event.preventDefault();
    if (busy) return;
    const username = $('admin-username').value.trim(), password = $('admin-password').value;
    if (!username || !password) { say('admin-login-error', 'اكتب اسم المستخدم وكلمة المرور.'); return; }
    say('admin-login-error', '');
    busy = true;
    $('admin-login-submit').disabled = true;
    $('admin-login-label').textContent = I.t('جارٍ التحقق…');
    try {
      const result = await api('login', {username, password});
      session = {token: result.token, user: result.user, expiresAt: result.expiresAt};
      write(session);
      sync();
      $('admin-password').value = '';
      $('admin-login').close();
      window.WorkshopApp?.notice('تم تسجيل الدخول. يمكنك الآن الإضافة والتعديل.');
    } catch (error) {
      say('admin-login-error', error.message);
    } finally {
      busy = false;
      $('admin-login-submit').disabled = false;
      $('admin-login-label').textContent = I.t('دخول');
    }
  }
  async function signOut() {
    const token = session?.token;
    signedOut('');
    window.WorkshopApp?.notice('تم تسجيل الخروج.');
    if (token) { try { await api('logout', {token}); } catch {} }
  }
  async function restore() {
    const saved = read();
    if (!saved?.token) return;
    if (saved.expiresAt && Date.parse(saved.expiresAt) <= Date.now()) { write(null); return; }
    session = saved;
    sync();
    try {
      const result = await api('session', {token: saved.token});
      session = {token: saved.token, user: result.user, expiresAt: result.expiresAt};
      write(session);
      sync();
    } catch {
      signedOut('انتهت الجلسة، سجّل الدخول من جديد.');
    }
  }
  window.WorkshopAdmin = {
    canEdit,
    canDelete,
    open(id) {
      const item = data?.items.find(record => record.id === id);
      if (item && canEdit()) openEditor(item);
    }
  };
  window.addEventListener('workshop-data', event => { data = event.detail; });
  (async () => {
    try {
      const response = await fetch('./admin-config.json?t=' + Date.now(), {cache: 'no-store'});
      endpoint = (await response.json()).apiUrl || '';
    } catch { endpoint = ''; }
    // كلمة المرور لا تُرسل إلا عبر https (أو خادم محلي أثناء التجربة).
    if (!/^https:\/\//.test(endpoint) && !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(endpoint)) return;
    document.body.dataset.adminReady = 'true';
    $('admin-open').hidden = false;
    $('admin-open').addEventListener('click', () => {
      say('admin-login-error', '');
      $('admin-login').showModal();
      $('admin-username').focus();
    });
    $('admin-logout').addEventListener('click', signOut);
    $('admin-add').addEventListener('click', () => openEditor(null));
    $('admin-login-form').addEventListener('submit', signIn);
    $('admin-editor-form').addEventListener('submit', save);
    $('admin-delete').addEventListener('click', remove);
    $('admin-pr-enabled').addEventListener('change', purchase);
    for (const id of ['admin-login-cancel', 'admin-editor-cancel']) {
      $(id).addEventListener('click', () => $(id.replace('-cancel', '')).close());
    }
    $('admin-editor').addEventListener('close', resetConfirm);
    await restore();
  })();
})();
