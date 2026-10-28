'use strict';
(() => {
  const I=window.WorkshopI18n;
  const model=globalThis.WorkshopProcurement;
  const $=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normal=value=>String(value??'').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[\u064B-\u065F]/g,'').trim();
  const number=new Intl.NumberFormat('en-AE',{maximumFractionDigits:2});
  const date=value=>String(value||'').split('-').reverse().join(' / ');
  let rows=[],type='all',stage='all',query='',feed=null;
  const filterStore='workshop-procurement-filters';
  const typeLabels=Object.fromEntries(model.transactionTypes);
  try{
    const saved=JSON.parse(sessionStorage.getItem(filterStore)||'null');
    if(saved&&Object.hasOwn(typeLabels,saved.type))type=saved.type;
    const stages=type==='petty_cash'?model.pettyCashStages:model.stages;
    if(saved&&(saved.stage==='other'||stages.some(([id])=>id===saved.stage)))stage=saved.stage;
  }catch{}
  function saveFilters(){try{sessionStorage.setItem(filterStore,JSON.stringify({type,stage}));}catch{}}
  const scopedRows=()=>rows.filter(row=>type==='all'||model.transactionType(row.meta)===type);
  const rowStage=row=>type==='petty_cash'?model.cashStage(row.meta):model.displayStage(row.meta.stage);
  function stageOptions(scope=scopedRows()){
    const options=type==='petty_cash'?model.pettyCashStages:model.stages;
    return scope.some(row=>!options.some(([id])=>id===rowStage(row)))||stage==='other'?[...options,['other','حالات أخرى']]:options;
  }
  const groupStage=(row,options)=>options.some(([id])=>id===rowStage(row))?rowStage(row):'other';
  let selectedView=null;
  const expanded=new Set();
  const panels={procurement:'procurement-panel',letters:'letters-panel',jobs:'jobs-panel',stats:'stats-panel',closed:'closed-panel'};
  function selectView(view,updateHash=true){
    const purchase=view==='procurement';
    const general=['non-purchase','jobs'].includes(view);
    const changed=selectedView!==view;
    selectedView=view;
    const shown=panels[view]||'overview-panel';
    $('overview-panel').hidden=!(general||view==='overview'||view==='plans');
    for(const id of Object.values(panels))$(id).hidden=id!==shown;
    $('followup-records').hidden=view==='letters'||view==='jobs';
    $('followup-categories').hidden=view==='plans';
    for(const tab of tabs){
      const main=tab.parentElement.id==='main-views';
      const active=tab.dataset.view===(main&&general?'non-purchase':view);
      if(main){tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
      else{tab.setAttribute('aria-pressed',String(active));tab.classList.toggle('active',active);}
    }
    $('overview-panel').setAttribute('aria-labelledby',general?'non-purchase-tab':panels[view]?'overview-tab':view+'-tab');
    if(updateHash)history.replaceState(null,'',purchase?'#purchase-orders':'#'+view);
    window.dispatchEvent(new CustomEvent('workshop-view',{detail:view}));
    if(changed)window.WorkshopMotion?.reveal($(shown));
  }
  // The automatic display rotates tabs through the same selection path as a click.
  window.WorkshopViews={select:view=>selectView(view),get current(){return selectedView;}};
  const tabs=[...document.querySelectorAll('#main-views [data-view]')];
  for(const tab of tabs){
    tab.addEventListener('click',()=>selectView(tab.dataset.view));
    tab.addEventListener('keydown',event=>{
      if(tab.parentElement.id!=='main-views')return;
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      const peers=tabs.filter(peer=>peer.parentElement===tab.parentElement&&!peer.hidden);
      event.preventDefault();let i=peers.indexOf(tab);i=event.key==='Home'?0:event.key==='End'?peers.length-1:((event.key==='ArrowLeft')===(document.documentElement.dir==='rtl'))?(i+1)%peers.length:(i+peers.length-1)%peers.length;
      selectView(peers[i].dataset.view);peers[i].focus();
    });
  }
  function requestReference(meta){
    const transactionType=model.transactionType(meta);
    const prefix=transactionType==='pr'?'':escape(typeLabels[transactionType])+' · ';
    if(meta.prNumber)return `${prefix}${escape(meta.numberType||(transactionType==='direct'?'DPR':'PR'))} <bdi>${escape(meta.prNumber)}</bdi>`;
    if(meta.lpoNumber)return `${prefix}LPO <bdi>${escape(meta.lpoNumber)}</bdi>`;
    if(transactionType!=='pr')return escape(typeLabels[transactionType]);
    return meta.kind==='planning'?'احتياج مستقبلي':'رقم PR لم يصدر';
  }
  function orderDetails(meta){
    const orders=meta.orders||[];
    if(model.transactionType(meta)==='petty_cash'&&!orders.length)return '';
    if(!orders.length)return `<div class="detail-full"><h4>أوامر الشراء والاستلام</h4><p class="missing-value">لم يُسجل أمر شراء LPO بعد.</p></div>`;
    const quantity=value=>value==null?'غير مسجل':number.format(value);
    return `<div class="detail-full lpo-details"><h4>أوامر الشراء والاستلام</h4>${orders.map(order=>`<section class="lpo-card"><div class="lpo-heading"><h5>LPO <bdi>${escape(order.lpoNumber)}</bdi></h5><span class="stage stage-${escape(order.receiptState)}">${escape(window.WorkshopOrders.states[order.receiptState])}</span></div><dl class="lpo-meta"><div><dt>المورد</dt><dd>${escape(order.supplier||'غير مسجل')}</dd></div><div><dt>قيمة الأمر — درهم</dt><dd><bdi>${quantity(order.amountAed)}</bdi></dd></div><div><dt>تاريخ الإصدار</dt><dd>${escape(date(order.issuedDate)||'غير مسجل')}</dd></div><div><dt>موعد التوريد</dt><dd>${escape(date(order.dueDate)||'غير مسجل')}</dd></div><div><dt>تاريخ آخر استلام</dt><dd>${escape(date(order.lastReceiptDate)||'غير مسجل')}</dd></div></dl>${order.lines.length?`<div class="delivery-table-wrap" tabindex="0" role="region" aria-label="كميات التوريد"><table class="delivery-table"><caption class="sr-only">كميات التوريد</caption><thead><tr><th scope="col">البند / الصنف</th><th scope="col">الوحدة</th><th scope="col">المطلوب</th><th scope="col">المستلم</th><th scope="col">المتبقي</th><th scope="col">آخر استلام</th></tr></thead><tbody>${order.lines.map(line=>`<tr><th scope="row"><bdi>${escape(line.lineNumber)}${line.itemCode?' · '+escape(line.itemCode):''}</bdi><span>${escape(line.description)}</span>${line.notes?`<small>${escape(line.notes)}</small>`:''}</th><td>${escape(line.unit)}</td><td>${quantity(line.ordered)}</td><td>${quantity(line.received)}</td><td>${quantity(line.remaining)}</td><td>${escape(date(line.lastReceiptDate)||'غير مسجل')}</td></tr>`).join('')}</tbody></table></div>${!order.linesComplete?'<p class="purchase-sub">لم يتأكد تسجيل جميع بنود هذا الأمر.</p>':''}`:'<p class="missing-value">كميات الأصناف والاستلام لم تُسجل بعد.</p>'}${order.notes?`<p>${escape(order.notes)}</p>`:''}</section>`).join('')}<p class="purchase-sub">إغلاق طلب PR يتطلب تأكيد اكتمال جميع أوامره؛ اكتمال LPO واحد لا يغلق الطلب.</p></div>`;
  }
  function detailRow(row){
    const {item,meta,linked}=row;
    const sources=item.sources.map(s=>`<li><span class="source-title">${escape(s.title)}</span><span class="source-locator">${escape(s.locator)} · <bdi>${escape(date(s.date))}</bdi></span></li>`).join('');
    return `<tr id="pr-detail-${escape(item.id)}" class="purchase-detail" ${expanded.has(item.id)?'':'hidden'}><td colspan="6"><div class="detail-grid"><div><h4>الحالة المسجلة</h4><p>${escape(item.status)}</p><p class="detail-meta"><span>آخر تعديل للبند</span>: <time translate="no" datetime="${escape(item.updatedAt||'')}">${escape(window.WorkshopRecordTime(item.updatedAt))}</time> <span>بتوقيت الإمارات</span></p></div><div><h4>جهة المتابعة</h4><p>${escape(item.followUpWith)}</p></div><div><h4>نوع المعاملة</h4><p>${escape(typeLabels[model.transactionType(meta)])}</p></div><div><h4>مرحلة المعاملة</h4><p>${escape(model.stageLabel(meta))}</p></div>${orderDetails(meta)}${window.WorkshopRelations?.forItem(item,feed)||''}${item.notes?`<div class="detail-full"><h4>الملاحظات</h4><p>${escape(item.notes)}</p></div>`:''}${linked.length?`<div class="detail-full"><h4>بنود فنية مرتبطة بنفس الطلب</h4>${linked.map(x=>`<p>${escape(x.title)} — ${escape(x.action)}</p>`).join('')}</div>`:''}<div class="detail-full"><h4>المراجع</h4><ul class="sources">${sources}</ul></div></div></td></tr>`;
  }
  function renderRows(){
    if(!feed)return;
    const scope=scopedRows(),options=stageOptions(scope);
    const visible=scope.filter(x=>(stage==='all'||groupStage(x,options)===stage)&&(!query||normal(I.search([x.item.title,x.meta.prNumber,x.meta.lpoNumber,x.meta.budgetCode,x.item.status,x.item.owner,x.item.action,typeLabels[model.transactionType(x.meta)],model.stageLabel(x.meta),...(x.meta.orders||[]).flatMap(o=>[o.lpoNumber,o.supplier,...o.lines.flatMap(l=>[l.itemCode,l.description])])])).includes(normal(query))));
    window.WorkshopPresentation?.setItems('procurement', visible.map(({item})=>item), stage==='all'?typeLabels[type]:(Object.fromEntries(options)[stage]||'حالات أخرى'));
    $('pr-count').textContent=visible.length+' / '+scope.length;
    $('pr-empty').hidden=visible.length!==0;$('pr-records').hidden=visible.length===0;
    const sections=options.filter(([id])=>id!=='all').map(([id,label])=>{
      const group=visible.filter(x=>groupStage(x,options)===id);if(!group.length)return '';
      const body=group.map(row=>{
        const {item,meta}=row;
        const amount=typeof meta.amountAed==='number'?`<bdi>${number.format(meta.amountAed)}</bdi><span class="purchase-sub">${meta.amountBasis==='estimated'?'قيمة تقديرية':meta.amountBasis==='quoted'?'قيمة العرض':'قيمة مسجلة'}</span>`:'<span class="missing-value">غير مسجل</span>';
        return `<tr class="purchase-row"><td class="purchase-number">${rows.indexOf(row)+1}</td><td class="purchase-topic"><span class="purchase-reference">${requestReference(meta)}</span><h4>${escape(item.title)}</h4>${(meta.orders||[]).map(order=>`<span class="purchase-sub">LPO <bdi>${escape(order.lpoNumber)}</bdi> · <span>${escape(window.WorkshopOrders.states[order.receiptState])}</span></span>`).join('')}</td><td class="purchase-amount" data-label="القيمة بالدرهم">${amount}${meta.amountNote?`<span class="purchase-sub">${escape(meta.amountNote)}</span>`:''}</td><td class="purchase-budget" data-label="بند الموازنة"><bdi>${escape(meta.budgetCode||'غير مسجل')}</bdi></td><td class="purchase-action"><span class="stage stage-${escape(item.stage)}">${escape(model.stageLabel(meta))}</span><p>${escape(item.action)}</p><span class="purchase-sub">${escape(item.owner)} · آخر معلومة <bdi>${escape(date(item.informationDate))}</bdi></span></td><td class="purchase-toggle">${window.WorkshopAdmin?.canEdit()?`<button type="button" class="edit-button" data-edit="${escape(item.id)}" aria-label="تعديل ${escape(item.title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z"/></svg></button>`:''}<button class="expand-button" type="button" data-pr-item="${escape(item.id)}" aria-label="تفاصيل ${escape(item.title)}" aria-expanded="${expanded.has(item.id)}" aria-controls="pr-detail-${escape(item.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></td></tr>${detailRow(row)}`;
      }).join('');
      return `<section class="purchase-stage-group" aria-label="${escape(label)}"><h4 class="purchase-stage-heading">${escape(label)} <span>${group.length}</span></h4><table class="purchase-table"><thead><tr><th scope="col">#</th><th scope="col">رقم الطلب والموضوع</th><th scope="col">القيمة — درهم</th><th scope="col">الموازنة</th><th scope="col">الحالة والإجراء المطلوب</th><th scope="col"><span class="sr-only">التفاصيل</span></th></tr></thead><tbody>${body}</tbody></table></section>`;
    }).join('');
    $('pr-records').innerHTML=sections;
  }
  function renderFilters(){
    const scope=scopedRows(),options=stageOptions(scope);
    $('pr-type-filters').innerHTML=model.transactionTypes.map(([id,label])=>`<button type="button" data-pr-type="${id}" class="filter-button ${type===id?'active':''}" aria-pressed="${type===id}">${escape(label)}<span class="filter-count">${id==='all'?rows.length:rows.filter(row=>model.transactionType(row.meta)===id).length}</span></button>`).join('');
    const buttons=stages=>stages.map(([id,label])=>`<button type="button" data-pr-stage="${id}" class="filter-button ${stage===id?'active':''}" aria-pressed="${stage===id}">${escape(label)}<span class="filter-count">${id==='all'?scope.length:scope.filter(x=>groupStage(x,options)===id).length}</span></button>`).join('');
    const activeStages=stages=>stages.filter(([id])=>!['received','completed','closed_unreceived'].includes(id));
    const cash=type==='petty_cash';
    $('pr-filters').innerHTML=buttons(cash?model.pettyCashStages:activeStages(model.primaryStages));
    const secondary=[...(cash?[]:activeStages(model.secondaryStages)),...options.filter(([id])=>id==='other')];
    $('pr-secondary-filters').innerHTML=buttons(secondary);
    $('pr-secondary-statuses').hidden=secondary.length===0;
    $('pr-order-note').hidden=cash||type==='contract';
    $('pr-summary').hidden=cash||type==='contract';
    const stats=model.metrics(scope.filter(row=>['pr','direct'].includes(model.transactionType(row.meta))));
    $('pr-numbered').textContent=stats.numbered;$('pr-unnumbered').textContent=stats.unnumbered;$('pr-quotes').textContent=stats.quotes;$('pr-received').textContent=stats.received;
  }
  window.addEventListener('workshop-data',event=>{
    feed=event.detail;const F=window.WorkshopFollowups;rows=model.getRows(feed).filter(row=>!F.isClosed(row.item,feed));
    $('overview-tab-count').textContent=feed.items.filter(item=>!F.isClosed(item,feed)).length;$('procurement-tab-count').textContent=rows.length;
    $('non-purchase-tab-count').textContent=feed.items.filter(item=>F.isGeneral(item,feed)&&!F.isClosed(item,feed)).length;
    $('plans-tab-count').textContent=feed.items.filter(item=>F.home(item,feed)==='development'&&!F.isClosed(item,feed)).length;
    $('closed-tab-count').textContent=F.archiveEntries(feed).length;
    renderFilters();renderRows();
  });
  $('pr-type-filters').addEventListener('click',event=>{const button=event.target.closest('[data-pr-type]');if(!button)return;type=button.dataset.prType;stage='all';saveFilters();renderFilters();renderRows();$('pr-type-filters').querySelector(`[data-pr-type="${type}"]`)?.focus({preventScroll:true});window.WorkshopMotion?.reveal($('pr-records'));});
  for(const id of ['pr-filters','pr-secondary-filters'])$(id).addEventListener('click',event=>{const button=event.target.closest('[data-pr-stage]');if(!button)return;stage=button.dataset.prStage;saveFilters();renderFilters();renderRows();$(id).querySelector(`[data-pr-stage="${stage}"]`)?.focus({preventScroll:true});window.WorkshopMotion?.reveal($('pr-records'));});
  $('pr-search').addEventListener('input',event=>{query=event.target.value;renderRows();});
  $('pr-clear').addEventListener('click',()=>{type='all';stage='all';query='';$('pr-search').value='';saveFilters();renderFilters();renderRows();});
  $('pr-records').addEventListener('click',event=>{
    if(window.WorkshopRelations?.handle(event))return;
    const edit=event.target.closest('button[data-edit]');
    if(edit){window.WorkshopAdmin?.open(edit.dataset.edit);return;}
    const button=event.target.closest('[data-pr-item]');if(!button)return;const id=button.dataset.prItem,open=!expanded.has(id);if(open)expanded.add(id);else expanded.delete(id);button.setAttribute('aria-expanded',String(open));$('pr-detail-'+id).hidden=!open;if(open)window.WorkshopMotion?.reveal($('pr-detail-'+id).querySelector('.detail-grid'),'detail');});
  const viewFromHash=()=>location.hash==='#purchase-orders'?'procurement':location.hash==='#letters'?'letters':location.hash==='#jobs'?'jobs':location.hash==='#stats'?'stats':location.hash==='#plans'?'plans':location.hash==='#non-purchase'?'non-purchase':location.hash==='#closed'?'closed':location.hash==='#overview'?'overview':'non-purchase';
  window.WorkshopPurchases={orderDetails,reveal(id){
    const item=feed?.items.find(item=>item.id===id);
    if(item&&window.WorkshopFollowups.isClosed(item,feed)){window.WorkshopArchive?.reveal('item:'+id);return;}
    if(!rows.some(row=>row.item.id===id))return;
    type=model.transactionType(item.procurement);stage='all';query='';$('pr-search').value='';expanded.add(id);saveFilters();
    selectView('procurement');renderFilters();renderRows();
    const target=$('pr-detail-'+id);
    target?.scrollIntoView({block:'center',behavior:'smooth'});
  }};
  window.addEventListener('hashchange',()=>selectView(viewFromHash(),false));
  // Reformat locale-dependent dates and refresh bilingual search results immediately.
  window.addEventListener('workshop-session',()=>{if(feed)renderRows();});
  window.addEventListener('workshop-language',()=>{renderFilters();renderRows();});
  selectView(viewFromHash(),false);
})();

