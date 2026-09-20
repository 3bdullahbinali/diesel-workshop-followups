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

  const tag = (group, value) => {
    const L = root.STATIONS_HEALTH_REF.label(group, value);
    return `<span class="hm-chip tone-${L.tone}${L.known ? '' : ' unknown'}"${
      L.known ? '' : ' title="قيمة غير معرّفة في المفردات"'}>${esc(L.name)}</span>`;
  };
  const cell = (value, suffix) => value == null || value === ''
    ? dash : esc(value) + (suffix ? ' ' + suffix : '');

  /** سطر المصدر: كل صف في سجل الأصول يحمل من أين جاء، والرابط يفتح الصف نفسه. */
  const provenance = (row) => {
    const bits = [];
    if (row.historicalDate) bits.push('إفادة ' + esc(row.historicalDate));
    if (row.sourceRef) bits.push(esc(row.sourceRef));
    if (!bits.length) return '';
    return `<p class="hm-src">${bits.join(' · ')}${row.sourceUrl
      ? ` — <a href="${esc(row.sourceUrl)}" target="_blank" rel="noopener noreferrer">الصف المصدر</a>` : ''}</p>`;
  };

  function pumpTable(pumps) {
    return pumps.map(p => `<div class="hm-asset">
      <div class="hm-asset-head">
        <b>${esc(p.label || p.id)}</b>
        <span class="hm-asset-id">${esc(p.id)}</span>
      </div>
      <div class="hm-asset-states">
        ${tag('inventory', p.inventory)}${tag('installation', p.installation)}
        ${tag('operating', p.operating)}${tag('health', p.health)}${tag('duty', p.duty)}
      </div>
      <dl class="hm-asset-spec">
        <div><dt>الصانع</dt><dd>${cell(p.make)}</dd></div>
        <div><dt>الطراز</dt><dd>${cell(p.model)}</dd></div>
        <div><dt>السيريال</dt><dd>${cell(p.serial)}</dd></div>
        <div><dt>القدرة</dt><dd>${p.kw == null ? dash : num(p.kw) + ' كيلوواط'}</dd></div>
        <div><dt>التدفق</dt><dd>${p.flow == null ? dash : num(p.flow) + ' م³/س'}</dd></div>
        <div><dt>الرفع</dt><dd>${p.head == null ? dash : num(p.head) + ' م'}</dd></div>
        <div><dt>أساس السجل</dt><dd>${tag('basis', p.basis)}</dd></div>
        <div><dt>الحالة بتاريخ</dt><dd>${cell(p.statusAsOf)}</dd></div>
      </dl>
      ${p.historicalNote ? `<p class="hm-asset-note">${esc(p.historicalNote)}</p>` : ''}
      ${p.nextAction ? `<p class="hm-asset-next"><b>الإجراء التالي:</b> ${esc(p.nextAction)}</p>` : ''}
      ${provenance(p)}
    </div>`).join('');
  }

  function lineTable(lines) {
    return lines.map(l => `<div class="hm-asset">
      <div class="hm-asset-head">
        <b>${esc(l.label || l.id)}</b>
        <span class="hm-asset-id">${esc(l.id)}</span>
      </div>
      <div class="hm-asset-states">
        ${tag('inventory', l.inventory)}${tag('flowState', l.flowState)}
        ${tag('health', l.health)}${tag('service', l.service)}${tag('role', l.role)}
      </div>
      <dl class="hm-asset-spec">
        <div><dt>من</dt><dd>${cell(l.fromNode || l.fromStationId)}</dd></div>
        <div><dt>إلى</dt><dd>${cell(l.toNode || l.toStationId)}</dd></div>
        <div><dt>القطر</dt><dd>${l.diameterMm == null ? dash : num(l.diameterMm) + ' مم'}</dd></div>
        <div><dt>الطول</dt><dd>${l.lengthM == null ? dash : num(l.lengthM) + ' م'}</dd></div>
        <div><dt>المادة</dt><dd>${cell(l.material)}</dd></div>
        <div><dt>الصمام</dt><dd>${l.valveType
          ? esc(l.valveType) + (l.valveSizeMm ? ' — ' + num(l.valveSizeMm) + ' مم' : '') : dash}</dd></div>
        <div><dt>أساس الاتجاه</dt><dd>${tag('directionBasis', l.directionBasis)}</dd></div>
        <div><dt>المسار</dt><dd>${tag('routeVerification', l.routeVerification)}</dd></div>
      </dl>
      ${l.historicalNote ? `<p class="hm-asset-note">${esc(l.historicalNote)}</p>` : ''}
      ${l.nextAction ? `<p class="hm-asset-next"><b>الإجراء التالي:</b> ${esc(l.nextAction)}</p>` : ''}
      ${provenance(l)}
    </div>`).join('');
  }

  const emptyAssets = (what) => `<div class="hm-empty">
    <p>لا ${what} مسجّلة لهذه المحطة في ملف الأصول بعد.</p>
  </div>`;

  function card(s, index) {
    const ev = s.evidence, isOpen = open.has(s.id);
    const badges = [
      s.tier === 'main' ? '<span class="hm-badge main">محطة رئيسية</span>' : '',
      s.tier === 'main_proposed' ? '<span class="hm-badge propose">رئيسية — مطابقة مقترحة</span>' : '',
      s.vacuum ? `<span class="hm-badge vac">سحب فراغي${s.vacuumProposed ? ' — مقترحة' : ''}</span>` : '',
      s.locationOnly ? '<span class="hm-badge site">موقع مساندة — ليس محطة</span>' : ''
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
        ${s.card && s.card.reportedInstalled != null
          ? `<span>مبلَّغ <b>${num(s.card.reportedInstalled)}</b></span>` : ''}
      </div>

      <div class="hm-card-body" ${isOpen ? '' : 'hidden'}>
        <p class="hm-why">${esc(ev.state.note)}</p>

        ${s.card && (s.card.reportedInstalled != null || s.card.reportedSpares != null) ? `
          <p class="hm-spec">المبلَّغ في البيان: ${s.card.reportedInstalled == null ? dash
            : num(s.card.reportedInstalled) + ' مركّبة'}${s.card.reportedSpares == null ? ''
            : ' · ' + num(s.card.reportedSpares) + ' بالمستودع'}
          ${s.card.countAsOf ? ` <span class="hm-src">بتاريخ ${esc(s.card.countAsOf)}</span>` : ''}
          <br><span class="hm-src">المسجَّل بسجلات مرقّمة: ${num(s.assets.pumps.length)} —
          العدد المبلَّغ ليس إثباتاً لسجلات مطابِقة.</span></p>` : ''}

        ${s.card && s.card.historicalNote ? `<p class="hm-why">${esc(s.card.historicalNote)}</p>` : ''}

        ${s.capacityLps != null ? `<p class="hm-spec">السعة ${num(s.capacityLps)} لتر/الثانية ·
          أُنشئت عام ${num(s.builtYear)} <span class="hm-src">— عرض القسم، صفحة 19</span></p>` : ''}

        <h4>المضخات</h4>
        ${s.assets.pumps.length ? pumpTable(s.assets.pumps) : emptyAssets('مضخات')}

        <h4>الخطوط</h4>
        ${s.assets.lines.length ? lineTable(s.assets.lines) : emptyAssets('خطوط')}

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
        <p>${esc(d.duty)}</p>
        <div class="hm-hero-stats">
          ${stat(cov.total, 'محطة رفع', 'في الإمارة')}
          ${stat(cov.sewage, 'صرف صحي')}
          ${stat(cov.storm, 'مياه أمطار')}
          ${stat(cov.main, 'محطة رئيسية')}
        </div>
      </div>
      <div class="hm-hero-arc">
        ${arc(cov.trackedPercent)}
        <p style="margin-top:14px"><button type="button" class="present-open" id="present-health">
          ▶ عرض تلقائي — كرة وخريطة
        </button></p>
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
        ${stat(cov.pumpRows, 'مضخة مسجّلة', cov.verifiedPumps + ' منها مثبتة', 'none')}
        ${stat(cov.unknownHealth, 'مضخة حالتها غير مثبتة', 'سُجّلت ولم تُفحص', 'warn')}
        ${stat(cov.lineRows, 'خط مسجَّل', 'من ملف الأصول', 'none')}
        ${stat(cov.mainUnknown, 'محطة رئيسية بلا مقابل', 'من الثماني، لا سجل لها', 'warn')}
      </div>
      <p class="hm-note">غياب السجل ليس دليل سلامة، و<b>وجود السجل ليس إثبات حالة</b>:
      صف كل حقوله «غير مثبت» سجلٌ موجود ومجهول. التمييز بين الاثنين هو ما يمنع
      هذه الشاشة من أن تكذب.</p>
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
          <option value="sites"${filters.tier === 'sites' ? ' selected' : ''}>مواقع مساندة</option>
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
    if (filters.tier === 'sites' && !s.locationOnly) return false;
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
