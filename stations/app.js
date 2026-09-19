'use strict';
(() => {
  const data = window.STATIONS_DATA;
  const M = window.StationsModel;
  const AS_OF = data.meta.buildDate;

  const stateLabels = M.labels(data, 'states');
  const partyLabels = M.labels(data, 'parties');
  const kindLabels = M.labels(data, 'kinds');
  const stageLabels = M.labels(data, 'procurementStages');
  const idx = M.index(data);

  const el = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (value) => `<bdi>${esc(value)}</bdi>`;
  const placeName = (id) => idx.places.get(id)?.name || id;

  const openFollowups = data.followups.filter(f => !f.closed);

  // ------------------------------------------------------------ أدوات مشتركة
  function ageCell(followup) {
    const age = M.ageDays(followup, AS_OF);
    if (age === null) return '<span class="badge">بلا تاريخ</span>';
    const band = M.band(followup, AS_OF);
    return `<span class="age-pill age-${band.id}">${num(age)}<small>يوم</small></span>`;
  }

  function stateCell(followup) {
    const derived = followup.waitingOn !== 'internal'
      ? `<span class="badge badge-derived">بانتظار: ${esc(partyLabels[followup.waitingOn])}</span>` : '';
    return `<span class="badge-state state-${followup.state}">${esc(stateLabels[followup.state])}</span>
      <div class="badges">${derived}
        ${followup.needsReview ? '<span class="badge badge-review">تحتاج تثبيت</span>' : '<span class="badge badge-ok">مثبّتة</span>'}
        ${followup.stateFromLastRecordOnly ? '<span class="badge">حسب آخر سجل</span>' : ''}
      </div>
      <p class="row-owner">${esc(followup.stateDetail)}</p>`;
  }

  function conflictNote(followup) {
    const shared = followup.orders
      .map(number => idx.orders.get(number))
      .filter(order => order && order.multiStation);
    if (!shared.length) return '';
    const text = shared.map(order =>
      `${order.number} مستخدم في: ${order.stations.map(placeName).join(' · ')}`).join('؛ ');
    return `<p class="note-line conflict-line">رقم أمر مشترك — ${esc(text)}. لا يُغلق بإنجاز موقع آخر.</p>`;
  }

  // --------------------------------------------------------------- اللوحة
  function renderDashboard() {
    const d = M.dashboard(data, AS_OF);
    const bands = { fresh: 0, watch: 0, stalled: 0 };
    for (const followup of openFollowups) {
      const band = M.band(followup, AS_OF);
      if (band) bands[band.id] += 1;
    }
    const total = bands.fresh + bands.watch + bands.stalled || 1;
    const pct = (n) => (n / total * 100).toFixed(1) + '%';

    const parties = [...d.byWaitingOn.entries()]
      .sort((a, b) => b[1] - a[1]);
    const maxParty = Math.max(...parties.map(p => p[1]), 1);

    el('view-dashboard').innerHTML = `
      <h2>لوحة المتابعة</h2>
      <p class="lead">المؤشر هنا هو عمر آخر إفادة ومن عليه الإجراء، لا عدد السجلات.</p>

      <div class="kpis">
        <div class="kpi kpi-alarm">
          <span class="kpi-label">متوقفة بلا إفادة</span>
          <strong>${num(d.stalled)}</strong>
          <span class="kpi-note">مضى أكثر من ثلاثة أسابيع على آخر معلومة مؤيدة.</span>
        </div>
        <div class="kpi kpi-main">
          <span class="kpi-label">الإجراء على الفريق</span>
          <strong>${num(d.ours)}</strong>
          <span class="kpi-note">من ${num(d.open)} متابعة مفتوحة. ${num(d.awaitingOthers)} بانتظار جهات أخرى.</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">تحتاج تثبيت حالة</span>
          <strong>${num(d.needsReview)}</strong>
          <span class="kpi-note">${num(d.confirmed)} فقط مثبّتة بدليل. النسبة الباقية غير معتمدة للتشغيل.</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">لها موعد مؤكد</span>
          <strong>${num(d.withDueDate)}</strong>
          <span class="kpi-note">لا يوجد موعد واحد في السجل؛ التأخير لا يُولَّد من تواريخ تاريخية.</span>
        </div>
      </div>

      <div class="aging">
        <div class="aging-head">
          <h3>عمر آخر إفادة</h3>
          <p>وسيط العمر ${num(d.medianAge)} أيام · محسوب حتى ${num(AS_OF)}</p>
        </div>
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
          <div class="panel-head">
            <div><h3>الأقدم بلا إفادة</h3><p>الترتيب بعمر آخر معلومة مؤيدة، لا بتاريخ الإنشاء.</p></div>
          </div>
          <div class="panel-body">
            <ul class="age-list">${
              openFollowups
                .map(f => ({ f, age: M.ageDays(f, AS_OF) }))
                .filter(entry => entry.age !== null)
                .sort((a, b) => b.age - a.age)
                .slice(0, 8)
                .map(({ f }) => `<li>${ageCell(f)}<div>
                  <p class="age-title">${esc(f.title)}</p>
                  <p class="age-meta">${esc(placeName(f.stationId))} · ${esc(stateLabels[f.state])}
                    · بانتظار: ${esc(partyLabels[f.waitingOn])}</p>
                </div></li>`).join('')
            }</ul>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div><h3>من عليه الإجراء</h3><p>حقل مشتق من نص الإجراء التالي، يحتاج تأكيد الفريق.</p></div>
          </div>
          <div class="panel-body">
            <ul class="party-list">${
              parties.map(([id, count]) => `<li class="${id === 'internal' ? 'party-ours' : ''}">
                <span class="party-name">${esc(partyLabels[id])}</span>
                <span class="party-track"><span style="width:${(count / maxParty * 100).toFixed(1)}%"></span></span>
                <span class="party-count">${num(count)}</span>
              </li>`).join('')
            }</ul>
          </div>
        </section>
      </div>

      <div class="alerts">
        <div class="alert"><strong>${num(d.unlinkedWork)}</strong>
          <h4>عمل بلا متابعة تغطيه</h4>
          <p>أنشطة مسجّلة في الجداول لا تقابلها متابعة. تحتاج قراراً: متابعة أو استبعاد.</p></div>
        <div class="alert"><strong>${num(d.conflictingOrders)}</strong>
          <h4>أوامر عمل عبر أكثر من موقع</h4>
          <p>رقم واحد يظهر في محطات مختلفة. قد يكون أمراً جامعاً وقد يكون خطأ إدخال.</p></div>
        <div class="alert"><strong>${num(data.daily.filter(a => !a.dateVerified).length)}</strong>
          <h4>أنشطة بتاريخ غير مؤكد</h4>
          <p>ملف ١٦/٩ يحمل داخلياً عنوان ١٥/٩. تاريخ الاسم مستخدم مؤقتاً.</p></div>
        <div class="alert"><strong>${num(d.openIssues)}</strong>
          <h4>ملاحظات جودة بيانات</h4>
          <p>مفتوحة في شاشة مراجعة البيانات، ولم يُغلق منها شيء بعد.</p></div>
      </div>`;
  }

  // ------------------------------------------------------------- المتابعات
  const filters = { kind: 'all', state: 'all', party: 'all', band: 'all', review: false, q: '' };

  function matches(followup) {
    if (filters.kind !== 'all' && followup.kind !== filters.kind) return false;
    if (filters.state !== 'all' && followup.state !== filters.state) return false;
    if (filters.party !== 'all' && followup.waitingOn !== filters.party) return false;
    if (filters.band !== 'all' && M.band(followup, AS_OF)?.id !== filters.band) return false;
    if (filters.review && !followup.needsReview) return false;
    if (filters.q) {
      const hay = [followup.title, followup.reference, followup.notes, followup.nextAction,
        placeName(followup.stationId), followup.ownerPerSource, ...followup.orders].join(' ').toLowerCase();
      if (!hay.includes(filters.q.toLowerCase())) return false;
    }
    return true;
  }

  function renderFollowups() {
    const rows = data.followups.filter(matches)
      .sort((a, b) => (M.ageDays(b, AS_OF) ?? -1) - (M.ageDays(a, AS_OF) ?? -1));
    const kindCount = (id) => data.followups.filter(f => id === 'all' || f.kind === id).length;

    el('view-followups').innerHTML = `
      <h2>المتابعات</h2>
      <p class="lead">مرتبة بعمر آخر إفادة. الحالة مصنَّفة، والنص الأصلي للمصدر معروض تحتها.</p>
      <section class="panel">
        <div class="panel-head"><div><h3>النتائج <span class="tab-count">${num(rows.length)}</span></h3></div></div>
        <div class="toolbar">
          <div class="chips" id="kind-chips">
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
          <thead><tr>
            <th style="width:60px">العمر</th><th style="width:30%">الموضوع والموقع</th>
            <th style="width:20%">الحالة</th><th>الإجراء التالي</th><th style="width:110px">آخر إفادة</th>
          </tr></thead>
          <tbody>${rows.map(f => `<tr>
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
              ${f.notes ? `<p class="note-line">${esc(f.notes)}</p>` : ''}
            </td>
            <td>${num(f.evidenceDate || '—')}
              <div class="badges">${f.sourceIds.map(id => `<span class="badge">${esc(id)}</span>`).join('')}</div></td>
          </tr>`).join('')}</tbody>
        </table>` : '<p class="empty">لا نتائج مطابقة للفلاتر الحالية.</p>'}
      </section>`;

    el('view-followups').querySelectorAll('[data-kind]').forEach(button =>
      button.addEventListener('click', () => { filters.kind = button.dataset.kind; renderFollowups(); }));
    el('state-filter').addEventListener('change', (e) => { filters.state = e.target.value; renderFollowups(); });
    el('party-filter').addEventListener('change', (e) => { filters.party = e.target.value; renderFollowups(); });
    el('band-filter').addEventListener('change', (e) => { filters.band = e.target.value; renderFollowups(); });
    el('review-toggle').addEventListener('click', () => { filters.review = !filters.review; renderFollowups(); });
    const search = el('search');
    search.addEventListener('input', () => {
      filters.q = search.value;
      renderFollowups();
      const again = el('search');
      again.focus();
      again.setSelectionRange(again.value.length, again.value.length);
    });
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
        الباقي معروض هنا ليقرر الفريق، ولم يُنشأ منه أي سجل.</p>
      ${groups.map(([id, title, note]) => {
        const rows = data.orphanActivities.filter(o => o.category === id)
          .map(o => ({ orphan: o, activity: idx.daily.get(o.activityId) }));
        return `<section class="panel" style="margin-bottom:18px">
          <div class="panel-head"><div>
            <h3>${esc(title)} <span class="tab-count">${num(rows.length)}</span></h3><p>${esc(note)}</p>
          </div></div>
          <table>
            <thead><tr><th style="width:110px">التاريخ</th><th style="width:140px">الموقع</th>
              <th>العمل كما ورد</th><th style="width:130px">رقم الأمر</th><th style="width:110px">الحالة</th></tr></thead>
            <tbody>${rows.map(({ activity }) => {
              const cross = crossRefs.get(activity.id);
              return `<tr>
                <td>${num(activity.date)}
                  ${activity.dateVerified ? '' : '<div class="badges"><span class="badge badge-review">غير مؤكد</span></div>'}</td>
                <td>${esc(placeName(activity.station))}</td>
                <td><p class="row-action" dir="ltr" style="text-align:right">${esc(activity.description)}</p>
                  ${cross ? `<p class="note-line conflict-line">رقم الأمر نفسه مرتبط بمتابعة في موقع آخر:
                    ${cross.followupIds.map(id => esc(idx.followups.get(id)?.title || id)).join(' · ')}. للتحقق فقط، دون ربط.</p>` : ''}</td>
                <td>${activity.order ? num(activity.order)
                  : activity.orderRaw ? `<span class="badge badge-conflict">قيمة غير صالحة</span>
                    <span class="row-ref">${esc(activity.orderRaw)}</span>` : '<span class="badge">بلا رقم</span>'}</td>
                <td><span class="badge">${esc(activity.finalStatus)}</span>
                  <div class="badges"><span class="badge">${esc(activity.sourceId)}</span></div></td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </section>`;
      }).join('')}`;
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
      <p class="lead">${num(data.daily.length)} نشاطاً مجمّعاً من ${num(data.sources.filter(s => s.id.startsWith('D')).length)} جداول.
        إنجاز النشاط اليومي لا يساوي إغلاق المتابعة.</p>
      <section class="panel">
        ${dates.map(date => {
          const rows = byDate.get(date);
          const unverified = rows.some(a => !a.dateVerified);
          return `<div class="day-head"><span>${num(date)}</span>
            <span>${rows.length ? `<span class="badge">${num(rows.length)} نشاط</span>` : ''}
              ${unverified ? '<span class="badge badge-review">تاريخ غير مؤكد</span>' : ''}</span></div>
          <table><tbody>${rows.map(activity => `<tr>
            <td style="width:150px">${esc(placeName(activity.station))}
              <div class="badges"><span class="badge">${esc(activity.sourceId)}</span>
                <span class="badge">صفوف ${num(activity.sourceRows)}</span></div></td>
            <td><p class="row-action" dir="ltr" style="text-align:right">${esc(activity.description)}</p>
              ${activity.findings.length ? `<p class="note-line">${activity.findings.map(esc).join(' ')}</p>` : ''}</td>
            <td style="width:190px"><span class="row-owner">${esc(activity.staff.join(' · '))}</span></td>
            <td style="width:130px">${activity.order ? num(activity.order) : '<span class="badge">بلا رقم</span>'}</td>
            <td style="width:110px"><span class="badge">${esc(activity.finalStatus)}</span></td>
          </tr>`).join('')}</tbody></table>`;
        }).join('')}
      </section>`;
  }

  // ---------------------------------------------------------------- المحطات
  function renderStations() {
    const card = (place) => {
      const view = M.stationView(data, place.id);
      return `<div class="card">
        <h4>${esc(place.name)}</h4><span class="card-id">${esc(place.id)}</span>
        <div class="card-stats">
          <span><b>${num(view.followups.length)}</b>متابعة</span>
          <span><b>${num(view.daily.length)}</b>نشاط</span>
          <span><b>${num(view.orders.length)}</b>أمر عمل</span>
        </div>
        ${view.sharedOrders.length ? `<div class="badges"><span class="badge badge-conflict">
          ${num(view.sharedOrders.length)} أمر مشترك مع موقع آخر</span></div>` : ''}
        <div class="badges"><span class="badge badge-review">الجاهزية غير موثقة</span></div>
      </div>`;
    };

    el('view-stations').innerHTML = `
      <h2>المحطات والمواقع</h2>
      <p class="lead">${num(data.stations.length)} محطة، و${num(data.locations.length)} موقعاً وجهة أخرى فُصلت عنها.
        الجاهزية غير موثقة لأي منها، فلا تُعرض كمعلومة.</p>
      <section class="panel" style="margin-bottom:18px">
        <div class="panel-head"><div><h3>المحطات <span class="tab-count">${num(data.stations.length)}</span></h3></div></div>
        <div class="cards">${data.stations.map(card).join('')}</div>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h3>مواقع وجهات أخرى <span class="tab-count">${num(data.locations.length)}</span></h3>
          <p>ورش ومساندة أقسام ومواقع غير محددة. ليست محطات، ولا تدخل في تعداد المحطات.</p></div></div>
        <div class="cards">${data.locations.map(card).join('')}</div>
      </section>`;
  }

  // ------------------------------------------------------------- كتب تراسل
  function renderLetters() {
    el('view-letters').innerHTML = `
      <h2>كتب تراسل</h2>
      <p class="lead">كتابان موثقان فقط. إغلاق الكتاب لا يغيّر حالة العمل أو طلب الشراء، والرد يُسجَّل كتاباً آخر.</p>
      <section class="panel">
        <div class="cards">${data.letters.map(letter => {
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
            <p class="note-line">${esc(letter.notes)}</p>
          </div>`;
        }).join('')}</div>
      </section>`;
  }

  // --------------------------------------------------------- مراجعة البيانات
  function renderReview() {
    el('view-review').innerHTML = `
      <h2>مراجعة البيانات</h2>
      <p class="lead">شاشة مراجعة إدارية، لا عبء يومي على الفني. لم يُغلق من الملاحظات شيء بعد.</p>
      <section class="panel">
        <div class="cards">${data.issues.map(issue => `
          <div class="card issue-card ${issue.severity === 'high' ? 'issue-high' : ''}" style="grid-column:span 2">
            <h4>${esc(issue.title)}</h4>
            <span class="card-id">${esc(issue.id)}</span>
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
      </section>`;
  }

  // ------------------------------------------------------------------ التنقل
  const views = {
    dashboard: renderDashboard, followups: renderFollowups, orders: renderOrders,
    unlinked: renderUnlinked, daily: renderDaily, stations: renderStations,
    letters: renderLetters, review: renderReview
  };
  let rendered = new Set();

  function show(name) {
    for (const key of Object.keys(views)) {
      el('view-' + key).hidden = key !== name;
      document.querySelector(`[data-view="${key}"]`).setAttribute('aria-selected', String(key === name));
    }
    if (!rendered.has(name)) { views[name](); rendered.add(name); }
  }

  document.querySelectorAll('[data-view]').forEach(button =>
    button.addEventListener('click', () => show(button.dataset.view)));

  el('build-date').textContent = data.meta.buildDate;
  el('latest-daily').textContent = data.meta.latestDailyDate;
  el('banner-counts').textContent =
    `${data.meta.coverage.needsReview} من ${data.meta.coverage.followups}`;
  show('dashboard');
})();
