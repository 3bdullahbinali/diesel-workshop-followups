'use strict';
(() => {
  const I = window.WorkshopI18n;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const shelf = document.createElement('div');
  shelf.className = 'toast-shelf';
  shelf.setAttribute('role', 'status');
  shelf.setAttribute('aria-live', 'polite');
  const live = [], pending = new Set();
  const LIMIT = 4, LIFE = 14000;
  // ذاكرة لهذا الموقع على هذا المتصفح. لا تُخزَّن نصوص المتابعات أو بيانات الدخول.
  const storageKey = 'workshop-notifications:v1:' + location.pathname;
  const MAX_KEYS = 800;
  const seen = new Set();
  let storage = null;
  try {
    localStorage.setItem(storageKey + ':probe', '1');
    localStorage.removeItem(storageKey + ':probe');
    storage = localStorage;
  } catch {}
  function storedKeys() {
    try {
      const value = JSON.parse((storage && storage.getItem(storageKey)) || 'null');
      if (!Array.isArray(value)) return null;
      return value.filter(key => typeof key === 'string' && /^[0-9a-f]{16}$/.test(key));
    } catch { return null; }
  }
  // بلا تخزين لا ذاكرة تُبنى، فتُعرض التغييرات الجديدة بدل كتمها للأبد.
  let known = !storage || storedKeys() !== null;
  function refreshMemory() {
    const stored = storedKeys();
    if (stored) for (const key of stored) seen.add(key);
  }
  function remember(keys) {
    refreshMemory();
    for (const key of keys) seen.add(key);
    // الأقدم يخرج أولاً، فلا تكبر الذاكرة بلا حد على شاشة تعمل بلا توقف.
    if (seen.size > MAX_KEYS) for (const key of [...seen].slice(0, seen.size - MAX_KEYS)) seen.delete(key);
    known = true;
    if (!storage) return;
    try { storage.setItem(storageKey, JSON.stringify([...seen])); } catch {}
  }
  // بصمة ثابتة للتمييز فقط، وليست آلية تشفير أو حماية.
  function fingerprint(value) {
    let a = 2166136261, b = 2246822519;
    for (let i = 0; i < value.length; i++) {
      a = Math.imul(a ^ value.charCodeAt(i), 16777619);
      b = Math.imul(b ^ value.charCodeAt(i), 3266489917);
    }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
  }
  const keyOf = item => fingerprint(String(item.id || JSON.stringify([item.kind || 'info', item.title, item.body || ''])));
  refreshMemory();

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
      {duration:260, easing:'cubic-bezier(.4,0,1,1)'}).finished.then(remove, remove);
  }
  function push(item, coveredKeys = []) {
    const {title, body = '', kind = 'info'} = item;
    const key = keyOf(item);
    refreshMemory();
    if (seen.has(key)) return null;
    if (!document.body.contains(shelf)) document.body.append(shelf);
    const node = document.createElement('div');
    node.className = 'toast';
    node.dataset.kind = kind;
    node.innerHTML = '<div class="toast-text"><strong></strong><span></span></div>' +
      '<button type="button" class="toast-close" aria-label="إغلاق الإشعار"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button>';
    node.querySelector('strong').textContent = I.t(title);
    node.querySelector('.toast-close').setAttribute('aria-label', I.t('إغلاق الإشعار'));
    const detail = node.querySelector('span');
    detail.textContent = I.t(body);
    detail.hidden = !body;
    const entry = {node, key, gone:false, timer:0};
    node.querySelector('.toast-close').addEventListener('click', () => dismiss(entry));
    shelf.append(node);
    live.push(entry);
    // يُسجَّل عند العرض: الإغلاق والتحديث وانتهاء المهلة لا يعيدون نفس الإشعار.
    remember([key, ...coveredKeys]);
    while (live.length > LIMIT) dismiss(live[0]);
    entry.timer = setTimeout(() => dismiss(entry), LIFE);
    if (motionOn()) {
      node.animate([{opacity:0, transform:'translateY(-14px)'}, {opacity:1, transform:'none'}],
        {duration:340, easing:'cubic-bezier(.2,.7,.2,1)'});
    }
    return entry;
  }
  function later(fn, delay) {
    if (!delay || !motionOn()) return fn();
    const timer = setTimeout(() => { pending.delete(timer); fn(); }, delay);
    pending.add(timer);
  }
  function pushAll(list) {
    const first = !known;
    refreshMemory();
    const batch = new Set();
    const unseen = list.filter(item => {
      const key = keyOf(item);
      if (seen.has(key) || batch.has(key)) return false;
      batch.add(key);
      return true;
    });
    if (first && unseen.length) { remember(unseen.map(keyOf)); return 0; }
    // التصفية تسبق الحد: الإشعارات القديمة لا تحجب تحديثاً جديداً.
    const count = unseen.length > LIMIT ? LIMIT - 1 : LIMIT;
    unseen.slice(0, count).forEach((item, index) => later(() => push(item), index * 140));
    const rest = unseen.slice(count);
    if (rest.length) later(() => {
      refreshMemory();
      const keys = rest.map(keyOf).filter(key => !seen.has(key));
      if (keys.length) push({
        id:'summary:' + keys.slice().sort().join(','),
        title:'وتغييرات أخرى', body:`${keys.length} تغييراً إضافياً في السجل.`
      }, keys);
    }, count * 140);
    return unseen.length;
  }
  function clear() {
    for (const timer of pending) clearTimeout(timer);
    pending.clear();
    [...live].forEach(dismiss);
  }
  window.WorkshopToast = {push, pushAll, clear};
  window.addEventListener('storage', event => { if (event.key === storageKey) refreshMemory(); });
  window.addEventListener('workshop-language', clear);
})();
