'use strict';
/**
 * صفحة الموارد: دليل الأصناف والمخزون واحتياجات القطاعات.
 *
 * تقرأ من شيت الجاهزية نفسه وبالطريقة نفسها — مرة عند فتح الصفحة، مستقلة
 * عن سجل المتابعات. وتقيس فجوة واحدة قبل كل شيء: الاحتياج مسجّل بالكامل،
 * والرصيد غير مجرود. عرضُ الأول دون الثاني نصفُ الحقيقة، فيُعرضان معاً.
 */
(() => {
  const M=window.WorkshopResourcesModel;
  const S=window.WorkshopSheets;
  const $=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normal=value=>String(value??'').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[ً-ٟ]/g,'').trim();
  const number=new Intl.NumberFormat('en-AE',{maximumFractionDigits:2});
  const missing='<span class="rd-missing">لم يُدخل</span>';
  const perPage=18;

  let data=null,loading=false,loaded=false,config=null;
  let group='all',query='',offset=0,selected=null;

  function note(message){const node=$('rx-status');if(node&&node.textContent!==message)node.textContent=message;}
  const stockFor=code=>(data.stock||[]).filter(row=>row.code===code);

  function items(){
    const list=(data?.catalog||[]).filter(M.filters[group]);
    if(!query)return list;
    const needle=normal(query);
    return list.filter(item=>normal([item.code,item.sapCode,item.name,item.spec,item.partNumber,item.maker,item.family].join(' ')).includes(needle));
  }

  function renderSummary(){
    const s=data.summary;
    const card=(id,value,sub,title,hint)=>`<button type="button" class="rd-stat${id===group?' is-on':''}${id==='uncounted'?' rd-stat-main':''}" data-group="${id}" aria-pressed="${id===group}"><span class="rd-stat-label">${escape(title)}</span><strong>${value}${sub?`<span class="rd-of"> ${escape(sub)}</span>`:''}</strong><small>${escape(hint)}</small></button>`;
    const wanted=s.wanted.map(w=>number.format(w.total)+' '+w.label).join(' · ')||'لم تُدخل كميات';
    $('rx-summary').innerHTML=[
      card('all',s.items,'',`الأصناف المكوّدة`,`${s.groups.map(g=>g.count+' '+g.label).join(' · ')}`),
      card('uncounted',s.counted,'من '+s.stockRows,'جُرد رصيدها',s.uncounted?`${s.uncounted} سطراً بانتظار العدّ`:'اكتمل الجرد'),
      `<div class="rd-stat" role="group"><span class="rd-stat-label">بنود احتياج</span><strong>${s.needs}</strong><small>على ${s.sectors.filter(x=>x.count).length} قطاعات${s.placeless?` · ${s.placeless} بلا قطاع`:''}</small></div>`,
      `<div class="rd-stat" role="group"><span class="rd-stat-label">الكمية المطلوبة</span><strong class="rx-wanted">${escape(wanted)}</strong><small>لا تُجمع الوحدات بعضها إلى بعض</small></div>`
    ].join('');
  }

  function renderNeeds(){
    const groups=M.needGroups(data.needs).slice(0,9);
    const top=groups[0]?.total||1;
    $('rx-needs').innerHTML=groups.map(g=>`<div class="rx-need"><div class="rx-need-head"><span>${escape(g.label)}</span><b>${number.format(g.total)} <small>${escape(M.units[g.unit]||'')}</small></b></div><div class="rx-bar"><span style="width:${Math.max(2,Math.round(g.total/top*100))}%"></span></div><small class="rd-hint">${g.count} بنداً · ${g.sectors} قطاعات</small></div>`).join('')
      ||'<p class="rd-hint">لم يُسجَّل احتياج بعد.</p>';
    const s=data.summary;
    $('rx-sectors').innerHTML=s.sectors.map(sec=>`<div class="rd-place"><span>${escape(sec.label)}</span><b>${sec.count}</b></div>`).join('')
      +(s.placeless?`<p class="rd-hint rd-placeless">${s.placeless} بنداً خارج القطاعات (محطة المعالجة وغيرها).</p>`:'');
  }

  function renderDetail(){
    const item=(data.catalog||[]).find(x=>x.code===selected)||items()[0]||(data.catalog||[])[0];
    if(!item){$('rx-item-title').textContent='—';$('rx-item-facts').innerHTML='';return;}
    selected=item.code;
    $('rx-item-title').textContent=item.name||item.code;
    $('rx-item-code').textContent=item.code;
    $('rx-item-group').textContent=item.group?M.groups[item.group]:'بلا مجموعة';
    const rows=stockFor(item.code);
    const counted=rows.filter(row=>row.onHand!=null);
    const fact=(term,value)=>`<div><dt>${escape(term)}</dt><dd dir="auto">${value}</dd></div>`;
    const value=raw=>raw?escape(raw):missing;
    const qty=raw=>raw==null?missing:number.format(raw);
    $('rx-item-facts').innerHTML=[
      fact('الرصيد الموجود',counted.length?qty(counted.reduce((n,r)=>n+r.onHand,0)):'<span class="rd-warn">لم يُجرد</span>'),
      fact('الصالح للاستخدام',counted.length?qty(counted.reduce((n,r)=>n+(r.serviceable||0),0)):missing),
      fact('الوحدة',value(item.unit?M.units[item.unit]:null)),
      fact('طريقة التتبع',value(item.tracking?M.tracking[item.tracking]:null)),
      fact('رقم القطعة',value(item.partNumber)),
      fact('الشركة',value(item.maker)),
      fact('كود SAP',value(item.sapCode)),
      fact('عائلة المعدة',value(item.family)),
      item.size!=null?fact('القطر',escape(item.size+' بوصة')):'',
      rows.length?fact('أسطر الجرد',escape(String(rows.length))+(rows[0].priorBalance!=null?' · رصيد تاريخي '+number.format(rows.reduce((n,r)=>n+(r.priorBalance||0),0)):'')):fact('أسطر الجرد','<span class="rd-warn">لا سطر جرد لهذا الصنف</span>'),
      item.spec&&item.spec!==item.name?fact('المواصفة',escape(item.spec)):''
    ].join('');
  }

  function renderFilters(){
    const counts=Object.fromEntries(Object.keys(M.filters).map(key=>[key,(data.catalog||[]).filter(M.filters[key]).length]));
    $('rx-groups').innerHTML=Object.entries(M.filterLabels)
      .filter(([key])=>counts[key])
      .map(([key,title])=>`<button type="button" data-group="${key}" class="${key===group?'active':''}" aria-pressed="${key===group}">${escape(title)} <span>${counts[key]}</span></button>`).join('');
  }

  function renderList(){
    const rows=items();
    if(offset>=rows.length)offset=0;
    const shown=rows.slice(offset,offset+perPage);
    $('rx-count').textContent=rows.length===data.catalog.length?`${rows.length} صنفاً`:`معروض ${rows.length} من ${data.catalog.length} صنفاً`;
    $('rx-empty').hidden=rows.length!==0;
    $('rx-clear').hidden=group==='all'&&!query;
    $('rx-items').innerHTML=shown.map(item=>{
      const rowsFor=stockFor(item.code);
      const counted=rowsFor.filter(r=>r.onHand!=null);
      const stock=counted.length?number.format(counted.reduce((n,r)=>n+r.onHand,0))+(item.unit?' '+M.units[item.unit]:''):'لم يُجرد';
      return `<button type="button" class="rd-tile${item.code===selected?' is-on':''}" data-item="${escape(item.code)}" aria-pressed="${item.code===selected}"><span class="rd-tile-top"><span>${escape(item.group?M.groups[item.group]:'—')}</span><span class="rd-state" data-tone="${counted.length?'ready':'unknown'}">${escape(stock)}</span></span><strong>${escape(item.name||item.code)}</strong><span class="rd-tile-foot" dir="ltr">${escape(item.code)}${item.partNumber?' · '+escape(item.partNumber):''}</span></button>`;
    }).join('');
    const pages=rows.length>perPage;
    $('rx-pager').hidden=!pages;
    if(pages){
      $('rx-page-count').textContent=`${offset+1}–${Math.min(offset+perPage,rows.length)} من ${rows.length}`;
      $('rx-prev').disabled=offset===0;$('rx-next').disabled=offset+perPage>=rows.length;
    }
    note(`${rows.length} صنفاً في العرض الحالي.`);
  }

  function render(){
    if(!data)return;
    renderSummary();renderNeeds();renderFilters();renderDetail();renderList();
    const s=data.summary;
    $('rx-note').classList.toggle('rd-provisional',s.uncounted>0);
    $('rx-note').textContent=s.uncounted
      ?`الاحتياج مسجّل والرصيد غير مجرود: ${s.needs} بند احتياج مقابل ${s.uncounted} سطر مخزون لم يُعدّ بعد${s.unlisted?`، و${s.unlisted} صنفاً بلا سطر جرد أصلاً`:''}. المقارنة بين المطلوب والمتوفر غير ممكنة قبل الجرد.`
      :'الجرد مكتمل.';
    $('rx-lede').textContent=`${s.items} صنفاً · ${s.needs} بند احتياج · ${s.counted} من ${s.stockRows} سطراً مجروداً`;
    $('rx-source').innerHTML=`المصدر: <a href="${escape(config.readinessSpreadsheetUrl||'#')}" rel="noopener" target="_blank">سجل جاهزية المضخات والخراطيم</a>`+(data.readAt?` · آخر قراءة <bdi>${escape(new Intl.DateTimeFormat('ar-AE',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dubai'}).format(data.readAt))}</bdi>`:'');
    document.title=`الموارد (${s.items} صنفاً) — شعبة ورشة الديزل`;
  }

  function failure(message){
    $('rx-lede').textContent='تعذّرت القراءة.';
    $('rx-summary').innerHTML='';$('rx-items').innerHTML='';
    $('rx-note').textContent=message;$('rx-note').classList.add('rd-error');
    note(message);
  }

  async function read(){
    if(loading||loaded)return;
    loading=true;
    $('rx-note').textContent='جارٍ قراءة سجل الموارد…';
    try{
      if(!config){
        const response=await fetch('./sheets-config.json?t='+Date.now(),{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(12000)});
        if(!response.ok)throw new Error('تعذر تحميل إعداد الربط.');
        config=await response.json();
      }
      const id=config.readinessSpreadsheetId;
      if(!id)throw new Error('لم يُسجَّل معرّف ملف الجاهزية في إعداد الربط.');
      const R=window.WorkshopReadinessModel;
      const tab=(name,headers,required,parse,rows)=>{
        const last=R.columnLetter(headers.length);
        const at=start=>S.query(id,name,'A'+start+':'+last+(rows+start-1),12000)
          .then(response=>parse(M.sheetRows(response,headers,required,name)));
        return at(1).catch(first=>at(2).catch(()=>{throw first;}));
      };
      const soft=promise=>promise.catch(()=>[]);
      const [catalog,stock,needs]=await Promise.all([
        tab(M.catalogSheetName,M.catalogHeaders,14,M.catalogEntries,5000),
        soft(tab(M.stockSheetName,M.stockHeaders,22,M.stockEntries,5000)),
        soft(tab(M.needSheetName,M.needHeaders,15,M.needEntries,5000))
      ]);
      data={catalog,stock,needs,summary:M.summary(catalog,stock,needs),readAt:new Date()};
      loaded=true;
      $('rx-note').classList.remove('rd-error');
      render();
      window.WorkshopMotion?.reveal($('resources-panel'));
    }catch(error){
      failure('تعذّرت قراءة سجل الموارد. '+error.message);
    }finally{loading=false;}
  }

  const today=$('today');
  if(today)today.textContent=new Intl.DateTimeFormat('ar-AE',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Dubai'}).format(new Date());
  $('rx-refresh')?.addEventListener('click',()=>{loaded=false;read();});

  $('resources-panel').addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(!button||!data)return;
    if(button.dataset.group!=null){group=button.dataset.group;offset=0;render();}
    else if(button.dataset.item){selected=button.dataset.item;renderDetail();renderList();$('rx-item-title').scrollIntoView({block:'nearest',behavior:'smooth'});}
    else if(button.id==='rx-next'){offset+=perPage;renderList();}
    else if(button.id==='rx-prev'){offset=Math.max(0,offset-perPage);renderList();}
    else if(button.id==='rx-clear'){group='all';query='';offset=0;$('rx-search').value='';render();}
  });
  $('rx-search').addEventListener('input',event=>{query=event.target.value;offset=0;renderList();});

  window.WorkshopResources={refresh(){loaded=false;return read();},get data(){return data;}};
  read();
})();
