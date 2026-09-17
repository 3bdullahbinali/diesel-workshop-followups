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
  const STORE = 'workshop-toast-seen', MAX_KEYS = 600, KEEP_DAYS = 60;
  // ذاكرة الإشعارات: التغيير يظهر مرة واحدة، وإن أُغلق لا يعود بعد كل تحديث للصفحة.
  let memory = new Map(), known = false, storage = null;
  try {
    localStorage.setItem(STORE + '-probe', '1');
    localStorage.removeItem(STORE + '-probe');
    storage = localStorage;
  } catch { known = true; }   // بلا تخزين: الذاكرة للجلسة الواحدة فقط.
  if (storage) {
    try {
      const saved = JSON.parse(storage.getItem(STORE) || 'null');
      if (saved && saved.v === 1 && saved.keys && typeof saved.keys === 'object') {
        memory = new Map(Object.entries(saved.keys).filter(([, at]) => Number.isFinite(at)));
        known = true;
      }
    } catch {}
  }
  function save() {
    // الأقدم يُحذف أولاً، والمفاتيح القديمة تنتهي، فلا تكبر الذاكرة بلا حد.
    const cutoff = Date.now() - KEEP_DAYS * 86400000;
    const kept = [...memory].filter(([, at]) => at >= cutoff).sort((a, b) => a[1] - b[1]).slice(-MAX_KEYS);
    memory = new Map(kept);
    if (!storage) return;
    try { storage.setItem(STORE, JSON.stringify({v:1, keys:Object.fromEntries(kept)})); } catch {}
  }
  const seen = key => Boolean(key) && memory.has(key);
  function remember(key) {
    if (!key) return;
    memory.set(key, Date.now());
  }

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
  function push({title, body = '', kind = 'info', key = ''}) {
    if (seen(key)) return null;
    remember(key);
    save();
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
  // ترجع عدد الإشعارات التي ستظهر فعلاً، حتى يعرف الموقع إن كان هناك جديد.
  function pushAll(list) {
    const fresh = list.filter(item => !seen(item.key));
    if (!fresh.length) return 0;
    // أول فتح في هذا المتصفح: تُسجَّل الحالة الراهنة بلا إشعارات عن تغييرات سابقة لم يرها أحد.
    if (!known) {
      known = true;
      for (const item of fresh) remember(item.key);
      save();
      return 0;
    }
    // دفعة واحدة تظهر متتابعة لا دفعة واحدة، فتُقرأ.
    fresh.slice(0, LIMIT).forEach((item, index) => {
      if (!index || !motionOn()) return push(item);
      setTimeout(() => push(item), index * 140);
    });
    if (fresh.length > LIMIT) {
      const rest = fresh.slice(LIMIT);
      for (const item of rest) remember(item.key);
      save();
      setTimeout(() => push({title:'وتغييرات أخرى', body:`${rest.length} تغييراً إضافياً في السجل.`}), LIMIT * 140);
    }
    return fresh.length;
  }
  window.WorkshopToast = {push, pushAll, clear: () => [...live].forEach(dismiss), get remembered() { return memory.size; }};
  window.addEventListener('workshop-language', () => [...live].forEach(dismiss));
})();
