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
    case:'#28303a', caseIn:'#1b2028', caseEdge:'#5a6a78',
    engine:'#3a424b', engineDark:'#141920', chassis:'#39414a', stack:'#414a54',
    body:'#f0b400', bodyDark:'#b88a04', steel:'#aab6c0',
    hose:'#2f353c', hoseRib:'#596169', blue:'#2f6fb5', blueRib:'#4a8ad4',
    gear:'#c08f4e', gearDark:'#8d6636', shaft:'#d3b45f',
    spring:'#5cb87a', piston:'#3f6fd0', pistonDark:'#2a4e96',
    arrow:'#55d0e0', water:'#4fa8d8', vane:'#86a2b6'
  };

  /** نقطة على منحنى تربيعي، ومعها اتجاه المماس: تُركب عليها الخراطيم وأسهم الماء. */
  function bez(p0, p1, p2, t){
    const u = 1 - t;
    return [u*u*p0[0] + 2*u*t*p1[0] + t*t*p2[0],
            u*u*p0[1] + 2*u*t*p1[1] + t*t*p2[1],
            Math.atan2(2*u*(p1[1]-p0[1]) + 2*t*(p2[1]-p1[1]),
                       2*u*(p1[0]-p0[0]) + 2*t*(p2[0]-p1[0]))];
  }

  /** خرطوم مضلّع: جسم سميك تعبره أضلاع عرضية، كخراطيم السحب والطرد. */
  function hose(ctx, p0, p1, p2, width, colour, rib){
    const span = Math.hypot(p2[0]-p0[0], p2[1]-p0[1]);
    const N = Math.max(8, Math.round(span/13));
    const pts = []; for (let i = 0; i <= N; i++) pts.push(bez(p0, p1, p2, i/N));
    const run = () => { ctx.beginPath();
      pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); };
    ctx.save(); ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#11151a'; ctx.lineWidth = width + 7; run();   // حدّ الخرطوم
    ctx.strokeStyle = colour; ctx.lineWidth = width; run();
    ctx.strokeStyle = rib; ctx.lineWidth = Math.max(2, width*0.13);
    for (const p of pts){
      const nx = -Math.sin(p[2])*width*0.45, ny = Math.cos(p[2])*width*0.45;
      ctx.beginPath(); ctx.moveTo(p[0]-nx, p[1]-ny); ctx.lineTo(p[0]+nx, p[1]+ny); ctx.stroke();
    }
    ctx.globalAlpha = .22; ctx.strokeStyle = '#ffffff';               // لمعة الأنبوب
    ctx.lineWidth = Math.max(2, width*0.10); ctx.beginPath();
    pts.forEach((p, i) => { const x = p[0] - Math.sin(p[2])*width*0.27,
                            y = p[1] + Math.cos(p[2])*width*0.27;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke(); ctx.restore();
  }

  /** شفّة ببراغٍ: وصلة الخرطوم بجسم المضخة كما تُربط في الميدان. */
  function flange(ctx, x, y, w, h, bolts){
    ctx.fillStyle = PART.steel;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill();
    ctx.fillStyle = '#4b555e';
    const along = w > h;                      // البراغي على امتداد الشفّة لا عبرها
    for (let i = 0; i < bolts; i++){
      const f = (i + 0.5)/bolts;
      const bx = along ? x + w*f : x + w/2, by = along ? y + h/2 : y + h*f;
      ctx.beginPath();
      ctx.arc(bx, by, Math.min(along ? h : w, (along ? w : h)/bolts)*0.26, 0, Math.PI*2);
      ctx.fill();
    }
  }

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
    {name:'المكبس والكرنك', note:'الاحتراق يدفع المكبس فيدير عمود المرفق', x:260, y:350},
    {name:'الصمّام ونابضه', note:'يفتح مع الشوط النازل ويعيده النابض', x:260, y:204},
    {name:'قطار التروس',   note:'ينقل الدوران من المحرّك إلى عمود المضخة', x:320, y:480},
    {name:'الدوّار والحلزون', note:'الريش تدفع الماء إلى مخرج الطرد', x:760, y:436},
    {name:'خرطوما السحب والطرد', note:'أسود يسحب من الغمر، وأزرق يطرد إلى التصريف', x:880, y:230}
  ];
  const CALLOUT_MS = 1800;

  function drawSection(ctx, w, h, now, unit, reduced, since, TONE, toneOf){
    const k = Math.min(w/1180, h/700);
    const running = !!unit && unit.technical === 'ready' && unit.operation === 'running';
    const live = running && !reduced;
    const t = live ? now/1000 : 0;             // ساكنة إن لم تكن تعمل فعلاً
    const a = t*2.0;                           // زاوية عمود المرفق
    const ratio = 18/13;

    ctx.save(); ctx.translate(w/2, h/2); ctx.scale(k, k); ctx.translate(-540, -320);
    ctx.lineJoin = 'round';

    // ── إطار الرسم ──────────────────────────────────────────────────────────
    ctx.fillStyle = PART.case;
    ctx.beginPath(); ctx.roundRect(40, 40, 1000, 560, 26); ctx.fill();
    ctx.strokeStyle = '#3c454f'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = PART.caseIn;
    ctx.beginPath(); ctx.roundRect(64, 64, 952, 512, 18); ctx.fill();

    // ── الهيكل: المجموعة كلها قائمة على قاعدة، كما تُنقل إلى الموقع ────────
    ctx.fillStyle = PART.chassis;
    ctx.beginPath(); ctx.roundRect(140, 556, 790, 16, 5); ctx.fill();

    // ── عادم قائم على يسار كتلة المحرّك ────────────────────────────────────
    ctx.strokeStyle = PART.stack; ctx.lineWidth = 26;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(190, 290); ctx.lineTo(112, 290); ctx.lineTo(112, 92); ctx.stroke();
    ctx.fillStyle = PART.stack;
    ctx.beginPath(); ctx.roundRect(90, 70, 44, 14, 6); ctx.fill();       // غطاء المطر

    // ── كتلة المحرّك، وفيها نافذة مقطوعة يظهر منها ما يتحرك ────────────────
    ctx.fillStyle = PART.engine;
    ctx.beginPath(); ctx.roundRect(164, 106, 252, 454, 16); ctx.fill();
    ctx.fillStyle = PART.caseIn;
    ctx.beginPath(); ctx.roundRect(178, 120, 224, 426, 10); ctx.fill();

    ctx.save();                                    // كل ما يلي محصور في القطع
    ctx.beginPath(); ctx.roundRect(178, 120, 224, 426, 10); ctx.clip();

    const cx = 260, cy = 480, crankR = 40, rodLen = 160, pistonH = 58;
    const pinX = cx + Math.sin(a)*crankR;
    const pinY = cy - Math.cos(a)*crankR;
    // موضع المكبس من طول ذراع ثابت: الذراع جسم صلب لا يتمطّط.
    const pistonY = pinY - Math.sqrt(rodLen*rodLen - (pinX - cx)*(pinX - cx)) - pistonH/2;
    const lift = Math.max(0, Math.sin(a))*18;      // الصمّام يفتح مع الشوط النازل

    // قطار التروس: مقاس سنّ واحد لكليهما، فيتعشّقان كما تتعشّق التروس.
    const g2x = 349.8, g2y = 436.2;
    gear(ctx, cx, cy, 58, 18, a - 0.45379, PART.gear, PART.gearDark);
    gear(ctx, g2x, g2y, 41.89, 13, 0.0295 - a*ratio, PART.gear, PART.gearDark);
    ctx.fillStyle = PART.caseEdge;
    ctx.beginPath(); ctx.arc(cx, cy, 46, 0, Math.PI*2); ctx.fill();

    // المبرّد خلف الكتلة: زعانف أفقية كما تُرى في المقطع
    ctx.fillStyle = PART.engineDark;
    ctx.beginPath(); ctx.roundRect(330, 176, 68, 148, 6); ctx.fill();
    ctx.strokeStyle = '#4c555f'; ctx.lineWidth = 3;
    for (let i = 0; i < 9; i++){
      const y = 188 + i*15;
      ctx.beginPath(); ctx.moveTo(338, y); ctx.lineTo(390, y); ctx.stroke();
    }

    // الأسطوانة ورأسها، وتنّورتها مفتوحة على بيت المرفق
    ctx.fillStyle = PART.caseEdge;
    ctx.beginPath(); ctx.roundRect(196, 188, 128, 44, 8); ctx.fill();
    ctx.beginPath(); ctx.roundRect(196, 232, 128, 204, 10); ctx.fill();
    ctx.fillStyle = PART.caseIn;
    ctx.beginPath(); ctx.roundRect(208, 244, 104, 192, 6); ctx.fill();
    ctx.fillRect(244, 188, 32, 44);                                    // منفذ الصمّام

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
    ctx.beginPath(); ctx.moveTo(260, 122); ctx.lineTo(260, 238 + lift); ctx.stroke();
    spring(ctx, 260, 133 + lift, 45 - lift, 34, 6, PART.spring, 4);
    ctx.fillStyle = PART.caseEdge;
    ctx.beginPath(); ctx.roundRect(232, 178, 56, 10, 4); ctx.fill();        // المقعد الثابت
    ctx.fillStyle = '#8fa6b8';
    ctx.beginPath(); ctx.roundRect(238, 122 + lift, 44, 11, 4); ctx.fill(); // صحن النابض
    ctx.fillStyle = PART.spring; ctx.beginPath();                           // قرص الصمّام
    ctx.moveTo(237, 246 + lift); ctx.lineTo(283, 246 + lift);
    ctx.lineTo(274, 232 + lift); ctx.lineTo(246, 232 + lift);
    ctx.closePath(); ctx.fill();
    ctx.restore();                                  // انتهى القطع

    // ── عمود الإدارة: طوق حامل ثم وصلة مرنة ثم المضخة ──────────────────────
    ctx.strokeStyle = PART.shaft; ctx.lineWidth = 17; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(402, 436); ctx.lineTo(700, 436); ctx.stroke();
    ctx.fillStyle = PART.caseEdge;
    ctx.beginPath(); ctx.roundRect(470, 414, 22, 44, 5); ctx.fill();        // طوق حامل
    ctx.beginPath(); ctx.roundRect(556, 404, 14, 64, 5); ctx.fill();        // شفّة الوصلة
    ctx.beginPath(); ctx.roundRect(578, 404, 14, 64, 5); ctx.fill();
    ctx.fillStyle = PART.gearDark;
    ctx.fillRect(570, 422, 8, 28);

    // ── جسم المضخة الأصفر: حلزون مقطوع، ومنفذا سحب وطرد بشفّتين ────────────
    ctx.fillStyle = PART.chassis;                                          // قائمتا الجسم
    ctx.beginPath(); ctx.roundRect(700, 524, 20, 34, 4); ctx.fill();
    ctx.beginPath(); ctx.roundRect(800, 524, 20, 34, 4); ctx.fill();
    ctx.fillStyle = PART.body;
    ctx.beginPath(); ctx.roundRect(726, 280, 68, 104, 8); ctx.fill();      // عنق الطرد
    ctx.beginPath(); ctx.roundRect(856, 400, 78, 72, 8); ctx.fill();       // عنق السحب
    ctx.beginPath(); ctx.arc(760, 436, 100, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = PART.bodyDark;                                         // براغي الغلاف
    for (let i = 0; i < 12; i++){
      const th = (i/12)*Math.PI*2;
      ctx.beginPath(); ctx.arc(760 + Math.cos(th)*94, 436 + Math.sin(th)*94, 4.6, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.fillStyle = PART.caseIn;
    ctx.beginPath(); ctx.arc(760, 436, 88, 0, Math.PI*2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(760, 436, 88, 0, Math.PI*2); ctx.clip();
    // ممر الماء: يبدأ ضيقاً عند اللسان ويتّسع مع الدوران حتى مخرج الطرد
    ctx.globalAlpha = .62; ctx.fillStyle = PART.water; ctx.beginPath();
    const TH0 = -1.745, SWEEP = 6.11, N = 96;   // اللسان قبل الطرد، والاتساع ينتهي عنده
    for (let i = 0; i <= N; i++){
      const f = i/N, th = TH0 - f*SWEEP, r = 72 + 16*f;
      const px = 760 + Math.cos(th)*r, py = 436 + Math.sin(th)*r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    for (let i = N; i >= 0; i--){
      const th = TH0 - (i/N)*SWEEP;
      ctx.lineTo(760 + Math.cos(th)*66, 436 + Math.sin(th)*66);
    }
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    // الدوّار على عمود الترس نفسه: يدور بدورانه واتجاهه
    ctx.translate(760, 436); ctx.rotate(-a*ratio);
    ctx.fillStyle = '#2b3742';
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

    // لوحة «DIESEL PUMP» على الجسم، كما تحملها المجموعة في الميدان
    ctx.fillStyle = PART.engineDark;
    ctx.beginPath(); ctx.roundRect(700, 486, 120, 26, 5); ctx.fill();
    ctx.fillStyle = PART.body; ctx.textAlign = 'center'; ctx.direction = 'ltr';
    ctx.font = '700 15px Arial, sans-serif';
    ctx.fillText('DIESEL PUMP', 760, 505);

    // ── الخراطيم: أسود على السحب وأزرق على الطرد، كما تُركَّب في الميدان ────
    const D0 = [760, 266], D1 = [792, 178], D2 = [1000, 166];
    hose(ctx, [950, 436], [981, 436], [1012, 436], 58, PART.hose, PART.hoseRib);
    hose(ctx, D0, D1, D2, 46, PART.blue, PART.blueRib);
    flange(ctx, 934, 390, 18, 92, 5);
    flange(ctx, 712, 264, 96, 18, 5);

    // ── الماء يجري: يدخل من خرطوم السحب ويخرج من خرطوم الطرد ───────────────
    if (live){
      for (let i = 0; i < 6; i++){
        const p = ((t*0.5) + i/6) % 1;
        arrow(ctx, 1002 - p*136, 436 + Math.sin(p*7)*5, 12, Math.PI, PART.water, .9);
      }
      for (let i = 0; i < 5; i++){
        const p = ((t*0.5) + i/5) % 1;
        const q = bez(D0, D1, D2, p);
        arrow(ctx, q[0], q[1], 12, q[2], PART.water, .9);
      }
      arrow(ctx, cx, cy + 84, 15, 0, PART.arrow, .85);          // اتجاه دوران العمود
      arrow(ctx, g2x + 4, g2y - 62, 12, Math.PI, PART.arrow, .85);
    }

    // ── لوحة الحالة: لون المعدة نفسه المستعمل في بقية الشاشة ───────────────
    ctx.fillStyle = PART.engine;
    ctx.beginPath(); ctx.roundRect(66, 452, 88, 96, 10); ctx.fill();
    ctx.fillStyle = TONE[toneOf(unit || {})];
    ctx.beginPath(); ctx.roundRect(78, 464, 64, 13, 6); ctx.fill();
    ctx.globalAlpha = .55; ctx.fillStyle = PART.caseIn;
    for (let i = 0; i < 3; i++){
      ctx.beginPath(); ctx.roundRect(78, 492 + i*16, 64 - i*18, 8, 4); ctx.fill();
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
      ctx.fillText(c.name, tight ? 1000 : 700, tight ? 116 : 124);
      if (!tight){
        ctx.fillStyle = '#9fb7c6';
        ctx.font = `400 ${note}px "IBM Plex Sans Arabic", Tahoma, sans-serif`;
        ctx.fillText(c.note, 700, 156);
        ctx.strokeStyle = '#e8c88a'; ctx.globalAlpha = fade*0.45; ctx.lineWidth = 1.6;
        ctx.setLineDash([7, 6]);
        ctx.beginPath(); ctx.moveTo(700, 170); ctx.lineTo(c.x, c.y); ctx.stroke();
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
