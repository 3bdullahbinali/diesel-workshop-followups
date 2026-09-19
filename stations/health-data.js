'use strict';
/**
 * مرجع أسطول المحطات — منقول من عرض «قسم تشغيل المحطات الخارجية و الشبكات».
 *
 * هذا الملف مرجع ثابت، لا سجل تشغيلي. كل رقم فيه مصدره العرض وحده، ولا يُشتق
 * منه شيء لم يُذكر صراحة. ما لم يذكره العرض قيمته null لا صفر: الصفر ادعاء،
 * وnull اعتراف بأن البيانات لم تصل بعد.
 *
 * المضخات والخطوط تحديداً فارغة عمداً حتى تُزوَّد. لا يُملأ فراغها بتقدير.
 */
(function (root) {

  /** حقائق القسم كما وردت في العرض، بأرقام صفحاته للمراجعة. */
  const department = {
    name: 'قسم تشغيل المحطات الخارجية و الشبكات',
    parent: 'إدارة الصرف الصحي — بلدية مدينة الشارقة',
    head: 'عبدالله صالح',
    staff: 135,
    source: 'عرض القسم — م. أحمد الصالح',
    divisions: [
      { id: 'stations', name: 'شعبة تشغيل المحطات الخارجية والشبكات', page: 6,
        duty: 'تشغيل محطات الرفع ونقل مياه الصرف والأمطار من أحواض التجميع إلى محطة المعالجة أو البحر.',
        tasks: ['تنظيف شبكات مياه الأمطار والصرف الصحي', 'فتح الانسدادات في الخطوط',
          'مراقبة المحطات وكفاءة تشغيلها', 'تنظيف أحواض التجميع'] },
      { id: 'cctv', name: 'شعبة المسح التلفزيوني', page: 13,
        duty: 'مسح الخطوط والشبكات وتقييم هيكلها، وتبطين الخطوط المتضررة، وعزل التدفق بصمامات هوائية.',
        tasks: ['المسح التلفزيوني للخطوط', 'تبطين الخطوط المكسورة أو المصدوعة',
          'عزل التدفق بصمامات هوائية'] },
      { id: 'university', name: 'شعبة المدينة الجامعية', page: 17,
        duty: 'تسيير محطات الصرف في جامعة الشارقة والجامعة الأمريكية، وتعمل بنظام السحب الفراغي.',
        tasks: ['تشغيل نظام السحب الفراغي', 'مراقبة الصمامات', 'متابعة غرف التفتيش'] }
    ]
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

  /**
   * حالات المضخة وحالات الخط — القوائم المسموح بها حين تصل البيانات.
   * القيمة خارج القائمة تُرفض ولا تُخمَّن، كما في بقية الموقع.
   */
  const pumpStates = {
    running:   { name: 'تعمل',            tone: 'ok'   },
    standby:   { name: 'احتياط جاهز',     tone: 'ok'   },
    stopped:   { name: 'متوقفة',          tone: 'high' },
    service:   { name: 'تحت الصيانة',     tone: 'warn' },
    needs_fix: { name: 'تحتاج صيانة',     tone: 'warn' },
    write_off: { name: 'مرشحة للشطب',     tone: 'high' }
  };

  const lineStates = {
    clear:     { name: 'سالك',            tone: 'ok'   },
    watch:     { name: 'تحت المراقبة',    tone: 'warn' },
    partial:   { name: 'انسداد جزئي',     tone: 'warn' },
    blocked:   { name: 'مسدود',           tone: 'high' },
    lined:     { name: 'مُبطَّن',          tone: 'ok'   },
    damaged:   { name: 'متضرر',           tone: 'high' }
  };

  /**
   * سجل المضخات والخطوط. يبدأ فارغاً بالكامل.
   *
   * حين تصل بياناتك ضع هنا صفوفاً بهذا الشكل بالضبط:
   *   pumps: [{ stationId:'PS-01', tag:'P-1', make:null, model:null, kw:null,
   *             state:'running', lastService:null, notes:null }]
   *   lines: [{ stationId:'PS-01', tag:'L-1', diameterMm:null,
   *             lengthM:null, material:null, state:'clear', lastSurvey:null, notes:null }]
   *
   * الحقل المجهول يبقى null. القارئ يعرض «لم تُزوَّد» ولا يحسبها صفراً.
   */
  const pumps = [];
  const lines = [];

  root.STATIONS_HEALTH_REF = {
    department, fleet, mainStations, componentKinds, vacuumSystem,
    pumpStates, lineStates, pumps, lines
  };
})(window);
