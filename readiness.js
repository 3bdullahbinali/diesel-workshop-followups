'use strict';
/**
 * لوحة جاهزية المضخات والخراطيم.
 *
 * صفحة قائمة بذاتها، تُفتح من زر في سجل المتابعات ولا تُحمَّل معه. الفصل
 * كامل: ملف Google Sheets آخر، ودورة قراءة أخرى، فلا يمس تعطّلُ أحد
 * السجلين الآخر. وإن غاب معرّف الملف من الإعداد قالت الصفحة ذلك صراحة.
 */
(() => {
  const M=window.WorkshopReadinessModel;
  const S=window.WorkshopSheets;
  const $=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normal=value=>String(value??'').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[ً-ٟ]/g,'').trim();
  const missing='<span class="rd-missing">لم يُدخل</span>';
  const date=value=>String(value||'').split('-').reverse().join(' / ');
  const perPage=12;

  let data=null,loading=false,loaded=false,config=null;
  let status='all',size='all',place='all',query='',offset=0,selected=null,paused=false;
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');

  const label=(map,key)=>key==null?null:map[key];
  const sizeLabel=unit=>unit.kind==='dam'?'وحدة سد':unit.size==null?'مقاس غير مدخل':unit.size+' بوصة';
  // الحالة المعروضة تجمع الحكم الفني والتشغيل في سطر واحد دون أن تخلطهما.
  function stateLabel(unit){
    if(!unit.technical)return 'الحالة لم تُدخل';
    if(unit.technical==='ready')return unit.operation==='running'?'تعمل':unit.operation==='standby'?'جاهزة — احتياط':'جاهزة';
    return M.technicalStates[unit.technical];
  }
  const stateTone=unit=>!unit.technical?'unknown':unit.technical==='ready'?'ready':unit.technical==='write_off'?'retire':'repair';

  function note(message){const node=$('rd-status');if(node&&node.textContent!==message)node.textContent=message;}

  function units(){
    const list=(data?.equipment||[]).filter(unit=>M.filters[status](unit)&&(size==='all'||sizeKey(unit)===size)&&(place==='all'||unit.place===place));
    if(!query)return list;
    const needle=normal(query);
    return list.filter(unit=>normal([unit.asset,unit.make,unit.model,unit.serial,unit.receiver,unit.site,unit.notes,label(M.places,unit.place)].join(' ')).includes(needle));
  }
  const sizeKey=unit=>unit.kind==='dam'?'dam':unit.size==null?'unknown':String(unit.size);
  const filtersClear=()=>status==='all'&&size==='all'&&place==='all'&&!query;

  function renderSummary(){
    const s=data.summary;
    const card=(id,value,total,title,hint)=>`<button type="button" class="rd-stat${id===status?' is-on':''}${id==='ready'?' rd-stat-main':''}" data-status="${id}" aria-pressed="${id===status}"><span class="rd-stat-label">${escape(title)}</span><strong>${value}<span class="rd-of"> من ${total}</span></strong><small>${escape(hint)}</small></button>`;
    $('rd-summary').innerHTML=[
      card('ready',s.readyToHandOver,s.total,'جاهزة للتسليم','سليمة فنياً · في الورشة · غير مسلّمة'),
      card('delivered',s.delivered,s.total,'مسلّمة للجهات','عهدة، لا مكان'),
      card('workshop',s.workshop,s.total,'داخل الورشة',s.maintenance?s.maintenance+' منها للصيانة والإصلاح':'لا صيانة مسجّلة'),
      card('demo',s.demo,s.total,'بيانات تجريبية',s.verified?s.verified+' سجلاً تحقّق ميدانياً':'لم يتحقق أي سجل ميدانياً بعد')
    ].join('');
  }

  function renderPlaces(){
    const s=data.summary;
    const rows=[['workshop','الورشة'],['operations','مواقع التشغيل'],['store','المستودع']]
      .map(([key,title])=>`<button type="button" class="rd-place${place===key?' is-on':''}" data-place="${key}" aria-pressed="${place===key}"><span>${escape(title)}</span><b>${s[key]}</b></button>`).join('');
    const outside=(data.equipment||[]).filter(unit=>unit.place==='kalba').length;
    $('rd-places').innerHTML=rows+(outside?`<button type="button" class="rd-place${place==='kalba'?' is-on':''}" data-place="kalba" aria-pressed="${place==='kalba'}"><span>بلدية كلباء</span><b>${outside}</b></button>`:'')
      +(s.placeless?`<p class="rd-hint rd-placeless">${s.placeless} معدة لم تُسجَّل جهتها بعد.</p>`:'');
    $('rd-places-hint').textContent=s.placeless?`${s.total-s.placeless} من ${s.total} سُجّلت جهتها`:`كل الـ${s.total} سُجّلت جهتها`;
    const owners=new Map((data.sectors||[]).map(sector=>[sector.code,sector]));
    $('rd-sectors').innerHTML=s.sectors.map(sector=>{
      const owner=owners.get(sector.code)?.owner;
      return `<button type="button" class="rd-place rd-sector${place===sector.place?' is-on':''}" data-place="${sector.place}" aria-pressed="${place===sector.place}"><span>${escape(sector.label)}<small>${owner?escape(owner):'المسؤول غير مسجّل'}</small></span><b>${sector.count}</b></button>`;
    }).join('');
  }

  function renderDetail(){
    const unit=(data.equipment||[]).find(x=>x.id===selected)||units()[0]||(data.equipment||[])[0];
    if(!unit){$('rd-unit-title').textContent='—';$('rd-unit-facts').innerHTML='';return;}
    selected=unit.id;
    $('rd-unit-title').textContent=unit.asset;
    $('rd-unit-make').textContent=unit.make||'الشركة لم تُسجَّل';
    $('rd-unit-size').textContent=sizeLabel(unit);
    $('rd-unit-state').textContent=stateLabel(unit);
    $('rd-unit-state').dataset.tone=stateTone(unit);
    // الحركة تعني «تعمل الآن»؛ فلا تدور مضخة حالتها مجهولة أو متوقفة.
    const running=unit.technical==='ready'&&unit.operation==='running';
    const animate=running&&!reducedMotion.matches;
    $('rd-stage').classList.toggle('is-running',animate&&!paused);
    $('rd-pump').setAttribute('aria-label','رسم توضيحي لمضخة — حالة '+unit.asset+': '+stateLabel(unit));
    $('rd-motion').hidden=!animate;
    $('rd-motion').setAttribute('aria-pressed',String(paused));
    $('rd-motion').textContent=paused?'تشغيل الحركة':'إيقاف الحركة';
    const fact=(term,value)=>`<div><dt>${escape(term)}</dt><dd dir="auto">${value}</dd></div>`;
    const value=raw=>raw?escape(raw):missing;
    $('rd-unit-facts').innerHTML=[
      fact('الحالة الفنية',value(label(M.technicalStates,unit.technical))),
      fact('حالة التشغيل',value(label(M.operationStates,unit.operation))),
      fact('الجهة الحالية',value(label(M.places,unit.place))),
      fact('الموقع الدقيق',value(unit.site)),
      fact('حالة التسليم',value(label(M.handoverStates,unit.handover))),
      fact('المستلم',value(unit.receiver)),
      fact('تاريخ التسليم',unit.handoverDate?`<bdi>${escape(date(unit.handoverDate))}</bdi>`:missing),
      fact('الطراز والرقم التسلسلي',unit.model||unit.serial?escape([unit.model,unit.serial].filter(Boolean).join(' · ')):missing),
      fact('آخر صيانة',unit.lastMaintenance?`<bdi>${escape(date(unit.lastMaintenance))}</bdi>`:missing),
      fact('الصيانة القادمة',unit.nextMaintenance?`<bdi>${escape(date(unit.nextMaintenance))}</bdi>`:missing),
      unit.notes?fact('الأعطال والملاحظات',escape(unit.notes)):'',
      unit.temporaryAsset?fact('تنبيه','<span class="rd-warn">رقم مؤقت يُستبدل بعد الجرد الفعلي</span>'):'',
      unit.dataKind==='demo'?fact('نوع البيانات','<span class="rd-warn">تجريبية — لم تُتحقق ميدانياً</span>'):
        unit.dataKind==='verified'?fact('نوع البيانات','فعلية · تحقّق ميداني'):''
    ].join('');
  }

  function renderFilters(){
    const counts=Object.fromEntries(Object.keys(M.filters).map(key=>[key,(data.equipment||[]).filter(M.filters[key]).length]));
    $('rd-statuses').innerHTML=Object.entries(M.filterLabels)
      .map(([key,title])=>`<button type="button" data-status="${key}" class="${key===status?'active':''}" aria-pressed="${key===status}">${escape(title)} <span>${counts[key]}</span></button>`).join('');
    const groups=[{key:'all',label:'كل المقاسات',count:(data.equipment||[]).length},...data.sizes];
    $('rd-sizes').innerHTML=groups
      .map(group=>`<button type="button" data-size="${escape(group.key)}" class="${group.key===size?'active':''}" aria-pressed="${group.key===size}">${escape(group.label)} <span>${group.count}</span></button>`).join('');
  }

  function renderList(){
    const rows=units();
    if(offset>=rows.length)offset=0;
    const shown=rows.slice(offset,offset+perPage);
    $('rd-count').textContent=rows.length===data.equipment.length
      ?`${rows.length} معدة`:`معروض ${rows.length} من ${data.equipment.length} معدة`;
    $('rd-empty').hidden=rows.length!==0;
    $('rd-clear').hidden=filtersClear();
    $('rd-units').innerHTML=shown.map(unit=>`<button type="button" class="rd-tile${unit.id===selected?' is-on':''}" data-unit="${escape(unit.id)}" aria-pressed="${unit.id===selected}"><span class="rd-tile-top"><span>${escape(sizeLabel(unit))}</span><span class="rd-state" data-tone="${stateTone(unit)}">${escape(stateLabel(unit))}</span></span><strong dir="ltr">${escape(unit.asset)}</strong><span class="rd-tile-foot">${unit.place?escape(M.places[unit.place]):missing}</span></button>`).join('');
    const pages=rows.length>perPage;
    $('rd-pager').hidden=!pages;
    if(pages){
      $('rd-page-count').textContent=`${offset+1}–${Math.min(offset+perPage,rows.length)} من ${rows.length}`;
      $('rd-prev').disabled=offset===0;$('rd-next').disabled=offset+perPage>=rows.length;
    }
    note(`${rows.length} معدة في العرض الحالي.`);
  }

  function renderHoses(){
    const hoses=data.hoses||[],catalog=data.catalog||[];
    const counted=hoses.filter(hose=>hose.quantity!=null);
    $('rd-hoses-hint').textContent=hoses.length
      ?`${counted.length} من ${hoses.length} صنفاً سُجّلت كميته`
      :'الجرد لم يُدخل بعد — الأصناف أدناه دليل مرجعي ولا تعني توفّر كميات.';
    const cards=hoses.length?hoses.map(hose=>({
      title:[label(M.hoseKinds,hose.kind),hose.size!=null?hose.size+' بوصة':null].filter(Boolean).join(' · ')||hose.code||hose.id,
      code:hose.code,
      rows:[['الكمية',hose.quantity==null?null:hose.quantity+(hose.unit?' '+M.hoseUnits[hose.unit]:'')],
            ['إجمالي الطول',hose.totalLength==null?null:hose.totalLength+' متر'],
            ['سليمة / تحتاج إصلاحاً',hose.sound==null&&hose.needsRepair==null?null:`${hose.sound??'—'} / ${hose.needsRepair??'—'}`],
            ['الجهة',label(M.places,hose.place)],
            ['الحالة',label(M.hoseConditions,hose.condition)]]
    })):catalog.map(item=>({
      title:[label(M.hoseKinds,item.kind),item.size!=null?item.size+' بوصة':null].filter(Boolean).join(' · ')||item.code,
      code:item.code,
      rows:[['الكمية المتاحة',null],['الطول القياسي',item.length==null?null:item.length+' متر'],
            ['الوصلات',item.coupling],['وحدة القياس',label(M.hoseUnits,item.unit)],['الحالة',null]]
    }));
    $('rd-hose-grid').innerHTML=cards.length
      ?cards.map(card=>`<article class="rd-hose"><span class="rd-reel" aria-hidden="true"></span><div><span class="rd-hint">${escape(card.code||'')}</span><h5>${escape(card.title)}</h5><dl>${card.rows.map(([term,value])=>`<div><dt>${escape(term)}</dt><dd>${value?escape(value):missing}</dd></div>`).join('')}</dl></div></article>`).join('')
      :'<p class="rd-hint">لم يُدخل أي صنف خراطيم بعد.</p>';
  }

  function render(){
    if(!data)return;
    renderSummary();renderPlaces();renderFilters();renderDetail();renderList();renderHoses();
    const s=data.summary;
    $('rd-note').classList.toggle('rd-provisional',s.demo>0);
    $('rd-note').textContent=s.demo
      ?`${s.demo} من ${s.total} سجلاً حالته وموقعه ما زالا تجريبيين حتى التحقق الميداني — الأرقام أدناه ليست جاهزية تشغيلية معتمدة.`
      :'سجل مستقل عن سجل المتابعات. الخانة الفارغة تعني «لم تُدخل بعد» ولا تعني صفراً.';
    $('rd-source').innerHTML=`المصدر: <a href="${escape(config.readinessSpreadsheetUrl||'#')}" rel="noopener" target="_blank">سجل جاهزية المضخات والخراطيم</a>`+(data.readAt?` · آخر قراءة <bdi>${escape(new Intl.DateTimeFormat('ar-AE',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dubai'}).format(data.readAt))}</bdi>`:'');
    document.title=`جاهزية المضخات والخراطيم (${s.total}) — شعبة ورشة الديزل`;
  }

  function failure(message){
    $('rd-lede').textContent='تعذّرت القراءة.';
    $('rd-summary').innerHTML='';
    $('rd-units').innerHTML='';
    $('rd-note').textContent=message;
    $('rd-note').classList.add('rd-error');
    note(message);
  }

  async function read(){
    if(loading||loaded)return;
    loading=true;
    $('rd-note').textContent='جارٍ قراءة سجل الجاهزية…';
    try{
      if(!config){
        const response=await fetch('./sheets-config.json?t='+Date.now(),{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(12000)});
        if(!response.ok)throw new Error('تعذر تحميل إعداد الربط.');
        config=await response.json();
      }
      const id=config.readinessSpreadsheetId;
      if(!id)throw new Error('لم يُسجَّل معرّف ملف الجاهزية في إعداد الربط.');
      // العناوين في الصف الأول؛ وورقة يعلوها سطر إرشاد تبقى مقروءة أيضاً.
      const tab=(name,headers,required,parse,rows)=>{
        const last=M.columnLetter(headers.length);
        const at=start=>S.query(id,name,'A'+start+':'+last+(rows+start-1),12000)
          .then(response=>parse(M.sheetRows(response,headers,required,name)));
        // العناوين في الصف الأول عادةً؛ وورقة يعلوها سطر إرشاد تبقى مقروءة.
        // يُبلَّغ عن خطأ المحاولة الأولى لأنها الشكل المتوقع، فلا يحجبه خطأ الثانية.
        return at(1).catch(first=>at(2).catch(()=>{throw first;}));
      };
      // المعدات وحدها إلزامية؛ غياب ورقة أخرى يُفرغ قسمها ولا يُسقط اللوحة.
      const soft=promise=>promise.catch(()=>null);
      const [equipment,hoses,catalog,sectors]=await Promise.all([
        tab(M.equipmentSheetName,M.equipmentHeaders,23,M.equipmentEntries,5000),
        soft(tab(M.hoseSheetName,M.hoseHeaders,20,M.hoseEntries,5000)),
        soft(tab(M.catalogSheetName,M.catalogHeaders,7,M.catalogEntries,500)),
        soft(tab(M.sectorSheetName,M.sectorHeaders,10,M.sectorEntries,50))
      ]);
      data={equipment,hoses:hoses||[],catalog:catalog||[],sectors:sectors||[],
        summary:M.summary(equipment),sizes:M.sizeGroups(equipment),readAt:new Date()};
      loaded=true;
      $('rd-note').classList.remove('rd-error');
      render();
      window.WorkshopMotion?.reveal($('readiness-panel'));
      const s=data.summary;
      $('rd-lede').textContent=`${s.total} معدة · ${s.verified?s.verified+' منها ببيانات فعلية':'لا سجل فعلي بعد'} · سجل مستقل يُقرأ لحظة فتح الصفحة.`;
    }catch(error){
      failure('تعذّرت قراءة سجل الجاهزية. '+error.message);
    }finally{loading=false;}
  }

  const today=$('today');
  if(today)today.textContent=new Intl.DateTimeFormat('ar-AE',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Dubai'}).format(new Date());
  $('rd-refresh')?.addEventListener('click',()=>{loaded=false;read();});

  $('readiness-panel').addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(!button||!data)return;
    if(button.dataset.status!=null){status=button.dataset.status;offset=0;render();}
    else if(button.dataset.size!=null){size=button.dataset.size;offset=0;render();}
    else if(button.dataset.unit){selected=button.dataset.unit;paused=false;renderDetail();renderList();$('rd-unit-title').scrollIntoView({block:'nearest',behavior:'smooth'});}
    else if(button.dataset.place){
      // النقر على جهة يصفّي القائمة على معداتها بلا مغادرة اللوحة.
      place=place===button.dataset.place?'all':button.dataset.place;
      status='all';size='all';offset=0;render();
      $('rd-units').scrollIntoView({block:'nearest',behavior:'smooth'});
    }
    else if(button.id==='rd-next'){offset+=perPage;renderList();}
    else if(button.id==='rd-prev'){offset=Math.max(0,offset-perPage);renderList();}
    else if(button.id==='rd-motion'){paused=!paused;renderDetail();}
    else if(button.id==='rd-clear'){status='all';size='all';place='all';query='';offset=0;$('rd-search').value='';render();}
  });
  $('rd-search').addEventListener('input',event=>{query=event.target.value;offset=0;renderList();});
  reducedMotion.addEventListener('change',()=>{if(data)renderDetail();});

  window.WorkshopReadiness={refresh(){loaded=false;return read();},get data(){return data;}};

  read();
})();
