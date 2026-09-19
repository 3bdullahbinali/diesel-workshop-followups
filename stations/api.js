'use strict';
(function (root) {
  /**
   * عميل واجهة Apps Script الموثقة.
   *
   * الرمز يُحفظ في sessionStorage لا localStorage: ينتهي بإغلاق التبويب،
   * ولا يبقى على جهاز مشترك بعد انصراف المستخدم.
   *
   * ترويسة text/plain مقصودة: تجعل الطلب «بسيطاً» فلا يسبقه preflight،
   * وApps Script لا يردّ على OPTIONS. الخادم يقرأ الجسم كـJSON على أي حال.
   */

  const TOKEN_KEY = 'stations-api-token';
  let endpoint = null;
  let session = null;

  const store = {
    get() { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } },
    set(value) { try { value ? sessionStorage.setItem(TOKEN_KEY, value) : sessionStorage.removeItem(TOKEN_KEY); } catch {} }
  };

  async function call(action, payload) {
    if (!endpoint) throw new Error('لم يُضبط رابط الواجهة في api-config.json.');
    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, ...payload }),
        redirect: 'follow'
      });
    } catch {
      throw new Error('تعذّر الوصول إلى الخادم. تأكد من الاتصال ومن رابط النشر.');
    }
    if (!response.ok) throw new Error(`الخادم ردّ بالرمز ${response.status}.`);

    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      // رد HTML بدل JSON يعني غالباً أن النشر يطلب تسجيل دخول Google.
      throw new Error('رد غير متوقع من الخادم. راجع إعداد النشر: الوصول «أي شخص».');
    }
    if (!data.ok) throw new Error(data.error || 'رُفض الطلب.');
    return data;
  }

  const api = {
    configure(config) {
      endpoint = config?.apiUrl || null;
      return Boolean(endpoint);
    },
    get configured() { return Boolean(endpoint); },
    get session() { return session; },

    /** يستعيد جلسة محفوظة إن كانت لا تزال صالحة على الخادم. */
    async resume() {
      const token = store.get();
      if (!token) return null;
      try {
        const data = await call('session', { token });
        session = data.user;
        return session;
      } catch {
        store.set(null);
        session = null;
        return null;
      }
    },

    async login(username, password) {
      const data = await call('login', { username, password });
      store.set(data.token);
      session = data.user;
      return session;
    },

    async logout() {
      const token = store.get();
      store.set(null);
      session = null;
      if (token) { try { await call('logout', { token }); } catch {} }
    },

    /** قراءة السجل. تفشل بلا جلسة صالحة؛ لا يوجد مسار قراءة مجهول. */
    async read(tabs) {
      const token = store.get();
      if (!token) throw new Error('يلزم تسجيل الدخول.');
      return call('read', { token, tabs });
    }
  };

  root.StationsApi = api;
})(globalThis);
