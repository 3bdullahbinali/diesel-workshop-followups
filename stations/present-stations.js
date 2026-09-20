'use strict';
/**
 * برنامج عرض صحة المحطات — كرة تدور، ثم تقريب، ثم انتقال بين المواقع.
 *
 * الإسقاط واحد ومعامله يتحرك: t=0 كرة بإسقاط عمودي، t=1 سطح مستوٍ. التقريب
 * ليس قطعاً بين مشهدين بل تحريك لهذا المعامل، فالانتقال متصل لا مقطوع.
 *
 * ————— قاعدة الإحداثيات —————
 * عمودا Latitude و Longitude في ملف الأصول فارغان اليوم. ولن تُخترع إحداثيات
 * لبنية تحتية حقيقية: نقطةٌ على خريطة تُقرأ كموقع، ولو كُتب تحتها أنها تقريبية.
 *
 * فما دامت فارغة، المواضع **تخطيطية بالمعنى لا بالجغرافيا**: الحلقة تحددها حالة
 * الدليل (المتوقفة في المركز)، والزاوية ترتيبها. وهذا رسم بياني صادق لا خريطة
 * كاذبة، ولافتة ثابتة تقول ذلك طوال العرض.
 *
 * وحين تُملأ الإحداثيات تصير المواضع جغرافية وتختفي اللافتة — بلا تعديل سطر.
 */
(function (root) {

  const P = () => root.StationsPresent;
  const TAU = Math.PI * 2, RAD = Math.PI / 180;

  const TONE = { high: '#f2705f', warn: '#e8b45c', ok: '#39c2a8', calm: '#7fb2e0', none: '#6f8ba3' };
  // الحلقة بالمعنى: ما يحتاج نظراً أقرب إلى المركز.
  const RING = { stalled: 0.18, watch: 0.38, active: 0.58, closed: 0.74, none: 0.9 };

  let canvas = null, ctx = null, loop = 0, started = 0;
  let nodes = [], geographic = false;
  // الكاميرا: lon/lat مركزها، والتقريب، وt معامل التسطيح.
  const cam = { lon: 0, lat: 0, zoom: 1, t: 0 };
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

    const withCoords = built.rows.filter(r => {
      const c = cards.get(r.id);
      return c && Number.isFinite(c.lat) && Number.isFinite(c.lon);
    });
    geographic = withCoords.length >= 2;

    const byRing = new Map();
    nodes = built.rows.map((r, i) => {
      const c = cards.get(r.id);
      let lon, lat;
      if (geographic && c && Number.isFinite(c.lat)) {
        lon = c.lon; lat = c.lat;
      } else {
        // توزيع ثابت لا عشوائي: نفس السجل يعطي نفس الشكل في كل تشغيل.
        const ring = RING[r.evidence.state.id] ?? 0.9;
        const n = (byRing.get(ring) || 0); byRing.set(ring, n + 1);
        const angle = (n * 137.508) * RAD;              // زاوية ذهبية تفرّق النقاط
        lon = (Math.cos(angle) * ring * 150);
        lat = (Math.sin(angle) * ring * 62);
      }
      return {
        id: r.id, name: r.name, lon, lat, row: r,
        tone: r.evidence.state.tone,
        pumps: r.assets.pumps.length, lines: r.assets.lines.length,
        card: c || null, i
      };
    });
    return built;
  }

  /* ————————————————————————————————— الإسقاط ————————————————————————————————— */
  function project(lon, lat, w, h) {
    const R = Math.min(w, h) * 0.42 * cam.zoom;
    const λ = (lon - cam.lon) * RAD, φ = lat * RAD, φ0 = cam.lat * RAD;
    // كروي
    const cosC = Math.sin(φ0) * Math.sin(φ) + Math.cos(φ0) * Math.cos(φ) * Math.cos(λ);
    const gx = Math.cos(φ) * Math.sin(λ);
    const gy = Math.cos(φ0) * Math.sin(φ) - Math.sin(φ0) * Math.cos(φ) * Math.cos(λ);
    // مستوٍ
    const fx = (dLon(cam.lon, lon) / 180) * 1.35;
    const fy = -((lat - cam.lat) / 90) * 1.35;
    const t = cam.t;
    return {
      x: w / 2 + lerp(gx, fx, t) * R,
      y: h / 2 - lerp(gy, fy, t) * R,
      // الظهور يتلاشى مع التسطيح: على السطح المستوي كل شيء مرئي.
      visible: cosC > -0.02 || t > 0.55,
      depth: lerp(Math.max(0, cosC), 1, t),
      R
    };
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

    const R = Math.min(w, h) * 0.42 * cam.zoom;
    graticule(w, h, R);
    links(w, h);
    dots(w, h, now);

    loop = requestAnimationFrame(frame);
  }

  /** شبكة خطوط الطول والعرض: تعطي الإحساس بالكرة بلا ادعاء رسم يابسة. */
  function graticule(w, h, R) {
    const fade = 1 - cam.t * 0.55;
    ctx.lineWidth = 1;
    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.beginPath(); ctx.strokeStyle = `rgba(125,178,224,${0.16 * fade})`;
      let drawn = false;
      for (let lon = -180; lon <= 180; lon += 4) {
        const p = project(lon, lat, w, h);
        if (!p.visible) { drawn = false; continue; }
        drawn ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
        drawn = true;
      }
      ctx.stroke();
    }
    for (let lon = -180; lon < 180; lon += 30) {
      ctx.beginPath(); ctx.strokeStyle = `rgba(125,178,224,${0.13 * fade})`;
      let drawn = false;
      for (let lat = -88; lat <= 88; lat += 4) {
        const p = project(lon, lat, w, h);
        if (!p.visible) { drawn = false; continue; }
        drawn ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
        drawn = true;
      }
      ctx.stroke();
    }
    // هالة الحافة تختفي مع التسطيح.
    if (cam.t < 0.9) {
      const glow = ctx.createRadialGradient(w / 2, h / 2, R * 0.72, w / 2, h / 2, R * 1.1);
      glow.addColorStop(0, `rgba(45,130,196,0)`);
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
    if (!a || !b) return;
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
    const wrap = document.createElement('div');
    wrap.className = 'pv-globe-wrap';
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'pv-globe';
      ctx = canvas.getContext('2d');
    }
    wrap.append(canvas);
    const orbit = document.createElement('div');
    orbit.className = 'pv-orbit';
    wrap.append(orbit);
    if (banner && !geographic) {
      const note = document.createElement('span');
      note.className = 'pv-schematic';
      note.textContent = 'ترتيب تخطيطي بحسب حالة الدليل — الإحداثيات غير مزوَّدة';
      wrap.append(note);
    }
    stage.querySelector('.pv-scene')?.append(wrap);
    resize();
    if (!loop) loop = requestAnimationFrame(frame);
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
  P().register('health', {
    title: 'صحة وأصول المحطات الخارجية',
    scope: 'ما وُثِّق وما لم يوثَّق',
    bg: '#07172b',
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
          fly({ lat: 0, lon: cam.lon, zoom: 1.35, t: 1 }, 3200);
        } });

      // ٥ — الانتقال بين المواقع التي لها أصول
      const stops = nodes.filter(n => n.pumps || n.lines)
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
            fly({ lon: node.lon, lat: node.lat, zoom: 2.1, t: 1 }, 1700);

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
