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
  const S3 = window.Scene3D;

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
    body:'#ddd1b7', bodyDark:'#a2957a', bodyInk:'#3a3128',
    chassis:'#c6b99b', chassisDark:'#9a8e74',
    engine:'#39424a', engineDark:'#232a31', rust:'#8a6a4a', rustDark:'#664e35',
    tyre:'#16191c', steel:'#a3aeb8', steelDark:'#6d7780',
    gold:'#c9a758', bronze:'#c08f4e', bronzeDark:'#8d6636',
    piston:'#3f6fd0', pistonDark:'#2a4e96', vane:'#c3d2dd', water:'#4fa8d8',
    hose:'#434a52', blue:'#2f6fb5'
  };

  /** ترس محوره x: يُبنى في مستوى xy ثم يُدار ربع دورة فيصير محوره العمود. */
  function gearX(x, y, z, r, teeth, thick, colour, ang){
    const g = S3.spin(S3.gear(0, 0, 0, r, teeth, thick, colour, ang), 'y', Math.PI/2);
    return g.map(f => Object.assign({}, f,
      {p: f.p.map(p => [p[0] + x, p[1] + y, p[2] + z])}));
  }

  /** موضع على مسار مكسّر، ومعه اتجاهه: يمشي عليه الماء. */
  function along(path, t){
    let len = 0; const seg = [];
    for (let i = 0; i < path.length - 1; i++){
      const d = Math.hypot(path[i+1][0]-path[i][0], path[i+1][1]-path[i][1],
                           path[i+1][2]-path[i][2]);
      seg.push(d); len += d;
    }
    let want = t*len;
    for (let i = 0; i < seg.length; i++){
      if (want <= seg[i] || i === seg.length - 1){
        const f = seg[i] ? want/seg[i] : 0;
        return [path[i][0] + (path[i+1][0]-path[i][0])*f,
                path[i][1] + (path[i+1][1]-path[i][1])*f,
                path[i][2] + (path[i+1][2]-path[i][2])*f];
      }
      want -= seg[i];
    }
    return path[0];
  }

  const SUCTION = [[330, 8, 18], [250, 9, 6], [168, 9.5, 0], [140, 9.5, 0]];
  const DISCHARGE = [[132, 40, 0], [132, 104, 0], [156, 130, 0], [258, 130, 0],
                     [300, 118, 8], [330, 82, 18]];

  /** أجزاء لا تتحرك: تُبنى مرة واحدة ويُعاد استعمالها كل إطار. */
  let STATIC = null;
  function staticParts(){
    if (STATIC) return STATIC;
    const P = PART, f = [];
    const add = (...xs) => { for (const x of xs) for (const face of x) f.push(face); };

    // ── المقطورة ───────────────────────────────────────────────────────────
    add(S3.box(0,-104, 58, 520,20,22, P.chassis),
        S3.box(0,-104,-58, 520,20,22, P.chassis),
        S3.box(-232,-104,0, 20,20,138, P.chassis),
        S3.box( 236,-104,0, 20,20,138, P.chassis),
        S3.box(-120,-92,0, 230,6,112, P.chassisDark),        // فرشة القاعدة
        S3.box(-316,-100,0, 120,15,17, P.chassis),           // ذراع الجرّ
        S3.cyl(-372,-100,0, 13, 15, 16, P.chassis, 'z'));
    for (const z of [80, -80]){                              // عجلتان بحافّة
      add(S3.cyl(90,-116,z, 45, 24, 26, P.tyre, 'z'),
          S3.cyl(90,-116,z, 40, 27, 26, '#2a2e33', 'z'),
          S3.cyl(90,-116,z, 19, 29, 18, P.chassis, 'z'),
          S3.cyl(90,-116,z,  6, 31, 10, P.steel, 'z'));
    }
    for (const x of [-232, 236])                             // قائمتا الاتّكاء
      add(S3.box(x,-128,62, 14,30,14, P.chassis),
          S3.box(x,-142,62, 26,6,26, P.chassisDark));

    // ── قاعدتا تثبيت المحرّك على الفرشة ────────────────────────────────────
    for (const x of [-190, -74]) add(S3.box(x,-84,0, 26, 22, 96, P.chassisDark));

    // ── كتلة المحرّك مقطوعة: جدارها القريب وطرفها مرفوعان فيُرى ما بداخلها.
    // القطع أصدق من الشفافية وأوضح: الجدار الذي لا يُرى منه شيء لا يُرسم.
    add(S3.box(-130,-14,-52, 150, 120, 10, P.engineDark),    // الجدار البعيد
        S3.box(-130,-69,  0, 150, 10, 104, P.engine),        // الأرضية
        S3.box(-130, 41,  0, 150, 10, 104, P.engine),        // السقف
        S3.box(-60, -14,  0,  10, 120, 104, P.engine),       // الطرف نحو المضخة
        S3.box(-130, 57, 0, 132, 22, 96, P.engineDark),      // غطاء المراجيح
        S3.box(-130, 70, 0, 96, 6, 64, P.engine));
    for (const x of [-182, -152, -122, -92])                 // براغي الغطاء
      add(S3.cyl(x, 75, 26, 5, 8, 8, P.steel, 'y'));
    add(S3.cyl(-40, 58, 22, 17, 42, 20, P.engineDark, 'x'),  // منقّي الهواء
        S3.cyl(-40, 58, 22, 19, 8, 20, P.engine, 'x'));
    add(S3.box(-46,-14,0, 10, 112, 96, P.engineDark));       // المبرّد
    for (let i = 0; i < 9; i++)                              // زعانفه
      add(S3.box(-46, -60 + i*13, 0, 13, 6, 92, P.engine));

    // ── العادم: كاتم صدئ وماسورتان ─────────────────────────────────────────
    add(S3.cyl(-232, 64, 34, 21, 96, 24, P.rust, 'x'),
        S3.cyl(-232, 64, 34, 23, 10, 24, P.rustDark, 'x'),
        S3.tube([[-158, 40, 34], [-180, 56, 34], [-192, 64, 34]], 9, 10, P.rustDark),
        S3.tube([[-278, 64, 34], [-280, 96, 34], [-280, 116, 34]], 9, 10, P.rustDark),
        S3.cyl(-280, 120, 34, 15, 8, 14, P.rustDark, 'y'));

    // ── الأعمدة ────────────────────────────────────────────────────────────
    add(S3.cyl(-70,-36,0, 10, 280, 16, P.gold, 'x'),
        S3.cyl( 96, 9.5,0, 8, 100, 16, P.gold, 'x'),
        S3.cyl( 70, 9.5,0, 15, 14, 16, P.steel, 'x'));

    // ── جسم المضخة: حلزون يتّسع، غطاؤه القريب شفّاف يُرى منه الدوّار ───────
    const vol = S3.scroll(132, 9.5, 0, 56, 22, 58, 44, P.body);
    // الغطاء القريب مرفوع كما رُفع جدار المحرّك: يُرى الدوّار في الحلزون
    add(S3.only(vol, ['side']), S3.only(vol, ['far']),
        S3.cyl(104, 9.5, 0, 74, 4, 40, '#2f3740', 'x'),        // قاع الغرفة الداكن
        S3.cyl(160, 9.5, 0, 38, 8, 26, P.bodyDark, 'x'),       // شفّة العنق
        S3.cyl(100, 9.5, 0, 23, 18, 20, P.body, 'x'),          // صندوق الحشو
        S3.cyl(196, 9.5, 0, 32, 74, 24, P.body, 'x'),          // عنق السحب
        S3.cyl(235, 9.5, 0, 42, 11, 24, P.steel, 'x'));        // شفّته
    for (let i = 0; i < 8; i++){                             // براغي الشفّة
      const th = (i/8)*Math.PI*2;
      add(S3.cyl(235, 9.5 + Math.cos(th)*35, Math.sin(th)*35, 4, 13, 8, P.steelDark, 'x'));
    }
    // قائمتان تحملان الجسم على القاعدة
    for (const x of [104, 180]) add(S3.box(x,-76,0, 16, 34, 74, P.body));

    // ── خط الطرد: عنق فكوع فمحبس بيد دوّارة فوصلة ──────────────────────────
    add(S3.box(132, 106, 0, 46, 62, 46, P.body),
        S3.box(184, 130, 0, 100, 44, 44, P.body),
        S3.box(238, 130, 0, 50, 56, 56, P.body),
        S3.cyl(238, 166, 0, 11, 38, 14, P.body, 'y'),
        S3.cyl(238, 186, 0, 27, 7, 24, P.steel, 'y'),
        S3.cyl(238, 186, 0, 9, 11, 12, P.steelDark, 'y'),
        S3.cyl(272, 130, 0, 28, 10, 20, P.steel, 'x'),
        S3.box(140, 76, 0, 34, 30, 3, '#e8e2d2'));           // لوحة البيانات

    // ── الخراطيم ───────────────────────────────────────────────────────────
    add(S3.tube([[246, 9.5, 4], [290, 9, 10], [334, 8, 20]], 31, 16, P.hose),
        S3.tube([[278,130,0], [306,118,8], [326,94,14], [334,66,20]], 25, 14, P.blue));

    STATIC = f;
    return f;
  }

  /** أجزاء تدور: تُبنى كل إطار بزاوية العمود. */
  function movingParts(a, live, t){
    const P = PART, f = [];
    const add = (...xs) => { for (const x of xs) for (const face of x) f.push(face); };

    // ثلاث أسطوانات على عمود مرفق واحد، مسامیرها متباعدة ثلث دورة كما في
    // محرّك ثلاثي. وموضع كل مكبس من طول ذراع ثابت لا من جيب تمام مباشر.
    const crankR = 20, rod = 38, crankY = -36;
    for (let c = 0; c < 3; c++){
      const x = -174 + c*44, th = a + c*(Math.PI*2/3);
      const pinY = crankY + Math.cos(th)*crankR, pinZ = Math.sin(th)*crankR;
      const pistonY = pinY + Math.sqrt(rod*rod - pinZ*pinZ);
      add(S3.cyl(x, 0, 0, 20, 70, 14, '#5c6a76', 'y',
                 {from: Math.PI, to: Math.PI*2, caps: 'none'}),  // نصف جدار الأسطوانة
          S3.cyl(x, pistonY, 0, 19, 24, 16, P.piston, 'y'),
          S3.cyl(x, pistonY + 9, 0, 20, 5, 16, P.pistonDark, 'y'),
          S3.bar([x, pinY, pinZ], [x, pistonY - 10, 0], 10, 12, '#93a2ad'),
          S3.cyl(x, crankY, 0, 22, 16, 16, '#8d9aa5', 'x'),
          S3.cyl(x, pinY, pinZ, 8, 26, 8, P.gold, 'x'));
    }

    // ترسان يتعشّقان: نسبة دورانهما عكس نسبة أسنانهما تماماً
    add(gearX(46,-36,0, 28, 16, 20, P.bronze, a),
        gearX(46,  9.5,0, 17.5, 10, 20, P.bronze, -a*1.6));

    // الدوّار: ريش منحنية على عمود الترس الثاني، بدورانه واتجاهه
    const vanes = [];
    for (let i = 0; i < 6; i++){
      const th = (i/6)*Math.PI*2;
      const at = (r, off) => [122, 9.5 + Math.cos(th + off)*r, Math.sin(th + off)*r];
      vanes.push(...S3.bar(at(18, 0), at(34, 0.24), 9, 34, P.vane),
                 ...S3.bar(at(34, 0.24), at(50, 0.56), 9, 34, P.vane));
    }
    add(S3.spin(vanes, 'x', -a*1.6, [122, 9.5, 0]),
        S3.cyl(122, 9.5, 0, 19, 36, 18, P.gold, 'x'));

    // الماء: كتل تمشي على مسار السحب ثم على مسار الطرد
    if (live){
      for (let i = 0; i < 4; i++){
        const p = along(SUCTION, ((t*0.28) + i/4) % 1);
        add(S3.cyl(p[0], p[1], p[2], 9, 16, 8, P.water, 'x'));
      }
      for (let i = 0; i < 6; i++){
        const p = along(DISCHARGE, ((t*0.28) + i/6) % 1);
        add(S3.cyl(p[0], p[1], p[2], 8, 15, 8, P.water, 'y'));
      }
    }
    return f;
  }

  const CALLOUTS = [
    {name:'المكابس والمرفق', note:'ثلاث أسطوانات على عمود واحد',      at:[-152, 6, 0]},
    {name:'قطار التروس',     note:'ينقل الدوران إلى عمود المضخة',     at:[46, -20, 0]},
    {name:'الدوّار والحلزون', note:'الريش تدفع الماء إلى الطرد',        at:[128, 9.5, 40]},
    {name:'المحبس وخط الطرد', note:'يُغلق الخط قبل فكّ الخرطوم',        at:[238, 155, 0]},
    {name:'خرطوم السحب',     note:'يسحب من الغمر إلى عين الدوّار',     at:[292, 9, 14]}
  ];
  const CALLOUT_MS = 1800;

  let OFF = null, CACHE = '';
  function target(w, h){
    const ow = Math.min(w, 1120), oh = Math.max(1, Math.round(h*ow/w));
    if (!OFF) OFF = document.createElement('canvas');
    if (OFF.width !== ow || OFF.height !== oh){ OFF.width = ow; OFF.height = oh; CACHE = ''; }
    return OFF;
  }

  function drawSection(ctx, w, h, now, unit, reduced, since, TONE, toneOf){
    const running = !!unit && unit.technical === 'ready' && unit.operation === 'running';
    const live = running && !reduced;
    const t = live ? now/1000 : 0;             // ساكنة إن لم تكن تعمل فعلاً
    const a = t*1.9;                           // زاوية عمود المرفق

    // الكاميرا: ثلاثة أرباع، وتتأرجح قليلاً ليظهر العمق. وتثبت إن كانت
    // الحركة مخفّضة في إعدادات الجهاز.
    const sway = reduced ? 0 : Math.sin(now/4200)*0.13;
    const off = target(w, h), g = off.getContext('2d');
    const camOff = {
      yaw: 0.62 + sway, pitch: 0.26, focal: 1700,
      scale: Math.min(off.width/960, off.height/560),
      ox: off.width/2, oy: off.height*0.50
    };
    const grow = w/off.width;                    // من لوحة الرسم إلى الشاشة
    const cam = {...camOff, scale: camOff.scale*grow,
                 ox: camOff.ox*grow, oy: camOff.oy*grow};

    // إن كان كل شيء ساكناً فالإطار واحد لا يتغيّر: يُرسم مرة ويُعاد نسخه.
    const key = reduced ? `${off.width}x${unit && unit.id}` : '';
    if (!key || key !== CACHE){
      g.clearRect(0, 0, off.width, off.height);
      // ظلّ على الأرض يُجلس المجموعة في مكانها بدل أن تطفو
      const sh = S3.project([-10,-162, 0], camOff);
      const rx = 330*camOff.scale, ry = 52*camOff.scale;
      const grad = g.createRadialGradient(sh[0], sh[1], 0, sh[0], sh[1], rx);
      grad.addColorStop(0, 'rgba(0,0,0,.42)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.save(); g.translate(sh[0], sh[1]); g.scale(1, ry/rx); g.translate(-sh[0], -sh[1]);
      g.fillStyle = grad;
      g.beginPath(); g.arc(sh[0], sh[1], rx, 0, Math.PI*2); g.fill(); g.restore();

      S3.render(g, staticParts().concat(movingParts(a, live, t)), camOff);
      CACHE = key;
    }
    ctx.drawImage(off, 0, 0, w, h);

    // ── لوحة الحالة ولوحة الاسم: تُرسمان مسطّحتين فوق المجسّم لتُقرآ ────────
    const plate = S3.project([140,-104, 62], cam);
    ctx.save();
    ctx.textAlign = 'center'; ctx.direction = 'ltr';
    ctx.fillStyle = PART.bodyDark;
    ctx.beginPath();
    ctx.roundRect(plate[0] - 78, plate[1] - 4, 156, 42, 5); ctx.fill();
    ctx.fillStyle = PART.bodyInk;
    ctx.font = '700 14px Arial, sans-serif';
    ctx.fillText('DIESEL PUMP', plate[0], plate[1] + 14);
    ctx.font = '700 15px Arial, sans-serif';
    ctx.fillText(unit && unit.asset ? unit.asset : '—', plate[0], plate[1] + 32);
    ctx.restore();

    const tone = S3.project([-252,-96, 46], cam);
    ctx.fillStyle = PART.chassis;
    ctx.beginPath(); ctx.roundRect(tone[0] - 27, tone[1] - 30, 54, 60, 8); ctx.fill();
    ctx.fillStyle = TONE[toneOf(unit || {})];
    ctx.beginPath(); ctx.roundRect(tone[0] - 19, tone[1] - 22, 38, 9, 4); ctx.fill();
    ctx.globalAlpha = .5; ctx.fillStyle = PART.bodyInk;
    for (let i = 0; i < 3; i++){
      ctx.beginPath();
      ctx.roundRect(tone[0] - 19, tone[1] - 5 + i*11, 38 - i*11, 5, 3); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── نداء الجزء: اسمه وعمله، وخيط يصله بموضعه المُسقَط من المجسّم ───────
    const k = Math.min(w/1180, h/700), tight = k < 0.62;
    ctx.save();
    ctx.textAlign = 'right'; ctx.direction = 'rtl';
    const idx = reduced ? 0 : Math.floor(since/CALLOUT_MS) % CALLOUTS.length;
    const local = reduced ? CALLOUT_MS/2 : since % CALLOUT_MS;
    const fade = reduced ? 1 : Math.min(1, local/260, (CALLOUT_MS - local)/260);
    if (fade > 0.01){
      const c = CALLOUTS[idx], q = S3.project(c.at, cam);
      const tx = w*0.95, ty = h*0.13;
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#e8c88a';
      ctx.font = `700 ${Math.max(19, Math.min(34, h*0.046))}px "IBM Plex Sans Arabic", Tahoma, sans-serif`;
      ctx.fillText(c.name, tx, ty);
      if (!tight){
        ctx.fillStyle = '#9fb7c6';
        ctx.font = `400 ${Math.max(13, Math.min(21, h*0.028))}px "IBM Plex Sans Arabic", Tahoma, sans-serif`;
        ctx.fillText(c.note, tx, ty + h*0.042);
        ctx.strokeStyle = '#e8c88a'; ctx.globalAlpha = fade*0.45; ctx.lineWidth = 1.6;
        ctx.setLineDash([7, 6]);
        ctx.beginPath(); ctx.moveTo(tx, ty + h*0.058); ctx.lineTo(q[0], q[1]); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = fade*0.8;
        ctx.beginPath(); ctx.arc(q[0], q[1], 9, 0, Math.PI*2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
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
          outsideAt: {x: 0.15, y: 0.28},    // في فراغ أعلى اليسار، بعيداً عن المجسّم
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
