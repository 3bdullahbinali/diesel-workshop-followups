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
   * مضخة شبه مجسّمة. لا WebGL ولا مجسّم ثلاثي الأبعاد — لا يوجد ملف مجسّم
   * للمضخات أصلاً. وإنما انعراج أفقي (yaw) يضغط العرض بجيب الزاوية، فتبدو
   * الكتلة دائرة حول محورها، مع وجه يميني يظهر ويختفي. الأثر مقنع والتكلفة
   * صفر: لا تحميل ولا اعتمادية.
   */
  function drawPump(ctx, w, h, now, unit, reduced, TONE, toneOf){
    const cx = w/2, cy = h*0.50, k = Math.min(w, h)/430;
    const yaw = (now/2600) % (Math.PI*2);
    const face = Math.cos(yaw), depth = Math.sin(yaw);
    const push = (x, y) => [cx + x*face*k - y*0, cy + y*k];
    const shade = (base, amount) => `rgba(${base},${amount})`;

    // ظل أرضي يثبّت الكتلة على المسرح
    ctx.save();
    ctx.globalAlpha = .45;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 126*k, 200*k*Math.abs(face)*0.9 + 54*k, 20*k, 0, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(3,10,8,.75)'; ctx.filter = 'blur(10px)'; ctx.fill();
    ctx.restore();

    const bw = 190*k*Math.abs(face) + 24*k;   // عرض الهيكل يتنفّس مع الدوران
    const bh = 118*k, top = cy - 92*k;
    const ground = cy + 96*k;                 // خط الأرض: عليه ترتكز العجلات

    // الجانب العميق: يظهر حين يميل الهيكل
    ctx.fillStyle = shade('70,92,78', .55 + .25*Math.abs(depth));
    ctx.beginPath();
    ctx.moveTo(cx + bw/2, top + 10*k);
    ctx.lineTo(cx + bw/2 + 44*k*depth, top + 26*k);
    ctx.lineTo(cx + bw/2 + 44*k*depth, top + bh - 4*k);
    ctx.lineTo(cx + bw/2, top + bh + 12*k);
    ctx.closePath(); ctx.fill();

    // الهيكل
    const body = ctx.createLinearGradient(cx - bw/2, top, cx + bw/2, top + bh);
    body.addColorStop(0, '#cfdac9'); body.addColorStop(.55, '#aebda8'); body.addColorStop(1, '#8b9c85');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.roundRect(cx - bw/2, top, bw, bh, 10*k); ctx.fill();

    // فتحات التهوية تنزلق مع الدوران فتبيّن أن السطح يتحرك
    ctx.save(); ctx.beginPath(); ctx.roundRect(cx - bw/2, top, bw, bh, 10*k); ctx.clip();
    ctx.globalAlpha = .40; ctx.strokeStyle = '#55665c'; ctx.lineWidth = 2*k;
    for (let i = -8; i < 9; i++){
      const x = cx + (i*22*k + (yaw/(Math.PI*2))*22*k) * face;
      ctx.beginPath(); ctx.moveTo(x, top + 22*k); ctx.lineTo(x, top + bh - 30*k); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.restore();

    // عادم يعلو الهيكل فيكسر استطالته
    ctx.fillStyle = '#5f6f66';
    ctx.beginPath(); ctx.roundRect(cx - bw*0.26, top - 30*k, 11*k, 32*k, 5*k); ctx.fill();

    // لوحة الحالة على الهيكل
    ctx.fillStyle = TONE[toneOf(unit)];
    ctx.globalAlpha = .9;
    ctx.beginPath(); ctx.roundRect(cx - bw*0.30, top + 16*k, bw*0.60, 9*k, 4*k); ctx.fill();
    ctx.globalAlpha = 1;

    // شاسيه يربط الهيكل بالعجلات فلا تطفو
    ctx.fillStyle = '#5f6f66';
    ctx.beginPath(); ctx.roundRect(cx - bw/2 - 8*k, top + bh, bw + 16*k, 13*k, 4*k); ctx.fill();

    // العجلات ترتكز على خط أرض واحد
    for (const [ox, rr] of [[-0.30, 27], [0.30, 27]]){
      const x = cx + bw*ox;
      ctx.beginPath(); ctx.arc(x, ground - rr*k, rr*k, 0, Math.PI*2);
      ctx.fillStyle = '#2c372f'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, ground - rr*k, rr*k*0.48, 0, Math.PI*2);
      ctx.fillStyle = '#93a08e'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, ground - rr*k, rr*k*0.16, 0, Math.PI*2);
      ctx.fillStyle = '#5f6f66'; ctx.fill();
    }

    // رأس الطرد ودوّار يدور حول محوره
    const hx = cx - bw/2 - 30*k, hy = top + bh*0.62;
    ctx.beginPath(); ctx.arc(hx, hy, 40*k, 0, Math.PI*2);
    ctx.fillStyle = '#8b9c85'; ctx.fill();
    ctx.beginPath(); ctx.arc(hx, hy, 29*k, 0, Math.PI*2);
    ctx.fillStyle = '#cfdac9'; ctx.fill();
    const running = unit && unit.technical === 'ready' && unit.operation === 'running';
    const blade = running && !reduced.matches ? now/240 : 0;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(blade);
    ctx.strokeStyle = '#2f5d45'; ctx.lineWidth = 5*k; ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++){
      const a = i*Math.PI/3;
      ctx.beginPath(); ctx.moveTo(Math.cos(a)*6*k, Math.sin(a)*6*k);
      ctx.lineTo(Math.cos(a)*22*k, Math.sin(a)*22*k); ctx.stroke();
    }
    ctx.restore();

    // تدفّق الماء يخرج من الطرد حين تعمل المضخة فعلاً
    if (running){
      ctx.globalAlpha = .75;
      for (let i = 0; i < 5; i++){
        const t = ((now/900) + i/5) % 1;
        ctx.beginPath();
        ctx.ellipse(hx - (46 + t*110)*k, hy + Math.sin(t*6)*5*k, (11 - t*6)*k, 5*k, 0, 0, Math.PI*2);
        ctx.fillStyle = `rgba(122,196,199,${(1-t)*0.8})`; ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
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

        { title: 'المضخة عن قرب',
          lede: star ? `${star.asset} · ${starSize} · ${star.make || 'الشركة غير مسجّلة'}` : 'لا سجل',
          metric: {value: s.total, caption: 'معدة في السجل'},
          outside: 'الأسطول',
          drawBehind(g){ drawPump(g.ctx, g.w, g.h, g.now, star, g.reduced, TONE, toneOf); },
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
