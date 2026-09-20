'use strict';
/**
 * محرّك العرض التلقائي — مشترك بين شاشتَي «مدار» (المضخات) و«إمداد» (الموارد).
 *
 * قاعدته الواحدة: مجموعة ثابتة من النقاط، نقطة لكل شيء حقيقي، لا تختفي ولا
 * تُستحدث بين المشاهد إنما تُعيد ترتيب نفسها. وتُصان هذه القاعدة هنا لا في
 * كل شاشة على حدة: ما لا يضعه المشهد في مجموعة يُعرض في شريط سفلي معنون
 * بعدده. فلا تسقط نقطة بصمت مهما تغيّرت البيانات أو أُضيف مشهد.
 *
 * وما يخص كل شاشة — ألوانها ومشاهدها ورسومها الخاصة — يُمرَّر إليها،
 * فالمحرّك لا يعرف مضخة من صنف.
 */
(() => {
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;

  // ── تخطيطات مشتركة ────────────────────────────────────────────────────────
  function gridPositions(list, box, gap){
    const n = list.length || 1;
    const cols = Math.max(1, Math.round(Math.sqrt(n * box.w / Math.max(box.h,1))));
    const rows = Math.ceil(n / cols);
    const step = Math.min(box.w / cols, box.h / rows, gap);
    const x0 = box.x + (box.w - cols*step)/2 + step/2;
    const y0 = box.y + (box.h - rows*step)/2 + step/2;
    return list.map((_, i) => ({x: x0 + (i%cols)*step, y: y0 + Math.floor(i/cols)*step,
      r: Math.max(2.5, step*0.30)}));
  }

  function clusterLayout(groups, area){
    // عدد الأعمدة يتبع نسبة المساحة لا عدد المجموعات، وإلا خرجت العناقيد عن
    // الشاشة رأسياً على الجدار العريض وأفقياً على الهاتف.
    const wide = area.w / Math.max(area.h, 1) > 1.4;
    const cols = groups.length <= 6 && wide ? groups.length : Math.max(1, Math.min(groups.length,
      Math.round(Math.sqrt(groups.length * area.w / Math.max(area.h, 1)))));
    const rows = Math.ceil(groups.length/cols);
    const cw = area.w/cols, ch = area.h/rows;
    const spots = [], labels = [];
    groups.forEach((group, i) => {
      const cx = area.x + (i%cols)*cw, cy = area.y + Math.floor(i/cols)*ch;
      const box = {x: cx + cw*0.08, y: cy + ch*0.10, w: cw*0.84, h: ch*0.62};
      const places = gridPositions(group.units, box, Math.min(cw,ch)*0.09);
      group.units.forEach((unit, j) => spots.push({unit, ...places[j]}));
      labels.push({text: group.label, count: group.units.length, x: cx + cw/2, y: cy + ch*0.84});
    });
    return {spots, labels};
  }

  // الخطوة واحدة لكل الأعمدة — ولو اختلفت لصارت المقارنة بالنظر كاذبة.
  function columnLayout(groups, area){
    const n = groups.length, cw = area.w/n;
    const tallest = Math.max(...groups.map(g => g.units.length), 1);
    let perRow = 1, step = 0;
    for (let p = 1; p <= 14; p++){
      const fit = Math.min(cw*0.78/p, area.h*0.74/Math.ceil(tallest/p));
      if (fit > step) { step = fit; perRow = p; }
    }
    const base = area.y + area.h*0.80, spots = [], labels = [];
    groups.forEach((group, i) => {
      const cx = area.x + i*cw + cw/2;
      group.units.forEach((unit, j) => {
        const row = Math.floor(j/perRow), col = j%perRow;
        const wide = Math.min(perRow, group.units.length - row*perRow);
        spots.push({unit, x: cx - (wide-1)*step/2 + col*step, y: base - row*step,
          r: Math.max(2.5, step*0.32)});
      });
      labels.push({text: group.label, count: group.units.length, x: cx, y: area.y + area.h*0.90});
    });
    return {spots, labels};
  }

  function create(spec){
    const $ = id => document.getElementById(id);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const SCENE_MS = spec.sceneMs || 9000;
    const aurora = [
      {hue:'62,124,96',  x:.24, y:.30, r:.60, sx:.000031, sy:.000019},
      {hue:'96,150,112', x:.74, y:.66, r:.54, sx:-.000023, sy:.000027},
      {hue:'160,132,74', x:.52, y:.88, r:.44, sx:.000017, sy:-.000021}
    ];
    let dots = [], scenes = [], index = 0, playing = false;
    let raf = 0, sceneAt = 0, wakeLock = null, canvas, ctx, w = 0, h = 0, dpr = 1;
    let sweep = -1, countFrom = 0, countTarget = 0, countStart = 0;

    const area = () => ({x: w*0.05, y: h*0.16, w: w*0.90, h: h*0.68});

    function revealWords(node, text){
      if (reduced.matches) { node.textContent = text; return; }
      node.textContent = '';
      String(text).split(' ').forEach((word, i) => {
        const span = document.createElement('span');
        span.className = 'rdx-word'; span.textContent = word;
        span.style.animationDelay = (i * 70) + 'ms';
        node.append(span, document.createTextNode(' '));
      });
    }

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
      const {spots, labels} = scene.layout({area: area(), w, h});
      const target = new Map(spots.map(s => [s.unit.__id, s]));
      // شبكة الأمان: ما لا يضعه المشهد يُعرض في شريط سفلي معنون، لا يختفي.
      const left = dots.filter(dot => !target.has(dot.unit.__id)).map(dot => dot.unit);
      if (left.length){
        const band = {x: w*0.08, y: h*0.885, w: w*0.84, h: h*0.06};
        const spare = gridPositions(left, band, h*0.020);
        left.forEach((unit, i) => target.set(unit.__id, {unit, ...spare[i], r: Math.min(spare[i].r, 3.2)}));
        // المشهد قد يزيح عنوان الشريط عن موضعه إن كان رسمه يشغل وسط الشاشة،
        // والشريط نفسه لا يتزحزح: هو ضمانة ألا تختفي وحدة.
        const at = scene.outsideAt || {x: 0.5, y: 0.805};
        labels.push({text: scene.outside || 'خارج هذا العرض', count: left.length,
                     x: w*at.x, y: h*at.y});
      }
      const now = performance.now();
      dots.forEach((dot, i) => {
        const to = target.get(dot.unit.__id);
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
      revealWords($('rdx-title'), scene.title);
      $('rdx-lede').textContent = scene.lede;
      $('rdx-caption').textContent = scene.metric.caption;
      $('rdx-step').textContent = `${index+1} / ${scenes.length}`;
      $('rdx-dots').innerHTML = scenes.map((_, i) => `<span class="${i===index?'is-on':''}"></span>`).join('');
      countFrom = Number($('rdx-metric').dataset.value || 0);
      countTarget = scene.metric.value; countStart = performance.now();
      if (reduced.matches){ $('rdx-metric').textContent = countTarget; $('rdx-metric').dataset.value = countTarget; }
    }

    function frame(now){
      raf = requestAnimationFrame(frame);
      ctx.clearRect(0, 0, w, h);
      for (const a of aurora){
        const drift = reduced.matches ? 0 : now;
        const x = (a.x + Math.sin(drift*a.sx)*0.10) * w, y = (a.y + Math.cos(drift*a.sy)*0.08) * h;
        const g = ctx.createRadialGradient(x, y, 0, x, y, a.r * Math.max(w, h));
        g.addColorStop(0, `rgba(${a.hue},0.22)`); g.addColorStop(1, `rgba(${a.hue},0)`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }

      const scene = scenes[index];
      const geom = {w, h, ctx, now, reduced: reduced.matches, since: now - sceneAt};
      scene?.drawBehind?.(geom);

      for (const dot of dots){
        const t = dot.dur ? Math.min(1, Math.max(0, (now - dot.start) / dot.dur)) : 1;
        const e = easeInOut(t);
        dot.x = dot.fromX + (dot.toX - dot.fromX)*e;
        dot.y = dot.fromY + (dot.toY - dot.fromY)*e;
        dot.r = dot.fromR + (dot.toR - dot.fromR)*e;
        if (dot.r <= 0.2) continue;
        ctx.beginPath(); ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI*2);
        ctx.fillStyle = dot.color;
        ctx.globalAlpha = dot.faint ? .45 : .92; ctx.fill();
      }
      ctx.globalAlpha = 1;

      const settled = Math.min(1, (now - sceneAt) / 1100);
      if (settled > 0.35){
        ctx.globalAlpha = reduced.matches ? 1 : easeOut((settled-0.35)/0.65);
        ctx.textAlign = 'center';
        for (const label of scene?.rendered || []){
          ctx.font = `500 ${Math.max(13, h*0.021)}px "IBM Plex Sans Arabic", Tahoma, sans-serif`;
          ctx.fillStyle = '#cfe0d6'; ctx.fillText(label.text, label.x, label.y);
          ctx.font = `700 ${Math.max(17, h*0.030)}px Arial, sans-serif`;
          ctx.fillStyle = '#e8c88a'; ctx.fillText(String(label.count), label.x, label.y + h*0.038);
        }
        ctx.globalAlpha = 1;
      }
      scene?.drawFront?.(geom);

      if (sweep >= 0 && sweep <= 1){
        const x = -w*0.3 + sweep*w*1.6;
        const band = ctx.createLinearGradient(x - w*0.22, 0, x + w*0.22, 0);
        band.addColorStop(0, 'rgba(232,200,138,0)');
        band.addColorStop(.5, `rgba(232,200,138,${0.10*(1-Math.abs(sweep-.5)*2)})`);
        band.addColorStop(1, 'rgba(232,200,138,0)');
        ctx.fillStyle = band; ctx.fillRect(0, 0, w, h); sweep += 0.02;
      }

      if (!reduced.matches){
        const ct = Math.min(1, (now - countStart)/900);
        const shown = Math.round(countFrom + (countTarget - countFrom)*easeOut(ct));
        const node = $('rdx-metric');
        if (node.dataset.value !== String(shown)){ node.textContent = shown; node.dataset.value = shown; }
      }
      if (playing && now - sceneAt > SCENE_MS) applyScene(index + 1);
    }

    function controls(){
      $('rdx-play').setAttribute('aria-pressed', String(playing));
      $('rdx-play').querySelector('span').textContent = playing ? 'إيقاف' : 'تشغيل';
      $('rdx-bar').style.animationPlayState = playing && !reduced.matches ? 'running' : 'paused';
    }
    function play(){ if (reduced.matches){ playing = false; controls(); return; } playing = true; sceneAt = performance.now(); controls(); }
    function pause(){ playing = false; controls(); }
    async function lock(){
      if (wakeLock || !navigator.wakeLock?.request) return;
      try { wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch {}
    }
    function unlock(){ wakeLock?.release?.().catch(() => {}); wakeLock = null; }

    function open(){
      const data = spec.data();
      const population = data ? spec.population(data) : [];
      if (!population.length) return;
      $('rdx').hidden = false;
      document.body.classList.add('rdx-open');
      canvas = $('rdx-canvas'); ctx = canvas.getContext('2d');
      dots = population.map((unit, i) => {
        unit.__id = spec.idOf ? spec.idOf(unit) : (unit.id ?? i);
        const tone = spec.toneOf(unit);
        return {unit, tone, color: spec.tones[tone], faint: tone === spec.faintTone,
          x:0, y:0, r:0, fromX:0, fromY:0, fromR:0, toX:0, toY:0, toR:0, start:0, dur:0};
      });
      scenes = spec.scenes(data, {area, gridPositions, clusterLayout, columnLayout});
      $('rdx-honesty').textContent = spec.honesty(data);
      $('rdx-honesty').hidden = false;
      $('rdx-legend').innerHTML = Object.entries(spec.legend)
        .map(([k, name]) => `<span><i style="background:${spec.tones[k]}"></i>${name}</span>`).join('');
      resize();
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
      $(spec.openButton)?.focus();
    }
    async function fullscreen(){
      try { if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen({navigationUI:'hide'}); } catch {}
    }

    $(spec.openButton)?.addEventListener('click', open);
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
      if (key === 'Escape'){ close(); event.preventDefault(); }
      else if (key === ' '){ playing ? pause() : play(); event.preventDefault(); }
      else if (key === 'ArrowLeft'){ pause(); applyScene(index + 1); event.preventDefault(); }
      else if (key === 'ArrowRight'){ pause(); applyScene(index - 1); event.preventDefault(); }
      else if (key === 'f' || key === 'F'){ fullscreen(); event.preventDefault(); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

    if (new URLSearchParams(location.search).get('display') === '1'){
      const wait = setInterval(() => { if (!spec.data()) return; clearInterval(wait); open(); }, 300);
      setTimeout(() => clearInterval(wait), 30000);
    }
    return {open, close};
  }

  window.WorkshopDisplay = {create, gridPositions, clusterLayout, columnLayout, easeOut, easeInOut};
})();
