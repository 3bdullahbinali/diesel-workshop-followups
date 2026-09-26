'use strict';
// Add only the workload navigation link; do not change existing tabs or data.
(() => {
  const anchor = document.querySelector('.page-actions .readiness-link');
  if (!anchor || document.getElementById('workload-launch')) return;
  const link = document.createElement('a');
  link.id = 'workload-launch'; link.className = 'admin-button workload-link';
  link.href = './workload.html'; link.setAttribute('translate', 'no');
  link.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M7 16v-5M12 16V5M17 16V8"/></svg><span></span>';
  const update = () => { link.querySelector('span').textContent = document.documentElement.lang === 'en' ? 'Achievement & workload' : 'الإنجاز وعبء العمل'; };
  update(); anchor.after(link);
  new MutationObserver(update).observe(document.documentElement, {attributes:true, attributeFilter:['lang']});
})();
