'use strict';
/**
 * «إمداد» — العرض التلقائي للموارد على شاشة الجدار.
 *
 * نقطة واحدة لكل بند احتياج حقيقي (٤٠٣)، تُعيد ترتيب نفسها بين المشاهد.
 * ومشهد الخريطة يرسم المواقع التي لها إحداثيات فعلية في الشيت — لا خريطة
 * مستوردة ولا بلاطات من خدمة خارجية، وإنما إسقاط مباشر للإحداثيات على
 * اللوحة. وما لا إحداثية له يبقى مرئياً في شريطه، فلا يوهم العرض أن
 * المعروض هو كل شيء.
 */
(() => {
  const M = window.WorkshopResourcesModel;
  const D = window.WorkshopDisplay;

  const TONE = {pump:'#8ad7d9', suction:'#7fd8a4', discharge:'#e8c88a',
                generator:'#c9a8e0', spare:'#e6b566', other:'#6f7f78'};
  const toneOf = need => TONE[need.kind] ? need.kind : 'other';
  const nf = new Intl.NumberFormat('en-AE',{maximumFractionDigits:0});

  // ── الخريطة: إسقاط مباشر، وتكبير يطير بين المواقع ─────────────────────────
  let mapFocus = 0, mapAt = 0;
  function drawMap(g, points){
    if (!points.length) return;
    const {ctx, w, h, now} = g;
    const box = {x: w*0.10, y: h*0.16, w: w*0.80, h: h*0.62};
    const lats = points.map(p => p.lat), lngs = points.map(p => p.lng);
    const pad = 0.12;
    const latSpan = Math.max(lats[0] ? Math.max(...lats)-Math.min(...lats) : 0, 0.004);
    const lngSpan = Math.max(lngs[0] ? Math.max(...lngs)-Math.min(...lngs) : 0, 0.004);
    const midLat = (Math.max(...lats)+Math.min(...lats))/2, midLng = (Math.max(...lngs)+Math.min(...lngs))/2;

    // كل ٤ ثوانٍ ينتقل التركيز إلى موقع جديد، والتكبير يتبعه بسلاسة
    if (!g.reduced && now - mapAt > 4000){ mapAt = now; mapFocus = (mapFocus+1) % points.length; }
    const target = points[mapFocus] || points[0];
    const t = g.reduced ? 1 : Math.min(1, (now - mapAt)/1400);
    const ease = 1 - Math.pow(1-t, 3);
    const zoom = g.reduced ? 1 : 1 + 0.9*Math.sin(Math.min(1, t)*Math.PI)*0 + 0.85;
    const cLat = midLat + (target.lat - midLat)*ease*0.65;
    const cLng = midLng + (target.lng - midLng)*ease*0.65;

    const scale = Math.min(box.w/(lngSpan*(1+pad*2)), box.h/(latSpan*(1+pad*2))) / zoom;
    // خط الطول يمينُه شرق؛ والشاشة عربية فيُعكس المحور ليطابق الاتجاه المألوف
    const px = lng => box.x + box.w/2 - (lng - cLng)*scale;
    const py = lat => box.y + box.h/2 - (lat - cLat)*scale;

    ctx.save();
    ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();

    // شبكة خفيفة تعطي إحساس المسافة بلا ادعاء أنها خريطة شوارع
    ctx.strokeStyle = 'rgba(126,168,142,0.13)'; ctx.lineWidth = 1;
    for (let i = -8; i <= 8; i++){
      const gx = px(cLng + i*0.006), gy = py(cLat + i*0.006);
      ctx.beginPath(); ctx.moveTo(gx, box.y); ctx.lineTo(gx, box.y+box.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(box.x, gy); ctx.lineTo(box.x+box.w, gy); ctx.stroke();
    }

    const biggest = Math.max(...points.map(p => p.count), 1);
    for (const point of points){
      const x = px(point.lng), y = py(point.lat);
      const focused = point === target;
      const r = (7 + 13*(point.count/biggest)) * (focused ? 1.35 : 1);
      if (focused && !g.reduced){
        const pulse = (now % 1800)/1800;
        ctx.beginPath(); ctx.arc(x, y, r + pulse*40, 0, Math.PI*2);
        ctx.strokeStyle = `rgba(232,200,138,${(1-pulse)*0.55})`; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
      ctx.fillStyle = focused ? '#e8c88a' : 'rgba(127,216,164,0.72)'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r*0.40, 0, Math.PI*2);
      ctx.fillStyle = '#0a1512'; ctx.fill();
    }

    // بطاقة الموقع المركَّز عليه: اسمه وبنوده وكمياته، تظهر متدرّجة
    if (target){
      const x = px(target.lng), y = py(target.lat);
      const alpha = g.reduced ? 1 : Math.min(1, (now - mapAt)/700);
      const lines = [target.place || 'موقع بلا اسم',
        ...target.kinds.map(k => `${k.label} — ${nf.format(k.total)}`)];
      ctx.font = `500 ${Math.max(13, h*0.020)}px "IBM Plex Sans Arabic", Tahoma, sans-serif`;
      const wide = Math.max(...lines.map(l => ctx.measureText(l).width)) + 28;
      const tall = 18 + lines.length*(h*0.030);
      const bx = Math.min(Math.max(x + 26, box.x+8), box.x+box.w-wide-8);
      const by = Math.min(Math.max(y - tall/2, box.y+8), box.y+box.h-tall-8);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(8,22,17,0.90)';
      ctx.beginPath(); ctx.roundRect(bx, by, wide, tall, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(232,200,138,0.45)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.textAlign = 'right';
      lines.forEach((line, i) => {
        ctx.font = i ? `400 ${Math.max(12, h*0.019)}px "IBM Plex Sans Arabic", Tahoma, sans-serif`
                     : `600 ${Math.max(13, h*0.021)}px "IBM Plex Sans Arabic", Tahoma, sans-serif`;
        ctx.fillStyle = i ? '#cfe0d6' : '#e8c88a';
        ctx.fillText(line, bx + wide - 14, by + 22 + i*(h*0.030));
      });
      ctx.globalAlpha = 1; ctx.textAlign = 'center';
    }
    ctx.restore();
  }

  D.create({
    openButton: 'rx-display-open',
    data: () => window.WorkshopResources?.data,
    population: data => data.needs,
    idOf: need => need.id,
    toneOf, tones: TONE, faintTone: 'other',
    legend: {pump:'مضخة', suction:'خرطوم سحب', discharge:'خرطوم طرد', other:'غير محدد'},
    honesty: data => `${data.summary.uncounted} من ${data.summary.stockRows} سطر مخزون لم يُجرد — لا يمكن مقارنة المطلوب بالمتوفر قبل الجرد.`,
    scenes(data, kit){
      const needs = data.needs, s = data.summary;
      const groups = M.needGroups(needs);
      const points = M.mapPoints(needs);
      const withCoords = needs.filter(n => n.coords);
      const wanted = s.wanted.map(x => nf.format(x.total)+' '+x.label).join(' · ');

      return [
        { title: 'ما تطلبه القطاعات',
          lede: 'نقطة واحدة لكل بند احتياج مسجّل — تُعاد ترتيبها ولا تُستبدل',
          metric: {value: s.needs, caption: wanted || 'بلا كميات'},
          layout({area}){ const spots = kit.gridPositions(needs, area, area.h*0.07);
            return {spots: needs.map((n,i) => ({unit:n, ...spots[i]})), labels: []}; } },

        { title: 'بالنوع والمقاس',
          lede: 'ارتفاع العمود عدد بنوده، والرقم تحته كميته بوحدتها',
          metric: {value: groups.length, caption: 'مجموعة احتياج'},
          layout({area}){ return kit.columnLayout(groups.slice(0, 9).map(g => ({
            label: g.label, units: needs.filter(n =>
              (n.kind||'other')+'|'+(n.size==null?'':n.size) === g.key)})), area); } },

        { title: 'على القطاعات الخمسة',
          outside: 'خارج القطاعات',
          lede: 'أين يُطلب الإمداد',
          metric: {value: s.needs - s.placeless, caption: 'بنداً داخل القطاعات'},
          layout({area}){ return kit.clusterLayout(s.sectors.map(sec => ({label: sec.label,
            units: needs.filter(n => n.sector === sec.code)})).filter(g => g.units.length), area); } },

        { title: 'على الخريطة',
          outside: 'بنود الاحتياج',
          lede: `${points.length} موقعاً بإحداثيات فعلية — من ${withCoords.length} بنداً من أصل ${s.needs}`,
          metric: {value: points.length, caption: 'موقعاً على الأرض'},
          drawBehind(g){ drawMap(g, points); },
          layout(){ return {spots: [], labels: []}; } },

        { title: 'الفجوة',
          lede: 'الاحتياج مسجّل بالكامل، والرصيد لم يُجرد منه سطر واحد',
          metric: {value: s.counted, caption: 'من ' + s.stockRows + ' سطر مخزون مجرود'},
          layout({w, h}){
            const spots = kit.gridPositions(needs, {x: w*0.07, y: h*0.22, w: w*0.40, h: h*0.50}, h*0.05);
            return {spots: needs.map((n,i) => ({unit:n, ...spots[i]})),
              labels: [{text: 'بنود احتياج مسجّلة', count: s.needs, x: w*0.27, y: h*0.80},
                       {text: 'أصناف عُدّ رصيدها', count: s.counted, x: w*0.73, y: h*0.80}]}; } },

        { title: 'دليل الأصناف',
          outside: 'بنود الاحتياج',
          lede: 'ما تعرفه الورشة من أصنافها — مقابل ما لا تعرف رصيده',
          metric: {value: s.items, caption: s.groups.map(g => g.count+' '+g.label).join(' · ')},
          layout(){ return {spots: [], labels: []}; } }
      ];
    }
  });
})();
