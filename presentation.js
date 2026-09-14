'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const I = window.WorkshopI18n;
  const dialog = $('presentation');
  const card = $('presentation-card');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const collections = new Map();
  const priorities = {high:'عالية', medium:'متوسطة', low:'منخفضة'};
  let view = location.hash === '#purchase-orders' ? 'procurement' : location.hash === '#non-purchase' ? 'non-purchase' : location.hash === '#closed' ? 'closed' : 'overview';
  let items = [], scope = '', index = 0, playing = false, elapsed = 0, lastTick = 0, frame = 0, animation;
  let connection = 'جارٍ الاتصال بالسجل', connected = false, seconds = 12;
  try {
    const saved = Number(localStorage.getItem('workshop-presentation-seconds'));
    if ([8,12,20,30].includes(saved)) seconds = saved;
  } catch {}
  $('presentation-speed').value = String(seconds);

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
    text('presentation-scope', scope);
    text('presentation-connection', connection);
    $('presentation-connection').dataset.connected = String(connected);
  }
  function progress() {
    $('presentation-progress-fill').style.transform = `scaleX(${Math.min(elapsed / (seconds * 1000), 1)})`;
  }
  function controls() {
    const multiple = items.length > 1;
    $('presentation-toggle').disabled = !multiple;
    $('presentation-prev').disabled = !multiple;
    $('presentation-next').disabled = !multiple;
    $('presentation-speed').disabled = !multiple;
    text('presentation-play-label', playing ? 'إيقاف مؤقت' : 'تشغيل العرض');
    text('presentation-play-state', !items.length ? '' : !multiple ? 'متابعة واحدة في هذا العرض' : playing ? 'الانتقال التلقائي مفعّل' : 'العرض متوقف مؤقتاً');
    $('presentation-play-icon').setAttribute('d', playing ? 'M9 5v14M15 5v14' : 'm9 5 10 7-10 7Z');
    dialog.dataset.playing = String(playing);
    // Keep automatic changes quiet for screen readers; manual navigation announces its result.
    text('presentation-counter', `${items.length ? index + 1 : 0} / ${items.length}`);
    const next = items.length > 1 ? items[(index + 1) % items.length] : null;
    text('presentation-next-title', next?.title || '');
    dialog.querySelector('.presentation-next').hidden = !next;
  }
  function render({animate = false, resetScroll = false} = {}) {
    labels();
    card.hidden = items.length === 0;
    $('presentation-empty').hidden = items.length !== 0;
    const item = items[index];
    if (item) {
      card.dataset.itemId = item.id;
      text('presentation-item-title', item.title);
      text('presentation-reference', item.reference || (item.procurement?.prNumber ? `PR ${item.procurement.prNumber}` : ''));
      text('presentation-priority', priorities[item.priority] || '');
      $('presentation-priority').dataset.priority = item.priority;
      const stage = view === 'procurement' ? window.WorkshopProcurement.stageLabels[item.procurement?.stage] : window.WorkshopSheets?.stages[item.stage];
      text('presentation-status-badge', stage || item.stage);
      text('presentation-status', item.status || 'غير مسجل');
      text('presentation-action', item.action || 'غير مسجل');
      text('presentation-owner', item.owner || 'غير مسجل');
      const information = item.informationDate ? new Date(`${item.informationDate}T12:00:00Z`) : null;
      text('presentation-information', information && Number.isFinite(information.getTime()) ? new Intl.DateTimeFormat(I.locale, {day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Dubai'}).format(information) : 'غير مسجل');
      $('presentation-information').dateTime = item.informationDate || '';
      text('presentation-updated', window.WorkshopRecordTime(item.updatedAt));
      $('presentation-updated').dateTime = item.updatedAt || '';
      if (resetScroll) card.scrollTop = 0;
      if (animate && document.documentElement.dataset.motion === 'on' && !reducedMotion.matches) {
        animation?.cancel();
        animation = card.animate([
          {opacity:0, transform:`translateX(${I.language === 'ar' ? -18 : 18}px) translateY(10px)`},
          {opacity:1, transform:'translateX(0) translateY(0)'}
        ], {duration:620, easing:'cubic-bezier(.2,.7,.2,1)'});
      }
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
  function pause() {
    playing = false;
    stopFrame();
    controls();
  }
  function advance(delta, manual = false) {
    if (!items.length) return;
    if (manual) pause();
    index = (index + delta + items.length) % items.length;
    elapsed = 0;
    render({animate:true, resetScroll:true});
    if (manual) text('presentation-announcement', `${index + 1} / ${items.length} — ${items[index].title}`);
  }
  function tick(now) {
    frame = 0;
    if (!dialog.open || !playing || document.hidden || items.length < 2) return;
    if (lastTick) elapsed += now - lastTick;
    lastTick = now;
    if (elapsed >= seconds * 1000) advance(1);
    progress();
    frame = requestAnimationFrame(tick);
  }
  function play() {
    if (!dialog.open || document.hidden || items.length < 2) return;
    playing = true;
    stopFrame();
    controls();
    frame = requestAnimationFrame(tick);
  }
  function adoptCollection() {
    const previous = items[index];
    const next = collections.get(view) || {items:[], label:''};
    items = next.items;
    scope = next.label;
    const found = previous ? items.findIndex(item => item.id === previous.id) : -1;
    index = found >= 0 ? found : Math.min(index, Math.max(items.length - 1, 0));
    if (found < 0) elapsed = 0;
    if (items.length < 2) pause();
    if (dialog.open) {
      const changed = JSON.stringify(previous) !== JSON.stringify(items[index]);
      if (changed) render({resetScroll:found < 0});
      else { labels(); controls(); }
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
    }
  };
  $('presentation-open').addEventListener('click', () => {
    adoptCollection();
    index = 0;
    elapsed = 0;
    dialog.showModal();
    document.body.classList.add('presentation-open');
    render({animate:true, resetScroll:true});
    if (!reducedMotion.matches) play();
  });
  $('presentation-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    pause();
    animation?.cancel();
    text('presentation-announcement', '');
    document.body.classList.remove('presentation-open');
    $('presentation-open').focus({preventScroll:true});
  });
  $('presentation-toggle').addEventListener('click', () => playing ? pause() : play());
  $('presentation-prev').addEventListener('click', () => advance(-1, true));
  $('presentation-next').addEventListener('click', () => advance(1, true));
  $('presentation-language').addEventListener('click', () => {
    pause();
    I.setLanguage(I.language === 'ar' ? 'en' : 'ar');
  });
  $('presentation-speed').addEventListener('change', event => {
    seconds = Number(event.target.value);
    elapsed = 0;
    try { localStorage.setItem('workshop-presentation-seconds', seconds); } catch {}
    progress();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Tab') pause();
    if (event.target.matches('input,select,textarea')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const nextKey = I.language === 'ar' ? 'ArrowLeft' : 'ArrowRight';
      advance(event.key === nextKey ? 1 : -1, true);
    }
  });
  // Interaction with long text pauses the timer so readers can finish the record.
  card.addEventListener('pointerdown', pause);
  card.addEventListener('wheel', pause, {passive:true});
  card.addEventListener('focusin', pause);
  document.addEventListener('visibilitychange', () => { if (dialog.open && document.hidden) pause(); });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) { animation?.cancel(); if (dialog.open) pause(); }
  });
  window.addEventListener('workshop-view', event => {
    view = event.detail;
    index = 0;
    elapsed = 0;
    adoptCollection();
  });
  window.addEventListener('workshop-language', () => { if (dialog.open) render(); });
})();
