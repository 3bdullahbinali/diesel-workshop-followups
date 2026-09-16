'use strict';
(() => {
  const I = window.WorkshopI18n;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const shelf = document.createElement('div');
  shelf.className = 'toast-shelf';
  shelf.setAttribute('role', 'status');
  shelf.setAttribute('aria-live', 'polite');
  const live = [];
  const LIMIT = 4, LIFE = 14000;

  function motionOn() {
    return document.documentElement.dataset.motion === 'on' && !reducedMotion.matches;
  }
  function dismiss(entry) {
    if (entry.gone) return;
    entry.gone = true;
    clearTimeout(entry.timer);
    const index = live.indexOf(entry);
    if (index >= 0) live.splice(index, 1);
    const remove = () => entry.node.remove();
    if (!motionOn()) return remove();
    entry.node.animate([{opacity:1, transform:'none'}, {opacity:0, transform:'translateY(-10px)'}],
      {duration:260, easing:'cubic-bezier(.4,0,1,1)'}).finished.finally(remove);
  }
  function push({title, body = '', kind = 'info'}) {
    if (!document.body.contains(shelf)) document.body.append(shelf);
    const node = document.createElement('div');
    node.className = 'toast';
    node.dataset.kind = kind;
    node.innerHTML = `<div class="toast-text"><strong></strong><span></span></div>
      <button type="button" class="toast-close" aria-label="إغلاق الإشعار"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button>`;
    node.querySelector('strong').textContent = I.t(title);
    const detail = node.querySelector('span');
    detail.textContent = I.t(body);
    detail.hidden = !body;
    const entry = {node, gone:false, timer:0};
    node.querySelector('.toast-close').addEventListener('click', () => dismiss(entry));
    shelf.append(node);
    live.push(entry);
    // الأقدم ينصرف أولاً حتى لا تتراكم الإشعارات فوق بعضها.
    while (live.length > LIMIT) dismiss(live[0]);
    entry.timer = setTimeout(() => dismiss(entry), LIFE);
    if (motionOn()) {
      node.animate([{opacity:0, transform:'translateY(-14px)'}, {opacity:1, transform:'none'}],
        {duration:340, easing:'cubic-bezier(.2,.7,.2,1)'});
    }
    return entry;
  }
  function pushAll(list) {
    // دفعة واحدة تظهر متتابعة لا دفعة واحدة، فتُقرأ.
    list.slice(0, LIMIT).forEach((item, index) => {
      if (!index || !motionOn()) return push(item);
      setTimeout(() => push(item), index * 140);
    });
    if (list.length > LIMIT) {
      setTimeout(() => push({title:'وتغييرات أخرى', body:`${list.length - LIMIT} تغييراً إضافياً في السجل.`}), LIMIT * 140);
    }
  }
  window.WorkshopToast = {push, pushAll, clear: () => [...live].forEach(dismiss)};
  window.addEventListener('workshop-language', () => [...live].forEach(dismiss));
})();
