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
    body:'#d8ccb2', bodyDark:'#a2957a', bodyInk:'#3a3128', chassis:'#c6b99b',
    engine:'#2f363d', engineDark:'#1b2026', rust:'#7e5f43', tyre:'#1b1e21',
    steel:'#8f9aa4', gold:'#c9a758', bronze:'#b8894a', bronzeDark:'#8d6636',
    piston:'#3f6fd0', vane:'#9fb0bd', water:'#4fa8d8',
    hose:'#2c3035', blue:'#2f6fb5'
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

  const SUCTION = [[326,-6,16], [250,-4,4], [168,-4,0], [138,-4,0]];
  const DISCHARGE = [[130,26,0], [130,74,0], [150,96,0], [244,96,0],
                     [292,90,6], [324,52,20], [334,16,26]];

  /** أجزاء لا تتحرك: تُبنى مرة واحدة ويُعاد استعمالها كل إطار. */
  let STATIC = null;
  function staticParts(){
    if (STATIC) return STATIC;
    const P = PART, f = [];
    const add = (...xs) => { for (const x of xs) for (const face of x) f.push(face); };

    // المقطورة: مجرّان وعارضتان وذراع جرّ بحلقة قَطر وعجلتان
    add(S3.box(0,-104, 56, 520,18,20, P.chassis),
        S3.box(0,-104,-56, 520,18,20, P.chassis),
        S3.box(-238,-104,0, 18,18,130, P.chassis),
        S3.box( 238,-104,0, 18,18,130, P.chassis),
        S3.box(-120,-92,0, 210,8,118, P.chassis),
        S3.box(-312,-100,0, 112,14,16, P.chassis),
        S3.cyl(-364,-100,0, 12, 14, 12, P.chassis, 'z'));
    for (const z of [76, -76])
      add(S3.cyl(84,-118,z, 42, 22, 13, P.tyre, 'z'),
          S3.cyl(84,-118,z, 18, 25, 9, P.chassis, 'z'));

    // كتلة المحرّك: جداران قريبان شفّافان يُرى من خلالهما ما يتحرك
    const blk = S3.box(-120,-30,0, 160,116,122, P.engine);
    add(S3.without(blk, ['pz','nx']), S3.ghost(S3.only(blk, ['pz','nx']), .17),
        S3.box(-120,-30,-56, 150,108,6, P.engineDark),     // ظهر البيت من الداخل
        S3.box(-120, 36, 0, 138, 26, 98, P.engine),        // غطاء المراجيح
        S3.cyl(-34, 30, 30, 18, 46, 14, P.engine, 'x'),    // منقّي الهواء
        S3.box(-32,-30,0, 12, 104, 102, P.engineDark));    // المبرّد

    // العادم: كاتم أفقي صدئ وماسورة دخول وكوع خارج
    add(S3.cyl(-236, 54, 40, 19, 98, 14, P.rust, 'x'),
        S3.tube([[-150,32,40], [-176,44,40], [-190,54,40]], 9, 8, P.rust),
        S3.tube([[-282,54,40], [-284,86,40], [-284,104,40]], 9, 8, P.rust),
        S3.cyl(-284, 108, 40, 14, 8, 10, P.rust, 'y'));

    // عمود المرفق إلى قطار التروس، ثم عمود المضخة
    add(S3.cyl(-56,-64,0, 9, 210, 12, P.gold, 'x'),
        S3.cyl( 88, -4,0, 8, 104, 12, P.gold, 'x'),
        S3.cyl( 60, -4,0, 15, 16, 12, P.steel, 'x'));       // طوق العمود

    // جسم المضخة: نصف غلاف مصمت وآخر شفّاف، وغطاء أمامي شفّاف
    const shell = (from, to) => S3.cyl(130,-4,0, 76, 58, 16, P.body, 'x',
                                       {from, to, caps: 'none'});
    add(shell(Math.PI, Math.PI*2), S3.ghost(shell(0, Math.PI), .34),
        S3.cyl(159,-4,0, 76, 3, 16, P.body, 'x'),
        S3.ghost(S3.cyl(101,-4,0, 76, 3, 16, P.body, 'x'), .30),
        S3.cyl(96,-4,0, 24, 14, 14, P.body, 'x'));          // صندوق الحشو

    // السحب محوري، والطرد يصعد ثم ينعطف إلى محبس بيد دوّارة
    add(S3.cyl(196,-4,0, 34, 74, 16, P.body, 'x'),
        S3.cyl(234,-4,0, 44, 10, 16, P.steel, 'x'),
        S3.box(130, 50, 0, 46, 58, 46, P.body),
        S3.box(178, 96, 0, 96, 44, 44, P.body),
        S3.box(232, 96, 0, 48, 56, 56, P.body),
        S3.cyl(232, 132, 0, 11, 34, 10, P.body, 'y'),
        S3.cyl(232, 150, 0, 26,  6, 16, P.steel, 'y'),
        S3.cyl(262, 96, 0, 30, 10, 14, P.steel, 'x'),
        S3.tube([[242,-4,2], [286,-5,10], [330,-6,18]], 32, 9, P.hose),
        S3.tube([[268,96,0], [300,88,8], [324,56,18], [334,20,26]], 26, 9, P.blue));

    STATIC = f;
    return f;
  }

  /** أجزاء تدور: تُبنى كل إطار بزاوية العمود. */
  function movingParts(a, live, t){
    const P = PART, f = [];
    const add = (...xs) => { for (const x of xs) for (const face of x) f.push(face); };

    // المكبس على ذراع صلب: موضعه من طول الذراع لا من جيب تمام مباشر
    const crankR = 22, rod = 52, crankY = -62;
    const pinY = crankY + Math.cos(a)*crankR, pinZ = Math.sin(a)*crankR;
    const pistonY = pinY + Math.sqrt(rod*rod - pinZ*pinZ);
    add(S3.cyl(-150, -14, 0, 28, 82, 16, '#6c7a86', 'y',
               {from: Math.PI, to: Math.PI*2, caps: 'none'}),   // نصف جدار الأسطوانة البعيد
        S3.cyl(-150, pistonY, 0, 25, 26, 16, P.piston, 'y'),
        S3.bar([-150, pinY, pinZ], [-150, pistonY - 12, 0], 12, 14, '#93a2ad'),
        S3.cyl(-150, crankY, 0, 26, 18, 16, '#93a2ad', 'x'),
        S3.cyl(-150, pinY, pinZ, 8, 30, 10, P.gold, 'x'));

    // ترسان يتعشّقان: نسبة دورانهما عكس نسبة أسنانهما تماماً
    add(gearX(40,-64,0, 36, 18, 18, P.bronze, 0.1745 + a),
        gearX(40, -4,0, 24, 12, 18, P.bronze, 0.2618 - a*1.5));

    // الدوّار على عمود الترس الثاني: بدورانه واتجاهه
    const vanes = [];
    for (let i = 0; i < 6; i++){
      const th = (i/6)*Math.PI*2;
      vanes.push(...S3.bar([118, -4 + Math.cos(th)*20, Math.sin(th)*20],
                           [118, -4 + Math.cos(th + 0.55)*62, Math.sin(th + 0.55)*62],
                           11, 28, P.vane));
    }
    add(S3.spin(vanes, 'x', -a*1.5, [118, -4, 0]),
        S3.cyl(118,-4,0, 20, 30, 14, P.gold, 'x'));

    // الماء: كتل تمشي على مسار السحب ثم على مسار الطرد
    if (live){
      for (let i = 0; i < 5; i++){
        const p = along(SUCTION, ((t*0.28) + i/5) % 1);
        add(S3.box(p[0], p[1], p[2], 15, 15, 15, P.water));
      }
      for (let i = 0; i < 6; i++){
        const p = along(DISCHARGE, ((t*0.28) + i/6) % 1);
        add(S3.box(p[0], p[1], p[2], 14, 14, 14, P.water));
      }
    }
    return f;
  }

  const CALLOUTS = [
    {name:'المكبس والمرفق',  note:'الاحتراق يدفع المكبس فيدير العمود', at:[-150, 20, 0]},
    {name:'قطار التروس',     note:'ينقل الدوران إلى عمود المضخة',     at:[40, -34, 0]},
    {name:'الدوّار والحلزون', note:'الريش تدفع الماء إلى الطرد',        at:[130, -4, 50]},
    {name:'المحبس وخط الطرد', note:'يُغلق الخط قبل فكّ الخرطوم',        at:[232, 120, 0]},
    {name:'خرطوم السحب',     note:'يسحب من الغمر إلى عين الدوّار',     at:[290, -5, 12]}
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
      scale: Math.min(off.width/950, off.height/520),
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
      const sh = S3.project([-10,-150, 0], camOff);
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
    const plate = S3.project([120,-104, 60], cam);
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

    const tone = S3.project([-232,-86, 54], cam);
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
