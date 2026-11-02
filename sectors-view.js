/* Read-only view of the team's shared register. Data updates do not need a release. */
(()=>{
  'use strict';
  if(document.documentElement.classList.contains('archive-mode'))return;
  const root=document.getElementById('sector-content'), ledger=window.WorkshopSectorLedger;
  let data,config,busy=false,error='',query='',limit=20;
  const initial=location.hash.match(/^#sector-([1-5])$/);
  let department='STW',deptRows=null,deptStale=false;
  let section=location.hash==='#operations'?'operations':'sectors',sector=initial?'SEC-'+initial[1]:'';
  const t=(ar,en)=>window.WorkshopI18n?.language==='en'?en:ar;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pending=()=>t('بانتظار التأكيد','Awaiting confirmation');
  const missing=()=>t('غير مدخل','Not entered');
  const number=v=>v==null?'—':String(v);
  const sum=(rows,key)=>rows.some(r=>r[key]==null)?null:rows.reduce((n,r)=>n+r[key],0);
  const received=(rows,key)=>rows.every(r=>r[key]==null)?null:rows.reduce((n,r)=>n+(r[key]??0),0);
  const dateList=(rows,key)=>[...new Set(rows.map(r=>r[key]).filter(Boolean))].join(' / ')||'—';
  const sectorName=s=>s?t('القطاع '+s.slice(4),'Sector '+s.slice(4)):t('كل القطاعات','All sectors');
  const sizeName=s=>s==='السد'?t('مضخة السد','Al Sad'):s.replace(' بوصة',t(' بوصة',' in'));
  const basis=s=>s==='سابق'?t('طلب سابق','Previous request'):s==='محدّث'?t('طلب محدّث','Updated request'):s||'—';
  const labels=()=>({sectors:t('قطاعات الأمطار','Rain sectors'),operations:t('إدارة التشغيل','Operations Department'),owned:t('المضخات المملوكة','Owned pumps'),rental:t('الإيجار','Rentals'),hoses:t('الخراطيم','Hoses')});
  const table=(heads,body)=>'<div class="sector-scroll" tabindex="0"><table><thead><tr>'+heads.map(x=>'<th scope="col">'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+body.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  const pill=(attr,v,name,on)=>'<button type="button" '+attr+'="'+esc(v)+'" aria-pressed="'+String(on)+'">'+esc(name)+'</button>';
  const metric=(v,title)=>'<div><strong>'+esc(v)+'</strong><small>'+esc(title)+'</small></div>';
  const note=(s,warn=false)=>'<p class="'+(warn?'sector-alert':'sector-note')+'">'+esc(s)+'</p>';
  const tabs=()=>'<div class="sector-tabs" role="group" aria-label="'+t('الأقسام','Sections')+'">'+Object.entries(labels()).map(([k,v])=>pill('data-view',k,v,k===section)).join('')+'</div>';
  const picks=()=>'<div class="sector-picks" role="group" aria-label="'+t('اختيار القطاع','Choose sector')+'">'+['',...ledger.sectorCodes].map(s=>pill('data-sector',s,sectorName(s),s===sector)).join('')+'</div>';
  const rows=()=>data.plans.filter(r=>!sector||r.sector===sector);
  const group=s=>data.plans.filter(r=>r.sector===s);
  const sheet=(gid,label)=>'<a target="_blank" rel="noopener" href="https://docs.google.com/spreadsheets/d/'+encodeURIComponent(config.readinessSpreadsheetId)+'/edit#gid='+gid+'">'+esc(label)+'</a>';
  const source=(list)=>'<p class="rd-hint">'+list.join(' · ')+'</p>';
  const receiptCell=v=>v==null?esc(pending()):number(v);
  function balance(r){return r.confirmed==null||r.need==null?'—':number(Math.max(0,r.need-r.confirmed));}
  function sectorView(){
    const selected=rows(),req=t('المطلوب','Required'),issued=t('الموزّع حسب الورشة','Workshop issues'),receipt=t('المستلم الموثّق','Confirmed in sector');
    let html=picks()+'<div class="sector-metrics">'+metric(number(sum(selected,'need')),req)+metric(number(sum(selected,'issued')),issued)+metric(number(received(selected,'confirmed')),receipt)+'</div>';
    html+='<p class="rd-hint">'+t('كشف الاحتياج','Requirements')+' '+esc(dateList(selected,'needDate'))+' · '+t('كشف التوزيع','Distribution')+' '+esc(dateList(selected,'issuedDate'))+'</p>';
    if(sector){
      html+='<h4>'+sectorName(sector)+' · '+esc(basis(selected[0]?.basis))+'</h4>';
      html+=table([t('المقاس','Size'),req,issued,receipt,t('المتبقي للتأكيد','Still to confirm'),t('تاريخ آخر حركة','Latest movement')],ledger.sizes.map(size=>selected.find(r=>r.size===size)).map(r=>[esc(sizeName(r.size)),number(r.need),number(r.issued),receiptCell(r.confirmed),balance(r),esc(r.confirmationDate||'—')]));
    }else{
      html+=table([t('القطاع','Sector'),t('نوع الطلب','Request basis'),req,issued,receipt],ledger.sectorCodes.map(s=>{
        const g=group(s);return ['<button type="button" data-sector="'+s+'">'+sectorName(s)+'</button>',esc(basis(g[0]?.basis)),number(sum(g,'need')),number(sum(g,'issued')),receiptCell(received(g,'confirmed'))];
      }));
    }
    for(const s of (sector?[sector]:ledger.sectorCodes)){
      const g=group(s),reported=g.find(r=>r.reported!=null)?.reported,actual=sum(g,'issued');
      if(reported!=null&&actual!=null&&actual!==reported)html+=note(t(sectorName(s)+' — مجموع المقاسات '+actual+' مضخة، والإجمالي المكتوب في كشف الورشة '+reported+'.',sectorName(s)+' — the size breakdown totals '+actual+' pumps. The workshop report states '+reported+'.'),true);
    }
    html+=note(t('يُحتسب المستلم من حركات التسليم والنقل والإرجاع الموثّقة. الخانة الفارغة تعني أن تأكيد القطاع لم يُسجّل.','Receipts reflect documented handovers, transfers and returns. A blank means sector confirmation is pending.'));
    return html+source([sheet(65027002,t('كشف القطاعات','Sector breakdown')),sheet(308244355,t('تسجيل حركة استلام','Record a handover'))]);
  }
  function operationsView(){
    if(!deptRows)return note(t('تعذّرت قراءة احتياجات إدارة التشغيل. استخدم زر تحديث العرض.','Operations requirements could not be read. Refresh the view.'),true);
    const names={Operations:t('التشغيل العام (ورشة الديزل)','General Operations (AUTO Workshop)'),STW:t('محطات المعالجة (STW)','Treatment plants (STW)'),Civil:t('الأعمال المدنية','Civil'),'Town Drainage':t('محطات الصرف (Town Drainage)','Town Drainage'),Irrigation:t('الري','Irrigation'),Other:t('أخرى','Other')};
    const held=t('بانتظار الإدخال','Awaiting entry');
    const requiredValue=v=>v==null?held:number(v);
    const complete=values=>values.every(v=>v!==null);
    const total=values=>values.reduce((n,v)=>n+(v??0),0);
    const values=deptRows.flatMap(r=>r.required),known=values.some(v=>v!==null)?total(values):null;
    // A blank assignment leaves the count open; a known assignment is distinct from readiness.
    function assignments(code,owner,size){
      const pool=data.fleet.filter(u=>u.owner===owner&&(!size||u.size===size));
      const count=pool.filter(u=>u.assignment===code).length;
      if(count)return count;
      return !pool.length||pool.some(u=>!u.assignment)?t('بانتظار التخصيص','Awaiting assignment'):0;
    }
    let html='<div class="sector-metrics">'+metric(requiredValue(known),t('المطلوب المسجّل حتى الآن','Requirements entered so far'))+metric(deptRows.filter(r=>complete(r.required)).length+' / '+deptRows.length,t('جهات مكتملة الاحتياج','Assignments with complete requirements'))+metric(complete(values)?total(values):t('غير مكتمل','Incomplete'),t('إجمالي احتياج إدارة التشغيل','Total Operations requirement'))+'</div>';
    if(deptStale)html+=note(t('تعذّر تحديث احتياجات التشغيل. المعروض آخر قراءة ناجحة.','Operations refresh failed. Showing the last successful read.'),true);
    html+=note(t('الاحتياج هو عدد المضخات المطلوبة. المخصّص هو ما ربطه الفريق بالجهة في سجل المضخات. اختر الجهة لعرض المقاسات.','Requirements are requested quantities. Allocations come from the assignment field in the pump register. Select a department for its size breakdown.'));
    const owned=t('مملوك مخصّص','Owned assigned'),rental=t('إيجار مخصّص','Rentals assigned');
    html+=table([t('جهة التشغيل','Operations assignment'),t('إجمالي المطلوب','Total required'),owned,rental],deptRows.map(r=>[pill('data-department',r.code,names[r.code],department===r.code),requiredValue(complete(r.required)?total(r.required):null),assignments(r.code,'مملوكة'),assignments(r.code,'إيجار')]));
    const picked=deptRows.find(r=>r.code===department);
    if(picked){
      html+='<h4>'+esc(names[picked.code])+'</h4>'+table([t('المقاس','Size'),t('المطلوب','Required'),owned,rental],ledger.sizes.map((s,i)=>[esc(sizeName(s)),requiredValue(picked.required[i]),assignments(picked.code,'مملوكة',s),assignments(picked.code,'إيجار',s)]));
      if(picked.source)html+='<p class="rd-hint">'+t('المرجع','Source')+' · '+esc(picked.source)+'</p>';
    }
    return html+source([sheet(65027003,t('تحديث احتياجات إدارة التشغيل','Update Operations requirements')),sheet(65027001,t('تحديث تخصيص المضخات','Update pump assignments'))]);
  }
  function inventory(rental){
    const units=data.fleet.filter(u=>u.owner===(rental?'إيجار':'مملوكة'));
    const withReceipt=units.filter(u=>data.receipts.has(u.id)).length;
    let html='<div class="sector-metrics">'+(rental?metric(units.length,t('مضخات إيجار مسجّلة','Registered rentals'))+metric(units.filter(u=>u.received).length,t('استلمتها الورشة من المورد','Received from supplier'))+metric(withReceipt,t('موثّقة لدى القطاعات','Confirmed in sectors')):metric(units.length,t('هويات مملوكة مسجّلة','Registered owned identities'))+metric(units.filter(u=>u.state&&u.assignment&&u.verified).length,t('مكتملة الحالة والتخصيص والتحقق','Condition, assignment and date verified'))+metric(withReceipt,t('موثّقة لدى القطاعات','Confirmed in sectors')))+'</div>';
    html+=note(rental?t('تاريخ الاستلام هنا من المورد. يظهر القطاع المستلم بعد تسجيل حركة مؤكّدة على المضخة.','Receipt here means delivery from the supplier. Sector custody follows a confirmed movement.'):t('الأرقام تخص هويات المضخات. يُحدّث الفريق الحالة والتخصيص والموقع بعد التحقق الميداني.','These counts represent pump identities. The team records condition, assignment and location after verification.'));
    const label=t('ابحث برقم المضخة أو السيريال أو المرجع','Search by pump number, serial or reference');
    html+='<label class="search-field"><input id="sector-query" type="search" value="'+esc(query)+'" placeholder="'+esc(label)+'" aria-label="'+esc(label)+'"></label><div id="sector-results"></div>';
    return html+source([sheet(65027001,t('فتح سجل المضخات للتحديث','Open pump register'))]);
  }
  function inventoryResults(){
    const rental=section==='rental', key=v=>String(v??'').toLowerCase().replace(/[\s/-]+/g,'');
    const needle=key(query);
    const matches=data.fleet.filter(u=>u.owner===(rental?'إيجار':'مملوكة')&&[u.id,u.asset,u.serial,u.make,u.legacy].some(v=>key(v).includes(needle)));
    const cols=[t('المرجع','Reference'),t('رقم المضخة / السيريال','Pump number / serial'),t('المقاس','Size'),t('الشركة أو الطراز','Make or model'),rental?t('استلام الورشة','Workshop receipt'):t('الحالة','Condition'),t('التخصيص','Assignment'),t('الموقع الحالي','Location'),t('عهدة القطاع المؤكّدة','Confirmed sector custody')];
    const body=matches.slice(0,limit).map(u=>[esc(u.id),esc([u.asset,u.serial].filter(Boolean).join(' / ')),esc(sizeName(u.size)),esc(u.make)||'—',esc((rental?u.received:u.state)||missing()),esc(u.assignment||missing()),esc(u.location||missing()),data.receipts.has(u.id)?esc(sectorName(data.receipts.get(u.id).sector)):esc(pending())]);
    document.getElementById('sector-results').innerHTML='<span class="rd-hint">'+t('عدد النتائج','Results')+' '+matches.length+'</span>'+(body.length?table(cols,body):note(t('لا توجد نتائج مطابقة.','No matching pumps.')))+(matches.length>limit?'<button class="sector-more" type="button" data-more>'+t('عرض المزيد','Show more')+'</button>':'');
  }
  function hoseView(){
    const selected=rows();
    let html=picks()+note(t('الطرد بالمتر والسحب بالقطعة. يعرض الجدول الكميات المدرجة في كشف الاحتياج. بنود الإيجار المقترحة منفصلة.','Delivery is in metres and suction in pieces. The table covers recorded requirements and excludes proposed rental additions.'));
    const body=[];
    for(const size of ledger.sizes.slice(0,-1)){
      const g=selected.filter(r=>r.size===size);
      for(const [name,needKey,receivedKey] of [[t('طرد · متر','Delivery · m'),'delivery','deliveryReceived'],[t('سحب · قطعة','Suction · pcs'),'suction','suctionReceived']]){
        const need=sum(g,needKey),qty=received(g,receivedKey);
        if(need===0&&qty==null)continue;
        body.push([esc(sizeName(size)),name,number(need),receiptCell(qty),qty==null||need==null?'—':number(Math.max(0,need-qty))]);
      }
    }
    html+=table([t('المقاس','Size'),t('النوع والوحدة','Type / unit'),t('المطلوب المسجّل','Recorded need'),t('المستلم الموثّق','Confirmed in sector'),t('المتبقي للتأكيد','Still to confirm')],body);
    const unspecified=selected.reduce((n,r)=>n+(r.missingSize||0),0), lengths=selected.reduce((n,r)=>n+(r.missingLength||0),0);
    if(unspecified||lengths)html+=note(t('بيانات تحتاج استكمالاً: '+lengths+' بنود طرد بطول غير محدد، و'+unspecified+' قطعة سحب بمقاس غير محدد.','Incomplete requirements: '+lengths+' delivery lines without a length and '+unspecified+' suction pieces without a size.'));
    return html+source([sheet(65027002,t('متطلبات القطاعات','Sector requirements')),sheet(308244355,t('حركات الخراطيم','Hose movements'))]);
  }
  function render(){
    const heading='<div class="sector-toolbar"><h3>'+t('متابعة المضخات والخراطيم','Pump and hose dashboard')+'</h3></div>';
    const alert=error?note(t('تعذّر تحديث سجل القطاعات.','Sector data could not be refreshed.')+(data?t(' تُعرض آخر قراءة ناجحة.',' Showing the last successful read.'):'')+' '+error,true):'';
    if(!data){root.innerHTML=heading+alert+(busy?note(t('جارٍ قراءة الشيت…','Reading the register…')):'');return;}
    const focus=root.contains(document.activeElement)?document.activeElement:null;
    const selector=focus?.hasAttribute('data-sector')?'[data-sector="'+focus.dataset.sector+'"]':focus?.hasAttribute('data-view')?'[data-view="'+focus.dataset.view+'"]':null;
    root.innerHTML=heading+tabs()+alert+(data.invalid?note(t('حركات تحتاج مراجعة قبل احتسابها: ','Movements awaiting review: ')+data.invalid,true):'')+(section==='operations'?operationsView():section==='sectors'?sectorView():section==='hoses'?hoseView():inventory(section==='rental'))+'<details class="sector-guide"><summary>'+t('طريقة تسجيل الاستلام','How to record a receipt')+'</summary><p>'+t('في ورقة الحركات أدخل معرفاً فريداً للحركة، التاريخ، نوع الأصل، معرف الأصل، الكمية، ونوع الحركة (تسليم أو نقل أو إرجاع). حدّد القطاع المستلم في «إلى قطاع» بصيغة SEC-2 مثلاً، والقطاع المُرسِل في «من قطاع» للنقل والإرجاع. أدخل اسم المستلم ونوع البيانات «فعلية».','In Movements, enter a unique movement ID, date, asset type, asset reference, quantity and movement type (تسليم, نقل or إرجاع). Use a code such as SEC-2 in the destination sector. Transfers and returns require a source sector. Enter the recipient and mark data as فعلية.')+'</p><p>'+t('للمضخة اختر «مضخة»، واستخدم مرجع OWN أو RENT والكمية 1. للخراطيم اختر «خرطوم طرد» أو «خرطوم سحب»، وأدخل المقاس مثل «6 بوصة» في معرف الأصل، والكمية بالمتر للطرد أو بالقطعة للسحب.','For a pump use مضخة, an OWN or RENT reference and quantity 1. For hoses use خرطوم طرد or خرطوم سحب, a size such as 6 بوصة as the asset reference, and metres for delivery or pieces for suction.')+'</p></details>';
    if(section==='operations')root.querySelector('.sector-guide')?.remove();
    if(section==='owned'||section==='rental')inventoryResults();
    if(selector)root.querySelector(selector)?.focus({preventScroll:true});
  }
  async function read(){
    if(busy)return;busy=true;
    if(!data)render();
    try{
      if(!config){const response=await fetch('./sheets-config.json',{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error('HTTP '+response.status);config=await response.json();}
      if(!config.readinessSpreadsheetId)throw new Error('Missing register');
      const [live,ops]=await Promise.allSettled([ledger.load(config.readinessSpreadsheetId),ledger.loadDepartments(config.readinessSpreadsheetId)]);
      deptStale=ops.status==='rejected';
      if(!deptStale)deptRows=ops.value;
      if(live.status==='rejected')throw live.reason;
      data=live.value;error='';
    }catch(e){error=String(e.message||e);}finally{busy=false;render();}
  }
  root.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.view){
      section=b.dataset.view;query='';limit=20;
      const hash=section==='operations'?'#operations':section==='sectors'&&sector?'#sector-'+sector.slice(4):'';
      history.replaceState(null,'',location.pathname+location.search+hash);render();
    }else if(b.dataset.department){
      department=department===b.dataset.department?'':b.dataset.department;render();
      root.querySelector('[data-department="'+b.dataset.department+'"]')?.focus({preventScroll:true});
    }
    else if(b.hasAttribute('data-sector')){sector=b.dataset.sector;history.replaceState(null,'',location.pathname+location.search+(sector?'#sector-'+sector.slice(4):''));render();}
    else if(b.hasAttribute('data-more')){limit+=20;inventoryResults();}
  });
  root.addEventListener('input',e=>{if(e.target.id==='sector-query'){query=e.target.value;limit=20;inventoryResults();}});
  window.addEventListener('workshop-language',render);
  document.getElementById('rd-refresh').addEventListener('click',read);
  read();
})();
