'use strict';
(() => {
  /**
   * يربط الموقع بمصدره.
   *
   * القراءة مفتوحة: الزائر يرى السجل الحيّ بلا حساب. التحرير وحده خلف تسجيل
   * الدخول، والرفض من الخادم لا من إخفاء الأزرار.
   *
   * ترتيب الإقلاع: جلسة محفوظة ← قراءة عامة عبر الواجهة ← النسخة المضمّنة.
   * قراءة gviz المباشرة مسار قديم لا يُفعَّل إلا بإذن صريح، وتتطلب مشاركة
   * الشيت بالرابط؛ الواجهة تغني عنها وتُبقي الملف غير مشارَك.
   *
   * قاعدة تفادي الازدواج: حين يكون المصدر خارجياً يتعطّل التحرير المحلي، لأن
   * تعديلاً يظنه صاحبه محفوظاً وهو ليس كذلك أسوأ من غياب التحرير.
   */

  const apiConfig = window.STATIONS_API_CONFIG || {};
  const sheetConfig = window.STATIONS_SHEET_CONFIG || {};
  const api = window.StationsApi;
  const sheets = window.StationsSheets;

  const el = (id) => document.getElementById(id);
  const band = el('sync-band');
  const dot = el('sync-dot');
  const label = el('sync-label');
  const detail = el('sync-detail');
  const actions = el('sync-actions');

  const useApi = api.configure(apiConfig);
  const allowPublic = sheetConfig.allowPublicRead === true;

  if (!useApi && !allowPublic) {
    show('offline', 'المصدر: النسخة المضمّنة',
      'لم يُضبط رابط الواجهة الموثقة في api-config.json، والقراءة العامة معطّلة.');
    setSource('local');
    return;
  }

  function show(state, title, note) {
    band.hidden = false;
    dot.className = 'sync-dot ' + state;
    label.textContent = title;
    detail.textContent = note;
  }

  function setSource(source) {
    document.body.dataset.source = source;
    // منطق الإظهار في مكان واحد داخل app.js حتى لا يتفرّع بين الملفين.
    window.StationsApp?.applyCapabilities?.();
  }

  function buttons(list) {
    actions.innerHTML = '';
    for (const [text, handler, className] of list) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className || 'mini';
      button.textContent = text;
      button.onclick = handler;
      actions.append(button);
    }
    if (sheetConfig.spreadsheetUrl) {
      const link = document.createElement('a');
      link.href = sheetConfig.spreadsheetUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'فتح الشيت';
      actions.append(link);
    }
  }

  // --------------------------------------------------------- نافذة الدخول
  function promptLogin() {
    const dialog = el('login');
    el('login-error').hidden = true;
    dialog.showModal();
    el('login-username').focus();

    dialog.querySelector('form').onsubmit = async (event) => {
      event.preventDefault();
      const error = el('login-error');
      const submit = el('login-submit');
      error.hidden = true;
      submit.disabled = true;
      submit.textContent = 'جارٍ التحقق…';
      try {
        const user = await api.login(el('login-username').value.trim(), el('login-password').value);
        el('login-password').value = '';
        dialog.close();
        await pull(user);
      } catch (failure) {
        error.textContent = failure.message;
        error.hidden = false;
      } finally {
        submit.disabled = false;
        submit.textContent = 'دخول';
      }
    };
    el('login-cancel').onclick = () => dialog.close();
  }

  // ------------------------------------------------------------- القراءة
  let timer = null;

  async function pull(user) {
    show('pending', 'جارٍ قراءة السجل', 'قراءة موثقة عبر Apps Script.');
    try {
      const data = await sheets.loadAuthenticated(window.STATIONS_DATA);
      window.StationsStore.replaceBase(data);
      setSource('api');
      const counts = data.meta.coverage;
      const time = new Date().toLocaleTimeString('ar-AE', { hour: '2-digit', minute: '2-digit' });
      show(data.warnings?.length ? 'partial' : 'live',
        `المصدر: الشيت عبر واجهة موثقة — ${user.name}`,
        `${api.canWrite ? 'تحرير' : 'قراءة فقط'} · ${counts.followups} متابعة`
        + ` · ${counts.activities} نشاطاً · آخر قراءة ${time}`
        + (data.warnings?.length ? ` · ${data.warnings.length} تنبيه` : ''));
      buttons([
        ['تحديث الآن', () => pull(user)],
        ['خروج', signOut]
      ]);
      if (!timer) {
        const every = Math.max(60, Number(apiConfig.refreshSeconds) || 120);
        timer = setInterval(() => pull(user).catch(() => {}), every * 1000);
      }
    } catch (error) {
      stopTimer();
      setSource('local');
      show('offline', 'المصدر: النسخة المضمّنة', 'تعذّرت القراءة الموثقة — ' + error.message);
      buttons([['تسجيل الدخول', promptLogin, 'mini primary']]);
    }
  }

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  /** قراءة عامة: بيانات حيّة بلا حساب، وزر دخول لمن يريد التحرير. */
  async function pullAnonymous() {
    show('pending', 'جارٍ قراءة السجل', 'قراءة عامة عبر الواجهة.');
    try {
      const data = await sheets.loadPublicApi(window.STATIONS_DATA);
      window.StationsStore.replaceBase(data);
      setSource('api-public');
      const counts = data.meta.coverage;
      const time = new Date().toLocaleTimeString('ar-AE', { hour: '2-digit', minute: '2-digit' });
      show(data.warnings?.length ? 'partial' : 'live', 'المصدر: الشيت — قراءة عامة',
        `${counts.followups} متابعة · ${counts.activities} نشاطاً · آخر قراءة ${time}`
        + ' · سجّل الدخول للتحرير');
      buttons([
        ['تحديث الآن', pullAnonymous],
        ['تسجيل الدخول', promptLogin, 'mini primary']
      ]);
      if (!timer) {
        const every = Math.max(60, Number(apiConfig.refreshSeconds) || 120);
        timer = setInterval(() => pullAnonymous().catch(() => {}), every * 1000);
      }
    } catch (error) {
      stopTimer();
      setSource('local');
      show('offline', 'المصدر: النسخة المضمّنة', 'تعذّرت القراءة — ' + error.message);
      buttons([['إعادة المحاولة', pullAnonymous], ['تسجيل الدخول', promptLogin, 'mini primary']]);
    }
  }

  async function signOut() {
    stopTimer();
    await api.logout();
    // الخروج يُنهي التحرير لا القراءة: يعود الزائر إلى العرض العام.
    await pullAnonymous();
  }

  /** القراءة العامة: مسار اختياري لا يُفعَّل إلا بإذن صريح في الإعداد. */
  async function pullPublic() {
    show('pending', 'جارٍ القراءة العامة', 'قراءة مباشرة من الشيت بلا تحقق هوية.');
    try {
      const data = await sheets.loadPublic(sheetConfig, window.STATIONS_DATA);
      window.StationsStore.replaceBase(data);
      setSource('public');
      show('partial', 'المصدر: الشيت — قراءة عامة',
        `${data.meta.coverage.followups} متابعة · الملف مقروء لكل من يملك الرابط.`);
      buttons([['تحديث الآن', pullPublic]]);
    } catch (error) {
      setSource('local');
      show('offline', 'المصدر: النسخة المضمّنة', 'تعذّرت القراءة العامة — ' + error.message);
      buttons([]);
    }
  }

  // تُستدعى بعد كل كتابة ناجحة حتى يعرض الموقع ما في الشيت لا ما أرسله المتصفح.
  window.StationsSync = {
    refresh: () => (api.session ? pull(api.session) : pullAnonymous()),
    get user() { return api.session; }
  };

  // ------------------------------------------------------------ الإقلاع
  (async () => {
    setSource('local');
    if (useApi) {
      show('pending', 'جارٍ تحميل السجل', 'قراءة من الشيت عبر الواجهة.');
      const user = await api.resume();
      return user ? pull(user) : pullAnonymous();
    }
    if (allowPublic) return pullPublic();
  })();
})();
