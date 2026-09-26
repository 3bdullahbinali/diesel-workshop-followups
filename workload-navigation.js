'use strict';
// Diesel workload navigation 1.1.1: use the existing language event, not a DOM observer.
// Observing html[lang] and rewriting text caused a feedback loop with i18n.apply().
(() => {
  const anchor = document.querySelector('.page-actions .readiness-link');
  if (!anchor || document.getElementById('workload-launch')) return;
  const link = document.createElement('a');
  link.id = 'workload-launch';
  link.className = 'admin-button workload-link';
  link.href = './workload.html';
  link.setAttribute('translate', 'no');
  link.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M7 16v-5M12 16V5M17 16V8"/></svg><span></span>';
  const label = link.querySelector('span');
  function update() {
    const language = window.WorkshopI18n?.language || document.documentElement.lang;
    const text = language === 'en' ? 'Achievement & workload' : 'الإنجاز وعبء العمل';
    if (label.textContent !== text) label.textContent = text;
  }
  update();
  anchor.after(link);
  window.addEventListener('workshop-language', update);
})();
