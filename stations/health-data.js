'use strict';
/**
 * مرجع أسطول المحطات — منقول من عرض «قسم تشغيل المحطات الخارجية و الشبكات».
 *
 * هذا الملف مرجع ثابت، لا سجل تشغيلي. كل رقم فيه مصدره العرض وحده، ولا يُشتق
 * منه شيء لم يُذكر صراحة. ما لم يذكره العرض قيمته null لا صفر: الصفر ادعاء،
 * وnull اعتراف بأن البيانات لم تصل بعد.
 *
 * المضخات والخطوط ليست هنا: مكانها ملف «صحة وأصول المحطات الخارجية» وتُقرأ
 * عبر الواجهة مثل بقية السجل. هذا الملف مفرداتها ومرجع الأسطول فقط.
 */
(function (root) {

  /** حقائق القسم كما وردت في العرض، بأرقام صفحاته للمراجعة. */
  const department = {
    name: 'فريق صيانة المحطات الخارجية',
    parent: 'إدارة الصرف الصحي — بلدية مدينة الشارقة',
    // أرقام الأسطول من عرض قسم التشغيل، وهو الجهة التي تُشغّل هذه المحطات.
    // الفريق يصونها، فالمحطات واحدة والجهتان مختلفتان.
    fleetSource: 'أرقام الأسطول من عرض قسم تشغيل المحطات الخارجية والشبكات',
    duty: 'صيانة محطات الرفع الخارجية وخطوطها ومضخاتها، ومتابعة أعمالها وطلبات شرائها وكتب تراسلها.',
  };

  /** الأسطول: 157 محطة رفع. التقسيم من صفحة 6 حرفياً. */
  const fleet = {
    total: 157,
    sewage: 87,
    storm: 70,
    main: 8,
    page: 6,
    note: 'مسؤولية شعبة تشغيل المحطات الخارجية والشبكات.'
  };

  /**
   * المحطات الرئيسية الثماني بأسمائها كما وردت.
   * linked: مطابقة مؤكدة لسجل المتابعات. proposed: مطابقة محتملة تنتظر تأكيدك.
   * ما عداهما لا سجل له في الموقع بعد — وهذا بذاته معلومة تستحق الظهور.
   */
  const mainStations = [
    { order: 1, name: 'محطة البطينة',    linked: 'PS-01',     proposed: null },
    { order: 2, name: 'محطة الصور',      linked: null,        proposed: 'PS-02' },
    { order: 3, name: 'محطة الصناعية 1', linked: null,        proposed: null },
    { order: 4, name: 'محطة النخيلات',   linked: null,        proposed: null },
    { order: 5, name: 'محطة الغبيبة',    linked: null,        proposed: null },
    { order: 6, name: 'محطة الممزر',     linked: null,        proposed: null },
    { order: 7, name: 'محطة الرمثاء',    linked: null,        proposed: null },
    { order: 8, name: 'محطة الدراري',    linked: 'DARARI-PS', proposed: 'GL013' }
  ];

  /** مكونات محطة الضخ — صفحة 9. تصنيف لا جرد: لا عدد لأي منها بعد. */
  const componentKinds = [
    { id: 'pump',       name: 'مضخات',            icon: 'M12 3v7m0 0 3-3m-3 3L9 7M5 13h14l-1.5 8h-11z' },
    { id: 'strainer',   name: 'مرشحات',           icon: 'M4 5h16l-6 7v7l-4-2v-5z' },
    { id: 'compressor', name: 'ضاغط',             icon: 'M5 8h10v8H5zM15 10h4v4h-4z' },
    { id: 'motor',      name: 'محركات',           icon: 'M6 9h9v6H6zM15 11h3v2h-3zM9 9V6m3 3V6' },
    { id: 'conveyor',   name: 'ناقلات (موصلات)',  icon: 'M4 14h16M7 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4m10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4' },
    { id: 'valve',      name: 'صمامات',           icon: 'M4 12h16M9 8l6 8M15 8l-6 8' },
    { id: 'air',        name: 'ضاغط هوائي',       icon: 'M12 4a4 4 0 0 1 0 8H4m8 8a3 3 0 0 0 0-6H6' }
  ];

  /**
   * نظام السحب الفراغي — المدينة الجامعية، صفحة 19.
   * العرض يرقّم المحطات 1..4 بلا أسماء، وسجل الموقع فيه VACUUM-02/03/04.
   * التطابق بالترقيم وحده ليس دليلاً، فيبقى مقترحاً لا مؤكداً.
   */
  const vacuumSystem = {
    page: 19,
    chambers: 710,
    description: 'نقل المياه بالمحافظة على فراغ جزئي داخل شبكة الأنابيب وتجميعها في خزان التفريغ،'
      + ' وفتح الصمامات وإغلاقها تلقائياً دون إنفاق طاقة ضخ كبيرة.',
    parts: ['محطة ضخ السحب الفراغي', 'خطوط السحب الفراغي الرئيسية',
      'نظام مراقبة تشغيل الصمامات', 'غرفة السحب الفراغي'],
    stations: [
      { order: 1, capacityLps: 50, builtYear: 1997, proposed: null },
      { order: 2, capacityLps: 50, builtYear: 1997, proposed: 'VACUUM-02' },
      { order: 3, capacityLps: 50, builtYear: 1998, proposed: 'VACUUM-03' },
      { order: 4, capacityLps: 75, builtYear: 1998, proposed: 'VACUUM-04' }
    ]
  };

  /* ————————————————————————— مفردات سجل الأصول —————————————————————————
     القيم تأتي من الشيت كما كُتبت. المعروفة تُسمّى بالعربية ويُعطى لها لون،
     وغير المعروفة تُعرض خاماً وتُعدّ في قائمة «قيم غير معرّفة» بدل أن تُحذف أو
     تُخمَّن — فالسجل ينمو، ومفردة جديدة يجب أن تَظهر لا أن تَختفي.

     unknown ليست حالة سيئة: هي إقرار بأن الحقل لم يُثبت بعد، وهي الصادقة ما
     دام لا دليل. الخطر أن تُعرض كـ«سليمة». */
  const VOCAB = {
    basis: {
      numbered_reference:   { name: 'مرجع مرقّم',           tone: 'calm' },
      serial_identified:    { name: 'معرّفة بالسيريال',      tone: 'calm' },
      unnumbered_reference: { name: 'مرجع بلا رقم',         tone: 'warn' }
    },
    inventory: {
      verified:           { name: 'مثبتة',          tone: 'ok'   },
      needs_verification: { name: 'تحتاج تحققاً',    tone: 'warn' }
    },
    installation: {
      installed: { name: 'مركّبة',            tone: 'ok'   },
      spare:     { name: 'احتياط بالمستودع',  tone: 'calm' },
      removed:   { name: 'مرفوعة',            tone: 'warn' },
      unknown:   { name: 'غير مثبت',          tone: 'none' }
    },
    operating: {
      running:  { name: 'تعمل',        tone: 'ok'   },
      standby:  { name: 'احتياط',      tone: 'ok'   },
      stopped:  { name: 'متوقفة',      tone: 'high' },
      unknown:  { name: 'غير مثبت',    tone: 'none' }
    },
    health: {
      healthy:            { name: 'سليمة',         tone: 'ok'   },
      needs_maintenance:  { name: 'تحتاج صيانة',   tone: 'warn' },
      under_maintenance:  { name: 'تحت الصيانة',   tone: 'warn' },
      faulty:             { name: 'معطّلة',         tone: 'high' },
      write_off:          { name: 'مرشحة للشطب',   tone: 'high' },
      unknown:            { name: 'غير مثبت',      tone: 'none' }
    },
    duty: {
      duty:    { name: 'تشغيل',    tone: 'ok'   },
      standby: { name: 'احتياط',   tone: 'calm' },
      unknown: { name: 'غير مثبت', tone: 'none' }
    },
    flowState: {
      flowing: { name: 'سريان طبيعي', tone: 'ok'   },
      partial: { name: 'سريان جزئي',  tone: 'warn' },
      blocked: { name: 'مسدود',       tone: 'high' },
      isolated:{ name: 'معزول',       tone: 'calm' },
      unknown: { name: 'غير مثبت',    tone: 'none' }
    },
    service: {
      sewage:       { name: 'صرف صحي',        tone: 'calm' },
      storm:        { name: 'مياه أمطار',     tone: 'calm' },
      TSE:          { name: 'مياه معالجة',    tone: 'calm' },
      vacuum_system:{ name: 'سحب فراغي',      tone: 'calm' },
      unknown:      { name: 'غير مثبت',       tone: 'none' }
    },
    role: {
      discharge: { name: 'خط طرد',    tone: 'calm' },
      suction:   { name: 'خط سحب',    tone: 'calm' },
      transfer:  { name: 'خط نقل',    tone: 'calm' },
      filling:   { name: 'خط تعبئة',  tone: 'calm' },
      bypass:    { name: 'خط تجاوز',  tone: 'calm' },
      gravity:   { name: 'خط انسيابي', tone: 'calm' }
    },
    directionBasis: {
      design_reference: { name: 'من مرجع تصميمي', tone: 'calm' },
      field_verified:   { name: 'محقَّق ميدانياً',  tone: 'ok'   },
      unknown:          { name: 'غير مثبت',       tone: 'none' }
    },
    routeVerification: {
      not_provided:  { name: 'المسار غير مزوَّد', tone: 'none' },
      surveyed:      { name: 'ممسوح',            tone: 'ok'   },
      approximate:   { name: 'تقريبي',           tone: 'warn' }
    },
    referenceType: {
      station_or_site: { name: 'محطة أو موقع',  tone: 'calm' },
      network_site:    { name: 'موقع شبكة',     tone: 'calm' },
      support:         { name: 'موقع مساندة',   tone: 'calm' },
      unassigned:      { name: 'غير محدد',      tone: 'none' }
    }
  };

  /** يسمّي القيمة إن عرفها، ويعرضها خاماً إن لم يعرفها — ولا يحذفها أبداً. */
  function label(group, value) {
    if (value == null || value === '') return { name: 'لم يُزوَّد', tone: 'none', known: true, empty: true };
    const found = VOCAB[group] && VOCAB[group][value];
    if (found) return { ...found, known: true, empty: false };
    return { name: String(value), tone: 'warn', known: false, empty: false };
  }

  root.STATIONS_HEALTH_REF = { department, fleet, mainStations, componentKinds, vacuumSystem, VOCAB, label };
})(window);
