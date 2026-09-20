'use strict';
/**
 * «مدار» — العرض التلقائي لجاهزية المضخات على شاشة الجدار.
 *
 * نقطة واحدة لكل معدة حقيقية، تُعيد ترتيب نفسها بين المشاهد ولا تُستبدل؛
 * والمحرّك المشترك يضمن ألا تختفي واحدة. وما دام في السجل صف لم يتحقق منه
 * أحد يبقى ذلك مكتوباً في كل مشهد، فالعرض على جدار لا يُغري بقراءة أرقام
 * لم يراجعها أحد.
 */
(() => {
  const M = window.WorkshopReadinessModel;
  const D = window.WorkshopDisplay;

  const TONE = {
    ready:      '#7fd8a4',
    running:    '#8ad7d9',
    maintenance:'#e6b566',
    inspection: '#9fb0c4',
    retire:     '#c98f86',
    unknown:    '#6f7f78'
  };
  const toneOf = unit =>
    !unit.technical ? 'unknown' :
    unit.technical === 'ready' ? (unit.operation === 'running' ? 'running' : 'ready') :
    unit.technical === 'write_off' ? 'retire' :
    unit.technical === 'needs_inspection' ? 'inspection' : 'maintenance';

  /**
   * مقطع عرضي متحرك لمجموعة الديزل: محرّك يدور فيُدير مضخة.
   *
   * على نسق الرسوم الفنية المقطوعة: أشكال مسطّحة بألوان دالّة، لا رِندر
   * واقعي. وكل جزء يتحرك بحركته الحقيقية — الكرنك يدور فيرفع المكبس،
   * والتروس تتعشّق في اتجاهين متضادين، والنابض ينضغط مع المكبس، والدوّار
   * يدفع الماء من السحب إلى الطرد.
   *
   * ولا يتحرك شيء إلا لمعدة حالتها «جاهزة» وتشغيلها «تعمل». المعدة المتوقفة
   * تُرسم ساكنة: الرسم يخبر بحالها لا يزيّنها.
   */
  const PART = {
    case:'#2b3f52', caseIn:'#1d2c3c', caseEdge:'#4b6a86',
    gear:'#c08f4e', gearDark:'#8d6636', shaft:'#d3b45f',
    spring:'#5cb87a', piston:'#3f6fd0', pistonDark:'#2a4e96',
    arrow:'#55d0e0', water:'#4fa8d8', vane:'#86a2b6'
  };

  /**
   * ترس بأسنان متماثلة ومقاس وحدة (module) صحيح، حتى يتعشّق ترسان
   * رُسما بالمقاس نفسه تعشّقاً حقيقياً: قمة سنّ أحدهما تنزل في قاع الآخر
   * ولا تتداخل معه.
   */
  function gear(ctx, x, y, r, teeth, angle, fill, dark){
    const P = Math.PI*2/teeth, m = 2*r/teeth, R = r + m, rr = r - 1.25*m;
    const at = (a, rad) => ctx.lineTo(Math.cos(a)*rad, Math.sin(a)*rad);
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.fillStyle = fill; ctx.beginPath();
    for (let i = 0; i < teeth; i++){
      const c = i*P;
      at(c - 0.33*P, rr); at(c - 0.25*P, r);  at(c - 0.15*P, R);
      at(c + 0.15*P, R);  at(c + 0.25*P, r);  at(c + 0.33*P, rr);
      at(c + 0.67*P, rr);
    }
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r*0.60, 0, Math.PI*2);
    ctx.fillStyle = dark; ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, r*0.05);
    for (let i = 0; i < 4; i++){
      const a = (i/4)*Math.PI*2;
      ctx.beginPath(); ctx.moveTo(Math.cos(a)*r*0.26, Math.sin(a)*r*0.26);
      ctx.lineTo(Math.cos(a)*r*0.52, Math.sin(a)*r*0.52); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 0, r*0.17, 0, Math.PI*2);
    ctx.fillStyle = PART.shaft; ctx.fill();
    ctx.restore();
  }

  function spring(ctx, x, top, len, width, coils, colour, lw){
    ctx.save(); ctx.strokeStyle = colour; ctx.lineWidth = lw || 3.4;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, top);
    for (let i = 0; i <= coils; i++)
      ctx.lineTo(x + (i%2 ? width/2 : -width/2), top + len*((i + .5)/(coils + 1)));
    ctx.lineTo(x, top + len); ctx.stroke(); ctx.restore();
  }

  function arrow(ctx, x, y, size, angle, colour, alpha){
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = colour; ctx.beginPath();
    ctx.moveTo(size, 0); ctx.lineTo(-size*0.55, size*0.62);
    ctx.lineTo(-size*0.2, 0); ctx.lineTo(-size*0.55, -size*0.62);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  /** نداءات الأجزاء: اسم الجزء وعمله، واحداً بعد واحد، وخيط يصل الاسم بموضعه. */
  const CALLOUTS = [
    {name:'المكبس والكرنك', note:'الاحتراق يدفع المكبس فيدير عمود المرفق', x:260, y:330},
    {name:'الصمّام ونابضه', note:'يفتح مع الشوط النازل ويعيده النابض', x:260, y:196},
    {name:'قطار التروس',   note:'ينقل الدوران من المحرّك إلى عمود المضخة', x:308, y:540},
    {name:'الدوّار والحلزون', note:'الريش تدفع الماء إلى مخرج الطرد', x:800, y:456},
    {name:'السحب والطرد',  note:'يدخل الماء من الجانب ويخرج من الأعلى', x:800, y:320}
  ];
  const CALLOUT_MS = 1800;

  function drawSection(ctx, w, h, now, unit, reduced, since, TONE, toneOf){
    const k = Math.min(w/1180, h/700);
    const running = !!unit && unit.technical === 'ready' && unit.operation === 'running';
    const live = running && !reduced;
    const t = live ? now/1000 : 0;             // ساكنة إن لم تكن تعمل فعلاً
    const a = t*2.0;                           // زاوية عمود المرفق

    ctx.save(); ctx.translate(w/2, h/2); ctx.scale(k, k); ctx.translate(-540, -320);
    ctx.lineJoin = 'round';

    // ── الغلاف المقطوع ──────────────────────────────────────────────────────
    ctx.fillStyle = PART.case;
    ctx.beginPath(); ctx.roundRect(40, 40, 1000, 560, 26); ctx.fill();
    ctx.strokeStyle = PART.caseEdge; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = PART.caseIn;
    ctx.beginPath(); ctx.roundRect(64, 64, 952, 512, 18); ctx.fill();

    // ── الحركة: مرفق يرفع مكبساً، وذراع صلب لا يتمطّط ──────────────────────
    const cx = 260, cy = 500, crankR = 40, rodLen = 174, pistonH = 58;
    const pinX = cx + Math.sin(a)*crankR;
    const pinY = cy - Math.cos(a)*crankR;
    const pistonY = pinY - Math.sqrt(rodLen*rodLen - (pinX - cx)*(pinX - cx)) - pistonH/2;
    const lift = Math.max(0, Math.sin(a))*18;  // الصمّام يفتح مع الشوط النازل

    // ترس العمود ثم قرص المرفق ثم الذراع ثم المسمار: بهذا الترتيب يبقى
    // الذراع ظاهراً واصلاً إلى مسماره لا مقطوعاً خلف القرص.
    // قطار التروس: مقاس سنّ واحد لكليهما، فيتعشّقان كما تتعشّق التروس.
    const g2x = 349.8, g2y = 456.2, ratio = 18/13;
    gear(ctx, cx, cy, 58, 18, a - 0.45379, PART.gear, PART.gearDark);
    gear(ctx, g2x, g2y, 41.89, 13, 0.0295 - a*ratio, PART.gear, PART.gearDark);
    ctx.fillStyle = PART.caseEdge;
    ctx.beginPath(); ctx.arc(cx, cy, 46, 0, Math.PI*2); ctx.fill();

    // الأسطوانة ورأسها
    ctx.fillStyle = PART.caseEdge;
    ctx.beginPath(); ctx.roundRect(196, 186, 128, 44, 8); ctx.fill();
    ctx.beginPath(); ctx.roundRect(196, 228, 128, 194, 10); ctx.fill();
    ctx.fillStyle = PART.caseIn;
    ctx.beginPath(); ctx.roundRect(208, 240, 104, 182, 6); ctx.fill();
    ctx.fillRect(244, 186, 32, 44);                                   // منفذ الصمّام

    // المكبس وذراعه
    ctx.strokeStyle = '#8fa6b8'; ctx.lineWidth = 16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, pistonY + pistonH/2); ctx.lineTo(pinX, pinY); ctx.stroke();
    ctx.fillStyle = PART.piston;
    ctx.beginPath(); ctx.roundRect(210, pistonY, 100, pistonH, 6); ctx.fill();
    ctx.fillStyle = PART.pistonDark;
    ctx.beginPath(); ctx.roundRect(210, pistonY + pistonH - 14, 100, 9, 3); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, pistonY + pistonH/2, 9, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = PART.shaft;
    ctx.beginPath(); ctx.arc(pinX, pinY, 12, 0, Math.PI*2); ctx.fill();

    // الصمّام: ساق تنزل فتفتح المنفذ، ونابض بين مقعد ثابت وصحن متحرك
    ctx.strokeStyle = '#8fa6b8'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(260, 96); ctx.lineTo(260, 236 + lift); ctx.stroke();
    spring(ctx, 260, 127 + lift, 49 - lift, 34, 6, PART.spring, 4);
    ctx.fillStyle = PART.caseEdge;
    ctx.beginPath(); ctx.roundRect(232, 176, 56, 10, 4); ctx.fill();        // المقعد الثابت
    ctx.fillStyle = '#8fa6b8';
    ctx.beginPath(); ctx.roundRect(238, 116 + lift, 44, 11, 4); ctx.fill(); // صحن النابض
    ctx.fillStyle = PART.spring; ctx.beginPath();                           // قرص الصمّام
    ctx.moveTo(237, 244 + lift); ctx.lineTo(283, 244 + lift);
    ctx.lineTo(274, 230 + lift); ctx.lineTo(246, 230 + lift);
    ctx.closePath(); ctx.fill();

    // ── عمود الإدارة: طوق حامل ثم وصلة مرنة ثم المضخة ──────────────────────
    ctx.strokeStyle = PART.shaft; ctx.lineWidth = 17; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(g2x, g2y); ctx.lineTo(790, 456); ctx.stroke();
    ctx.fillStyle = PART.caseEdge;
    ctx.beginPath(); ctx.roundRect(464, 434, 22, 44, 5); ctx.fill();        // طوق حامل
    ctx.beginPath(); ctx.roundRect(612, 424, 14, 64, 5); ctx.fill();        // شفّة الوصلة
    ctx.beginPath(); ctx.roundRect(634, 424, 14, 64, 5); ctx.fill();
    ctx.fillStyle = PART.gearDark;
    ctx.fillRect(626, 442, 8, 28);

    // ── جهة المضخة: حلزون يتّسع ممرّه حتى الطرد، ودوّار يدور مع الترس ────
    ctx.fillStyle = PART.caseEdge;
    ctx.beginPath(); ctx.roundRect(766, 250, 68, 130, 8); ctx.fill();       // الطرد
    ctx.beginPath(); ctx.roundRect(900, 420, 92, 72, 8); ctx.fill();        // السحب
    ctx.beginPath(); ctx.arc(800, 456, 100, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = PART.caseIn;
    ctx.beginPath(); ctx.arc(800, 456, 88, 0, Math.PI*2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(800, 456, 88, 0, Math.PI*2); ctx.clip();
    // ممر الماء: يبدأ ضيقاً عند اللسان ويتّسع مع الدوران حتى مخرج الطرد
    ctx.globalAlpha = .62; ctx.fillStyle = PART.water; ctx.beginPath();
    const TH0 = -1.745, SWEEP = 6.11, N = 96;   // اللسان قبل الطرد، والاتساع ينتهي عنده
    for (let i = 0; i <= N; i++){
      const f = i/N, th = TH0 - f*SWEEP, r = 72 + 16*f;
      const px = 800 + Math.cos(th)*r, py = 456 + Math.sin(th)*r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    for (let i = N; i >= 0; i--){
      const th = TH0 - (i/N)*SWEEP;
      ctx.lineTo(800 + Math.cos(th)*66, 456 + Math.sin(th)*66);
    }
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    // الدوّار على عمود الترس نفسه: يدور بدورانه واتجاهه
    ctx.translate(800, 456); ctx.rotate(-a*ratio);
    ctx.fillStyle = '#34506a';
    ctx.beginPath(); ctx.arc(0, 0, 64, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = PART.vane;
    for (let i = 0; i < 6; i++){
      ctx.save(); ctx.rotate((i/6)*Math.PI*2);
      ctx.beginPath();
      ctx.moveTo(19, 3); ctx.quadraticCurveTo(44, 20, 63, 16);
      ctx.quadraticCurveTo(46, 8, 21, -5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI*2); ctx.fillStyle = PART.shaft; ctx.fill();
    ctx.restore();

    // ── الماء يجري: من السحب إلى الحلزون إلى الطرد ─────────────────────────
    if (live){
      for (let i = 0; i < 5; i++){
        const p = ((t*0.5) + i/5) % 1;
        arrow(ctx, 984 - p*128, 456 + Math.sin(p*7)*6, 12, Math.PI, PART.water, .9);
      }
      for (let i = 0; i < 4; i++){
        const p = ((t*0.5) + i/4) % 1;
        arrow(ctx, 800, 350 - p*100, 12, -Math.PI/2, PART.water, .9);
      }
      arrow(ctx, cx, cy + 84, 15, 0, PART.arrow, .85);          // اتجاه دوران العمود
      arrow(ctx, g2x + 4, g2y - 62, 12, Math.PI, PART.arrow, .85);
    }

    // ── لوحة الحالة: لون المعدة نفسه المستعمل في بقية الشاشة ───────────────
    ctx.fillStyle = PART.caseEdge;
    ctx.beginPath(); ctx.roundRect(78, 452, 104, 96, 10); ctx.fill();
    ctx.fillStyle = TONE[toneOf(unit || {})];
    ctx.beginPath(); ctx.roundRect(90, 464, 80, 13, 6); ctx.fill();
    ctx.globalAlpha = .55; ctx.fillStyle = PART.caseIn;
    for (let i = 0; i < 3; i++){
      ctx.beginPath(); ctx.roundRect(90, 492 + i*16, 80 - i*22, 8, 4); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── نداء الجزء: اسمه وعمله، وخيط يصل الاسم بموضعه في المقطع ────────────
    // يُكبَّر الخط على الشاشات الصغيرة حتى يبقى مقروءاً، فإن ضاق المكان
    // اكتُفي بالاسم: سطر لا يُقرأ زينة لا فائدة فيها.
    ctx.textAlign = 'right'; ctx.direction = 'rtl';
    const idx = reduced ? 0 : Math.floor(since/CALLOUT_MS) % CALLOUTS.length;
    const local = reduced ? CALLOUT_MS/2 : since % CALLOUT_MS;
    const fade = reduced ? 1 : Math.min(1, local/260, (CALLOUT_MS - local)/260);
    if (fade > 0.01){
      const c = CALLOUTS[idx], tight = k < 0.62;
      const name = Math.max(31, 15/k), note = Math.max(19, 12/k);
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#e8c88a';
      ctx.font = `700 ${name}px "IBM Plex Sans Arabic", Tahoma, sans-serif`;
      ctx.fillText(c.name, tight ? 1000 : 726, tight ? 116 : 124);
      if (!tight){
        ctx.fillStyle = '#9fb7c6';
        ctx.font = `400 ${note}px "IBM Plex Sans Arabic", Tahoma, sans-serif`;
        ctx.fillText(c.note, 726, 156);
        ctx.strokeStyle = '#e8c88a'; ctx.globalAlpha = fade*0.45; ctx.lineWidth = 1.6;
        ctx.setLineDash([7, 6]);
        ctx.beginPath(); ctx.moveTo(726, 170); ctx.lineTo(c.x, c.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = fade*0.8;
        ctx.beginPath(); ctx.arc(c.x, c.y, 9, 0, Math.PI*2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'center'; ctx.direction = 'inherit';
    ctx.restore();
  }

  D.create({
    openButton: 'rd-display-open',
    data: () => window.WorkshopReadiness?.data,
    population: data => data.equipment,
    idOf: unit => unit.id,
    toneOf, tones: TONE, faintTone: 'unknown',
    legend: {ready:'جاهزة', running:'تعمل', maintenance:'صيانة وإصلاح',
             inspection:'تحتاج فحصاً', retire:'مرشحة للشطب', unknown:'بلا حالة'},
    honesty: data => data.summary.unverified
      ? `${data.summary.unverified} من ${data.summary.total} سجلاً لم يتحقق منه أحد ميدانياً — ليست جاهزية تشغيلية معتمدة.`
      : 'كل السجلات بيانات فعلية متحقق منها.',
    scenes(data, kit){
      const all = data.equipment, s = data.summary;
      const label = key => M.places[key];
      const place = key => all.filter(u => u.place === key);
      const sized = () => M.sizeGroups(all).map(g => ({
        label: g.label,
        units: all.filter(u => (u.kind==='dam' ? 'dam' : u.kind==='generator' ? 'generator'
          : u.size==null ? 'unknown' : String(u.size)) === g.key)
      }));
      const kinds = [['pump','مضخة'],['dam','وحدة سد'],['generator','مولد']]
        .map(([k,n]) => { const c = all.filter(u => u.kind===k).length; return c ? c+' '+n : ''; })
        .filter(Boolean).join(' · ');
      // تُختار معدة تعمل فعلاً؛ فإن لم توجد فأول جاهزة، وإلا فأول السجل.
      const star = all.find(u => u.technical==='ready' && u.operation==='running')
        || all.find(u => u.technical==='ready') || all[0];
      const starSize = !star ? '' : star.kind==='generator' ? (star.kva ? star.kva+' kVA' : 'مولد')
        : star.kind==='dam' ? 'وحدة سد' : star.size!=null ? star.size+' بوصة' : 'مقاس غير مدخل';

      return [
        { title: 'أسطول الديزل',
          lede: 'نقطة واحدة لكل معدة — تُعاد ترتيبها بين المشاهد ولا تُستبدل',
          metric: {value: s.total, caption: kinds},
          layout({area}){ const spots = kit.gridPositions(all, area, area.h*0.08);
            return {spots: all.map((unit,i) => ({unit, ...spots[i]})), labels: []}; } },

        { title: 'المجموعة من الداخل',
          // الرسم تخطيطي عام، والسكون فيه خبرٌ عن المعدة لا عطلٌ في العرض:
          // يُقال الأمران في السطر نفسه حتى يُقرآ في كل مقاس شاشة.
          lede: !star ? 'لا سجل'
            : `${star.asset} · ${starSize} · ${star.make || 'الشركة غير مسجّلة'}`
              + ' — رسم تخطيطي عام لا يصوّر تركيب هذه المعدة'
              + (star.technical === 'ready' && star.operation === 'running'
                 ? '' : '، وسكونه لأنها ليست في التشغيل الآن'),
          metric: {value: s.total, caption: 'معدة في السجل'},
          outside: 'الأسطول',
          drawBehind(g){ drawSection(g.ctx, g.w, g.h, g.now, star, g.reduced, g.since, TONE, toneOf); },
          layout(){ return {spots: [], labels: []}; } },

        { title: 'أين توجد المعدات؟',
          lede: 'المكان الفعلي الآن — لا العهدة ولا الحالة الفنية',
          metric: {value: s.workshop, caption: 'داخل الورشة'},
          layout({area}){ return kit.clusterLayout([
            {label: label('workshop'), units: place('workshop')},
            {label: label('operations'), units: place('operations')},
            {label: label('store'), units: place('store')},
            {label: label('kalba'), units: place('kalba')},
            ...M.sectorPlaces.map(k => ({label: label(k), units: place(k)})),
            {label: 'لم تُسجَّل جهتها', units: all.filter(u => !u.place)}
          ].filter(g => g.units.length), area); } },

        { title: 'الحالة الفنية',
          lede: 'حكم الورشة على المعدة، مستقلاً عن مكانها وعهدتها',
          metric: {value: s.maintenance, caption: 'تحتاج صيانة أو تحت الإصلاح'},
          layout({area}){ return kit.columnLayout([...Object.entries(M.technicalStates)
            .map(([key, name]) => ({label: name, units: all.filter(u => u.technical === key)})),
            {label: 'لم تُدخل', units: all.filter(u => !u.technical)}]
            .filter(g => g.units.length), area); } },

        { title: 'جاهزة للتسليم',
          lede: 'سليمة فنياً · في الورشة · غير مسلّمة — الثلاثة معاً',
          metric: {value: s.readyToHandOver, caption: 'من ' + s.total + ' معدة'},
          layout({w, h}){
            const ready = all.filter(M.filters.ready), rest = all.filter(u => !M.filters.ready(u));
            const inner = kit.gridPositions(ready, {x: w*0.30, y: h*0.22, w: w*0.40, h: h*0.42}, h*0.10);
            const ring = rest.map((unit, i) => { const a = (i/rest.length)*Math.PI*2 - Math.PI/2;
              return {unit, x: w/2 + Math.cos(a)*Math.min(w,h)*0.43,
                y: h*0.50 + Math.sin(a)*Math.min(w,h)*0.40, r: 2.6}; });
            return {spots: [...ready.map((unit,i) => ({unit, ...inner[i]})), ...ring],
              labels: [{text: 'الباقي في مدار الانتظار', count: rest.length, x: w/2, y: h*0.945}]}; } },

        { title: 'المقاسات والأنواع',
          lede: 'ارتفاع العمود هو عدد وحداته',
          metric: {value: M.sizeGroups(all).length, caption: 'مجموعة في الأسطول'},
          layout({area}){ return kit.columnLayout(sized(), area); } },

        { title: 'القطاعات الخمسة',
          outside: 'خارج عهدة القطاعات',
          lede: 'ما سُلّم إلى القطاعات من الأسطول',
          metric: {value: s.sectors.reduce((n,x) => n+x.count, 0), caption: 'معدة في عهدة القطاعات'},
          layout({area}){ return kit.clusterLayout(s.sectors.map(sec => ({label: sec.label,
            units: all.filter(u => u.place === sec.place)})), area); } }
      ];
    }
  });
})();
