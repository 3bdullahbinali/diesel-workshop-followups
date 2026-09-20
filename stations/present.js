'use strict';
/**
 * محرّك العرض التلقائي + برنامج المتابعات.
 *
 * برنامجان منفصلان لا واحد بتبويبين: جمهور «المتابعات» فريقٌ يريد أن يعرف ما
 * تأخر اليوم، وجمهور «صحة المحطات» إدارةٌ تريد أن ترى حجم ما لم يُوثَّق. خلطهما
 * في عرض واحد يجعل كلاً منهما ينتظر ما لا يعنيه.
 *
 * المشهد يعرض معلومة واحدة. شاشة الجدار تُقرأ من بعيد، فالازدحام يعني ألا
 * يُقرأ شيء. ومدة المشهد تتبع طوله: سطران لا يأخذان وقت ثمانية.
 *
 * كل رقم هنا مشتق من نفس المصدر الذي تعرضه الشاشات العادية — لا نسخة ثانية
 * للعرض: نسخة العرض تتقادم بصمت، وهذا أسوأ من غياب العرض.
 */
(function (root) {

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ar = (n) => Number(n).toLocaleString('ar-AE');
  const reduced = () => root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const programs = new Map();
  /** يسجّل برنامجاً: اسمه، ولونه، ودالة تبني مشاهده من البيانات الحالية. */
  function register(id, program) { programs.set(id, program); }

  /* ————————————————————————————————— الحالة ————————————————————————————————— */
  let dialog = null, stage = null, current = null, scenes = [], index = 0;
  let playing = true, seconds = 'auto', raf = 0, startedAt = 0, holdMs = 0;
  let wakeLock = null, resumeTimer = 0;

  const SPEEDS = [['auto', 'تلقائي'], [8, '٨ ثوانٍ'], [12, '١٢ ثانية'], [20, '٢٠ ثانية'], [30, '٣٠ ثانية']];
  // توقّف القراءة يستأنف وحده: شاشة معلّقة على الجدار لا أحد يضغط زرها.
  const RESUME_AFTER = 45000;

  try {
    const saved = localStorage.getItem('stations-present-speed');
    if (saved === 'auto' || SPEEDS.some(([v]) => String(v) === saved)) {
      seconds = saved === 'auto' ? 'auto' : Number(saved);
    }
  } catch (ignore) { /* التخزين قد يكون ممنوعاً؛ الافتراضي يكفي */ }

  /* ————————————————————————————————— البناء ————————————————————————————————— */
  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'pv';
    dialog.innerHTML = `
      <div class="pv-aurora"></div><div class="pv-aurora slow"></div><div class="pv-grid"></div>
      <div class="pv-stage">
        <div class="pv-top">
          <span><b id="pv-title">—</b> <span class="pv-scope" id="pv-scope">—</span></span>
          <span id="pv-source">—</span>
        </div>
        <div class="pv-body" id="pv-body"></div>
        <div class="pv-foot">
          <span class="pv-dots" id="pv-dots"></span>
          <span id="pv-caption">—</span>
          <span class="pv-controls">
            <button type="button" id="pv-prev" aria-label="المشهد السابق">◀</button>
            <button type="button" id="pv-play">إيقاف</button>
            <button type="button" id="pv-next" aria-label="المشهد التالي">▶</button>
            <select id="pv-speed" aria-label="مدة المشهد">${
              SPEEDS.map(([v, label]) => `<option value="${v}">${label}</option>`).join('')}</select>
            <button type="button" id="pv-full" aria-label="ملء الشاشة">⛶</button>
            <button type="button" id="pv-close">إغلاق</button>
          </span>
        </div>
      </div>
      <div class="pv-progress"><span id="pv-progress"></span></div>`;
    document.body.append(dialog);
    stage = dialog.querySelector('#pv-body');

    const el = (id) => dialog.querySelector('#' + id);
    el('pv-prev').onclick = () => { pause(true); go(index - 1); };
    el('pv-next').onclick = () => { pause(true); go(index + 1); };
    el('pv-play').onclick = () => (playing ? pause(false) : play());
    el('pv-close').onclick = close;
    el('pv-speed').value = String(seconds);
    el('pv-speed').onchange = (e) => {
      seconds = e.target.value === 'auto' ? 'auto' : Number(e.target.value);
      try { localStorage.setItem('stations-present-speed', String(seconds)); } catch (ignore) {}
      go(index);
    };
    el('pv-full').onclick = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else dialog.requestFullscreen?.().catch(() => {});
    };

    dialog.addEventListener('keydown', (event) => {
      const keys = { ArrowLeft: 1, ArrowRight: -1 };          // الصفحة عربية: اليسار يتقدّم
      if (event.key in keys) { event.preventDefault(); pause(true); go(index + keys[event.key]); }
      else if (event.key === ' ') { event.preventDefault(); playing ? pause(false) : play(); }
      else if (event.key === 'Home') { event.preventDefault(); pause(true); go(0); }
    });
    dialog.addEventListener('close', stop);
    return dialog;
  }

  /* ————————————————————————————————— التشغيل ————————————————————————————————— */
  function open(id) {
    const program = programs.get(id);
    if (!program) return;
    ensureDialog();
    current = program;
    scenes = program.scenes();
    if (!scenes.length) {
      scenes = [{ hold: 12000, html: `<div class="pv-scene">
        <div><span class="pv-line pv-head">لا بيانات لعرضها بعد</span>
        <span class="pv-line pv-sub" style="--i:1">تعذّرت القراءة، أو السجل فارغ.</span></div></div>` }];
    }
    dialog.querySelector('#pv-title').textContent = program.title;
    dialog.querySelector('#pv-scope').textContent = program.scope;
    dialog.style.setProperty('--pv-bg', program.bg || '#07172b');
    index = 0; playing = true;
    dialog.querySelector('#pv-play').textContent = 'إيقاف';
    if (!dialog.open) dialog.showModal();
    lockScreen();
    renderDots();
    go(0);
  }

  function close() {
    stop();
    if (dialog?.open) dialog.close();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  function stop() {
    cancelAnimationFrame(raf); raf = 0;
    clearTimeout(resumeTimer); resumeTimer = 0;
    current?.stop?.();
    releaseScreen();
  }

  function pause(temporary) {
    playing = false;
    cancelAnimationFrame(raf); raf = 0;
    dialog.querySelector('#pv-play').textContent = 'تشغيل';
    clearTimeout(resumeTimer);
    // التوقّف بضغطة زر مؤقت؛ التوقّف بزر «إيقاف» مقصود ويبقى.
    if (temporary) resumeTimer = setTimeout(play, RESUME_AFTER);
  }

  function play() {
    playing = true;
    clearTimeout(resumeTimer); resumeTimer = 0;
    dialog.querySelector('#pv-play').textContent = 'إيقاف';
    startedAt = performance.now();
    tick();
  }

  function renderDots() {
    dialog.querySelector('#pv-dots').innerHTML =
      scenes.map((_, i) => `<span class="pv-dot${i === index ? ' on' : ''}"></span>`).join('');
  }

  function go(next) {
    if (!scenes.length) return;
    index = (next + scenes.length) % scenes.length;
    const scene = scenes[index];
    current?.stop?.();
    // إعادة الإدراج تعيد تشغيل الحركات: أبسط من إدارة حالتها يدوياً.
    stage.innerHTML = scene.html;
    scene.mount?.(stage);
    holdMs = duration(scene);
    startedAt = performance.now();
    dialog.querySelector('#pv-caption').textContent = scene.caption || current.title;
    dialog.querySelector('#pv-source').textContent = sourceLabel();
    renderDots();
    if (playing) tick(); else setProgress(0);
  }

  /** المدة التلقائية تتبع كثافة المشهد: كلمات أكثر ⇦ وقت أطول، بحدّين. */
  function duration(scene) {
    if (seconds !== 'auto') return seconds * 1000;
    if (scene.hold) return scene.hold;
    const words = (stage.textContent || '').trim().split(/\s+/).length;
    return Math.min(26000, Math.max(7000, 3200 + words * 260));
  }

  function setProgress(fraction) {
    dialog.querySelector('#pv-progress').style.width = (fraction * 100).toFixed(2) + '%';
  }

  function tick() {
    cancelAnimationFrame(raf);
    const step = (now) => {
      const passed = now - startedAt;
      setProgress(Math.min(1, passed / holdMs));
      if (passed >= holdMs) return go(index + 1);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function sourceLabel() {
    const map = { api: 'الشيت — واجهة موثقة', 'api-public': 'الشيت — قراءة عامة',
      offline: 'الاتصال منقطع', local: 'نسخة مضمّنة' };
    return map[document.body.dataset.source || 'local'] || '';
  }

  /** يمنع إطفاء الشاشة ما دام العرض مفتوحاً؛ يسقط بصمت حيث لا يُدعم. */
  async function lockScreen() {
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (ignore) {}
  }
  function releaseScreen() {
    try { wakeLock?.release(); } catch (ignore) {}
    wakeLock = null;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && dialog?.open && playing) lockScreen();
  });

  /* ————————————————————————— قطع مشتركة بين البرامج ————————————————————————— */
  const line = (text, cls, i) => `<span class="pv-line ${cls || ''}" style="--i:${i || 0}">${text}</span>`;

  const figure = (value, unit, tone, extra) => `<div>
    ${line(`<span class="pv-shine"><span class="pv-figure ${tone || ''}">${ar(value)}</span></span>`, '', 0)}
    ${line(`<span class="pv-unit">${esc(unit)}</span>`, '', 1)}
    ${extra ? line(`<span class="pv-sub">${extra}</span>`, '', 2) : ''}
  </div>`;

  const titleScene = (eyebrow, head, sub) => `<div class="pv-scene"><div>
    ${line(esc(eyebrow), 'pv-eyebrow', 0)}
    ${line(esc(head), 'pv-head', 1)}
    ${sub ? line(esc(sub), 'pv-sub', 2) : ''}
  </div></div>`;

  const rows = (list) => `<div class="pv-rows">${list.map((r, i) => `
    <div class="pv-row ${r.tone || ''}" style="--i:${i}">
      <span class="pv-row-rank">${ar(i + 1)}</span>
      <span class="pv-row-main"><b>${esc(r.title)}</b><span>${esc(r.note || '')}</span></span>
      <span class="pv-row-age">${r.value}${r.unit ? `<small>${esc(r.unit)}</small>` : ''}</span>
    </div>`).join('')}</div>`;

  const bars = (list) => {
    const max = Math.max(1, ...list.map(b => b.value));
    return `<div class="pv-bars">${list.map((b, i) => `
      <div class="pv-bar ${b.tone || ''}" style="--i:${i}">
        <div class="pv-bar-top"><span>${esc(b.label)}</span><b>${ar(b.value)}</b></div>
        <div class="pv-bar-track"><span class="pv-bar-fill" style="--w:${(b.value / max * 100).toFixed(1)}%"></span></div>
      </div>`).join('')}</div>`;
  };

  const cloud = (list) => {
    const max = Math.max(1, ...list.map(w => w.value));
    return `<div class="pv-cloud">${list.map((w, i) => `
      <span class="pv-word ${w.dim ? 'dim' : ''}" style="--i:${i};--w:${(w.value / max).toFixed(2)}">
        ${esc(w.label)}<small>${ar(w.value)}</small></span>`).join('')}</div>`;
  };

  /* ═══════════════════════════ برنامج المتابعات ═══════════════════════════ */
  register('followups', {
    title: 'متابعات فريق صيانة المحطات الخارجية',
    scope: 'ما يحتاج تحركاً',
    bg: '#0a1f18',
    scenes() {
      const M = root.StationsModel;
      const data = root.StationsStore.data;
      const asOf = M.today();
      const d = M.dashboard(data, asOf);
      const open = data.followups.filter(f => !f.closed);
      const places = new Map([...data.stations, ...data.locations].map(p => [p.id, p.name]));
      const stalled = open
        .map(f => ({ f, age: M.ageDays(f, asOf) }))
        .filter(x => x.age != null && x.age > 21)
        .sort((a, b) => b.age - a.age);
      const states = M.labels(data, 'states');
      const parties = M.labels(data, 'parties');
      const out = [];

      out.push({ caption: 'الافتتاحية', hold: 7000, html: titleScene(
        'إدارة الصرف الصحي · بلدية مدينة الشارقة',
        'متابعات فريق صيانة المحطات الخارجية',
        `${ar(data.followups.length)} متابعة · آخر جدول يومي ${data.meta.latestDailyDate}`) });

      if (stalled.length) {
        out.push({ caption: 'المتوقفة', html: `<div class="pv-scene">${figure(
          stalled.length, 'متابعة مضى على آخر إفادة فيها أكثر من ثلاثة أسابيع', 'high',
          'العدد لا يقول إنها متعثّرة، بل إن السجل لا يعرف عنها جديداً.')}</div>` });

        // الأقدم واحدةً واحدة: الاسم يُقرأ، والقائمة لا تُقرأ من بعيد.
        for (const { f, age } of stalled.slice(0, 6)) {
          out.push({ caption: 'الأقدم بلا إفادة', hold: 9000, html: `<div class="pv-scene"><div>
            ${line(esc(places.get(f.stationId) || f.stationId || 'موقع غير محدد'), 'pv-eyebrow', 0)}
            ${line(esc(f.title), 'pv-head', 1)}
            ${line(`<span class="pv-figure high" style="font-size:clamp(3rem,9vw,7rem)">${ar(age)}</span>
                    <span class="pv-unit">يوماً بلا إفادة</span>`, '', 2)}
            ${line(esc(f.nextAction || f.stateDetail || ''), 'pv-sub', 3)}
          </div></div>` });
        }
      }

      out.push({ caption: 'من عليه الإجراء', html: `<div class="pv-scene"><div>
        ${line('من عليه الإجراء', 'pv-eyebrow', 0)}
        ${bars([
          { label: 'علينا نحن', value: d.ours, tone: 'high' },
          { label: 'على جهات أخرى', value: d.awaitingOthers, tone: 'warn' }
        ])}
        ${line('الأغلب علينا: التأخير داخلي لا خارجي، وهذا في أيدينا.', 'pv-sub', 3)}
      </div></div>` });

      const byParty = Object.entries(d.byWaitingOn || {})
        .map(([id, n]) => ({ label: parties[id] || id, value: n }))
        .filter(x => x.value).sort((a, b) => b.value - a.value);
      if (byParty.length) {
        out.push({ caption: 'الجهات', html: `<div class="pv-scene"><div>
          ${line('بانتظار من؟', 'pv-eyebrow', 0)}${cloud(byParty)}</div></div>` });
      }

      const byState = Object.entries(d.byState || {})
        .map(([id, n]) => ({ label: states[id] || id, value: n }))
        .filter(x => x.value).sort((a, b) => b.value - a.value);
      if (byState.length) {
        out.push({ caption: 'الحالات', html: `<div class="pv-scene"><div>
          ${line('الحالات المسجّلة', 'pv-eyebrow', 0)}${cloud(byState)}</div></div>` });
      }

      out.push({ caption: 'عمر الإفادة', html: `<div class="pv-scene">${figure(
        d.medianAge, 'يوماً — وسيط عمر آخر إفادة', d.medianAge > 21 ? 'high' : d.medianAge > 7 ? 'warn' : '',
        `الأقدم ${ar(d.oldest?.age ?? 0)} يوماً · محسوب حتى ${asOf}`)}</div>` });

      const top = open.map(f => ({ f, age: M.ageDays(f, asOf) }))
        .sort((a, b) => (b.age ?? -1) - (a.age ?? -1)).slice(0, 7);
      if (top.length) {
        out.push({ caption: 'الطابور', hold: 16000, html: `<div class="pv-scene">${rows(top.map(({ f, age }) => ({
          title: f.title,
          note: (places.get(f.stationId) || '—') + ' · ' + (states[f.state] || ''),
          value: age == null ? '—' : ar(age), unit: age == null ? '' : 'يوم',
          tone: age == null ? '' : age > 21 ? 'high' : age > 7 ? 'warn' : 'ok'
        })))}</div>` });
      }

      out.push({ caption: 'المراجعة', html: `<div class="pv-scene">${figure(
        d.needsReview, `من ${ar(data.followups.length)} متابعة تحتاج تثبيت حالة أو استكمال دليل`, 'warn',
        'الحالة غير المثبتة لا تعني جاهزية، ولا إثباتاً لاعتماد أو صدور LPO.')}</div>` });

      return out;
    }
  });

  /* ————————————————————————————————— التصدير ————————————————————————————————— */
  root.StationsPresent = {
    register, open, close,
    get programs() { return [...programs.keys()]; },
    helpers: { line, figure, titleScene, rows, bars, cloud, esc, ar, reduced }
  };
})(globalThis);
