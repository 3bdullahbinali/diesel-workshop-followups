'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const I = window.WorkshopI18n;
  const dialog = $('presentation');
  const card = $('presentation-card');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const collections = new Map();
  const priorities = {high:'عالية', medium:'متوسطة', low:'منخفضة'};
  const viewOrder = ['overview','non-purchase','procurement','plans','closed'];
  const speeds = [8,12,20,30];
  // A pause caused by reading resumes on its own so a wall screen never stays frozen.
  const resumeDelay = 45000;
  const params = new URLSearchParams(location.search);
  const flag = name => ['1','true','yes','on'].includes((params.get(name) || '').toLowerCase());
  const hashView = () => location.hash === '#purchase-orders' ? 'procurement' : location.hash === '#non-purchase' ? 'non-purchase' : location.hash === '#closed' ? 'closed' : location.hash==='#plans'?'plans':!location.hash?'non-purchase':'overview';
  let view = hashView();
  let items = [], scope = '', index = 0, playing = false, elapsed = 0, lastTick = 0, frame = 0;
  let connection = 'جارٍ الاتصال بالسجل', connected = false, speed = 12, cycle = false;
  let pendingPlay = false, resumeTimer = 0, linkTimer = 0, wakeLock = null, resumedAt = 0;
  try {
    const saved = localStorage.getItem('workshop-presentation-seconds');
    if (saved === 'auto') speed = 'auto';
    else if (speeds.includes(Number(saved))) speed = Number(saved);
    cycle = localStorage.getItem('workshop-presentation-cycle') === 'on';
  } catch {}
  const requested = (params.get('seconds') || '').toLowerCase();
  if (requested === 'auto') speed = 'auto';
  else if (speeds.includes(Number(requested))) speed = Number(requested);
  if (params.has('cycle')) cycle = flag('cycle');
  const kiosk = flag('display') || flag('kiosk');
  $('presentation-speed').value = String(speed);

  function text(id, value) {
    const node = $(id), next = I.t(value ?? '');
    if (node.textContent !== next) node.textContent = next;
  }
  function labels() {
    for (const node of dialog.querySelectorAll('[data-present-label]')) {
      const next = I.t(node.dataset.presentLabel);
      if (node.textContent !== next) node.textContent = next;
    }
    text('presentation-language', I.language === 'ar' ? 'English' : 'العربية');
    $('presentation-language').lang = I.language === 'ar' ? 'en' : 'ar';
    $('presentation-language').setAttribute('aria-label', I.language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية');
    $('presentation-close').setAttribute('aria-label', I.t('العودة للجدول'));
    $('presentation-fullscreen').setAttribute('aria-label', I.t($('presentation-fullscreen-label').dataset.presentLabel));
    $('presentation-cycle').setAttribute('aria-label', I.t('تدوير التبويبات تلقائياً بعد انتهاء القائمة'));
    $('presentation-link').setAttribute('aria-label', I.t($('presentation-link-label').dataset.presentLabel));
    text('presentation-scope', scope);
    text('presentation-connection', connection);
    $('presentation-connection').dataset.connected = String(connected);
  }
  // Automatic pacing gives each record time proportional to the text it carries.
  function duration() {
    if (speed !== 'auto') return speed * 1000;
    const item = items[index];
    if (!item) return 12000;
    const words = [item.title, item.status, item.action, item.owner].filter(Boolean).join(' ').trim().split(/\s+/).filter(Boolean).length;
    return Math.min(34, Math.max(9, Math.round(5 + words / 2.2))) * 1000;
  }
  // With tab rotation on, even an empty tab keeps moving to the next one.
  function rotating() {
    return items.length > 1 || cycle;
  }
  function progress() {
    const total = duration();
    K.ring($('presentation-ring'), rotating() ? elapsed / total : 0);
    const show = rotating();
    $('presentation-remaining').hidden = !show;
    if (show) text('presentation-remaining-value', String(Math.max(0, Math.ceil((total - elapsed) / 1000))));
  }
  function controls() {
    const multiple = items.length > 1;
    $('presentation-toggle').disabled = !rotating();
    $('presentation-prev').disabled = !multiple;
    $('presentation-next').disabled = !multiple;
    $('presentation-speed').disabled = !rotating();
    text('presentation-play-label', playing ? 'إيقاف مؤقت' : 'تشغيل العرض');
    text('presentation-play-state', !items.length && !cycle ? '' : !rotating() ? 'متابعة واحدة في هذا العرض' : !items.length ? 'ينتقل تلقائياً إلى التبويب التالي' : playing ? 'الانتقال التلقائي مفعّل' : resumeTimer ? 'يستأنف العرض تلقائياً بعد الانتهاء من القراءة' : 'العرض متوقف مؤقتاً');
    $('presentation-play-icon').setAttribute('d', playing ? 'M9 5v14M15 5v14' : 'm9 5 10 7-10 7Z');
    $('presentation-cycle').setAttribute('aria-pressed', String(cycle));
    dialog.dataset.playing = String(playing);
    dialog.dataset.cycle = String(cycle);
    // Keep automatic changes quiet for screen readers; manual navigation announces its result.
    text('presentation-counter', `${items.length ? index + 1 : 0} / ${items.length}`);
    const wrapping = cycle && index + 1 >= items.length;
    const next = !wrapping && items.length > 1 ? items[(index + 1) % items.length] : null;
    text('presentation-next-title', next?.title || (cycle ? 'التبويب التالي' : ''));
    dialog.querySelector('.presentation-next').hidden = !next && !cycle;
    queue();
  }
  // شريط «بعدها»: البنود الثلاثة التالية تمشي بسرعة القراءة، والأقرب أسطعها.
  // يُعاد بناؤه فقط حين تتغيّر القائمة أو اللغة، لا مع كل نبضة.
  let queueKey = '';
  function queue() {
    const track = $('presentation-queue-track');
    const upcoming = [];
    if (items.length > 1) {
      for (let k = 1; k <= 3 && k < items.length; k++) {
        if (cycle && index + k >= items.length) break;
        upcoming.push(items[(index + k) % items.length].title);
      }
    }
    if (cycle && upcoming.length < 3) upcoming.push(I.t('التبويب التالي'));
    const key = [I.language, motionOn(), playing, ...upcoming].join('|');
    if (key === queueKey) return;
    queueKey = key;
    track.textContent = '';
    if (!upcoming.length) return;
    const copies = motionOn() ? 2 : 1;           // نسختان ليدور الشريط بلا نهاية
    for (let c = 0; c < copies; c++) upcoming.forEach((title, i) => {
      const span = document.createElement('span');
      span.className = i === 0 ? 'k-near' : '';
      span.textContent = I.t(title);
      const num = document.createElement('b');
      num.textContent = String(i + 1);
      span.prepend(num);
      track.appendChild(span);
    });
    K.ticker(track, {animate: motionOn() && playing, rtl: I.language === 'ar'});
  }
  const motionOn = () => document.documentElement.dataset.motion === 'on' && !reducedMotion.matches;
  const K = window.WorkshopKinetic;
  function cancelMotion() {
    for (const a of card.getAnimations({subtree:true})) a.cancel();
  }
  // البند الخارج: نسخة منه تُرفع وتذوب فوق المسرح بينما يدخل الجديد تحتها.
  function ghostOut() {
    if (!card.dataset.itemId) return;
    const ghost = card.cloneNode(true);
    ghost.removeAttribute('id'); ghost.removeAttribute('tabindex');
    ghost.className = 'k-stage k-ghost'; ghost.setAttribute('aria-hidden', 'true');
    for (const el of ghost.querySelectorAll('[id]')) el.removeAttribute('id');
    card.parentNode.appendChild(ghost);
    const total = K.leave(ghost, {step:18, duration:300});
    setTimeout(() => ghost.remove(), total + 40);
  }
  function render({animate = false, resetScroll = false} = {}) {
    labels();
    card.hidden = items.length === 0;
    $('presentation-empty').hidden = items.length !== 0;
    const item = items[index];
    if (item) {
      const moving = animate && motionOn();
      const changed = card.dataset.itemId !== item.id;
      if (moving && changed) ghostOut();
      cancelMotion();
      const rtl = I.language === 'ar';
      const on = {animate: moving && changed};
      const hold = moving && changed && card.dataset.itemId ? 260 : 0;   // ريثما يرحل السابق
      card.dataset.itemId = item.id;
      // ترتيب الدخول: المرجع يعدّ، فالعنوان كلمةً كلمة، فالشارات، فالحالة
      // جملةً جملة، فالإجراء وخطّه الذهبي، فالمسؤول والتواريخ.
      K.count($('presentation-reference'), item.reference || (item.procurement?.prNumber ? `PR ${item.procurement.prNumber}` : ''), {...on, delay:hold + 120});
      const titleEnd = K.words($('presentation-item-title'), I.t(item.title), {...on, delay:hold + 180, step:70, from:18});
      text('presentation-priority', priorities[item.priority] || '');
      $('presentation-priority').dataset.priority = item.priority;
      const stage = view === 'procurement' ? window.WorkshopProcurement.stageLabels[item.procurement?.stage] : window.WorkshopSheets?.stages[item.stage];
      text('presentation-status-badge', stage || item.stage);
      K.reveal([...card.querySelectorAll('.k-badges .k-part, .k-status .k-label')], {...on, delay: Math.min(titleEnd - 300, 900), step:80, from:8});
      const statusEnd = K.lines($('presentation-status'), I.t(item.status || 'غير مسجل'), {...on, delay: Math.min(titleEnd - 200, 1000), step:90});
      const actionAt = Math.min(statusEnd - 260, 1700);
      K.rule(card.querySelector('.k-rule'), {...on, delay: actionAt});
      K.reveal([card.querySelector('.k-action .k-label')], {...on, delay: actionAt + 80, from:8});
      const actionEnd = K.lines($('presentation-action'), I.t(item.action || 'غير مسجل'), {...on, delay: actionAt + 160, step:90});
      text('presentation-owner', item.owner || 'غير مسجل');
      text('presentation-action-at', item.actionAt ? window.WorkshopSheets.actions[item.actionAt] : '');
      const blocker = $('presentation-blocker');
      text('presentation-blocker', item.blocker || '');
      blocker.hidden = !item.blocker;
      if (item.blocker) K.wipe(blocker, {...on, delay: titleEnd - 200, rtl});
      const information = item.informationDate ? new Date(`${item.informationDate}T12:00:00Z`) : null;
      text('presentation-information', information && Number.isFinite(information.getTime()) ? new Intl.DateTimeFormat(I.locale, {day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Dubai'}).format(information) : 'غير مسجل');
      $('presentation-information').dateTime = item.informationDate || '';
      text('presentation-updated', window.WorkshopRecordTime(item.updatedAt));
      $('presentation-updated').dateTime = item.updatedAt || '';
      K.reveal([...card.querySelectorAll('.k-meta .k-part')], {...on, delay: Math.min(actionEnd - 300, 2300), step:110, from:10});
      if (resetScroll) card.scrollTop = 0;
    } else {
      delete card.dataset.itemId;
    }
    controls();
    progress();
  }
  function stopFrame() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTick = 0;
  }
  function clearResume() {
    clearTimeout(resumeTimer);
    resumeTimer = 0;
  }
  // `resume` marks a pause the reader did not ask for explicitly: it lifts itself.
  function pause({resume = false} = {}) {
    playing = false;
    stopFrame();
    clearResume();
    releaseWakeLock();
    if (resume && dialog.open && !document.hidden && rotating()) {
      resumeTimer = setTimeout(() => { resumeTimer = 0; play(); }, resumeDelay);
    }
    controls();
  }
  const pauseForReading = () => pause({resume:true});
  function nextView(attempts = 0) {
    if (!cycle || attempts >= viewOrder.length || !window.WorkshopViews) return false;
    window.WorkshopViews.select(viewOrder[(viewOrder.indexOf(view) + 1) % viewOrder.length]);
    index = 0;
    elapsed = 0;
    render({animate:true, resetScroll:true});
    return items.length ? true : nextView(attempts + 1);
  }
  function advance(delta, manual = false) {
    if (!items.length) return;
    if (manual) pause({resume:true});
    if (!manual && cycle && (index + delta >= items.length || items.length < 2)) {
      if (nextView()) return;
    }
    index = (index + delta + items.length) % items.length;
    elapsed = 0;
    render({animate:true, resetScroll:true});
    if (manual) text('presentation-announcement', `${index + 1} / ${items.length} — ${items[index].title}`);
  }
  function tick(now) {
    frame = 0;
    if (!dialog.open || !playing || document.hidden || !rotating()) return;
    if (lastTick) elapsed += now - lastTick;
    lastTick = now;
    if (elapsed >= duration()) {
      if (items.length > 1 || !nextView()) advance(1);
      elapsed = 0;
    }
    progress();
    frame = requestAnimationFrame(tick);
  }
  function play() {
    clearResume();
    if (!dialog.open || document.hidden || !rotating()) { controls(); return; }
    playing = true;
    resumedAt = Date.now();
    stopFrame();
    requestWakeLock();
    controls();
    frame = requestAnimationFrame(tick);
  }
  // Wall screens must not dim while the display runs; the lock is dropped on pause.
  async function requestWakeLock() {
    if (wakeLock || !navigator.wakeLock?.request) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch {}
  }
  function releaseWakeLock() {
    wakeLock?.release?.().catch(() => {});
    wakeLock = null;
  }
  function fullscreenLabel() {
    const active = Boolean(document.fullscreenElement);
    $('presentation-fullscreen-label').dataset.presentLabel = active ? 'إنهاء ملء الشاشة' : 'ملء الشاشة';
    $('presentation-fullscreen').setAttribute('aria-pressed', String(active));
    labels();
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({navigationUI:'hide'});
    } catch {}
  }
  function adoptCollection() {
    const previous = items[index];
    const next = collections.get(view) || {items:[], label:''};
    items = next.items;
    scope = next.label;
    const found = previous ? items.findIndex(item => item.id === previous.id) : -1;
    index = found >= 0 ? found : Math.min(index, Math.max(items.length - 1, 0));
    if (found < 0) elapsed = 0;
    if (!rotating()) pause();
    if (dialog.open) {
      const changed = JSON.stringify(previous) !== JSON.stringify(items[index]);
      if (changed) render({resetScroll:found < 0});
      else { labels(); controls(); progress(); }
      // The register loads after the display opens, so a pending start waits for records.
      if (pendingPlay && rotating()) { pendingPlay = false; play(); }
    }
  }
  function open({auto = false} = {}) {
    adoptCollection();
    index = 0;
    elapsed = 0;
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('presentation-open');
    render({animate:true, resetScroll:true});
    if (auto || !reducedMotion.matches) {
      pendingPlay = true;
      if (rotating()) { pendingPlay = false; play(); }
    }
  }
  window.WorkshopPresentation = {
    setItems(name, records, label) {
      const signature = JSON.stringify(records);
      const prior = collections.get(name);
      if (prior?.signature === signature && prior.label === label) return;
      collections.set(name, {items:records, label, signature});
      if (name === view) adoptCollection();
    },
    setConnection(message, ok) {
      connection = message;
      connected = ok;
      if (dialog.open) labels();
    },
    open
  };
  $('presentation-open').addEventListener('click', () => open());
  $('presentation-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    pause();
    pendingPlay = false;
    cancelMotion();
    text('presentation-announcement', '');
    document.body.classList.remove('presentation-open');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    $('presentation-open').focus({preventScroll:true});
  });
  $('presentation-toggle').addEventListener('click', () => playing ? pause() : play());
  $('presentation-prev').addEventListener('click', () => advance(-1, true));
  $('presentation-next').addEventListener('click', () => advance(1, true));
  $('presentation-fullscreen').addEventListener('click', toggleFullscreen);
  // The wall-screen link reopens the site straight into the display with the same settings.
  $('presentation-link').addEventListener('click', async () => {
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('display', '1');
    url.searchParams.set('seconds', String(speed));
    if (cycle) url.searchParams.set('cycle', '1');
    const address = url.toString();
    let copied = true;
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      copied = false;
    }
    const button = $('presentation-link');
    button.dataset.copied = String(copied);
    $('presentation-link-label').dataset.presentLabel = copied ? 'تم نسخ رابط شاشة العرض' : 'رابط شاشة العرض';
    text('presentation-announcement', copied ? I.t('تم نسخ رابط شاشة العرض') : address);
    labels();
    clearTimeout(linkTimer);
    linkTimer = setTimeout(() => {
      delete button.dataset.copied;
      $('presentation-link-label').dataset.presentLabel = 'نسخ رابط شاشة العرض';
      labels();
    }, 4000);
  });
  $('presentation-cycle').addEventListener('click', () => {
    cycle = !cycle;
    try { localStorage.setItem('workshop-presentation-cycle', cycle ? 'on' : 'off'); } catch {}
    controls();
    progress();
    if (cycle && !playing && rotating()) play();
  });
  $('presentation-language').addEventListener('click', () => {
    pause();
    I.setLanguage(I.language === 'ar' ? 'en' : 'ar');
  });
  $('presentation-speed').addEventListener('change', event => {
    speed = event.target.value === 'auto' ? 'auto' : Number(event.target.value);
    elapsed = 0;
    try { localStorage.setItem('workshop-presentation-seconds', String(speed)); } catch {}
    progress();
  });
  dialog.addEventListener('keydown', event => {
    if (event.target.matches('input,select,textarea')) return;
    if (event.key === ' ' || event.key === 'Spacebar') {
      if (event.target.closest('button')) return;
      event.preventDefault();
      playing ? pause() : play();
      return;
    }
    if (event.key === 'f' || event.key === 'F') {
      if (event.target.closest('button,select')) return;
      event.preventDefault();
      toggleFullscreen();
      return;
    }
    if (event.key === 'Tab') pauseForReading();
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const nextKey = I.language === 'ar' ? 'ArrowLeft' : 'ArrowRight';
      advance(event.key === nextKey ? 1 : -1, true);
    }
  });
  // Interaction with long text pauses the timer so readers can finish the record.
  card.addEventListener('pointerdown', pauseForReading);
  card.addEventListener('wheel', pauseForReading, {passive:true});
  card.addEventListener('focusin', event => { if (Date.now() - resumedAt > 400) pauseForReading(); });
  document.addEventListener('fullscreenchange', fullscreenLabel);
  document.addEventListener('visibilitychange', () => {
    if (!dialog.open) return;
    if (document.hidden) { if (playing) pendingPlay = true; pause(); }
    else if (pendingPlay) { pendingPlay = false; play(); }
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) { cancelMotion(); if (dialog.open && !kiosk) pause(); }
    if (dialog.open) render();
  });
  window.addEventListener('workshop-view', event => {
    if (['letters','jobs','stats'].includes(event.detail)) return;   // العرض للمتابعات لا للمراسلات والأعمال والإحصائيات
    view = event.detail;
    index = 0;
    elapsed = 0;
    adoptCollection();
  });
  window.addEventListener('workshop-language', () => { if (dialog.open) render(); });
  window.addEventListener('workshop-translations', () => { if (dialog.open) render(); });
  if (!document.documentElement.requestFullscreen) $('presentation-fullscreen').hidden = true;
  fullscreenLabel();
  // ?display=1 opens the register straight into the running display for wall screens.
  if (kiosk) open({auto:true});
})();
