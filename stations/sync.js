'use strict';
(() => {
  /**
   * يربط الموقع بالشيت المستقل عند توفره.
   *
   * قاعدة السلامة: حين يكون المصدر هو الشيت، يتعطّل التحرير المحلي.
   * وجود شاشتَي تحرير لسجل واحد يعني تعديلاً يظنه صاحبه محفوظاً وهو ليس كذلك،
   * وهذا أسوأ من غياب التحرير.
   */

  const config = window.STATIONS_SHEET_CONFIG;
  const band = document.getElementById('sync-band');
  const dot = document.getElementById('sync-dot');
  const label = document.getElementById('sync-label');
  const detail = document.getElementById('sync-detail');
  const link = document.getElementById('sync-link');

  if (!config?.spreadsheetId) {
    band.hidden = true;
    return;
  }
  link.href = config.spreadsheetUrl;

  function show(state, title, note) {
    band.hidden = false;
    dot.className = 'sync-dot ' + state;
    label.textContent = title;
    detail.textContent = note;
  }

  function applySource(source) {
    document.body.dataset.source = source;
    // أزرار التحرير تختفي حين يكون الشيت هو المصدر، لا تبقى معطّلة بصمت.
    for (const el of document.querySelectorAll('[data-local-only]')) el.hidden = source === 'sheet';
  }

  async function sync(initial) {
    show('pending', 'جارٍ قراءة السجل من Google Sheets', 'تبويبات المتابعات والشراء والأنشطة والكتب.');
    try {
      const data = await window.StationsSheets.load(config, window.STATIONS_DATA);
      window.StationsStore.replaceBase(data);
      applySource('sheet');
      const time = new Date().toLocaleTimeString('ar-AE', { hour: '2-digit', minute: '2-digit' });
      const counts = data.meta.coverage;
      show('live', 'المصدر: Google Sheets',
        `${counts.followups} متابعة · ${counts.activities} نشاطاً · آخر قراءة ${time}`
        + (data.warnings?.length ? ` · تعذّر قراءة ${data.warnings.length} تبويب` : ''));
      if (data.warnings?.length) dot.className = 'sync-dot partial';
    } catch (error) {
      applySource('local');
      show('offline', 'المصدر: النسخة المضمّنة',
        (initial ? 'لم يُقرأ الشيت — ' : 'تعذّر التحديث — ')
        + 'تأكد أن الملف قابل للعرض بالرابط. التحرير المحلي يعمل.');
      console.warn('[stations] sheet sync failed:', error.message);
    }
  }

  applySource('local');
  sync(true);
  const every = Number(config.refreshSeconds) || 60;
  setInterval(() => sync(false), Math.max(30, every) * 1000);
  document.getElementById('sync-refresh').onclick = () => sync(false);
})();
