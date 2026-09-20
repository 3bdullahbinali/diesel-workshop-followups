'use strict';
/**
 * برنامج عرض صحة المحطات — كرة تدور، ثم تقريب، ثم انتقال بين المواقع.
 *
 * الإسقاط واحد ومعامله يتحرك: t=0 كرة بإسقاط عمودي، t=1 سطح مستوٍ. التقريب
 * ليس قطعاً بين مشهدين بل تحريك لهذا المعامل، فالانتقال متصل لا مقطوع.
 *
 * ————— قاعدة الإحداثيات —————
 * مصدر واحد لا غير: عمودا Latitude و Longitude في تبويب Stations بملف الأصول.
 * وهو محمي بما يحمي بقية السجل — يمرّ على الواجهة ويخضع لإعداد publicRead —
 * بخلاف أي ملف في الموقع، فالملف العام يُقرأ بكتابة مساره في المتصفح.
 *
 * حُذف مصدران كانا هنا: إحداثيات منقولة من تطبيق خارجي، وأخرى مولَّدة للعرض.
 * الأولى كشفت مواقع بنية تحتية في ملف عام، والثانية بلا قيمة بعد رحيل الأولى.
 *
 * فما دامت أعمدة الشيت فارغة، المواضع **تخطيطية بالمعنى لا بالجغرافيا**: الحلقة
 * تحددها حالة الدليل (المتوقفة في المركز)، والزاوية ترتيبها. رسم بياني صادق لا
 * خريطة كاذبة، ولافتة ثابتة تقول ذلك طوال العرض.
 *
 * وحين تُملأ الأعمدة تصير المواضع جغرافية وتختفي اللافتة — بلا تعديل سطر.
 */
(function (root) {

  const P = () => root.StationsPresent;
  const TAU = Math.PI * 2, RAD = Math.PI / 180;

  const TONE = { high: '#f2705f', warn: '#e8b45c', ok: '#39c2a8', calm: '#7fb2e0', none: '#6f8ba3' };
  // الحلقة بالمعنى: ما يحتاج نظراً أقرب إلى المركز.
  const RING = { stalled: 0.18, watch: 0.38, active: 0.58, closed: 0.74, none: 0.9 };

  let canvas = null, ctx = null, loop = 0;
  let nodes = [], geographic = false, fitZoom = 1, fromSheet = 0;

  /* ————————————————————————————— طبقة صور الأقمار —————————————————————————————
     مصدر مفتوح بلا مفتاح، وإسناده مرسوم على الخريطة كما يشترط مزوّده.
     البلاطات تُطلب من خادم خارجي، فهذه أول اعتمادية شبكية في الموقع: من يفتح
     العرض يُعلِم المزوّد بالمنطقة التي ينظر إليها، والعرض دون اتصال يسقط إلى
     الشبكة وحدها. لذلك الطبقة تُطفأ بزر، وسقوطها لا يوقف شيئاً. */
  const TILES = {
    url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    credit: 'صور: Esri · Maxar · Earthstar Geographics'
  };
  let satellite = true, tileFails = 0, tilesDown = false, tilesNote = null, sourceNote = null;
  const tileCache = new Map();
  try { satellite = localStorage.getItem('stations-present-satellite') !== 'off'; } catch (ignore) {}

  /** إسقاط مركاتور: صور الأقمار كلها مرسومة عليه، فالخريطة تتبعه لتنطبق. */
  const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * RAD / 2));
  const nx = (lon) => (lon + 180) / 360;
  const ny = (lat) => (1 - mercY(lat) / Math.PI) / 2;
  /** عرض العالم بالبكسل على الشاشة عند التقريب الحالي. */
  const worldPx = (R0) => 2.7 * cam.zoom * R0;
  // الكاميرا: lon/lat مركزها، والتقريب، وt معامل التسطيح.
  const cam = { lon: 0, lat: 0, zoom: 1, t: 0 };
  const center = { lon: 0, lat: 0 };
  let from = null, to = null, moveStart = 0, moveMs = 0, focus = null, spin = true;

  const ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const lerp = (a, b, k) => a + (b - a) * k;
  /** فرق خطوط الطول يؤخذ أقصر اتجاه، وإلا دارت الكاميرا حول الكرة بلا داعٍ. */
  const dLon = (a, b) => ((b - a + 540) % 360) - 180;

  /* ————————————————————————————— بناء المواضع ————————————————————————————— */
  function build() {
    const data = root.StationsStore.data;
    const built = root.StationsHealthModel.build(data);
    const cards = new Map((data.assetStations || []).map(a => [a.id, a]));

    /** المصدر الوحيد: الشيت. ما ليس فيه لا موضع له، ولا يُختلق له موضع. */
    const coordOf = (id) => {
      const c = cards.get(id);
      return c && Number.isFinite(c.lat) && Number.isFinite(c.lon)
        ? { lat: c.lat, lon: c.lon } : null;
    };

    const real = built.rows.map(r => coordOf(r.id)).filter(Boolean);
    geographic = real.length >= 2;
    fromSheet = real.length;

    const byRing = new Map();
    nodes = built.rows.map((r, i) => {
      const c = cards.get(r.id);
      let lon, lat, placed = true;
      const point = geographic ? coordOf(r.id) : null;
      if (point) {
        lon = point.lon; lat = point.lat;
      } else if (geographic) {
        // حالة مختلطة: بعض المحطات في الشيت لها إحداثي وبعضها لا. وضع الثانية
        // في ترتيب تخطيطي يبعثرها عبر الكرة بينما تتجمع الأولى في مكانها، فتُقرأ
        // كأنها محطات بعيدة. لا تُرسم أصلاً، ويُعلَن عددها.
        placed = false; lon = 0; lat = 0;
      } else {
        // لا إحداثي في الشيت لأحد: ترتيب بالمعنى — الحلقة من حالة الدليل.
        const ring = RING[r.evidence.state.id] ?? 0.9;
        const n = (byRing.get(ring) || 0); byRing.set(ring, n + 1);
        const angle = (n * 137.508) * RAD;
        lon = Math.cos(angle) * ring * 150;
        lat = Math.sin(angle) * ring * 62;
      }
      return {
        id: r.id, name: r.name, lon, lat, placed, row: r,
        tone: r.evidence.state.tone,
        pumps: r.assets.pumps.length, lines: r.assets.lines.length,
        card: c || null, i
      };
    });

    // تقريب يملأ الشاشة بالمواقع: نطاق درجة ونطاق مئة درجة لا يُعرضان بمقياس واحد.
    const shown = nodes.filter(n => n.placed);
    const lons = shown.map(n => n.lon), lats = shown.map(n => n.lat);
    const lonMin = Math.min(...lons), lonMax = Math.max(...lons);
    const latMin = Math.min(...lats), latMax = Math.max(...lats);
    // النطاق بوحدة العالم المطبَّع لا بالدرجات، لأن مركاتور يمطّ خطوط العرض.
    const spanX = Math.max(1e-4, nx(lonMax) - nx(lonMin));
    const spanY = Math.max(1e-4, Math.abs(ny(latMin) - ny(latMax)));
    const R0 = 1, fill = 1.2;                       // النسبة إلى نصف قطر الرسم
    fitZoom = Math.min(fill / (2.7 * spanX), fill / (2.7 * spanY)) * R0;
    center.lon = (lonMax + lonMin) / 2;
    // مركز رأسي بوحدة مركاتور: متوسط الدرجات ينزلق عن الوسط البصري.
    const midNy = (ny(latMin) + ny(latMax)) / 2;
    center.lat = (2 * Math.atan(Math.exp((1 - 2 * midNy) * Math.PI)) - Math.PI / 2) / RAD;
    return built;
  }

  /* ————————————————————————————————— الإسقاط ————————————————————————————————— */
  /**
   * الكرة والسطح لهما مقياسان: لو ضُرب التقريب في الطرفين انفجرت الكرة قبل أن
   * تتسطّح، فتطير النقاط خارج الشاشة في منتصف الانتقال. التقريب للسطح وحده.
   */
  function project(lon, lat, w, h) {
    const R0 = Math.min(w, h) * 0.42;
    const λ = (lon - cam.lon) * RAD, φ = lat * RAD, φ0 = cam.lat * RAD;
    const cosC = Math.sin(φ0) * Math.sin(φ) + Math.cos(φ0) * Math.cos(φ) * Math.cos(λ);
    const gx = Math.cos(φ) * Math.sin(λ);
    const gy = Math.cos(φ0) * Math.sin(φ) - Math.sin(φ0) * Math.cos(φ) * Math.cos(λ);
    // الحد المستوي بمركاتور ووحدةُ قياسه عرض العالم، فتنطبق البلاطات على النقاط.
    const W = worldPx(R0);
    let dx = nx(lon) - nx(cam.lon);
    if (dx > 0.5) dx -= 1; else if (dx < -0.5) dx += 1;   // التفاف خط التاريخ
    const fx = dx * W;
    const fy = (ny(lat) - ny(cam.lat)) * W;
    const t = cam.t;
    return {
      x: w / 2 + gx * (1 - t) * R0 + fx * t,
      y: h / 2 - gy * (1 - t) * R0 + fy * t,
      visible: cosC > -0.02 || t > 0.55,
      depth: lerp(Math.max(0, cosC), 1, t),
      R: R0
    };
  }

  /* ————————————————————————————— رسم البلاطات ————————————————————————————— */
  function tileImage(z, x, y, allowLoad) {
    const key = z + '/' + x + '/' + y;
    const hit = tileCache.get(key);
    if (hit) return hit.ok ? hit.img : null;
    // أثناء الطيران يمرّ التقريب على مستويات كثيرة تُهجَر فوراً؛ تحميلها يعني
    // عشرات الطلبات لبلاطات لا تُرى إطاراً واحداً. يُرسم المخزون ويُؤجَّل الطلب.
    if (!allowLoad) return null;
    const img = new Image();
    // بلا crossOrigin تتلوّث اللوحة فيتعذّر قياسها أو تصويرها.
    img.crossOrigin = 'anonymous';
    const entry = { img, ok: false };
    tileCache.set(key, entry);
    img.onload = () => { entry.ok = true; };
    img.onerror = () => {
      entry.ok = false;
      // ثلاث إخفاقات تكفي للحكم بأن المصدر غير متاح؛ لا يُعاد الطلب بلا نهاية.
      if (++tileFails >= 3) tilesDown = true;
    };
    img.src = TILES.url(z, x, y);
    return null;
  }

  function drawTiles(w, h) {
    // صور أقمار حقيقية تحت مواضع تخطيطية أسوأ من غيابها: النقطة تقع على أرض
    // لا علاقة لها بها. الطبقة لا تعمل إلا حين تكون المواضع جغرافية فعلاً.
    if (!geographic || !satellite || tilesDown || cam.t < 0.55) return 0;
    const R0 = Math.min(w, h) * 0.42;
    const W = worldPx(R0);
    const z = Math.max(0, Math.min(19, Math.round(Math.log2(W / 256))));
    const n = 2 ** z, size = W / n;
    const cx = nx(cam.lon), cy = ny(cam.lat);
    const x0 = Math.floor((cx - (w / 2) / W) * n), x1 = Math.floor((cx + (w / 2) / W) * n);
    const y0 = Math.floor((cy - (h / 2) / W) * n), y1 = Math.floor((cy + (h / 2) / W) * n);
    // الطبقة تظهر مع التسطّح لا فجأة: الكرة تبقى خطوطاً حتى تستوي.
    ctx.globalAlpha = Math.min(1, (cam.t - 0.55) / 0.35);
    const settled = !to;                    // لا طلبات ما دامت الكاميرا تتحرك
    let drawn = 0;
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        if (ty < 0 || ty >= n) continue;
        const img = tileImage(z, ((tx % n) + n) % n, ty, settled);
        if (!img) continue;
        const px = w / 2 + (tx / n - cx) * W, py = h / 2 + (ty / n - cy) * W;
        // نصف بكسل زيادة يمنع الخيوط البيضاء بين البلاطات عند التقريب الكسري.
        ctx.drawImage(img, px, py, size + 0.5, size + 0.5);
        drawn++;
      }
    }
    ctx.globalAlpha = 1;
    return drawn;
  }

  /** الإسناد شرط الاستعمال، فيُرسم ما دامت صورة واحدة ظاهرة. */
  function credit(w, h, shown) {
    if (!shown) return;
    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.font = '11px "IBM Plex Sans Arabic", Tahoma, sans-serif';
    const text = TILES.credit;
    const width = ctx.measureText(text).width + 14;
    ctx.fillStyle = 'rgba(4,16,30,.62)';
    ctx.fillRect(w - width - 6, h - 40, width, 18);
    ctx.fillStyle = 'rgba(232,242,250,.86)';
    ctx.fillText(text, w - 13, h - 27);
    ctx.restore();
  }

  /* ————————————————————————————————— الرسم ————————————————————————————————— */
  function frame(now) {
    if (!ctx) return;
    const w = canvas.width / devicePixelRatio, h = canvas.height / devicePixelRatio;
    ctx.clearRect(0, 0, w, h);

    if (spin && !to) cam.lon = (cam.lon + 0.055) % 360;
    if (to) {
      const k = moveMs ? Math.min(1, (now - moveStart) / moveMs) : 1;
      const e = ease(k);
      cam.lon = from.lon + dLon(from.lon, to.lon) * e;
      cam.lat = lerp(from.lat, to.lat, e);
      cam.zoom = lerp(from.zoom, to.zoom, e);
      cam.t = lerp(from.t, to.t, e);
      if (k >= 1) { from = null; to = null; }
    }

    const shown = drawTiles(w, h);
    if (tilesNote) tilesNote.hidden = !(satellite && tilesDown && cam.t > 0.55);
    paintSourceNote();
    graticule(w, h, Math.min(w, h) * 0.42, shown);
    links(w, h);
    dots(w, h, now);
    credit(w, h, shown);

    loop = requestAnimationFrame(frame);
  }

  /**
   * الشبكة تتبع المقياس: على الكرة كل ثلاثين درجة، وعلى خريطة إقليمية كل عُشر
   * درجة بأرقامها. شبكة ثابتة عند تقريب عالٍ تعني خطاً واحداً أو لا خط.
   */
  /** يعكس مركاتور: من الإحداثي المطبَّع إلى خط العرض. */
  const latOf = (nyValue) => (2 * Math.atan(Math.exp((1 - 2 * nyValue) * Math.PI)) - Math.PI / 2) / RAD;

  function gridStep(span) {
    // المطلوب خمسة خطوط إلى اثني عشر: أكبر خطوة تعطي أربعة خطوط فأكثر.
    // الشرط المعكوس (span/step ≤ 12) يصدق على أكبر خطوة دائماً فيعيد ٣٠ أبداً.
    for (const step of [30, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02]) {
      if (span / step >= 4) return step;
    }
    return 0.01;
  }

  function graticule(w, h, R, overImagery) {
    // فوق الصور تكفي إشارة خفيفة: شبكة ثقيلة تحجب ما جئنا لنراه.
    const fade = (1 - cam.t * 0.5) * (overImagery ? 0.45 : 1);
    const R0 = Math.min(w, h) * 0.42;
    const W = worldPx(R0);
    // الحدود من الإسقاط نفسه لا من تقدير: عرض العالم هو المقياس الوحيد.
    const halfLon = (w / 2) / W * 360, halfNy = (h / 2) / W;
    const flat = cam.t > 0.5;
    const step = flat ? gridStep(halfLon * 2) : 30;
    const showLabels = cam.t > 0.75 && step < 30;
    const lon0 = flat ? cam.lon - halfLon : -180;
    const lon1 = flat ? cam.lon + halfLon : 180;
    const lat0 = flat ? latOf(Math.min(0.999, ny(cam.lat) + halfNy)) : -60;
    const lat1 = flat ? latOf(Math.max(0.001, ny(cam.lat) - halfNy)) : 60;
    const fine = flat ? step / 4 : 4;

    ctx.lineWidth = 1;
    ctx.font = '12px Arial, sans-serif';
    // الصفحة عربية، و«البداية» في لوحة الرسم تتبع اتجاهها فتُرسم الأرقام خارج
    // الحد. أرقام الدرجات لاتينية على أي حال، فاتجاهها يُثبَّت يساراً.
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';

    for (let lat = Math.ceil(lat0 / step) * step; lat <= lat1 + 1e-9; lat += step) {
      ctx.beginPath(); ctx.strokeStyle = `rgba(125,178,224,${(cam.t > 0.5 ? 0.24 : 0.16) * fade})`;
      let drawn = false;
      for (let lon = lon0; lon <= lon1 + 1e-9; lon += fine) {
        const q = project(lon, lat, w, h);
        if (!q.visible) { drawn = false; continue; }
        drawn ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
        drawn = true;
      }
      ctx.stroke();
      if (showLabels) {
        const at = project(cam.lon, lat, w, h);
        if (at.y > 16 && at.y < h - 34) {
          ctx.fillStyle = 'rgba(157,189,216,.72)';
          ctx.fillText(lat.toFixed(step < 0.1 ? 3 : 2) + '°', 10, at.y - 5);
        }
      }
    }
    for (let lon = Math.ceil(lon0 / step) * step; lon <= lon1 + 1e-9; lon += step) {
      ctx.beginPath(); ctx.strokeStyle = `rgba(125,178,224,${(cam.t > 0.5 ? 0.2 : 0.13) * fade})`;
      let drawn = false;
      for (let lat = lat0; lat <= lat1 + 1e-9; lat += fine) {
        const q = project(lon, lat, w, h);
        if (!q.visible) { drawn = false; continue; }
        drawn ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
        drawn = true;
      }
      ctx.stroke();
      if (showLabels) {
        const at = project(lon, cam.lat, w, h);
        if (at.x > 46 && at.x < w - 46) {
          ctx.fillStyle = 'rgba(157,189,216,.72)';
          ctx.fillText(lon.toFixed(step < 0.1 ? 3 : 2) + '°', at.x + 5, h - 8);
        }
      }
    }

    if (cam.t < 0.9) {
      const glow = ctx.createRadialGradient(w / 2, h / 2, R * 0.72, w / 2, h / 2, R * 1.1);
      glow.addColorStop(0, 'rgba(45,130,196,0)');
      glow.addColorStop(0.72, `rgba(45,130,196,${0.3 * (1 - cam.t)})`);
      glow.addColorStop(1, 'rgba(45,130,196,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, R * 1.1, 0, TAU); ctx.fill();
    }
  }

  /** خيط من الموقع السابق إلى الحالي: يجعل الانتقال مقروءاً لا قفزة. */
  function links(w, h) {
    if (!focus || focus.prev == null) return;
    const a = nodes[focus.prev], b = nodes[focus.index];
    if (!a || !b || !a.placed || !b.placed) return;
    ctx.beginPath(); ctx.strokeStyle = 'rgba(57,194,168,.45)'; ctx.lineWidth = 1.4;
    let drawn = false;
    for (let s = 0; s <= 1.0001; s += 0.02) {
      const p = project(a.lon + dLon(a.lon, b.lon) * s, lerp(a.lat, b.lat, s), w, h);
      if (!p.visible) { drawn = false; continue; }
      drawn ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
      drawn = true;
    }
    ctx.stroke();
  }

  function dots(w, h, now) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 520);
    for (const node of nodes) {
      if (!node.placed) continue;
      const p = project(node.lon, node.lat, w, h);
      if (!p.visible) continue;
      const isFocus = focus && focus.index === node.i;
      const color = TONE[node.tone] || TONE.none;
      const alpha = 0.3 + p.depth * 0.7;
      const size = (node.pumps || node.lines ? 4.6 : 3) * (0.7 + p.depth * 0.6) * (isFocus ? 2 : 1);

      // هالة نابضة للمتوقفة وللمحطة المركَّز عليها: النبض يعني «انظر هنا».
      if (node.tone === 'high' || isFocus) {
        ctx.beginPath();
        ctx.globalAlpha = (isFocus ? 0.28 : 0.15) * (0.55 + pulse * 0.45);
        ctx.fillStyle = color;
        ctx.arc(p.x, p.y, size * (isFocus ? 4.5 : 3.2), 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.beginPath(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
      ctx.arc(p.x, p.y, size, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;

      if (isFocus) {
        ctx.beginPath(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6;
        ctx.arc(p.x, p.y, size + 7 + pulse * 3, 0, TAU); ctx.stroke();
        ctx.direction = 'rtl';
        ctx.font = '600 15px "IBM Plex Sans Arabic", Tahoma, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        ctx.textAlign = 'center';
        ctx.fillText(node.name, p.x, p.y - size - 18);
      }
    }
  }

  function fly(target, ms) {
    from = { ...cam };
    to = { lon: target.lon ?? cam.lon, lat: target.lat ?? cam.lat,
           zoom: target.zoom ?? cam.zoom, t: target.t ?? cam.t };
    moveStart = performance.now(); moveMs = ms ?? 1500;
  }

  /** لوحة تُركَّب في المشهد فوق اللوحة الرسمية — canvas واحد يبقى حياً. */
  function mountCanvas(stage, banner) {
    tilesNote = null; sourceNote = null;   // عنصرا المشهد السابق انفصلا معه
    const wrap = document.createElement('div');
    wrap.className = 'pv-globe-wrap';
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'pv-globe';
      ctx = canvas.getContext('2d');
    }
    wrap.append(canvas);
    // حلقة المدار تخص الكرة وحدها: على خريطة مسطّحة تصير دائرة بلا معنى.
    if (!banner) {
      const orbit = document.createElement('div');
      orbit.className = 'pv-orbit';
      wrap.append(orbit);
    }
    if (banner) {
      const note = document.createElement('span');
      note.className = 'pv-schematic';
      wrap.append(note);
      sourceNote = note;
      paintSourceNote();
    }
    if (banner && satellite) {
      const down = document.createElement('span');
      down.className = 'pv-tiles-note';
      down.hidden = true;
      down.textContent = 'تعذّر تحميل صور الأقمار — الشبكة وحدها معروضة';
      wrap.append(down);
      // مهلة ثابتة تسبق أول طلب أحياناً (التحميل يبدأ بعد استقرار الكاميرا)،
      // فالحالة تُراجع في حلقة الرسم: تظهر متى فشل التحميل فعلاً لا قبله.
      tilesNote = down;
    }
    stage.querySelector('.pv-scene')?.append(wrap);
    resize();
    if (!loop) loop = requestAnimationFrame(frame);
  }

  /**
   * نص اللافتة يتبع الحالة لحظةً بلحظة: صياغته عند التركيب وحدها تُبقيه يقول
   * «الصورة حقيقية» بعد أن يفشل تحميلها، وهذا أسوأ من غياب اللافتة.
   */
  function paintSourceNote() {
    if (!sourceNote) return;
    const off = nodes.filter(n => !n.placed).length;
    sourceNote.classList.remove('demo');
    if (!geographic) {
      sourceNote.hidden = false;
      sourceNote.textContent = 'ترتيب تخطيطي بحسب حالة الدليل — لا إحداثيات في السجل';
      return;
    }
    sourceNote.hidden = !off;
    if (off) sourceNote.textContent = off + ' محطة بلا إحداثيات لا تظهر على الخريطة';
  }

  function resize() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, rect.width * dpr);
    canvas.height = Math.max(1, rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  root.addEventListener('resize', resize);

  /* ————————————————————————————————— المشاهد ————————————————————————————————— */
  /**
   * منفذ قراءة لحالة الخريطة. لا يغيّر شيئاً، ويغني الفحص عن استنتاج الحالة من
   * بكسلات اللوحة — وهو استنتاج يخطئ حين يشبه لونُ الخلفية لونَ النقطة.
   */
  root.StationsPresentMap = {
    get state() {
      return {
        geographic, satellite, tilesDown, fromSheet,
        fitZoom, center: { ...center }, cam: { ...cam },
        placed: nodes.filter(n => n.placed).length,
        unplaced: nodes.filter(n => !n.placed).length,
        total: nodes.length
      };
    },
    /** امتداد المواقع المرسومة على الشاشة بالبكسل، عند المقاس الممرَّر. */
    spread(w, h) {
      const shown = nodes.filter(n => n.placed).map(n => project(n.lon, n.lat, w, h));
      if (!shown.length) return null;
      const xs = shown.map(q => q.x), ys = shown.map(q => q.y);
      return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
  };

  /** زر طبقة الصور. منفصل عن البرنامج ليُعرض أو يُحجب بحسب وجود خريطة. */
  const EXTRA = {
    label: () => (satellite ? '🛰 صور الأقمار' : '🗺 شبكة فقط'),
    toggle() {
      satellite = !satellite;
      if (satellite) { tilesDown = false; tileFails = 0; }
      try { localStorage.setItem('stations-present-satellite', satellite ? 'on' : 'off'); }
      catch (ignore) {}
    }
  };

  P().register('health', {
    title: 'صحة وأصول المحطات الخارجية',
    scope: 'ما وُثِّق وما لم يوثَّق',
    bg: '#07172b',
    // الزر يُقرأ بعد scenes() فتكون geographic محسومة: لا يُعرض بلا خريطة.
    get extra() { return geographic ? EXTRA : null; },
    stop() { /* الحلقة تبقى: الكرة حاضرة في أكثر المشاهد، وإيقافها يومض الشاشة */ },
    scenes() {
      const h = P().helpers;
      const built = build();
      const cov = built.coverage;
      const ref = built.ref;
      const out = [];
      const scene = (inner) => `<div class="pv-scene"><div>${inner}</div></div>`;

      // ١ — الكرة والعنوان
      out.push({ caption: 'الافتتاحية', hold: 9000,
        html: `<div class="pv-scene"></div>`,
        mount(stage) {
          spin = true; focus = null; cam.zoom = 1; cam.t = 0; cam.lat = 12;
          mountCanvas(stage, false);
          const cap = document.createElement('div');
          cap.style.cssText = 'position:absolute;inset-inline-start:6%;top:50%;transform:translateY(-50%);text-align:start;width:min(30vw,420px)';
          cap.innerHTML = `${h.line('إدارة الصرف الصحي · بلدية مدينة الشارقة', 'pv-eyebrow', 0)}
            ${h.line('صحة وأصول المحطات الخارجية', 'pv-head', 1).replace('pv-head', 'pv-head pv-head-side')}
            ${h.line(`${h.ar(cov.total)} محطة رفع في عهدة الشعبة`, 'pv-sub', 2)}`;
          stage.querySelector('.pv-scene').append(cap);
        } });

      // ٢ — الأسطول
      out.push({ caption: 'الأسطول', html: `<div class="pv-scene">${h.bars([
        { label: 'صرف صحي', value: cov.sewage, tone: 'calm' },
        { label: 'مياه أمطار', value: cov.storm, tone: 'ok' },
        { label: 'رئيسية', value: cov.main, tone: 'warn' }
      ])}</div>`, mount(stage) {
        const top = document.createElement('div');
        top.style.cssText = 'position:absolute;top:2%;inset-inline:0;text-align:center';
        top.innerHTML = h.line(`${h.ar(cov.total)} محطة رفع`, 'pv-head', 0);
        stage.querySelector('.pv-scene').append(top);
      } });

      // ٣ — التغطية: الرقم الذي تقوم عليه الشاشة
      out.push({ caption: 'التغطية', html: `<div class="pv-scene">${h.figure(
        cov.trackedPercent, `٪ فقط من الأسطول له سجل في الموقع`, 'warn',
        `${h.ar(cov.tracked)} محطة من ${h.ar(cov.total)} · ${h.ar(cov.untracked)} بلا سجل`)}</div>` });

      // ٤ — التقريب: الكرة تتسطّح
      out.push({ caption: 'التقريب', hold: 8000, html: `<div class="pv-scene"></div>`,
        mount(stage) {
          spin = false; focus = null;
          mountCanvas(stage, true);
          cam.t = 0; cam.zoom = 1;
          fly({ lat: center.lat, lon: center.lon, zoom: fitZoom, t: 1 }, 3400);
        } });

      // ٥ — الانتقال بين المواقع التي لها أصول
      const stops = nodes.filter(n => n.placed && (n.pumps || n.lines))
        .sort((a, b) => (b.pumps + b.lines) - (a.pumps + a.lines));
      stops.forEach((node, k) => {
        const r = node.row;
        const card = node.card;
        const L = ref.label;
        const states = r.assets.pumps.length
          ? [...new Set(r.assets.pumps.map(p => L('health', p.health).name))]
          : [...new Set(r.assets.lines.map(l => L('flowState', l.flowState).name))];
        out.push({ caption: node.name, hold: 11000, html: `<div class="pv-scene"></div>`,
          mount(stage) {
            spin = false;
            const prev = focus ? focus.index : null;
            focus = { index: node.i, prev };
            mountCanvas(stage, true);
            fly({ lon: node.lon, lat: node.lat, zoom: fitZoom * 2.4, t: 1 }, 1700);

            const panel = document.createElement('aside');
            panel.className = 'pv-panel';
            panel.innerHTML = `
              <h3>${h.esc(node.name)}</h3>
              <span class="pv-panel-id">${h.esc(node.id)}</span>
              <div class="pv-panel-states">
                <span class="pv-tag ${r.evidence.state.tone}">${h.esc(r.evidence.state.name)}</span>
                ${states.slice(0, 3).map(s => `<span class="pv-tag">${h.esc(s)}</span>`).join('')}
              </div>
              <dl class="pv-panel-grid">
                <div><dt>مضخات مسجّلة</dt><dd>${h.ar(node.pumps)}</dd></div>
                <div><dt>خطوط مسجّلة</dt><dd>${h.ar(node.lines)}</dd></div>
                <div><dt>متابعات مفتوحة</dt><dd>${h.ar(r.openCount)}</dd></div>
                <div><dt>أوامر عمل</dt><dd>${h.ar(r.orders.length)}</dd></div>
                ${card && card.reportedInstalled != null
                  ? `<div><dt>المبلَّغ مركّبة</dt><dd>${h.ar(card.reportedInstalled)}</dd></div>` : ''}
                ${card && card.reportedSpares != null
                  ? `<div><dt>بالمستودع</dt><dd>${h.ar(card.reportedSpares)}</dd></div>` : ''}
              </dl>
              ${card && card.reportedInstalled != null && card.reportedInstalled !== node.pumps
                ? `<p class="pv-panel-note">البيان يذكر ${h.ar(card.reportedInstalled)}،
                   والمسجَّل بسجلات مرقّمة ${h.ar(node.pumps)}. الفرق غير مفسَّر.</p>`
                : `<p class="pv-panel-note">${h.esc(
                    (r.assets.pumps[0] && r.assets.pumps[0].historicalNote)
                    || (r.assets.lines[0] && r.assets.lines[0].historicalNote) || '')}</p>`}`;
            stage.querySelector('.pv-scene').append(panel);
          } });
      });

      // ٦ — سُجِّل ولم يُثبت
      out.push({ caption: 'سُجِّل ولم يُثبت', html: `<div class="pv-scene">${h.figure(
        cov.unknownHealth, `من ${h.ar(cov.pumpRows)} مضخة مسجّلة حالتها غير مثبتة`, 'warn',
        'وجود السجل ليس إثبات حالة: صفٌّ كل حقوله «غير مثبت» سجلٌ موجود ومجهول.')}</div>` });

      // ٧ — المحطات الرئيسية
      out.push({ caption: 'الرئيسية الثماني', hold: 15000, html: `<div class="pv-scene">${
        h.rows(ref.mainStations.map(m => ({
          title: m.name,
          note: m.linked ? 'مرتبطة بـ ' + m.linked
            : m.proposed ? 'مطابقة مقترحة: ' + m.proposed : 'لا سجل لها في الموقع',
          value: m.linked ? '✓' : m.proposed ? '≈' : '—',
          tone: m.linked ? 'ok' : m.proposed ? 'warn' : 'high'
        })))}</div>` });

      // ٨ — الخلاصة
      out.push({ caption: 'الخلاصة', html: `<div class="pv-scene"><div>
        ${h.line('ما لا يعرفه الموقع بعد', 'pv-eyebrow', 0)}
        ${h.bars([
          { label: 'محطة بلا سجل', value: cov.untracked, tone: 'high' },
          { label: 'مضخة حالتها غير مثبتة', value: cov.unknownHealth, tone: 'warn' },
          { label: 'محطة رئيسية بلا مقابل', value: cov.mainUnknown, tone: 'warn' }
        ])}
        ${h.line('غياب السجل ليس دليل سلامة، ووجوده ليس إثبات حالة.', 'pv-sub', 4)}
      </div></div>` });

      return out;
    }
  });
})(globalThis);
