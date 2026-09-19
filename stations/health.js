'use strict';
/**
 * شاشة صحة المحطات.
 *
 * ترتيب الصفحة يتبع ترتيب الصدق: أولاً حجم الأسطول الحقيقي (157) وكم منه
 * يعرفه الموقع (34)، ثم ما يقوله سجل المتابعات عن كل محطة، ثم المضخات
 * والخطوط — وهي فارغة، وتُعرض فارغة بصيغتها المطلوبة لا مخفية.
 *
 * الحركة زينة لا معنى: كل ما تفعله تأخير ظهور، ويُلغى كله عند
 * prefers-reduced-motion. لا رقم يتحرك إلا وقيمته النهائية هي المكتوبة.
 */
(function (root) {

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g,
    ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const num = (value) => `<bdi class="num">${Number(value).toLocaleString('ar-AE')}</bdi>`;
  const dash = '<span class="hm-none">لم تُزوَّد</span>';

  let filters = { evidence: 'all', tier: 'all', query: '' };
  let open = new Set();

  const motionOff = () => root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------ قطع */

  /** قوس التغطية. النسبة مرسومة بالطول لا بالتقريب اللوني. */
  function arc(percent) {
    const r = 54, c = 2 * Math.PI * r;
    const shown = Math.max(0, Math.min(100, percent || 0));
    return `<svg class="hm-arc" viewBox="0 0 128 128" role="img"
        aria-label="التغطية ${shown} بالمئة">
      <circle cx="64" cy="64" r="${r}" class="hm-arc-track"/>
      <circle cx="64" cy="64" r="${r}" class="hm-arc-fill"
        style="stroke-dasharray:${c};stroke-dashoffset:${c}"
        data-target="${c - (c * shown) / 100}"/>
      <text x="64" y="60" class="hm-arc-num" data-count="${shown}">0</text>
      <text x="64" y="80" class="hm-arc-cap">٪ مغطاة</text>
    </svg>`;
  }

  function stat(value, label, note, tone) {
    return `<div class="hm-stat ${tone || ''}">
      <b class="hm-stat-num" data-count="${value ?? ''}">${value == null ? '—' : 0}</b>
      <span class="hm-stat-label">${esc(label)}</span>
      ${note ? `<span class="hm-stat-note">${esc(note)}</span>` : ''}
    </div>`;
  }

  function chip(state) {
    return `<span class="hm-chip tone-${state.tone}">${esc(state.name)}</span>`;
  }

  /* ---------------------------------------------------------- بطاقة محطة */

  function pumpTable(pumps) {
    if (!pumps.length) return '';
    const states = root.STATIONS_HEALTH_REF.pumpStates;
    return `<table class="hm-table"><thead><tr>
      <th>الرمز</th><th>الشركة</th><th>الطراز</th><th>القدرة</th><th>الحالة</th><th>آخر صيانة</th>
      </tr></thead><tbody>${pumps.map(p => {
        const s = states[p.state];
        return `<tr><td>${esc(p.tag)}</td><td>${p.make ? esc(p.make) : dash}</td>
          <td>${p.model ? esc(p.model) : dash}</td>
          <td>${p.kw == null ? dash : num(p.kw) + ' كيلوواط'}</td>
          <td>${s ? chip(s) : dash}</td>
          <td>${p.lastService ? esc(p.lastService) : dash}</td></tr>`;
      }).join('')}</tbody></table>`;
  }

  function lineTable(lines) {
    if (!lines.length) return '';
    const states = root.STATIONS_HEALTH_REF.lineStates;
    return `<table class="hm-table"><thead><tr>
      <th>الخط</th><th>القطر</th><th>الطول</th><th>المادة</th><th>الحالة</th><th>آخر مسح</th>
      </tr></thead><tbody>${lines.map(l => {
        const s = states[l.state];
        return `<tr><td>${esc(l.tag)}</td>
          <td>${l.diameterMm == null ? dash : num(l.diameterMm) + ' مم'}</td>
          <td>${l.lengthM == null ? dash : num(l.lengthM) + ' م'}</td>
          <td>${l.material ? esc(l.material) : dash}</td>
          <td>${s ? chip(s) : dash}</td>
          <td>${l.lastSurvey ? esc(l.lastSurvey) : dash}</td></tr>`;
      }).join('')}</tbody></table>`;
  }

  const emptyAssets = (what, shape) => `<div class="hm-empty">
    <p>لا ${what} مسجّلة لهذه المحطة بعد.</p>
    <code>${esc(shape)}</code>
  </div>`;

  function card(s, index) {
    const ev = s.evidence, isOpen = open.has(s.id);
    const badges = [
      s.tier === 'main' ? '<span class="hm-badge main">محطة رئيسية</span>' : '',
      s.tier === 'main_proposed' ? '<span class="hm-badge propose">رئيسية — مطابقة مقترحة</span>' : '',
      s.vacuum ? `<span class="hm-badge vac">سحب فراغي${s.vacuumProposed ? ' — مقترحة' : ''}</span>` : ''
    ].join('');

    return `<article class="hm-card tone-${ev.state.tone}${isOpen ? ' is-open' : ''}"
        style="--i:${index}" data-station="${esc(s.id)}">
      <button type="button" class="hm-card-head" aria-expanded="${isOpen}">
        <span class="hm-card-title">
          <span class="hm-dot tone-${ev.state.tone}" aria-hidden="true"></span>
          <b>${esc(s.name)}</b>
          ${badges}
        </span>
        <span class="hm-card-meta">
          ${chip(ev.state)}
          ${ev.oldestAge != null ? `<span class="hm-age">أقدم إفادة ${num(ev.oldestAge)} يوماً</span>` : ''}
        </span>
      </button>

      <div class="hm-card-strip">
        <span>متابعات مفتوحة <b>${num(s.openCount)}</b></span>
        <span>مغلقة <b>${num(s.closedCount)}</b></span>
        <span>أوامر عمل <b>${num(s.orders.length)}</b></span>
        <span>أنشطة <b>${num(s.daily.length)}</b></span>
        <span>مضخات ${s.assets.pumps.length ? `<b>${num(s.assets.pumps.length)}</b>` : dash}</span>
        <span>خطوط ${s.assets.lines.length ? `<b>${num(s.assets.lines.length)}</b>` : dash}</span>
      </div>

      <div class="hm-card-body" ${isOpen ? '' : 'hidden'}>
        <p class="hm-why">${esc(ev.state.note)}</p>

        ${s.capacityLps != null ? `<p class="hm-spec">السعة ${num(s.capacityLps)} لتر/الثانية ·
          أُنشئت عام ${num(s.builtYear)} <span class="hm-src">— عرض القسم، صفحة 19</span></p>` : ''}

        <h4>المضخات</h4>
        ${s.assets.pumps.length ? pumpTable(s.assets.pumps)
          : emptyAssets('مضخات', "{ stationId:'" + s.id + "', tag:'P-1', make:null, model:null, kw:null, state:'running', lastService:null }")}

        <h4>الخطوط</h4>
        ${s.assets.lines.length ? lineTable(s.assets.lines)
          : emptyAssets('خطوط', "{ stationId:'" + s.id + "', tag:'L-1', diameterMm:null, lengthM:null, material:null, state:'clear', lastSurvey:null }")}

        ${ev.open.length ? `<h4>المتابعات المفتوحة</h4>
          <ul class="hm-list">${ev.open.map(f => `<li>
            <b>${esc(f.title)}</b>
            <span>${esc(f.stateDetail || '')}</span>
            ${f.evidenceDate ? `<span class="hm-src">آخر إفادة ${esc(f.evidenceDate)}</span>` : ''}
          </li>`).join('')}</ul>` : ''}

        ${s.lastActivity ? `<p class="hm-src">آخر نشاط يومي مسجَّل: ${esc(s.lastActivity)}</p>` : ''}
      </div>
    </article>`;
  }

  /* ------------------------------------------------------------- الأقسام */

  function fleetBand(cov, ref) {
    const d = ref.department;
    return `<section class="hm-hero">
      <div class="hm-hero-text">
        <span class="hm-eyebrow">${esc(d.parent)}</span>
        <h2>${esc(d.name)}</h2>
        <p>${esc(d.divisions[0].duty)}</p>
        <div class="hm-hero-stats">
          ${stat(cov.total, 'محطة رفع', 'إجمالي مسؤولية الشعبة')}
          ${stat(cov.sewage, 'صرف صحي')}
          ${stat(cov.storm, 'مياه أمطار')}
          ${stat(cov.main, 'محطة رئيسية')}
        </div>
      </div>
      <div class="hm-hero-arc">
        ${arc(cov.trackedPercent)}
        <p><b>${num(cov.tracked)}</b> محطة لها سجل في الموقع<br>
        من <b>${num(cov.total)}</b> في عهدة الشعبة</p>
      </div>
    </section>`;
  }

  function gapPanel(cov) {
    return `<section class="hm-gap">
      <h3>ما لا يعرفه الموقع بعد</h3>
      <div class="hm-gap-grid">
        ${stat(cov.untracked, 'محطة بلا سجل', 'لم تَرِد في أي متابعة أو نشاط', 'none')}
        ${stat(cov.pumpRows, 'صف مضخة', 'السجل فارغ حتى تُزوَّد', 'none')}
        ${stat(cov.lineRows, 'صف خط', 'السجل فارغ حتى تُزوَّد', 'none')}
        ${stat(cov.mainUnknown, 'محطة رئيسية بلا مقابل', 'من الثماني، لا سجل لها', 'warn')}
      </div>
      <p class="hm-note">غياب السجل ليس دليل سلامة. هذه الصفحة تعرض صحة
      <b>السجل</b>، وصحة المعدة تحتاج بيانات المضخات والخطوط.</p>
    </section>`;
  }

  function mainPanel(ref) {
    return `<section class="panel hm-panel">
      <div class="panel-head"><div><h3>المحطات الرئيسية الثماني</h3>
        <p class="hm-src">عرض القسم، صفحة 6 — بالترتيب الوارد فيه.</p></div></div>
      <div class="hm-main-grid">${ref.mainStations.map((m, i) => {
        const state = m.linked ? 'linked' : m.proposed ? 'propose' : 'none';
        const label = m.linked ? 'مرتبطة بـ ' + m.linked
          : m.proposed ? 'مطابقة مقترحة: ' + m.proposed + ' — تحتاج تأكيدك'
          : 'لا سجل لها في الموقع';
        return `<div class="hm-main ${state}" style="--i:${i}">
          <b>${num(m.order)}</b>
          <span class="hm-main-name">${esc(m.name)}</span>
          <span class="hm-main-link">${esc(label)}</span>
        </div>`;
      }).join('')}</div>
    </section>`;
  }

  function vacuumPanel(ref) {
    const v = ref.vacuumSystem;
    return `<section class="panel hm-panel">
      <div class="panel-head"><div><h3>نظام السحب الفراغي — المدينة الجامعية</h3>
        <p class="hm-src">عرض القسم، صفحة ${num(v.page)}.</p></div></div>
      <div class="panel-body">
        <p>${esc(v.description)}</p>
        <div class="hm-vac-grid">${v.stations.map((s, i) => `
          <div class="hm-vac" style="--i:${i}">
            <b>محطة ${num(s.order)}</b>
            <span>${num(s.capacityLps)} لتر/الثانية</span>
            <span>أُنشئت ${num(s.builtYear)}</span>
            <span class="hm-vac-link">${s.proposed
              ? 'مطابقة مقترحة: ' + esc(s.proposed) : '<span class="hm-none">بلا مقابل في السجل</span>'}</span>
          </div>`).join('')}</div>
        <p class="hm-note">غرف التفتيش في هذا النظام: <b>${num(v.chambers)}</b> غرفة.
        الترقيم في العرض بلا أسماء، فالمطابقة بالرقم مقترحة لا مؤكدة.</p>
        <ul class="hm-inline">${v.parts.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
      </div>
    </section>`;
  }

  function componentsPanel(ref) {
    return `<section class="panel hm-panel">
      <div class="panel-head"><div><h3>مكونات محطة الضخ</h3>
        <p class="hm-src">عرض القسم، صفحة 9 — تصنيف لا جرد: لا عدد لأي منها بعد.</p></div></div>
      <div class="hm-comp-grid">${ref.componentKinds.map((c, i) => `
        <div class="hm-comp" style="--i:${i}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${c.icon}"/></svg>
          <b>${esc(c.name)}</b>
          <span class="hm-none">بلا عدد</span>
        </div>`).join('')}</div>
    </section>`;
  }

  function divisionsPanel(ref) {
    return `<section class="panel hm-panel">
      <div class="panel-head"><div><h3>الشعب الثلاث</h3>
        <p class="hm-src">${esc(ref.department.staff)} موظفاً — رئاسة ${esc(ref.department.head)}.</p></div></div>
      <div class="hm-div-grid">${ref.department.divisions.map((d, i) => `
        <div class="hm-div" style="--i:${i}">
          <b>${esc(d.name)}</b>
          <p>${esc(d.duty)}</p>
          <ul>${d.tasks.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
        </div>`).join('')}</div>
    </section>`;
  }

  /* -------------------------------------------------------------- الرسم */

  function toolbar(counts) {
    const E = root.StationsHealthModel.EVIDENCE;
    const options = [['all', 'الكل', counts.all], ...Object.values(E).map(s => [s.id, s.name, counts[s.id] || 0])];
    return `<div class="hm-bar">
      <div class="hm-filters" role="group" aria-label="تصفية حسب حالة الدليل">
        ${options.map(([id, label, n]) => `<button type="button" class="hm-fil${filters.evidence === id ? ' on' : ''}"
          data-evidence="${id}">${esc(label)} <b>${num(n)}</b></button>`).join('')}
      </div>
      <div class="hm-bar-end">
        <select id="hm-tier" aria-label="تصفية حسب التصنيف">
          <option value="all"${filters.tier === 'all' ? ' selected' : ''}>كل المحطات</option>
          <option value="main"${filters.tier === 'main' ? ' selected' : ''}>الرئيسية فقط</option>
          <option value="vacuum"${filters.tier === 'vacuum' ? ' selected' : ''}>السحب الفراغي</option>
          <option value="assets"${filters.tier === 'assets' ? ' selected' : ''}>لها مضخات أو خطوط</option>
        </select>
        <input type="search" id="hm-q" placeholder="ابحث باسم المحطة أو رمزها"
          value="${esc(filters.query)}" aria-label="بحث">
      </div>
    </div>`;
  }

  function match(s) {
    if (filters.evidence !== 'all' && s.evidence.state.id !== filters.evidence) return false;
    if (filters.tier === 'main' && !s.tier) return false;
    if (filters.tier === 'vacuum' && !s.vacuum) return false;
    if (filters.tier === 'assets' && !s.assets.pumps.length && !s.assets.lines.length) return false;
    const q = filters.query.trim();
    if (q && !(s.name + ' ' + s.id).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }

  function animate(container) {
    if (motionOff()) {
      container.querySelectorAll('[data-count]').forEach(node => {
        node.textContent = Number(node.dataset.count || 0).toLocaleString('ar-AE');
      });
      container.querySelectorAll('.hm-arc-fill').forEach(node => {
        node.style.strokeDashoffset = node.dataset.target;
      });
      container.classList.add('hm-static');
      return;
    }
    // القوس يُرسم بانتقال CSS؛ التغيير بعد إطار حتى يلتقطه المتصفح كانتقال.
    requestAnimationFrame(() => container.querySelectorAll('.hm-arc-fill')
      .forEach(node => { node.style.strokeDashoffset = node.dataset.target; }));

    for (const node of container.querySelectorAll('[data-count]')) {
      const target = Number(node.dataset.count);
      if (!Number.isFinite(target)) { node.textContent = '—'; continue; }
      const start = performance.now(), span = 900;
      const step = (now) => {
        const t = Math.min(1, (now - start) / span);
        const eased = 1 - Math.pow(1 - t, 3);
        node.textContent = Math.round(target * eased).toLocaleString('ar-AE');
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }

  function render(container) {
    const data = root.StationsStore.data;
    const built = root.StationsHealthModel.build(data);
    const ref = built.ref;
    const counts = { all: built.rows.length, ...built.byEvidence };
    const shown = built.rows.filter(match);

    container.innerHTML = `
      ${fleetBand(built.coverage, ref)}
      ${gapPanel(built.coverage)}
      ${toolbar(counts)}
      <div class="hm-grid">${shown.length
        ? shown.map((s, i) => card(s, i)).join('')
        : '<p class="hm-empty-grid">لا محطة تطابق هذه التصفية.</p>'}</div>
      ${mainPanel(ref)}
      ${vacuumPanel(ref)}
      ${componentsPanel(ref)}
      ${divisionsPanel(ref)}
    `;

    container.querySelectorAll('[data-evidence]').forEach(button =>
      button.onclick = () => { filters.evidence = button.dataset.evidence; render(container); });
    const tier = container.querySelector('#hm-tier');
    if (tier) tier.onchange = () => { filters.tier = tier.value; render(container); };
    const query = container.querySelector('#hm-q');
    if (query) query.oninput = () => { filters.query = query.value; render(container); };

    container.querySelectorAll('.hm-card-head').forEach(head => {
      head.onclick = () => {
        const id = head.closest('.hm-card').dataset.station;
        open.has(id) ? open.delete(id) : open.add(id);
        render(container);
      };
    });

    animate(container);
  }

  root.StationsHealth = { render, get filters() { return { ...filters }; } };
})(globalThis);
