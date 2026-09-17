'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const I = window.WorkshopI18n, S = window.WorkshopSheets, P = window.WorkshopProcurement;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const count = new Intl.NumberFormat('en-AE', {maximumFractionDigits:0});
  const params = new URLSearchParams(location.search);
  const flag = name => ['1','true','yes','on'].includes((params.get(name) || '').toLowerCase());
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const dialog = $('stats-display');
  const slideSeconds = 11;
  let data = null, stats = null, slides = [], slide = 0, playing = false, elapsed = 0, lastTick = 0, frame = 0;
  let wakeLock = null, linkTimer = 0, pendingPlay = false;
  const frames = new Set();

  const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Dubai'}).format(new Date());
  const motionOn = () => document.documentElement.dataset.motion === 'on' && !reducedMotion.matches;
  const tally = (list, key) => list.reduce((map, entry) => map.set(key(entry), (map.get(key(entry)) || 0) + 1), new Map());

  // كل رقم في هذه الشاشة محسوب من السجل نفسه، لا من إدخال يدوي منفصل.
  function build(feed) {
    const isClosed=item=>window.WorkshopFollowups.isClosed(item,feed);
    const items = feed.items || [];
    const open = items.filter(item => !isClosed(item));
    const now = today();
    const purchase = items.filter(P.isPurchaseRelated);
    const gearItems = items.filter(item => item.equipment);
    const jobs = Array.isArray(feed.jobs) ? feed.jobs : null;
    const letters = Array.isArray(feed.letters) ? feed.letters : null;
    const byStage = tally(open, item => item.stage);
    const amounts = purchase.map(item => item.procurement.amountAed).filter(value => typeof value === 'number');
    return {
      items: {
        total: items.length,
        open: open.length,
        closed: items.length - open.length,
        high: open.filter(item => item.priority === 'high').length,
        due: open.filter(item => item.dueDate && item.dueDate <= now).length,
        blocked: open.filter(item => item.blocker).length
      },
      actions: Object.entries(S.actions).map(([id, label]) => ({id, label, value: open.filter(item => (item.actionAt || 'unassigned') === id).length})),
      areas: Object.entries(window.WorkshopFollowups.homeLabels).map(([id,label])=>({id,label,value:open.filter(item=>window.WorkshopFollowups.home(item,feed)===id).length})).filter(row=>row.value),
      stages: [...byStage.entries()].map(([id, value]) => ({id, label: S.stages[id] || id, value})).sort((a, b) => b.value - a.value).slice(0, 7),
      purchase: {
        total: purchase.length,
        open: purchase.filter(item => !isClosed(item)).length,
        quotes: purchase.filter(item => item.procurement.stage === 'quotes').length,
        delivery: purchase.filter(item => ['delivery','partial_delivery'].includes(item.procurement.stage)).length,
        amount: amounts.reduce((sum, value) => sum + value, 0),
        amountCount: amounts.length
      },
      jobs: jobs && {
        total: jobs.length,
        running: jobs.filter(job => !['done','cancelled'].includes(job.state)).length,
        done: jobs.filter(job => job.state === 'done').length,
        kinds: Object.entries(S.jobKinds).map(([id, label]) => ({id, label, value: jobs.filter(job => job.kind === id).length})),
        parties: Object.entries(S.parties).map(([id, label]) => ({id, label, value: jobs.filter(job => job.party === id).length}))
      },
      letters: letters && {
        total: letters.length,
        open: letters.filter(letter => letter.closure === 'open').length,
        pending: letters.filter(letter => letter.closure === 'pending').length,
        closed: letters.filter(letter => letter.closure === 'closed').length,
        out: letters.filter(letter => letter.direction === 'out').length,
        in: letters.filter(letter => letter.direction === 'in').length,
        awaitingReply: letters.filter(letter => letter.reply === 'awaiting').length
      },
      gear: gearItems.length ? {
        total: gearItems.length,
        inWorkshop: gearItems.filter(item => item.equipment.handover === 'in_workshop').length,
        ready: gearItems.filter(item => item.equipment.handover === 'ready').length,
        delivered: gearItems.filter(item => item.equipment.handover === 'delivered').length
      } : null,
      // «عالية» تحتاج ما يسندها في السجل: موعد أو عائق أو معدة في الورشة.
      review: open.filter(item => item.priority === 'high' && !item.dueDate && !item.blocker
        && !(item.equipment && ['in_workshop','ready'].includes(item.equipment.handover)))
        .map(item => ({id:item.id, title:item.title})),
      updatedAt: feed.updatedAt || null
    };
  }
  // الأرقام خارج نص مترجَم حتى لا تمنع الجملة من الترجمة إلى الإنجليزية.
  const amountHint = s => s.purchase.amountCount
    ? `<p class="stat-hint"><span>القيمة المسجلة للطلبات</span>: <bdi translate="no">${count.format(s.purchase.amount)}</bdi> <span>درهم</span> · <bdi translate="no">${count.format(s.purchase.amountCount)}</bdi> <span>طلباً بقيمة مسجلة</span></p>`
    : '';
  const card = (label, value, note) =>
    `<div class="stat-card"><span class="stat-label">${escape(label)}</span><strong class="stat-value" data-count="${value}" translate="no">0</strong>${note ? `<span class="stat-note">${escape(note)}</span>` : ''}</div>`;
  function bars(title, rows, note) {
    const top = Math.max(1, ...rows.map(row => row.value));
    return `<section class="stat-bars"><h4>${escape(title)}</h4>${rows.map(row =>
      `<div class="stat-row"><span class="stat-row-label">${escape(row.label)}</span><span class="stat-track"><span class="stat-fill" data-width="${Math.round(row.value / top * 100)}%" data-tone="${escape(row.id || '')}"></span></span><span class="stat-row-value" data-count="${row.value}" translate="no">0</span></div>`).join('')}
      ${note || ''}</section>`;
  }
  // الأرقام تعدّ تصاعدياً والأشرطة تنمو، وتظهر فوراً إن كانت الحركة موقوفة.
  function animate(root) {
    for (const id of frames) cancelAnimationFrame(id);
    frames.clear();
    const on = motionOn();
    for (const node of root.querySelectorAll('[data-count]')) {
      const target = Number(node.dataset.count) || 0;
      if (!on || target === 0) { node.textContent = count.format(target); continue; }
      const duration = Math.min(1300, 520 + target * 18);
      const start = performance.now();
      node.textContent = '0';
      const step = now => {
        const progress = Math.min(1, (now - start) / duration);
        node.textContent = count.format(Math.round(target * (1 - Math.pow(1 - progress, 3))));
        if (progress < 1) frames.add(requestAnimationFrame(step));
      };
      frames.add(requestAnimationFrame(step));
    }
    for (const fill of root.querySelectorAll('.stat-fill')) {
      if (!on) { fill.style.width = fill.dataset.width; continue; }
      fill.style.width = '0%';
      frames.add(requestAnimationFrame(() => frames.add(requestAnimationFrame(() => { fill.style.width = fill.dataset.width; }))));
    }
  }
  // ليست في العرض التلقائي: هذه مراجعة داخلية لجودة الإدخال لا رقم يُعرض على الجدار.
  function review(s) {
    if (!s.review.length) return '';
    const rows = s.review.map(item =>
      `<li><button type="button" class="link-button" data-review="${escape(item.id)}">${escape(item.title)}</button></li>`).join('');
    return `<section class="stat-bars stat-review"><h4>أولويات تحتاج مراجعة <span class="stat-review-count" data-count="${s.review.length}" translate="no">0</span></h4>
      <p class="stat-hint">بنود أولويتها عالية بلا موعد مرتبط ولا عائق مسجّل ولا معدة في الورشة. أضف لها الموعد أو العائق، أو أنزل أولويتها حتى تبقى «عالية» علامة يُعتمد عليها.</p>
      <ul class="stat-review-list">${rows}</ul></section>`;
  }
  function panel() {
    const s = stats;
    const cards = [
      card('إجمالي المتابعات', s.items.total, 'كامل السجل'),
      card('متابعات مفتوحة', s.items.open, 'لم تُغلق بعد'),
      card('متابعات مغلقة', s.items.closed, 'مؤكدة الإنجاز'),
      card('أولوية عالية', s.items.high, 'ضمن المفتوحة'),
      card('حان موعدها', s.items.due, 'الموعد المرتبط اليوم أو قبله'),
      card('متعطلة بعائق', s.items.blocked, 'مسجل لها عائق')
    ];
    if (s.jobs) cards.push(card('أعمال قائمة', s.jobs.running, 'لم تكتمل بعد'));
    if (s.letters) cards.push(card('كتب مفتوحة', s.letters.open + s.letters.pending, 'مفتوحة أو بانتظار الإغلاق'));
    if (s.gear) cards.push(card('معدات في الورشة', s.gear.inWorkshop + s.gear.ready, 'مستلمة ولم تُسلّم بعد'));
    const groups = [
      bars('الإجراء عند من؟', s.actions, '<p class="stat-hint">المتابعات المفتوحة فقط.</p>'),
      s.areas.length ? bars('المجالات', s.areas) : '',
      s.stages.length ? bars('أكثر الحالات تكراراً', s.stages) : '',
      bars('طلبات الشراء', [
        {id:'open', label:'طلبات قائمة', value:s.purchase.open},
        {id:'quotes', label:'بانتظار العروض', value:s.purchase.quotes},
        {id:'delivery', label:'بانتظار التوريد أو استلام جزئي', value:s.purchase.delivery},
        {id:'closed', label:'طلبات مغلقة', value:s.purchase.total - s.purchase.open}
      ], amountHint(s)),
      s.jobs ? bars('الأعمال حسب النوع', s.jobs.kinds) : '',
      s.jobs ? bars('الأعمال حسب الطرف', s.jobs.parties) : '',
      s.letters ? bars('المراسلات', [
        {id:'out', label:'صادر', value:s.letters.out},
        {id:'in', label:'وارد', value:s.letters.in},
        {id:'open', label:'مفتوحة', value:s.letters.open},
        {id:'pending', label:'بانتظار الإغلاق', value:s.letters.pending},
        {id:'closed', label:'مغلقة', value:s.letters.closed}
      ]) : '',
      s.gear ? bars('المعدات المستلمة', [
        {id:'in_workshop', label:'في الورشة', value:s.gear.inWorkshop},
        {id:'ready', label:'جاهزة للتسليم', value:s.gear.ready},
        {id:'delivered', label:'تم تسليمها', value:s.gear.delivered}
      ]) : ''
    ].filter(Boolean).join('');
    $('stats-cards').innerHTML = cards.join('');
    $('stats-groups').innerHTML = groups + review(s);
    animate($('stats-panel'));
  }
  /* ————— العرض التلقائي للإحصائيات ————— */
  function buildSlides() {
    const s = stats, list = [];
    list.push({title:'سجل متابعات شعبة ورشة الديزل', note:'ملخص محسوب من السجل مباشرة', body:
      `<div class="stat-hero">${card('إجمالي المتابعات', s.items.total, 'كامل السجل')}${card('مفتوحة', s.items.open, 'قيد العمل الآن')}${card('مغلقة', s.items.closed, 'مؤكدة الإنجاز')}${card('أولوية عالية', s.items.high, 'ضمن المفتوحة')}</div>`});
    list.push({title:'أين تقف المتابعات المفتوحة؟', note:'الإجراء عند من، وما الذي حان موعده', body:
      bars('الإجراء عند من؟', s.actions) + `<div class="stat-hero stat-hero-small">${card('حان موعدها', s.items.due, 'الموعد اليوم أو قبله')}${card('متعطلة بعائق', s.items.blocked, 'مسجل لها عائق')}</div>`});
    if (s.areas.length) list.push({title:'المجالات', note:'توزيع المتابعات المفتوحة على مجالات العمل', body:bars('المجالات', s.areas)});
    if (s.stages.length) list.push({title:'الحالات الأكثر تكراراً', note:'أين تتجمع المتابعات المفتوحة', body:bars('الحالات', s.stages)});
    list.push({title:'طلبات الشراء', note:'من الإعداد حتى الاستلام', body:
      `<div class="stat-hero stat-hero-small">${card('طلبات قائمة', s.purchase.open, 'لم تُغلق بعد')}${card('بانتظار العروض', s.purchase.quotes)}${card('بانتظار التوريد', s.purchase.delivery)}${card('طلبات مغلقة', s.purchase.total - s.purchase.open)}</div>` +
      amountHint(s)});
    if (s.jobs) list.push({title:'الأعمال المطلوب إنجازها والأعمال القائمة', note:'ما نقدّمه لجهات أخرى وما يُقدّم لنا', body:
      `<div class="stat-hero stat-hero-small">${card('أعمال قائمة', s.jobs.running)}${card('اكتملت', s.jobs.done)}${card('إجمالي الأعمال', s.jobs.total)}</div>` + bars('حسب الطرف', s.jobs.parties)});
    if (s.letters) list.push({title:'المراسلات', note:'الصادر والوارد وحالة الإغلاق', body:
      `<div class="stat-hero stat-hero-small">${card('صادر', s.letters.out)}${card('وارد', s.letters.in)}${card('بانتظار رد جهة', s.letters.awaitingReply)}${card('مغلقة', s.letters.closed)}</div>`});
    if (s.gear) list.push({title:'المعدات المستلمة للصيانة', note:'ما هو داخل الورشة الآن', body:
      `<div class="stat-hero stat-hero-small">${card('في الورشة', s.gear.inWorkshop)}${card('جاهزة للتسليم', s.gear.ready)}${card('تم تسليمها', s.gear.delivered)}</div>`});
    return list;
  }
  function renderSlide({animated = true} = {}) {
    const current = slides[slide];
    if (!current) return;
    $('stats-slide-title').textContent = current.title;
    $('stats-slide-note').textContent = current.note || '';
    $('stats-stage').innerHTML = current.body;
    $('stats-dots').innerHTML = slides.map((_, i) =>
      `<span class="stats-dot${i === slide ? ' active' : ''}" aria-hidden="true"></span>`).join('');
    $('stats-position').textContent = `${slide + 1} / ${slides.length}`;
    if (animated && motionOn()) $('stats-stage').animate(
      [{opacity:0, transform:'translateY(14px)'}, {opacity:1, transform:'translateY(0)'}],
      {duration:520, easing:'cubic-bezier(.22,1,.36,1)'});
    animate($('stats-stage'));
    controls();
  }
  function controls() {
    dialog.dataset.playing = String(playing);
    $('stats-toggle-label').textContent = playing ? 'إيقاف مؤقت' : 'تشغيل العرض';
    $('stats-state').textContent = slides.length < 2 ? '' : playing ? 'الانتقال التلقائي مفعّل'
      : reducedMotion.matches ? 'الحركة مخفّضة حسب إعدادات جهازك؛ التنقل يدوي'
      : resumeTimer ? 'يستأنف العرض تلقائياً بعد الانتهاء من القراءة' : 'العرض متوقف مؤقتاً';
    $('stats-updated').textContent = stats?.updatedAt ? window.WorkshopRecordTime(stats.updatedAt) : '';
    progress();
  }
  function progress() {
    const ratio = playing ? Math.min(1, elapsed / (slideSeconds * 1000)) : 0;
    $('stats-progress').style.transform = `scaleX(${ratio})`;
  }
  function tick(now) {
    frame = 0;
    if (!dialog.open || !playing || document.hidden) return;
    if (lastTick) elapsed += now - lastTick;
    lastTick = now;
    if (elapsed >= slideSeconds * 1000) { advance(1); }
    progress();
    frame = requestAnimationFrame(tick);
  }
  function play() {
    clearResume();
    // الفحص هنا لا في open وحدها: وضع الشاشة يبدأ الدوران من adopt بعد وصول البيانات.
    if (reducedMotion.matches) { playing = false; controls(); return; }
    if (!dialog.open || document.hidden || slides.length < 2) { controls(); return; }
    playing = true;
    lastTick = 0;
    elapsed = 0;
    requestWakeLock();
    controls();
    if (!frame) frame = requestAnimationFrame(tick);
  }
  // توقف لم يطلبه القارئ صراحةً: يرفع نفسه بعد مهلة حتى لا تجمد شاشة الجدار.
  const resumeDelay = 45000;
  let resumeTimer = 0;
  function clearResume() {
    clearTimeout(resumeTimer);
    resumeTimer = 0;
  }
  function pauseForReading() {
    if (!dialog.open || !playing) return;
    pause();
    if (!reducedMotion.matches && slides.length > 1) {
      resumeTimer = setTimeout(() => { resumeTimer = 0; play(); }, resumeDelay);
      controls();
    }
  }
  function pause() {
    clearResume();
    playing = false;
    lastTick = 0;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    releaseWakeLock();
    controls();
  }
  function advance(delta) {
    if (!slides.length) return;
    slide = (slide + delta + slides.length) % slides.length;
    elapsed = 0;
    lastTick = 0;
    renderSlide();
  }
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
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({navigationUI:'hide'});
    } catch {}
  }
  function open({auto = false} = {}) {
    if (!stats) { pendingPlay = true; if (!dialog.open) dialog.showModal(); document.body.classList.add('presentation-open'); return; }
    slides = buildSlides();
    slide = 0;
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('presentation-open');
    renderSlide();
    // «تقليل الحركة» يمنع الدوران التلقائي حتى في وضع الشاشة؛ يبقى زر التشغيل ظاهراً.
    if (auto || slides.length > 1) play();
  }
  function adopt(feed) {
    data = feed;
    stats = build(feed);
    panel();
    if (dialog.open) {
      const keep = slide;
      slides = buildSlides();
      slide = Math.min(keep, slides.length - 1);
      renderSlide({animated:false});
      if (pendingPlay) { pendingPlay = false; play(); }
    }
  }
  window.WorkshopStatistics = {get stats() { return stats; }, open, build};
  window.addEventListener('workshop-data', event => adopt(event.detail));
  window.addEventListener('workshop-language', () => { if (stats) { panel(); if (dialog.open) renderSlide({animated:false}); } });
  window.addEventListener('workshop-translations', () => { if (dialog.open) renderSlide({animated:false}); });
  $('stats-groups').addEventListener('click', event => {
    const button = event.target.closest('button[data-review]');
    if (button) window.WorkshopApp?.reveal(button.dataset.review);
  });
  $('stats-open').addEventListener('click', () => open());
  $('stats-close').addEventListener('click', () => dialog.close());
  $('stats-toggle').addEventListener('click', () => playing ? pause() : play());
  $('stats-prev').addEventListener('click', () => { pause(); advance(-1); });
  $('stats-next').addEventListener('click', () => { pause(); advance(1); });
  $('stats-fullscreen').addEventListener('click', toggleFullscreen);
  const stage = $('stats-stage');
  stage.addEventListener('pointerdown', pauseForReading);
  stage.addEventListener('wheel', pauseForReading, {passive:true});
  stage.addEventListener('focusin', pauseForReading);
  stage.addEventListener('mouseenter', pauseForReading);
  $('stats-link').addEventListener('click', async () => {
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('stats', '1');
    let copied = true;
    try { await navigator.clipboard.writeText(url.toString()); } catch { copied = false; }
    $('stats-link-label').textContent = copied ? 'تم نسخ رابط شاشة الإحصائيات' : 'رابط شاشة الإحصائيات';
    clearTimeout(linkTimer);
    linkTimer = setTimeout(() => { $('stats-link-label').textContent = 'نسخ رابط شاشة الإحصائيات'; }, 4000);
  });
  dialog.addEventListener('close', () => {
    pause();
    pendingPlay = false;
    document.body.classList.remove('presentation-open');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    $('stats-open').focus({preventScroll:true});
  });
  // المسافة و f لا تُختطفان من زر تحت التركيز، كما في عرض المتابعات.
  dialog.addEventListener('keydown', event => {
    const onButton = Boolean(event.target.closest('button,select,input,textarea'));
    if (event.key === ' ' || event.key === 'Spacebar') {
      if (onButton) return;
      event.preventDefault();
      playing ? pause() : play();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const forward = (event.key === 'ArrowRight') === (document.documentElement.dir !== 'rtl');
      event.preventDefault();
      pause();
      advance(forward ? 1 : -1);
    } else if (event.key === 'f' || event.key === 'F') {
      if (onButton) return;
      event.preventDefault();
      toggleFullscreen();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!dialog.open) return;
    if (document.hidden) { if (playing) { pendingPlay = true; pause(); } }
    else if (pendingPlay) { pendingPlay = false; play(); }
  });
  // ?stats=1 يفتح شاشة الإحصائيات مباشرة لشاشات الجدار.
  if (flag('stats')) open({auto:true});
})();
