'use strict';
/**
 * إقلاع صفحة صحة المحطات المستقلة.
 *
 * الصفحة تشارك سجل المتابعات مصدرَه وتحميلَه وجلستَه، ولا تشارك شاشاته. لذلك
 * تُحمَّل ملفات الطبقة نفسها — القارئ والمخزن والواجهة والمزامنة — ويُستبدل
 * app.js وحده بهذا الملف: لا تبويبات ولا تسع شاشات، شاشة واحدة تملأ الصفحة.
 *
 * ولأن sync.js ينادي StationsApp عند كل تغيّر مصدر، يُعرَّف هنا بالاسم نفسه
 * بواجهة مصغّرة. البديل أن يعرف sync.js بوجود صفحتين، وهو ربطٌ لا داعي له.
 */
(function (root) {

  const store = root.StationsStore;
  const container = document.getElementById('view-health');
  let ready = false;

  store.init(root.STATIONS_DATA);

  function render() {
    if (!container) return;
    root.StationsHealth.render(container);
    ready = true;
  }

  /**
   * ما يظهر يتبع المصدر: الصفحة للقراءة وحدها، فلا زر تحرير فيها أصلاً.
   * تبقى الدالة لأن sync.js يناديها عند كل تغيّر، وغيابها يقطع السلسلة.
   */
  const applyCapabilities = () => {
    const source = document.body.dataset.source || 'local';
    document.body.dataset.readonly = source === 'offline' ? 'true' : 'false';
  };

  store.subscribe(() => { render(); applyCapabilities(); });

  // زر العرض التلقائي داخل الترويسة، يُعاد بناؤه مع كل رسم فيُربط بالتفويض.
  document.addEventListener('click', (event) => {
    if (event.target.closest('#present-health')) root.StationsPresent?.open('health');
  });

  root.StationsApp = {
    refresh: render,
    applyCapabilities,
    get current() { return 'health'; },
    get ready() { return ready; }
  };

  render();
})(globalThis);
