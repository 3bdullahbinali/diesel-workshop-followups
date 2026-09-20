'use strict';
/**
 * «مدار» — العرض التلقائي لجاهزية المضخات على شاشة الجدار.
 *
 * الفكرة الحاكمة: نقطة واحدة لكل معدة حقيقية، لا تختفي ولا تُستحدث،
 * إنما تُعيد ترتيب نفسها بين المشاهد. فما تراه العين متحركاً هو الأسطول نفسه
 * ينتقل من سؤال إلى سؤال، لا رسوم تُزيّن أرقاماً. ولهذا يصحّ العدّ بالنظر:
 * من عدّ النقاط في أي عنقود وجد رقمه المكتوب تحته.
 *
 * وما دام في السجل صف تجريبي واحد يبقى ذلك مكتوباً في كل مشهد، فالعرض على
 * جدار لا يُغري بقراءة أرقام لم يتحقق منها أحد.
 */
(() => {
  const M = window.WorkshopReadinessModel;
  const $ = id => document.getElementById(id);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const SCENE_MS = 9000;

  let dots = [], scenes = [], index = 0, playing = false;
  let raf = 0, sceneAt = 0, wakeLock = null, canvas, ctx, w = 0, h = 0, dpr = 1;
  let sweep = -1;

  // ── ألوان المشهد: خلفية الورشة ليلاً، والذهب للمعنى لا للزينة ─────────────
  const TONE = {
    ready:      '#7fd8a4',
    running:    '#8ad7d9',
    maintenance:'#e6b566',
    inspection: '#9fb0c4',
    retire:     '#c98f86',
    unknown:    '#6f7f78'
  };
  const toneOf = unit =>
    !unit.technical ? 'unknown' :
    unit.technical === 'ready' ? (unit.operation === 'running' ? 'running' : 'ready') :
    unit.technical === 'write_off' ? 'retire' :
    unit.technical === 'needs_inspection' ? 'inspection' : 'maintenance';

  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;

  // ── تخطيطات: كل واحد يعيد موضعاً لكل نقطة، والنقاط هي هي في كل مرة ────────
  function gridPositions(list, box, gap){
    const n = list.length || 1;
    const cols = Math.max(1, Math.round(Math.sqrt(n * box.w / Math.max(box.h,1))));
    const rows = Math.ceil(n / cols);
    const step = Math.min(box.w / cols, box.h / rows, gap);
    const x0 = box.x + (box.w - cols*step)/2 + step/2;
    const y0 = box.y + (box.h - rows*step)/2 + step/2;
    return list.map((_, i) => ({x: x0 + (i%cols)*step, y: y0 + Math.floor(i/cols)*step, r: Math.max(2.5, step*0.30)}));
  }

  // عناقيد معنونة: لكل مجموعة صندوقها وعنوانها وعددها
  function clusterLayout(groups, area){
    // عدد الأعمدة يتبع نسبة المساحة لا عدد المجموعات، وإلا خرجت العناقيد عن
    // الشاشة رأسياً على الجدار العريض وأفقياً على الهاتف.
    const wide = area.w / Math.max(area.h, 1) > 1.4;
    const cols = groups.length <= 6 && wide ? groups.length : Math.max(1, Math.min(groups.length,
      Math.round(Math.sqrt(groups.length * area.w / Math.max(area.h, 1)))));
    const rows = Math.ceil(groups.length/cols);
    const cw = area.w/cols, ch = area.h/rows;
    const out = [], labels = [];
    groups.forEach((group, i) => {
      const cx = area.x + (i%cols)*cw, cy = area.y + Math.floor(i/cols)*ch;
      const box = {x: cx + cw*0.08, y: cy + ch*0.10, w: cw*0.84, h: ch*0.62};
      const spots = gridPositions(group.units, box, Math.min(cw,ch)*0.09);
      group.units.forEach((unit, j) => out.push({unit, ...spots[j]}));
      labels.push({text: group.label, count: group.units.length, x: cx + cw/2, y: cy + ch*0.84});
    });
    return {spots: out, labels};
  }

  // أعمدة: ارتفاع العمود عدده. الخطوة واحدة لكل الأعمدة — ولو اختلفت لصارت
  // المقارنة بالنظر كاذبة. تُختار أكبر خطوة يسعها أطولُ عمود عرضاً وارتفاعاً.
  function columnLayout(groups, area){
    const n = groups.length, cw = area.w/n;
    const tallest = Math.max(...groups.map(g => g.units.length), 1);
    let perRow = 1, step = 0;
    for (let p = 1; p <= 14; p++){
      const rows = Math.ceil(tallest/p);
      const fit = Math.min(cw*0.78/p, area.h*0.74/rows);
      if (fit > step) { step = fit; perRow = p; }
    }
    const base = area.y + area.h*0.80;
    const out = [], labels = [];
    groups.forEach((group, i) => {
      const cx = area.x + i*cw + cw/2;
      group.units.forEach((unit, j) => {
        const row = Math.floor(j/perRow), col = j%perRow;
        const wide = Math.min(perRow, group.units.length - row*perRow);
        out.push({unit, x: cx - (wide-1)*step/2 + col*step,
          y: base - row*step, r: Math.max(2.5, step*0.32)});
      });
      labels.push({text: group.label, count: group.units.length, x: cx, y: area.y + area.h*0.90});
    });
    return {spots: out, labels};
  }

  const by = (list, pick) => {
    const map = new Map();
    for (const unit of list) { const k = pick(unit); if(k==null) continue; (map.get(k) || map.set(k, []).get(k)).push(unit); }
    return map;
  };

  function buildScenes(data){
    const all = data.equipment, s = data.summary;
    const area = () => ({x: w*0.05, y: h*0.16, w: w*0.90, h: h*0.68});
    const label = key => M.places[key];

    const place = key => all.filter(u => u.place === key);
    const sized = () => M.sizeGroups(all).map(g => ({
      label: g.label,
      units: all.filter(u => (u.kind==='dam' ? 'dam' : u.size==null ? 'unknown' : String(u.size)) === g.key)
    }));

    return [
      { title: 'أسطول الديزل',
        lede: 'نقطة واحدة لكل معدة — تُعاد ترتيبها بين المشاهد ولا تُستبدل',
        metric: {value: s.total, caption: [['pump','مضخة'],['dam','وحدة سد'],['generator','مولد']]
          .map(([k,n])=>{const c=all.filter(u=>u.kind===k).length;return c?c+' '+n:'';}).filter(Boolean).join(' · ')},
        layout(){ const spots = gridPositions(all, area(), h*0.055);
          return {spots: all.map((unit,i) => ({unit, ...spots[i]})), labels: []}; } },

      { title: 'أين توجد المعدات؟',
        lede: 'المكان الفعلي الآن — لا العهدة ولا الحالة الفنية',
        metric: {value: s.workshop, caption: 'داخل الورشة'},
        layout(){ return clusterLayout([
          {label: label('workshop'), units: place('workshop')},
          {label: label('operations'), units: place('operations')},
          {label: label('store'), units: place('store')},
          {label: label('kalba'), units: place('kalba')},
          ...M.sectorPlaces.map(k => ({label: label(k), units: place(k)})),
          {label: 'لم تُسجَّل جهتها', units: all.filter(u => !u.place)}
        ].filter(g => g.units.length), area()); } },

      { title: 'الحالة الفنية',
        lede: 'حكم الورشة على المعدة، مستقلاً عن مكانها وعهدتها',
        metric: {value: s.maintenance, caption: 'تحتاج صيانة أو تحت الإصلاح'},
        layout(){ return columnLayout([...Object.entries(M.technicalStates)
          .map(([key, name]) => ({label: name, units: all.filter(u => u.technical === key)})),
          {label: 'لم تُدخل', units: all.filter(u => !u.technical)}]
          .filter(g => g.units.length), area()); } },

      { title: 'جاهزة للتسليم',
        lede: 'سليمة فنياً · في الورشة · غير مسلّمة — الثلاثة معاً',
        metric: {value: s.readyToHandOver, caption: 'من ' + s.total + ' معدة'},
        layout(){ const ready = all.filter(M.filters.ready), rest = all.filter(u => !M.filters.ready(u));
          const box = {x: w*0.30, y: h*0.22, w: w*0.40, h: h*0.42};
          const inner = gridPositions(ready, box, h*0.10);
          const ring = rest.map((unit, i) => { const a = (i/rest.length)*Math.PI*2 - Math.PI/2,
            rx = Math.min(w,h)*0.43, ry = Math.min(w,h)*0.40;
            return {unit, x: w/2 + Math.cos(a)*rx, y: h*0.50 + Math.sin(a)*ry, r: 2.6}; });
          return {spots: [...ready.map((unit,i) => ({unit, ...inner[i]})), ...ring],
            labels: [{text: 'الباقي في مدار الانتظار', count: rest.length, x: w/2, y: h*0.945}]}; } },

      { title: 'المقاسات والأنواع',
        lede: 'ارتفاع العمود هو عدد وحداته',
        metric: {value: M.sizeGroups(all).length, caption: 'مجموعة في الأسطول'},
        layout(){ return columnLayout(sized(), area()); } },

      { title: 'القطاعات الخمسة',
        outside: 'خارج عهدة القطاعات',
        lede: 'ما سُلّم إلى القطاعات من الأسطول',
        metric: {value: s.sectors.reduce((n,x) => n+x.count, 0), caption: 'معدة في عهدة القطاعات'},
        layout(){ return clusterLayout(s.sectors.map(sec => ({label: sec.label,
          units: all.filter(u => u.place === sec.place)})), area()); } }
    ];
  }

  // ── الرسم ─────────────────────────────────────────────────────────────────
  function resize(){
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.round(w*dpr); canvas.height = Math.round(h*dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (scenes.length) applyScene(index, true);
  }

  function applyScene(next, instant){
    index = (next + scenes.length) % scenes.length;
    const scene = scenes[index];
    const {spots, labels} = scene.layout();
    const target = new Map(spots.map(s => [s.unit.id, s]));
    const left = dots.filter(dot => !target.has(dot.unit.id)).map(dot => dot.unit);
    if (left.length){
      const band = {x: w*0.08, y: h*0.885, w: w*0.84, h: h*0.06};
      const spare = gridPositions(left, band, h*0.020);
      left.forEach((unit, i) => target.set(unit.id, {unit, ...spare[i], r: Math.min(spare[i].r, 3.2)}));
      labels.push({text: scene.outside || 'خارج هذا العرض', count: left.length, x: w/2, y: h*0.805});
    }
    const now = performance.now();
    dots.forEach((dot, i) => {
      const to = target.get(dot.unit.id);
      dot.fromX = dot.x; dot.fromY = dot.y; dot.fromR = dot.r;
      dot.toX = to ? to.x : w/2; dot.toY = to ? to.y : h*1.2; dot.toR = to ? to.r : 0;
      dot.start = now + (instant || reduced.matches ? 0 : (i % 40) * 9);
      dot.dur = instant || reduced.matches ? 0 : 900;
    });
    scene.rendered = labels;
    sceneAt = now;
    sweep = instant || reduced.matches ? -1 : 0;
    paint(scene);
  }

  function paint(scene){
    $('rdx-title').textContent = scene.title;
    $('rdx-lede').textContent = scene.lede;
    $('rdx-caption').textContent = scene.metric.caption;
    $('rdx-step').textContent = `${index+1} / ${scenes.length}`;
    $('rdx-dots').innerHTML = scenes.map((_, i) =>
      `<span class="${i===index?'is-on':''}"></span>`).join('');
    countTo(scene.metric.value);
  }

  let countFrom = 0, countTarget = 0, countStart = 0;
  function countTo(value){
    countFrom = Number($('rdx-metric').dataset.value || 0);
    countTarget = value; countStart = performance.now();
    if (reduced.matches) { $('rdx-metric').textContent = value; $('rdx-metric').dataset.value = value; }
  }

  function frame(now){
    raf = requestAnimationFrame(frame);
    ctx.clearRect(0, 0, w, h);

    // ضوء سفلي خافت: عمق بلا زخرفة تشوّش القراءة
    const glow = ctx.createRadialGradient(w/2, h*0.62, 0, w/2, h*0.62, Math.max(w,h)*0.62);
    glow.addColorStop(0, 'rgba(46,92,74,0.30)');
    glow.addColorStop(1, 'rgba(6,18,14,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);

    for (const dot of dots){
      const t = dot.dur ? Math.min(1, Math.max(0, (now - dot.start) / dot.dur)) : 1;
      const e = easeInOut(t);
      dot.x = dot.fromX + (dot.toX - dot.fromX)*e;
      dot.y = dot.fromY + (dot.toY - dot.fromY)*e;
      dot.r = dot.fromR + (dot.toR - dot.fromR)*e;
      if (dot.r <= 0.2) continue;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI*2);
      ctx.fillStyle = dot.color;
      ctx.globalAlpha = dot.tone === 'unknown' ? .45 : .92;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // عناوين العناقيد تُرسم على اللوحة نفسها فتتبع النقاط
    const labels = scenes[index]?.rendered || [];
    const settled = Math.min(1, (now - sceneAt) / 1100);
    if (settled > 0.35){
      ctx.globalAlpha = reduced.matches ? 1 : easeOut((settled-0.35)/0.65);
      ctx.textAlign = 'center';
      for (const label of labels){
        ctx.font = `500 ${Math.max(13, h*0.021)}px "IBM Plex Sans Arabic", Tahoma, sans-serif`;
        ctx.fillStyle = '#cfe0d6';
        ctx.fillText(label.text, label.x, label.y);
        ctx.font = `700 ${Math.max(17, h*0.030)}px Arial, sans-serif`;
        ctx.fillStyle = '#e8c88a';
        ctx.fillText(String(label.count), label.x, label.y + h*0.038);
      }
      ctx.globalAlpha = 1;
    }

    // مسحة ضوء ذهبية تمرّ مرة واحدة عند تبديل المشهد
    if (sweep >= 0 && sweep <= 1){
      const x = -w*0.3 + sweep*w*1.6;
      const band = ctx.createLinearGradient(x - w*0.22, 0, x + w*0.22, 0);
      band.addColorStop(0, 'rgba(232,200,138,0)');
      band.addColorStop(.5, `rgba(232,200,138,${0.10*(1-Math.abs(sweep-.5)*2)})`);
      band.addColorStop(1, 'rgba(232,200,138,0)');
      ctx.fillStyle = band; ctx.fillRect(0, 0, w, h);
      sweep += 0.02;
    }

    // العدّاد يعدّ تصاعدياً؛ ومع تخفيض الحركة يُكتب رقمه فوراً
    if (!reduced.matches){
      const ct = Math.min(1, (now - countStart)/900);
      const shown = Math.round(countFrom + (countTarget - countFrom)*easeOut(ct));
      const node = $('rdx-metric');
      if (node.dataset.value !== String(shown)){ node.textContent = shown; node.dataset.value = shown; }
    }

    if (playing && now - sceneAt > SCENE_MS) applyScene(index + 1);
  }

  // ── التشغيل ───────────────────────────────────────────────────────────────
  function controls(){
    $('rdx-play').setAttribute('aria-pressed', String(playing));
    $('rdx-play').querySelector('span').textContent = playing ? 'إيقاف' : 'تشغيل';
    $('rdx-bar').style.animationPlayState = playing && !reduced.matches ? 'running' : 'paused';
  }
  function play(){ if (reduced.matches) { playing = false; controls(); return; } playing = true; sceneAt = performance.now(); controls(); }
  function pause(){ playing = false; controls(); }

  async function lock(){
    if (wakeLock || !navigator.wakeLock?.request) return;
    try { wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch {}
  }
  function unlock(){ wakeLock?.release?.().catch(() => {}); wakeLock = null; }

  function open(){
    const data = window.WorkshopReadiness?.data;
    if (!data || !data.equipment.length) return;
    const stage = $('rdx');
    stage.hidden = false;
    document.body.classList.add('rdx-open');
    canvas = $('rdx-canvas'); ctx = canvas.getContext('2d');
    dots = data.equipment.map(unit => { const tone = toneOf(unit);
      return {unit, tone, color: TONE[tone], x: 0, y: 0, r: 0,
        fromX: 0, fromY: 0, fromR: 0, toX: 0, toY: 0, toR: 0, start: 0, dur: 0}; });
    scenes = buildScenes(data);
    const s = data.summary;
    $('rdx-honesty').textContent = s.unverified
      ? `${s.unverified} من ${s.total} سجلاً لم يتحقق منه أحد ميدانياً — ليست جاهزية تشغيلية معتمدة.`
      : `كل السجلات بيانات فعلية متحقق منها.`;
    $('rdx-honesty').hidden = false;
    $('rdx-legend').innerHTML = Object.entries({
      ready:'جاهزة', running:'تعمل', maintenance:'صيانة وإصلاح',
      inspection:'تحتاج فحصاً', retire:'مرشحة للشطب', unknown:'بلا حالة'})
      .map(([k, name]) => `<span><i style="background:${TONE[k]}"></i>${name}</span>`).join('');
    resize();
    // البداية من المركز: الأسطول يتجمّع قبل أن يفترق
    dots.forEach(dot => { dot.x = w/2; dot.y = h/2; dot.r = 0; });
    applyScene(0);
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    play(); lock();
    $('rdx-close').focus();
  }

  function close(){
    pause(); unlock(); cancelAnimationFrame(raf); raf = 0;
    $('rdx').hidden = true;
    document.body.classList.remove('rdx-open');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    $('rd-display-open')?.focus();
  }

  async function fullscreen(){
    try { if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({navigationUI:'hide'}); } catch {}
  }

  $('rd-display-open')?.addEventListener('click', open);
  $('rdx-close').addEventListener('click', close);
  $('rdx-play').addEventListener('click', () => playing ? pause() : play());
  $('rdx-next').addEventListener('click', () => { pause(); applyScene(index + 1); });
  $('rdx-prev').addEventListener('click', () => { pause(); applyScene(index - 1); });
  $('rdx-full').addEventListener('click', fullscreen);
  if (!document.documentElement.requestFullscreen) $('rdx-full').hidden = true;
  window.addEventListener('resize', () => { if (!$('rdx').hidden) resize(); });
  reduced.addEventListener('change', () => { if (reduced.matches) pause(); controls(); });
  document.addEventListener('keydown', event => {
    if ($('rdx').hidden) return;
    const key = event.key;
    if (key === 'Escape') { close(); event.preventDefault(); }
    else if (key === ' ') { playing ? pause() : play(); event.preventDefault(); }
    else if (key === 'ArrowLeft') { pause(); applyScene(index + 1); event.preventDefault(); }
    else if (key === 'ArrowRight') { pause(); applyScene(index - 1); event.preventDefault(); }
    else if (key === 'f' || key === 'F') { fullscreen(); event.preventDefault(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  // ?display=1 يفتح العرض فور اكتمال القراءة — لشاشة الجدار بلا لمس
  if (new URLSearchParams(location.search).get('display') === '1'){
    const wait = setInterval(() => {
      if (!window.WorkshopReadiness?.data) return;
      clearInterval(wait); open();
    }, 300);
    setTimeout(() => clearInterval(wait), 30000);
  }
})();
