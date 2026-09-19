'use strict';
(function (root) {
  // طبقة اشتقاق للعرض فقط. لا تكتب في البيانات ولا تغيّر نص المصدر.

  const DAY = 86400000;
  // عتبات عمر آخر إفادة. الحد الأعلى مأخوذ من دورة المتابعة الأسبوعية للفريق.
  const BANDS = [
    { id: 'fresh', limit: 7, label: 'محدّثة', note: 'آخر إفادة خلال أسبوع.' },
    { id: 'watch', limit: 21, label: 'تحتاج متابعة', note: 'مضى أكثر من أسبوع بلا إفادة.' },
    { id: 'stalled', limit: Infinity, label: 'متوقفة', note: 'مضى أكثر من ثلاثة أسابيع بلا إفادة.' }
  ];

  // الحالات التي يكون فيها الإجراء التالي على الفريق نفسه.
  const OURS = ['in_progress', 'awaiting_evidence', 'needs_data'];

  const labels = (data, group) =>
    Object.fromEntries((data.enums[group] || []).map(entry => [entry.id, entry.label]));

  function today() {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function ageDays(followup, asOf) {
    if (!followup.evidenceDate) return null;
    const from = Date.parse(followup.evidenceDate);
    const to = Date.parse(asOf || today());
    if (Number.isNaN(from) || Number.isNaN(to)) return null;
    return Math.max(0, Math.round((to - from) / DAY));
  }

  function band(followup, asOf) {
    const age = ageDays(followup, asOf);
    if (age === null) return null;
    return BANDS.find(entry => age <= entry.limit);
  }

  // الإجراء علينا: لا ننتظر رد جهة أخرى.
  const isOurs = followup =>
    !followup.closed && (followup.waitingOn === 'internal' || OURS.includes(followup.state));

  function counts(list, key) {
    const out = new Map();
    for (const entry of list) out.set(entry[key], (out.get(entry[key]) || 0) + 1);
    return out;
  }

  /**
   * مؤشرات اللوحة. العدد الإجمالي ليس مؤشراً تشغيلياً هنا:
   * المؤشر هو عمر آخر إفادة ونسبة ما هو مثبّت.
   */
  function dashboard(data, asOf) {
    const open = data.followups.filter(f => !f.closed);
    const aged = open
      .map(f => ({ followup: f, age: ageDays(f, asOf), band: band(f, asOf) }))
      .filter(entry => entry.age !== null)
      .sort((a, b) => b.age - a.age);

    return {
      open: open.length,
      closed: data.followups.length - open.length,
      confirmed: open.filter(f => !f.needsReview).length,
      needsReview: open.filter(f => f.needsReview).length,
      ours: open.filter(isOurs).length,
      awaitingOthers: open.filter(f => !isOurs(f)).length,
      withDueDate: open.filter(f => f.dueDate).length,
      stalled: aged.filter(entry => entry.band.id === 'stalled').length,
      oldest: aged.slice(0, 5),
      medianAge: aged.length ? aged[Math.floor(aged.length / 2)].age : null,
      byState: counts(open, 'state'),
      byWaitingOn: counts(open, 'waitingOn'),
      byKind: counts(open, 'kind'),
      unlinkedWork: data.orphanActivities.filter(o => o.category === 'unlinked_work').length,
      routineUnlinked: data.orphanActivities.filter(o => o.category === 'routine_pm').length,
      conflictingOrders: data.workOrders.filter(w => w.multiStation).length,
      openIssues: data.issues.filter(i => !i.resolved).length
    };
  }

  function index(data) {
    return {
      followups: new Map(data.followups.map(f => [f.id, f])),
      daily: new Map(data.daily.map(a => [a.id, a])),
      orders: new Map(data.workOrders.map(w => [w.number, w])),
      places: new Map([...data.stations, ...data.locations].map(p => [p.id, p])),
      sources: new Map(data.sources.map(s => [s.id, s]))
    };
  }

  // كل ما يخص محطة واحدة: متابعاتها، أنشطتها، وأوامر العمل التي تمسها.
  function stationView(data, stationId) {
    const followups = data.followups.filter(f => f.stationId === stationId);
    const daily = data.daily.filter(a => a.station === stationId);
    const orders = data.workOrders.filter(w => w.stations.includes(stationId));
    return {
      place: [...data.stations, ...data.locations].find(p => p.id === stationId) || null,
      followups,
      daily,
      orders,
      sharedOrders: orders.filter(w => w.multiStation),
      letters: data.letters.filter(l => followups.some(f => f.id === l.linkedId))
    };
  }

  // الكتب المرتبطة بمتابعة. إغلاق الكتاب لا يغيّر حالة المتابعة.
  const lettersFor = (data, followupId) =>
    data.letters.filter(l => l.linkedId === followupId);

  function sourcesFor(data, record) {
    const map = index(data).sources;
    return (record.sourceIds || []).map(id => map.get(id)).filter(Boolean);
  }

  root.StationsModel = {
    BANDS, ageDays, band, isOurs, dashboard, index, stationView,
    lettersFor, sourcesFor, labels, today
  };
})(globalThis);
