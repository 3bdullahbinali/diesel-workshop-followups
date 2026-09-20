'use strict';
/**
 * اشتقاق صحة المحطات.
 *
 * قاعدة حاكمة: هذه الصفحة تعرض **صحة السجل** لا صحة المعدة. المحطة التي لا
 * متابعة مفتوحة عليها ليست «سليمة» — هي محطة لا نعلم عنها شيئاً. الخلط بين
 * «لا يوجد بلاغ» و«لا يوجد عطل» هو الخطأ الذي يجعل لوحات الحالة تكذب.
 *
 * لذلك لكل محطة حالتان منفصلتان لا تُدمجان:
 *   evidence — ما يقوله سجل المتابعات، ومصدره موجود.
 *   assets   — ما تقوله المضخات والخطوط، ولا يزال فارغاً حتى تُزوَّد.
 */
(function (root) {

  const ref = () => root.STATIONS_HEALTH_REF || {};
  const model = () => root.StationsModel;

  /** حالة الدليل: مشتقة من المتابعات وحدها، ومعلَّمة بذلك صراحة. */
  const EVIDENCE = {
    stalled: { id: 'stalled', name: 'إفادة متوقفة', tone: 'high',
      note: 'متابعة مفتوحة مضى على آخر إفادة فيها أكثر من ثلاثة أسابيع.' },
    watch:   { id: 'watch',   name: 'تحتاج متابعة', tone: 'warn',
      note: 'متابعة مفتوحة مضى على آخر إفادة فيها أكثر من أسبوع.' },
    active:  { id: 'active',  name: 'متابعة حديثة', tone: 'ok',
      note: 'متابعة مفتوحة وإفادتها خلال أسبوع.' },
    closed:  { id: 'closed',  name: 'لا متابعة مفتوحة', tone: 'calm',
      note: 'كل متابعات هذه المحطة مغلقة. لا يعني ذلك سلامة المعدات.' },
    none:    { id: 'none',    name: 'بلا سجل متابعة', tone: 'none',
      note: 'لم تَرِد هذه المحطة في أي متابعة. غياب البلاغ ليس دليل سلامة.' }
  };

  /** حالة الأصول: ثلاث حالات فقط ما دامت البيانات لم تصل. */
  const ASSETS = {
    supplied:  { id: 'supplied',  name: 'مزوَّدة',     tone: 'ok'   },
    partial:   { id: 'partial',   name: 'ناقصة',      tone: 'warn' },
    missing:   { id: 'missing',   name: 'لم تُزوَّد',  tone: 'none' }
  };

  function evidenceOf(view, asOf) {
    const open = view.followups.filter(f => !f.closed);
    if (!view.followups.length) return { state: EVIDENCE.none, open: [], oldestAge: null };
    if (!open.length) return { state: EVIDENCE.closed, open: [], oldestAge: null };
    const ages = open.map(f => model().ageDays(f, asOf)).filter(n => n != null);
    const oldest = ages.length ? Math.max(...ages) : null;
    const state = oldest == null ? EVIDENCE.watch
      : oldest > 21 ? EVIDENCE.stalled
      : oldest > 7 ? EVIDENCE.watch
      : EVIDENCE.active;
    return { state, open, oldestAge: oldest };
  }

  /**
   * الأصول تُقرأ من ملف الأصول عبر الواجهة، لا من ملف ثابت.
   * «مزوَّدة» هنا تعني أن صفوفاً وُجدت، لا أن حالتها مثبتة: صف كل حقوله unknown
   * سجلٌ موجود ومجهول، والتمييز بينهما هو ما يمنع اللوحة من الكذب.
   */
  function assetsOf(data, stationId) {
    const pumps = (data.pumps || []).filter(p => p.stationId === stationId);
    const lines = (data.assetLines || []).filter(l => l.stationId === stationId);
    const card = (data.assetStations || []).find(a => a.id === stationId) || null;
    const verified = pumps.filter(p => p.inventory === 'verified').length;
    const state = pumps.length && lines.length ? ASSETS.supplied
      : pumps.length || lines.length ? ASSETS.partial
      : ASSETS.missing;
    return { pumps, lines, card, verifiedPumps: verified, state };
  }

  /** آخر يوم عمل مسجَّل في المحطة — من السجل اليومي لا من المتابعة. */
  function lastActivity(view) {
    const dates = view.daily.map(a => a.date).filter(Boolean).sort();
    return dates.length ? dates[dates.length - 1] : null;
  }

  function stationHealth(data, place, asOf) {
    const view = model().stationView(data, place.id);
    const evidence = evidenceOf(view, asOf);
    const assets = assetsOf(data, place.id);
    const r = ref();
    const main = (r.mainStations || []).find(m => m.linked === place.id || m.proposed === place.id);
    const vac = (r.vacuumSystem?.stations || []).find(v => v.proposed === place.id);
    return {
      id: place.id,
      name: place.name,
      locationOnly: Boolean(place.locationOnly),
      tier: main ? (main.linked === place.id ? 'main' : 'main_proposed') : null,
      mainName: main ? main.name : null,
      capacityLps: vac ? vac.capacityLps : null,
      builtYear: vac ? vac.builtYear : null,
      card: assets.card,
      vacuum: Boolean(vac),
      vacuumProposed: Boolean(vac && vac.proposed === place.id),
      evidence, assets,
      followups: view.followups,
      openCount: evidence.open.length,
      closedCount: view.followups.filter(f => f.closed).length,
      orders: view.orders,
      daily: view.daily,
      lastActivity: lastActivity(view),
      letters: view.letters
    };
  }

  /**
   * التغطية: الفجوة بين ما يقوله العرض (157 محطة) وما يعرفه الموقع.
   * هذا الرقم هو رسالة الصفحة الحقيقية، لا عدّاد الحالات الملوّنة.
   */
  function coverage(rows, data) {
    const r = ref();
    const total = r.fleet?.total ?? null;
    // التغطية تقارن المحطات بالمحطات: إدخال المواقع المساندة فيها يضخّم النسبة.
    const tracked = rows.filter(s => !s.locationOnly).length;
    return {
      total,
      tracked,
      untracked: total == null ? null : Math.max(0, total - tracked),
      trackedPercent: total ? Math.round((tracked / total) * 100) : null,
      sewage: r.fleet?.sewage ?? null,
      storm: r.fleet?.storm ?? null,
      main: r.fleet?.main ?? null,
      mainLinked: (r.mainStations || []).filter(m => m.linked).length,
      mainProposed: (r.mainStations || []).filter(m => !m.linked && m.proposed).length,
      mainUnknown: (r.mainStations || []).filter(m => !m.linked && !m.proposed).length,
      withPumps: rows.filter(s => s.assets.pumps.length).length,
      withLines: rows.filter(s => s.assets.lines.length).length,
      pumpRows: rows.reduce((n, s) => n + s.assets.pumps.length, 0),
      lineRows: rows.reduce((n, s) => n + s.assets.lines.length, 0),
      // الفرق بين «سُجِّلت» و«ثُبِّتت» هو رسالة الشاشة كلها.
      verifiedPumps: rows.reduce((n, s) => n + s.assets.verifiedPumps, 0),
      unknownHealth: rows.reduce((n, s) =>
        n + s.assets.pumps.filter(p => !p.health || p.health === 'unknown').length, 0)
    };
  }

  function byEvidence(rows) {
    const out = {};
    for (const key of Object.keys(EVIDENCE)) out[key] = 0;
    for (const s of rows) out[s.evidence.state.id] += 1;
    return out;
  }

  /** ترتيب افتراضي: ما يحتاج نظراً أولاً، ثم الأقدم إفادةً. */
  const RANK = { stalled: 0, watch: 1, active: 2, none: 3, closed: 4 };
  function build(data, asOf) {
    // المواقع المساندة تدخل: أصل مربوط بـIND-03 أو بورشة الفريق أصلٌ قائم،
    // وإسقاطه لأنه ليس «محطة» يُخفي سجلاً موجوداً. يُعلَّم ولا يُحذف، ويبقى
    // خارج نسبة التغطية لأن الأسطول 157 محطة لا مواقع.
    const places = [
      ...(data.stations || []).map(p => ({ ...p, locationOnly: false })),
      ...(data.locations || []).map(p => ({ ...p, locationOnly: true }))
    ];
    const rows = places.map(p => stationHealth(data, p, asOf));
    rows.sort((a, b) => {
      const d = RANK[a.evidence.state.id] - RANK[b.evidence.state.id];
      if (d) return d;
      return (b.evidence.oldestAge ?? -1) - (a.evidence.oldestAge ?? -1);
    });
    return { rows, coverage: coverage(rows, data), byEvidence: byEvidence(rows), ref: ref() };
  }

  root.StationsHealthModel = { build, EVIDENCE, ASSETS, stationHealth, coverage };
})(globalThis);
