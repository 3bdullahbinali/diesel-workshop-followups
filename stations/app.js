'use strict';
(() => {
  const M = window.StationsModel;
  const store = window.StationsStore;
  let data = store.init(window.STATIONS_DATA);
  // دالة لا ثابت: الصفحة قد تبقى مفتوحة عبر منتصف الليل، وكل إعادة رسم تعيد القراءة.
  const AS_OF = () => M.today();

  let stateLabels, partyLabels, kindLabels, stageLabels, idx, openFollowups;

  function refreshContext() {
    data = store.data;
    stateLabels = M.labels(data, 'states');
    partyLabels = M.labels(data, 'parties');
    kindLabels = M.labels(data, 'kinds');
    stageLabels = M.labels(data, 'procurementStages');
    idx = M.index(data);
    openFollowups = data.followups.filter(f => !f.closed);
  }
  refreshContext();

  const el = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (value) => `<bdi>${esc(value)}</bdi>`;
  const placeName = (id) => idx.places.get(id)?.name || id;

  // ------------------------------------------------------------ أدوات مشتركة
  function ageCell(followup) {
    const age = M.ageDays(followup, AS_OF());
    if (age === null) return '<span class="badge">بلا تاريخ</span>';
    const band = M.band(followup, AS_OF());
    return `<span class="age-pill age-${band.id}">${num(age)}<small>يوم</small></span>`;
  }

  function stateCell(followup) {
    const derived = followup.waitingOn !== 'internal'
      ? `<span class="badge badge-derived">بانتظار: ${esc(partyLabels[followup.waitingOn])}</span>` : '';
    return `<span class="badge-state state-${followup.state}">${esc(stateLabels[followup.state])}</span>
      <div class="badges">${derived}
        ${followup.closed ? '<span class="badge badge-ok">مغلقة</span>'
          : followup.needsReview ? '<span class="badge badge-review">تحتاج تثبيت</span>'
          : '<span class="badge badge-ok">مثبّتة</span>'}
        ${followup.stateFromLastRecordOnly ? '<span class="badge">حسب آخر سجل</span>' : ''}
        ${followup.createdLocally ? '<span class="badge badge-local">مضافة محلياً</span>' : ''}
      </div>
      <p class="row-owner">${esc(followup.stateDetail)}</p>`;
  }

  function conflictNote(followup) {
    const shared = (followup.orders || [])
      .map(number => idx.orders.get(number))
      .filter(order => order && order.multiStation);
    if (!shared.length) return '';
    const text = shared.map(order =>
      `${order.number} مستخدم في: ${order.stations.map(placeName).join(' · ')}`).join('؛ ');
    return `<p class="note-line conflict-line">رقم أمر مشترك — ${esc(text)}. لا يُغلق بإنجاز موقع آخر.</p>`;
  }

  function rowActions(followup) {
    return `<div class="row-actions" data-edit-action>
      <button type="button" class="mini" data-edit="${esc(followup.id)}">تعديل</button>
      ${followup.closed ? '' : `<button type="button" class="mini" data-close="${esc(followup.id)}">إغلاق بدليل</button>`}
    </div>`;
  }

  /** تفصيل المتابعة: المصادر والأنشطة والكتب وأوامر العمل والتعديلات المحلية. */
  function detailPanel(followup) {
    const activities = (followup.relatedDaily || []).map(id => idx.daily.get(id)).filter(Boolean);
    const letters = M.lettersFor(data, followup.id);
    const sources = M.sourcesFor(data, followup);
    const orders = (followup.orders || []).map(n => idx.orders.get(n)).filter(Boolean);
    const edits = store.log.filter(entry => entry.targetId === followup.id);

    const block = (title, body) => body
      ? `<div class="detail-block"><h4>${esc(title)}</h4>${body}</div>` : '';

    return `<div class="detail-grid">
      ${block('المصادر', sources.length ? `<ul class="plain">${sources.map(s =>
        `<li><span class="badge">${esc(s.id)}</span> ${esc(s.name)}
          <span class="row-ref">${esc(s.date)}${s.note ? ' — ' + esc(s.note) : ''}</span></li>`).join('')}</ul>` : '')}

      ${block('أوامر العمل', orders.length ? `<ul class="plain">${orders.map(o =>
        `<li>${num(o.number)} — ${o.stations.map(placeName).map(esc).join(' · ')}
          ${o.multiStation ? '<span class="badge badge-conflict">عبر مواقع</span>' : ''}
          ${o.isSapNumber ? '' : '<span class="badge badge-review">مرجع غير رقمي</span>'}</li>`).join('')}</ul>` : '')}

      ${block(`الأنشطة المرتبطة (${activities.length})`, activities.length
        ? `<ul class="plain">${activities.map(a =>
            `<li><span class="badge">${esc(a.date)}</span>
              <span dir="ltr" style="unicode-bidi:plaintext">${esc(a.description)}</span>
              <span class="badge">${esc(a.finalStatus)}</span>
              <span class="row-ref">${esc(a.sourceId)} · صفوف ${esc(a.sourceRows)}</span></li>`).join('')}</ul>`
        : '<p class="row-owner">لا أنشطة يومية مرتبطة في المدى المستورد.</p>')}

      ${block('كتب تراسل', letters.length ? `<ul class="plain">${letters.map(l =>
        `<li><span class="badge badge-derived">${l.direction === 'incoming' ? 'وارد' : 'صادر'}</span>
          ${num(l.number)} · ${esc(l.date)} — ${esc(l.subject)}</li>`).join('')}</ul>`
        : '<p class="row-owner">لا كتاب مرتبط. إغلاق الكتاب لا يغيّر هذه المتابعة على أي حال.</p>')}

      ${followup.closed ? block('الإغلاق',
        `<p class="row-action">${esc(followup.closeDate || '')} — ${esc(followup.closeProof || '')}</p>`) : ''}

      ${block('ملاحظة المصدر', followup.notes ? `<p class="row-action">${esc(followup.notes)}</p>` : '')}

      ${edits.length ? block('تعديلات محلية', `<ul class="plain">${edits.slice(0, 6).map(e =>
        `<li><span class="badge">${esc(e.at.slice(0, 16).replace('T', ' '))}</span>
          ${esc(e.action)} — ${esc(e.detail || '')}</li>`).join('')}</ul>`) : ''}
    </div>`;
  }

  // --------------------------------------------------------------- اللوحة
  function renderDashboard() {
    const d = M.dashboard(data, AS_OF());
    const bands = { fresh: 0, watch: 0, stalled: 0 };
    for (const followup of openFollowups) {
      const band = M.band(followup, AS_OF());
      if (band) bands[band.id] += 1;
    }
    const total = bands.fresh + bands.watch + bands.stalled || 1;
    const pct = (n) => (n / total * 100).toFixed(1) + '%';
    const parties = [...d.byWaitingOn.entries()].sort((a, b) => b[1] - a[1]);
    const maxParty = Math.max(...parties.map(p => p[1]), 1);

    el('view-dashboard').innerHTML = `
      <h2>لوحة المتابعة</h2>
      <p class="lead">المؤشر هنا هو عمر آخر إفادة ومن عليه الإجراء، لا عدد السجلات.</p>

      <div class="kpis">
        <div class="kpi kpi-alarm"><span class="kpi-label">متوقفة بلا إفادة</span>
          <strong>${num(d.stalled)}</strong>
          <span class="kpi-note">مضى أكثر من ثلاثة أسابيع على آخر معلومة مؤيدة.</span></div>
        <div class="kpi kpi-main"><span class="kpi-label">الإجراء على الفريق</span>
          <strong>${num(d.ours)}</strong>
          <span class="kpi-note">من ${num(d.open)} متابعة مفتوحة. ${num(d.awaitingOthers)} بانتظار جهات أخرى.</span></div>
        <div class="kpi"><span class="kpi-label">تحتاج تثبيت حالة</span>
          <strong>${num(d.needsReview)}</strong>
          <span class="kpi-note">${num(d.confirmed)} فقط مثبّتة بدليل. النسبة الباقية غير معتمدة للتشغيل.</span></div>
        <div class="kpi"><span class="kpi-label">لها موعد مؤكد</span>
          <strong>${num(d.withDueDate)}</strong>
          <span class="kpi-note">${d.withDueDate ? 'مواعيد مُدخلة يدوياً.' : 'لا موعد في السجل؛ التأخير لا يُولَّد من تواريخ تاريخية.'}</span></div>
      </div>

      <p style="margin:0 0 18px">
        <button type="button" class="present-open green" id="present-followups">
          ▶ عرض تلقائي — ما يحتاج تحركاً
        </button>
      </p>

      <div class="aging">
        <div class="aging-head"><h3>عمر آخر إفادة</h3>
          <p>وسيط العمر ${num(d.medianAge)} أيام · محسوب حتى اليوم ${num(AS_OF())}</p></div>
        <div class="aging-bar" role="img"
          aria-label="محدّثة ${bands.fresh}، تحتاج متابعة ${bands.watch}، متوقفة ${bands.stalled}">
          <span class="seg-fresh" style="width:${pct(bands.fresh)}"></span>
          <span class="seg-watch" style="width:${pct(bands.watch)}"></span>
          <span class="seg-stalled" style="width:${pct(bands.stalled)}"></span>
        </div>
        <div class="aging-key">
          <span><i class="seg-fresh"></i>محدّثة خلال أسبوع — ${num(bands.fresh)}</span>
          <span><i class="seg-watch"></i>مضى ٨ إلى ٢١ يوماً — ${num(bands.watch)}</span>
          <span><i class="seg-stalled"></i>أكثر من ٢١ يوماً — ${num(bands.stalled)}</span>
        </div>
      </div>

      <div class="grid-2">
        <section class="panel">
          <div class="panel-head"><div><h3>الأقدم بلا إفادة</h3>
            <p>الترتيب بعمر آخر معلومة مؤيدة، لا بتاريخ الإنشاء.</p></div></div>
          <div class="panel-body"><ul class="age-list">${
            openFollowups.map(f => ({ f, age: M.ageDays(f, AS_OF()) }))
              .filter(entry => entry.age !== null)
              .sort((a, b) => b.age - a.age).slice(0, 8)
              .map(({ f }) => `<li>${ageCell(f)}<div>
                <p class="age-title">${esc(f.title)}</p>
                <p class="age-meta">${esc(placeName(f.stationId))} · ${esc(stateLabels[f.state])}
                  · بانتظار: ${esc(partyLabels[f.waitingOn])}</p></div></li>`).join('')
          }</ul></div>
        </section>

        <section class="panel">
          <div class="panel-head"><div><h3>من عليه الإجراء</h3>
            <p>حقل مشتق من نص الإجراء التالي، يحتاج تأكيد الفريق.</p></div></div>
          <div class="panel-body"><ul class="party-list">${
            parties.map(([id, count]) => `<li class="${id === 'internal' ? 'party-ours' : ''}">
              <span class="party-name">${esc(partyLabels[id])}</span>
              <span class="party-track"><span style="width:${(count / maxParty * 100).toFixed(1)}%"></span></span>
              <span class="party-count">${num(count)}</span></li>`).join('')
          }</ul></div>
        </section>
      </div>

      <div class="alerts">
        <div class="alert"><strong>${num(d.unlinkedWork)}</strong><h4>عمل بلا متابعة تغطيه</h4>
          <p>أنشطة مسجّلة في الجداول لا تقابلها متابعة. تحتاج قراراً: متابعة أو استبعاد.</p></div>
        <div class="alert"><strong>${num(d.conflictingOrders)}</strong><h4>أوامر عمل عبر أكثر من موقع</h4>
          <p>رقم واحد يظهر في محطات مختلفة. قد يكون أمراً جامعاً وقد يكون خطأ إدخال.</p></div>
        <div class="alert"><strong>${num(data.daily.filter(a => !a.dateVerified).length)}</strong>
          <h4>أنشطة بتاريخ غير مؤكد</h4>
          <p>ملف ١٦/٩ يحمل داخلياً عنوان ١٥/٩. تاريخ الاسم مستخدم مؤقتاً.</p></div>
        <div class="alert"><strong>${num(d.openIssues)}</strong><h4>ملاحظات جودة بيانات</h4>
          <p>مفتوحة في شاشة مراجعة البيانات، ولم يُغلق منها شيء بعد.</p></div>
      </div>`;
  }

  // ------------------------------------------------------------- المتابعات
  const filters = { kind: 'all', state: 'all', party: 'all', band: 'all', review: false, q: '' };
  const expanded = new Set();

  function matches(followup) {
    if (filters.kind !== 'all' && followup.kind !== filters.kind) return false;
    if (filters.state !== 'all' && followup.state !== filters.state) return false;
    if (filters.party !== 'all' && followup.waitingOn !== filters.party) return false;
    if (filters.band !== 'all' && M.band(followup, AS_OF())?.id !== filters.band) return false;
    if (filters.review && !followup.needsReview) return false;
    if (filters.q) {
      const hay = [followup.title, followup.reference, followup.notes, followup.nextAction,
        placeName(followup.stationId), followup.ownerPerSource, ...(followup.orders || [])]
        .join(' ').toLowerCase();
      if (!hay.includes(filters.q.toLowerCase())) return false;
    }
    return true;
  }

  function followupRows(rows) {
    return rows.map(f => `<tr data-row="${esc(f.id)}" class="${expanded.has(f.id) ? 'is-open' : ''}">
      <td>${ageCell(f)}</td>
      <td>
        <p class="row-title">${esc(f.title)}</p>
        <span class="row-ref">${esc(placeName(f.stationId))} · ${esc(f.reference)}</span>
        <div class="badges"><span class="badge">${esc(kindLabels[f.kind])}</span>
          ${f.prStage ? `<span class="badge">${esc(stageLabels[f.prStage] || f.prStage)}</span>` : ''}</div>
      </td>
      <td>${stateCell(f)}</td>
      <td>
        <p class="row-action">${esc(f.nextAction)}</p>
        <p class="row-owner">${esc(f.ownerPerSource)}</p>
        ${conflictNote(f)}
        ${rowActions(f)}
      </td>
      <td>${num(f.evidenceDate || '—')}
        <div class="badges">${(f.sourceIds || []).map(id => `<span class="badge">${esc(id)}</span>`).join('')}</div>
        <button type="button" class="mini" data-expand="${esc(f.id)}" aria-expanded="${expanded.has(f.id)}">
          ${expanded.has(f.id) ? 'إخفاء التفصيل' : 'التفصيل'}</button>
      </td>
    </tr>${expanded.has(f.id) ? `<tr class="detail-row"><td colspan="5">${detailPanel(f)}</td></tr>` : ''}`).join('');
  }

  function renderFollowups() {
    const rows = data.followups.filter(matches)
      .sort((a, b) => (M.ageDays(b, AS_OF()) ?? -1) - (M.ageDays(a, AS_OF()) ?? -1));
    const kindCount = (id) => data.followups.filter(f => id === 'all' || f.kind === id).length;

    el('view-followups').innerHTML = `
      <div class="view-head">
        <div><h2>المتابعات</h2>
          <p class="lead">مرتبة بعمر آخر إفادة. الحالة مصنَّفة، ونص المصدر الأصلي معروض تحتها.</p></div>
        <div class="view-actions">
          <button type="button" class="action" id="add-followup" data-edit-action>إضافة متابعة</button>
          <button type="button" class="action" id="export-followups">تصدير النتائج CSV</button>
        </div>
      </div>
      <section class="panel">
        <div class="panel-head"><div><h3>النتائج <span class="tab-count">${num(rows.length)}</span></h3></div></div>
        <div class="toolbar">
          <div class="chips">
            ${[['all', 'الكل'], ...data.enums.kinds.map(k => [k.id, k.label])].map(([id, label]) =>
              `<button type="button" class="chip" data-kind="${id}" aria-pressed="${filters.kind === id}">
                ${esc(label)}<span class="chip-count">${num(kindCount(id))}</span></button>`).join('')}
          </div>
          <select class="filter" id="state-filter" aria-label="الحالة">
            <option value="all">كل الحالات</option>
            ${data.enums.states.map(s => `<option value="${s.id}" ${filters.state === s.id ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
          </select>
          <select class="filter" id="party-filter" aria-label="الجهة المنتظر ردها">
            <option value="all">كل الجهات</option>
            ${data.enums.parties.map(p => `<option value="${p.id}" ${filters.party === p.id ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}
          </select>
          <select class="filter" id="band-filter" aria-label="عمر آخر إفادة">
            <option value="all">كل الأعمار</option>
            ${M.BANDS.map(b => `<option value="${b.id}" ${filters.band === b.id ? 'selected' : ''}>${esc(b.label)}</option>`).join('')}
          </select>
          <button type="button" class="chip" id="review-toggle" aria-pressed="${filters.review}">تحتاج تثبيت فقط</button>
          <label class="search-field">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input type="search" id="search" placeholder="بحث في الموضوع والمرجع ورقم الأمر" value="${esc(filters.q)}">
          </label>
        </div>
        ${rows.length ? `<table>
          <thead><tr><th style="width:60px">العمر</th><th style="width:28%">الموضوع والموقع</th>
            <th style="width:19%">الحالة</th><th>الإجراء التالي</th><th style="width:130px">آخر إفادة</th></tr></thead>
          <tbody>${followupRows(rows)}</tbody>
        </table>` : '<p class="empty">لا نتائج مطابقة للفلاتر الحالية.</p>'}
      </section>`;

    const view = el('view-followups');
    view.querySelectorAll('[data-kind]').forEach(b =>
      b.addEventListener('click', () => { filters.kind = b.dataset.kind; renderFollowups(); }));
    el('state-filter').onchange = (e) => { filters.state = e.target.value; renderFollowups(); };
    el('party-filter').onchange = (e) => { filters.party = e.target.value; renderFollowups(); };
    el('band-filter').onchange = (e) => { filters.band = e.target.value; renderFollowups(); };
    el('review-toggle').onclick = () => { filters.review = !filters.review; renderFollowups(); };
    el('add-followup').onclick = () => window.StationsEditor.openFollowup(null);
    el('export-followups').onclick = () => window.StationsEditor.exportFollowups(rows);
    view.querySelectorAll('[data-expand]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.expand;
      expanded.has(id) ? expanded.delete(id) : expanded.add(id);
      renderFollowups();
    }));
    view.querySelectorAll('[data-edit]').forEach(b =>
      b.addEventListener('click', () => window.StationsEditor.openFollowup(b.dataset.edit)));
    view.querySelectorAll('[data-close]').forEach(b =>
      b.addEventListener('click', () => window.StationsEditor.openClose('followup', b.dataset.close)));

    const search = el('search');
    search.addEventListener('input', () => {
      filters.q = search.value;
      renderFollowups();
      const again = el('search');
      again.focus();
      again.setSelectionRange(again.value.length, again.value.length);
    });
  }

  // ---------------------------------------------------------- طلبات الشراء
  function renderProcurement() {
    const requests = data.followups.filter(f => f.kind === 'pr');
    const stages = data.enums.procurementStages
      .map(stage => ({ stage, rows: requests.filter(r => r.prStage === stage.id) }))
      .filter(group => group.rows.length);
    const unstaged = requests.filter(r => !r.prStage);
    if (unstaged.length) stages.push({ stage: { id: 'none', label: 'بلا مرحلة محددة' }, rows: unstaged });

    const numbered = requests.filter(r => /\d{8}/.test(r.reference)).length;

    el('view-procurement').innerHTML = `
      <div class="view-head">
        <div><h2>طلبات الشراء</h2>
          <p class="lead">مسار واحد لكل طلب: المرحلة، والجهة المنتظر ردها، والكتب المرتبطة، ودليل الإفادة.</p></div>
        <div class="view-actions">
          <button type="button" class="action" id="export-pr">تصدير CSV</button>
        </div>
      </div>

      <div class="kpis">
        <div class="kpi kpi-main"><span class="kpi-label">طلبات متابَعة</span>
          <strong>${num(requests.length)}</strong>
          <span class="kpi-note">${num(numbered)} منها برقم طلب، والباقي احتياج بلا رقم مُصدَر.</span></div>
        <div class="kpi"><span class="kpi-label">تحت التقييم</span>
          <strong>${num(requests.filter(r => r.prStage === 'evaluation').length)}</strong>
          <span class="kpi-note">إعداد التقييم أو إرساله لا يثبت اعتماد تراسل.</span></div>
        <div class="kpi"><span class="kpi-label">بانتظار LPO</span>
          <strong>${num(requests.filter(r => r.prStage === 'lpo').length)}</strong>
          <span class="kpi-note">لا دليل على إصدار أمر شراء ضمن المواد المراجَعة.</span></div>
        <div class="kpi kpi-alarm"><span class="kpi-label">تحتاج تثبيت</span>
          <strong>${num(requests.filter(r => r.needsReview).length)}</strong>
          <span class="kpi-note">من ${num(requests.length)} طلبات. لا تُعتمد مرحلة جديدة دون دليل.</span></div>
      </div>

      <section class="panel">
        ${stages.map(({ stage, rows }) => `
          <h3 class="stage-heading">${esc(stage.label)}
            <span>${num(rows.length)} من ${num(requests.length)}</span></h3>
          <table>
            <thead><tr><th style="width:60px">العمر</th><th style="width:26%">الطلب</th>
              <th style="width:18%">الحالة</th><th>الإجراء التالي والكتب</th><th style="width:120px">آخر إفادة</th></tr></thead>
            <tbody>${rows.map(r => {
              const letters = M.lettersFor(data, r.id);
              return `<tr>
                <td>${ageCell(r)}</td>
                <td><p class="row-title">${esc(r.title)}</p>
                  <span class="row-ref">${esc(r.reference)}</span>
                  <div class="badges"><span class="badge">${esc(placeName(r.stationId))}</span></div></td>
                <td>${stateCell(r)}</td>
                <td><p class="row-action">${esc(r.nextAction)}</p>
                  <p class="row-owner">${esc(r.ownerPerSource)}</p>
                  ${letters.length ? `<div class="linked-letters">${letters.map(l =>
                    `<span class="badge badge-derived">${l.direction === 'incoming' ? 'وارد' : 'صادر'}
                      ${esc(l.number)} · ${esc(l.date)}</span>`).join(' ')}</div>`
                    : '<p class="row-owner">لا كتاب مرتبط في المواد المراجَعة.</p>'}
                  ${r.notes ? `<p class="note-line">${esc(r.notes)}</p>` : ''}
                  ${rowActions(r)}</td>
                <td>${num(r.evidenceDate || '—')}
                  <div class="badges">${(r.sourceIds || []).map(id => `<span class="badge">${esc(id)}</span>`).join('')}</div></td>
              </tr>`;
            }).join('')}</tbody>
          </table>`).join('')}
      </section>`;

    const view = el('view-procurement');
    el('export-pr').onclick = () => window.StationsEditor.exportFollowups(requests, 'purchase-requests');
    view.querySelectorAll('[data-edit]').forEach(b =>
      b.addEventListener('click', () => window.StationsEditor.openFollowup(b.dataset.edit)));
    view.querySelectorAll('[data-close]').forEach(b =>
      b.addEventListener('click', () => window.StationsEditor.openClose('followup', b.dataset.close)));
  }

  // --------------------------------------------------------- أوامر العمل
  function renderOrders() {
    const orders = [...data.workOrders].sort((a, b) =>
      (b.multiStation - a.multiStation) || b.activityIds.length - a.activityIds.length);

    el('view-orders').innerHTML = `
      <h2>أوامر العمل</h2>
      <p class="lead">شاشة تجمع الأمر عبر مواقعه. الربط بالمحطة والأصل ونوع العمل، لا برقم الأمر وحده.</p>
      <section class="panel">
        <div class="panel-head"><div>
          <h3>الأوامر <span class="tab-count">${num(orders.length)}</span></h3>
          <p>${num(orders.filter(o => o.multiStation).length)} منها يظهر في أكثر من موقع، و${
            num(orders.filter(o => !o.isSapNumber).length)} مرجع غير رقمي لم يُعتمد رقم SAP.</p>
        </div></div>
        <table>
          <thead><tr><th style="width:150px">رقم الأمر</th><th>المواقع</th>
            <th>المتابعات المرتبطة</th><th style="width:90px">الأنشطة</th></tr></thead>
          <tbody>${orders.map(order => `<tr>
            <td><span class="row-ref">${num(order.number)}</span>
              <div class="badges">
                ${order.multiStation ? '<span class="badge badge-conflict">عبر مواقع</span>' : ''}
                ${order.isSapNumber ? '' : '<span class="badge badge-review">مرجع غير رقمي</span>'}
              </div></td>
            <td>${order.stations.map(id => `<span class="badge">${esc(placeName(id))}</span>`).join(' ')}</td>
            <td>${order.followupIds.length
              ? order.followupIds.map(id => `<p class="row-action">${esc(idx.followups.get(id)?.title || id)}</p>`).join('')
              : '<span class="badge badge-review">لا متابعة مرتبطة</span>'}</td>
            <td>${num(order.activityIds.length)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </section>`;
  }

  // ------------------------------------------------- الأنشطة بلا متابعة
  function renderUnlinked() {
    const groups = [
      ['unlinked_work', 'عمل يحتاج قراراً', 'أنشطة مسجّلة لا تغطيها أي متابعة.'],
      ['routine_pm', 'صيانة وقائية منجزة', 'منجزة دون ملاحظات؛ لا تستدعي متابعة مفتوحة بالضرورة.']
    ];
    const crossRefs = new Map(data.crossStationOrderRefs.map(r => [r.activityId, r]));

    el('view-unlinked').innerHTML = `
      <h2>أنشطة بلا متابعة</h2>
      <p class="lead">${num(data.meta.coverage.activitiesLinked)} من ${num(data.meta.coverage.activities)} نشاطاً مرتبط بمتابعة.
        الباقي معروض هنا ليقرر الفريق: متابعة أو استبعاد.</p>
      ${groups.map(([id, title, note]) => {
        const rows = data.orphanActivities.filter(o => o.category === id)
          .map(o => idx.daily.get(o.activityId)).filter(Boolean);
        return `<section class="panel" style="margin-bottom:18px">
          <div class="panel-head"><div>
            <h3>${esc(title)} <span class="tab-count">${num(rows.length)}</span></h3><p>${esc(note)}</p>
          </div></div>
          ${rows.length ? `<table>
            <thead><tr><th style="width:110px">التاريخ</th><th style="width:130px">الموقع</th>
              <th>العمل كما ورد</th><th style="width:120px">رقم الأمر</th><th style="width:150px">الحالة</th></tr></thead>
            <tbody>${rows.map(activity => {
              const cross = crossRefs.get(activity.id);
              return `<tr>
                <td>${num(activity.date)}
                  ${activity.dateVerified ? '' : '<div class="badges"><span class="badge badge-review">غير مؤكد</span></div>'}</td>
                <td>${esc(placeName(activity.station))}</td>
                <td><p class="row-action" dir="ltr" style="text-align:right">${esc(activity.description)}</p>
                  ${cross ? `<p class="note-line conflict-line">رقم الأمر نفسه مرتبط بمتابعة في موقع آخر:
                    ${cross.followupIds.map(id => esc(idx.followups.get(id)?.title || id)).join(' · ')}. للتحقق فقط، دون ربط.</p>` : ''}
                  <div class="row-actions">
                    <button type="button" class="mini" data-followup-activity="${esc(activity.id)}" data-local-only>إنشاء متابعة</button>
                  </div></td>
                <td>${activity.order ? num(activity.order)
                  : activity.orderRaw ? `<span class="badge badge-conflict">قيمة غير صالحة</span>
                    <span class="row-ref">${esc(activity.orderRaw)}</span>` : '<span class="badge">بلا رقم</span>'}</td>
                <td><span class="badge">${esc(activity.finalStatus)}</span>
                  <div class="badges"><span class="badge">${esc(activity.sourceId)}</span></div></td>
              </tr>`;
            }).join('')}</tbody>
          </table>` : '<p class="empty">لا أنشطة في هذه المجموعة.</p>'}
        </section>`;
      }).join('')}`;

    el('view-unlinked').querySelectorAll('[data-followup-activity]').forEach(b =>
      b.addEventListener('click', () => window.StationsEditor.openActivity(b.dataset.followupActivity)));
  }

  // ------------------------------------------------------------ السجل اليومي
  function renderDaily() {
    const byDate = new Map();
    for (const activity of data.daily) {
      if (!byDate.has(activity.date)) byDate.set(activity.date, []);
      byDate.get(activity.date).push(activity);
    }
    const dates = [...byDate.keys()].sort().reverse();

    el('view-daily').innerHTML = `
      <h2>السجل اليومي</h2>
      <p class="lead">${num(data.daily.length)} نشاطاً من ${num(data.sources.filter(s => s.id.startsWith('D')).length)} جداول.
        إنجاز النشاط اليومي لا يساوي إغلاق المتابعة.</p>
      <section class="panel">
        ${dates.map(date => {
          const rows = byDate.get(date);
          const unverified = rows.some(a => !a.dateVerified);
          return `<div class="day-head"><span>${num(date)}</span>
            <span><span class="badge">${num(rows.length)} نشاط</span>
              ${unverified ? '<span class="badge badge-review">تاريخ غير مؤكد</span>' : ''}</span></div>
          <table><tbody>${rows.map(activity => `<tr>
            <td style="width:140px">${esc(placeName(activity.station))}
              <div class="badges"><span class="badge">${esc(activity.sourceId)}</span>
                <span class="badge">صفوف ${num(activity.sourceRows)}</span></div></td>
            <td><p class="row-action" dir="ltr" style="text-align:right">${esc(activity.description)}</p>
              ${activity.findings.length ? `<p class="note-line">${activity.findings.map(esc).join(' ')}</p>` : ''}</td>
            <td style="width:180px"><span class="row-owner">${esc(activity.staff.join(' · '))}</span></td>
            <td style="width:120px">${activity.order ? num(activity.order) : '<span class="badge">بلا رقم</span>'}</td>
            <td style="width:110px"><span class="badge">${esc(activity.finalStatus)}</span></td>
          </tr>`).join('')}</tbody></table>`;
        }).join('')}
      </section>`;
  }

  // ---------------------------------------------------------------- المحطات
  // ملف المحطة: البطاقة مدخل لا لوحة أرقام. الضغط يفتح كل ما يخص الموقع
  // في مكان واحد — متابعاته وطلبات شرائه وأوامر عمله وكتبه وأنشطته — بدل أن
  // يبحث الموظف عن الاسم نفسه في خمس شاشات.
  let openStation = null;

  function stationFile(place) {
    const view = M.stationView(data, place.id);
    const prs = view.followups.filter(f => f.kind === 'pr');
    const openOnes = view.followups.filter(f => !f.closed);

    const section = (title, count, body) => count
      ? `<div class="station-block"><h5>${esc(title)} <span class="tab-count">${num(count)}</span></h5>${body}</div>`
      : '';

    return `<div class="station-file">
      ${section('المتابعات المفتوحة', openOnes.length, `<ul class="station-list">${
        openOnes.map(f => `<li>
          <span class="station-list-main"><b>${esc(f.title)}</b>
            <span>${esc(f.stateDetail || stateLabels[f.state] || '')}</span></span>
          ${ageCell(f)}
        </li>`).join('')}</ul>`)}

      ${section('متابعات مغلقة', view.followups.length - openOnes.length, `<ul class="station-list">${
        view.followups.filter(f => f.closed).map(f => `<li>
          <span class="station-list-main"><b>${esc(f.title)}</b>
            <span>أُغلقت ${esc(f.closeDate || 'بلا تاريخ')} · ${esc(f.closeProof || 'بلا دليل')}</span></span>
        </li>`).join('')}</ul>`)}

      ${section('طلبات الشراء', prs.length, `<ul class="station-list">${
        prs.map(f => `<li><span class="station-list-main"><b>${esc(f.reference || f.title)}</b>
          <span>${esc(stageLabels[f.prStage] || 'المرحلة غير مثبتة')}</span></span></li>`).join('')}</ul>`)}

      ${section('أوامر العمل', view.orders.length, `<ul class="station-list">${
        view.orders.map(w => `<li><span class="station-list-main"><b>${esc(w.number)}</b>
          <span>${w.multiStation ? 'مشترك مع ' + num(w.stations.length) + ' موقعاً' : 'خاص بهذا الموقع'}</span></span></li>`).join('')}</ul>`)}

      ${section('كتب التراسل', view.letters.length, `<ul class="station-list">${
        view.letters.map(l => `<li><span class="station-list-main"><b>${esc(l.subject)}</b>
          <span>${esc(l.number || '')} · ${l.direction === 'outgoing' ? 'صادر' : 'وارد'}</span></span></li>`).join('')}</ul>`)}

      ${section('آخر الأنشطة', Math.min(view.daily.length, 8), `<ul class="station-list">${
        view.daily.slice(-8).reverse().map(a => `<li>
          <span class="station-list-main"><b>${esc(a.description)}</b>
            <span>${esc(a.date || 'بلا تاريخ')}${a.staff ? ' · ' + esc(a.staff) : ''}</span></span>
        </li>`).join('')}</ul>`)}

      ${view.followups.length || view.daily.length || view.orders.length ? ''
        : '<p class="station-empty">لا سجل لهذا الموقع بعد: لا متابعة ولا نشاط ولا أمر عمل.</p>'}
    </div>`;
  }

  function renderStations() {
    const card = (place) => {
      const view = M.stationView(data, place.id);
      const isOpen = openStation === place.id;
      return `<div class="card station-card${isOpen ? ' is-open' : ''}">
        <button type="button" class="card-open" data-station="${esc(place.id)}" aria-expanded="${isOpen}">
          <h4>${esc(place.name)}</h4><span class="card-id">${esc(place.id)}</span>
          <div class="card-stats">
            <span><b>${num(view.followups.length)}</b>متابعة</span>
            <span><b>${num(view.daily.length)}</b>نشاط</span>
            <span><b>${num(view.orders.length)}</b>أمر عمل</span>
          </div>
          ${view.sharedOrders.length ? `<div class="badges"><span class="badge badge-conflict">
            ${num(view.sharedOrders.length)} أمر مشترك مع موقع آخر</span></div>` : ''}
          <div class="badges"><span class="badge badge-review">الجاهزية غير موثقة</span>
            <span class="card-hint">${isOpen ? 'إخفاء الملف' : 'افتح ملف الموقع'}</span></div>
        </button>
        ${isOpen ? stationFile(place) : ''}
      </div>`;
    };

    el('view-stations').innerHTML = `
      <h2>المحطات والمواقع</h2>
      <p class="lead">${num(data.stations.length)} محطة، و${num(data.locations.length)} موقعاً وجهة أخرى فُصلت عنها.
        اضغط أي بطاقة ليُفتح ملف الموقع كاملاً. الجاهزية غير موثقة لأي منها، فلا تُعرض كمعلومة.</p>
      <section class="panel" style="margin-bottom:18px">
        <div class="panel-head"><div><h3>المحطات <span class="tab-count">${num(data.stations.length)}</span></h3></div></div>
        <div class="cards">${data.stations.map(card).join('')}</div>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h3>مواقع وجهات أخرى <span class="tab-count">${num(data.locations.length)}</span></h3>
          <p>ورش ومساندة أقسام ومواقع غير محددة. ليست محطات، ولا تدخل في تعدادها.</p></div></div>
        <div class="cards">${data.locations.map(card).join('')}</div>
      </section>`;

    for (const button of el('view-stations').querySelectorAll('[data-station]')) {
      button.onclick = () => {
        openStation = openStation === button.dataset.station ? null : button.dataset.station;
        renderStations();
        applyCapabilities();
      };
    }
  }

  // ------------------------------------------------------------- كتب تراسل
  function renderLetters() {
    const groups = [
      ['incoming', 'الوارد', l => l.direction === 'incoming' && !l.closed],
      ['outgoing', 'الصادر', l => l.direction === 'outgoing' && !l.closed],
      ['closed', 'الكتب المغلقة', l => l.closed]
    ];

    el('view-letters').innerHTML = `
      <div class="view-head">
        <div><h2>كتب تراسل</h2>
          <p class="lead">إغلاق الكتاب لا يغيّر حالة العمل أو طلب الشراء، والرد يُسجَّل كتاباً آخر مرتبطاً.</p></div>
        <div class="view-actions"><button type="button" class="action" id="add-letter" data-edit-action>إضافة كتاب</button></div>
      </div>
      ${groups.map(([id, title, test]) => {
        const rows = data.letters.filter(test);
        return `<section class="panel" style="margin-bottom:18px">
          <div class="panel-head"><div><h3>${esc(title)} <span class="tab-count">${num(rows.length)}</span></h3></div></div>
          ${rows.length ? `<div class="cards">${rows.map(letter => {
            const linked = idx.followups.get(letter.linkedId);
            return `<div class="card letter-card" style="grid-column:span 2">
              <h4>${esc(letter.subject)}</h4>
              <span class="card-id">${esc(letter.number)} · ${esc(letter.date)}</span>
              <div class="badges">
                <span class="badge badge-derived">${letter.direction === 'incoming' ? 'وارد' : 'صادر'}</span>
                <span class="badge">${esc(letter.party)}</span>
                <span class="badge ${letter.closed ? 'badge-ok' : 'badge-review'}">${letter.closed ? 'مغلق' : 'غير مغلق'}</span>
              </div>
              <p class="row-action" style="margin-top:9px">${esc(letter.action)}</p>
              ${linked ? `<p class="row-owner">مرتبط بـ: ${esc(linked.title)}</p>` : ''}
              ${letter.notes ? `<p class="note-line">${esc(letter.notes)}</p>` : ''}
              <div class="row-actions">
                ${letter.closed ? '' : `<button type="button" class="mini" data-close-letter="${esc(letter.id)}">إغلاق بدليل</button>`}
              </div>
            </div>`;
          }).join('')}</div>`
          : `<p class="empty">${id === 'outgoing'
              ? 'لا صادر مستورد. غياب الصادر هنا لا يعني عدم وجوده فعلياً.'
              : 'لا كتب في هذه المجموعة.'}</p>`}
        </section>`;
      }).join('')}`;

    el('add-letter').onclick = () => window.StationsEditor.openLetter();
    el('view-letters').querySelectorAll('[data-close-letter]').forEach(b =>
      b.addEventListener('click', () => window.StationsEditor.openClose('letter', b.dataset.closeLetter)));
  }

  // --------------------------------------------------------- مراجعة البيانات
  function renderReview() {
    el('view-review').innerHTML = `
      <div class="view-head">
        <div><h2>مراجعة البيانات</h2>
          <p class="lead">شاشة مراجعة إدارية، لا عبء يومي على الفني.</p></div>
        <div class="view-actions">
          <button type="button" class="action" id="export-json">تصدير نسخة JSON</button>
          <button type="button" class="action" id="import-json">استيراد نسخة</button>
          <button type="button" class="action danger" id="reset-local" data-local-only>إلغاء التعديلات المحلية</button>
        </div>
      </div>
      <section class="panel">
        <div class="cards">${data.issues.map(issue => `
          <div class="card issue-card ${issue.severity === 'high' ? 'issue-high' : ''}" style="grid-column:span 2">
            <h4>${esc(issue.title)}</h4><span class="card-id">${esc(issue.id)}</span>
            <div class="badges"><span class="badge ${issue.severity === 'high' ? 'badge-conflict' : ''}">
              ${issue.severity === 'high' ? 'أولوية عالية' : 'عادية'}</span>
              ${issue.sourceIds.map(id => `<span class="badge">${esc(id)}</span>`).join('')}</div>
            <p>${esc(issue.description)}</p>
            <p class="issue-action">الإجراء: ${esc(issue.action)}</p>
          </div>`).join('')}</div>
      </section>
      <section class="panel" style="margin-top:18px">
        <div class="panel-head"><div><h3>المصادر <span class="tab-count">${num(data.sources.length)}</span></h3></div></div>
        <table>
          <thead><tr><th style="width:70px">المعرّف</th><th>المصدر</th><th style="width:120px">التاريخ</th><th>ملاحظة</th></tr></thead>
          <tbody>${data.sources.map(source => `<tr>
            <td><span class="badge">${esc(source.id)}</span></td>
            <td><span class="row-ref">${esc(source.name)}</span></td>
            <td>${num(source.date)}</td>
            <td><p class="row-owner">${esc(source.note || '—')}</p></td>
          </tr>`).join('')}</tbody>
        </table>
      </section>
      ${store.log.length ? `<section class="panel" style="margin-top:18px">
        <div class="panel-head"><div><h3>سجل التعديلات المحلية <span class="tab-count">${num(store.log.length)}</span></h3>
          <p>محلي وغير موثق؛ ليس سجل تدقيق محمياً واسم المحرر غير مُتحقَّق منه.</p></div></div>
        <table>
          <thead><tr><th style="width:150px">الوقت</th><th style="width:150px">الإجراء</th>
            <th style="width:120px">السجل</th><th>التفصيل</th></tr></thead>
          <tbody>${store.log.slice(0, 40).map(entry => `<tr>
            <td>${num(entry.at.slice(0, 16).replace('T', ' '))}</td>
            <td>${esc(entry.action)}</td><td><span class="badge">${esc(entry.targetId)}</span></td>
            <td><p class="row-owner">${esc(entry.detail || '')}</p></td>
          </tr>`).join('')}</tbody>
        </table>
      </section>` : ''}`;

    el('export-json').onclick = () => window.StationsEditor.exportJson();
    el('import-json').onclick = () => window.StationsEditor.importJson();
    el('reset-local').onclick = () => window.StationsEditor.resetLocal();
  }

  // ------------------------------------------------------------------ التنقل
  const views = {
    dashboard: renderDashboard, followups: renderFollowups, procurement: renderProcurement,
    orders: renderOrders, unlinked: renderUnlinked, daily: renderDaily,
    stations: renderStations, letters: renderLetters, review: renderReview
  };
  let current = 'dashboard';

  function show(name) {
    current = name;
    for (const key of Object.keys(views)) {
      el('view-' + key).hidden = key !== name;
      document.querySelector(`[data-view="${key}"]`).setAttribute('aria-selected', String(key === name));
    }
    views[name]();
  }

  function syncCounts() {
    const counts = {
      followups: data.followups.length,
      procurement: data.followups.filter(f => f.kind === 'pr').length,
      orders: data.workOrders.length,
      unlinked: data.orphanActivities.length,
      daily: data.daily.length,
      stations: data.stations.length,
      letters: data.letters.length,
      review: data.issues.length
    };
    for (const [key, value] of Object.entries(counts)) {
      const badge = document.querySelector(`[data-view="${key}"] .tab-count`);
      if (badge) badge.textContent = value;
    }
    el('banner-counts').textContent =
      `${data.meta.coverage.needsReview} من ${data.meta.coverage.followups}`;
    const edits = store.editedCount;
    el('local-state').hidden = !edits;
    if (edits) el('local-count').textContent = edits;
    el('storage-warning').hidden = store.available;
  }

  store.subscribe(() => { refreshContext(); syncCounts(); show(current); });

  /**
   * ما يظهر يتبع المصدر والصلاحية معاً:
   *   data-edit-action  — تحرير السجلات: محلياً، أو عبر الواجهة لمن يملك صلاحية كتابة.
   *   data-local-only   — ما لا معنى له إلا محلياً: إلغاء التعديلات، والإنشاء من نشاط.
   * تُستدعى بعد كل إعادة رسم وبعد كل تغيّر في المصدر.
   */
  // نص اللافتة يتبع الاتصال: جملة ثابتة تصف وضعاً غير قائم تُفقد اللافتة معناها.
  const BANNER = {
    api: 'السجل يُقرأ من الشيت مباشرة، والتعديل يُحفظ فيه.',
    'api-public': 'السجل يُقرأ من الشيت. التعديل يحتاج تسجيل دخول.',
    offline: 'الاتصال منقطع — المعروض آخر سجل قُرئ، والحفظ متوقف مؤقتاً.',
    locked: 'السجل خلف تسجيل الدخول. لا تُعرض بيانات قبل التحقق من الهوية.',
    local: 'لا سجل محمَّل. سجّل الدخول لقراءة الشيت.'
  };

  const applyCapabilities = () => {
    const source = document.body.dataset.source || 'local';
    const local = source === 'local';
    const mode = el('banner-mode');
    if (mode) mode.textContent = BANNER[source] || BANNER.local;
    // القراءة العامة تعرض كل شيء ولا تحرّر: الجلسة والصلاحية شرطا التحرير.
    const canEdit = local || (source === 'api' && Boolean(window.StationsApi?.canWrite));
    for (const el of document.querySelectorAll('[data-local-only]')) el.hidden = !local;
    for (const el of document.querySelectorAll('[data-edit-action]')) el.hidden = !canEdit;
  };
  const originalShow = show;
  show = (name) => { originalShow(name); applyCapabilities(); };

  document.querySelectorAll('[data-view]').forEach(button =>
    button.addEventListener('click', () => show(button.dataset.view)));

  // عرض المتابعات يُفتح من لوحة المتابعة. وعرض المحطات في صفحته المستقلة.
  document.addEventListener('click', (event) => {
    if (event.target.closest('#present-followups')) window.StationsPresent?.open('followups');
  });

  const bannerToggle = el('banner-toggle');
  if (bannerToggle) bannerToggle.onclick = () => {
    const detail = el('banner-detail');
    detail.hidden = !detail.hidden;
    bannerToggle.setAttribute('aria-expanded', String(!detail.hidden));
    bannerToggle.textContent = detail.hidden ? 'التفاصيل' : 'إخفاء';
  };

  el('build-date').textContent = data.meta.buildDate;
  el('latest-daily').textContent = data.meta.latestDailyDate;
  syncCounts();
  show('dashboard');

  window.StationsApp = {
    refresh: () => show(current),
    applyCapabilities,
    get current() { return current; }
  };
})();
