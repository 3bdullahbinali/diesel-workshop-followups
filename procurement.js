'use strict';
(() => {
  const I=window.WorkshopI18n;
  const model=globalThis.WorkshopProcurement;
  const $=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normal=value=>String(value??'').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[\u064B-\u065F]/g,'').trim();
  const number=new Intl.NumberFormat('en-AE',{maximumFractionDigits:2});
  const date=value=>String(value||'').split('-').reverse().join(' / ');
  let rows=[],stage='all',query='',feed=null;
  let selectedView=null;
  const expanded=new Set();
  const panels={procurement:'procurement-panel',letters:'letters-panel',jobs:'jobs-panel',stats:'stats-panel',closed:'closed-panel',readiness:'readiness-panel'};
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
    if(meta.prNumber)return `${escape(meta.numberType||'PR')} <bdi>${escape(meta.prNumber)}</bdi>`;
    if(meta.lpoNumber)return `LPO <bdi>${escape(meta.lpoNumber)}</bdi>`;
    return meta.kind==='planning'?'احتياج مستقبلي':'رقم PR لم يصدر';
  }
  function orderDetails(meta){
    const orders=meta.orders||[];
    if(!orders.length)return `<div class="detail-full"><h4>أوامر الشراء والاستلام</h4><p class="missing-value">لم يُسجل أمر شراء LPO بعد.</p></div>`;
    const quantity=value=>value==null?'غير مسجل':number.format(value);
    return `<div class="detail-full lpo-details"><h4>أوامر الشراء والاستلام</h4>${orders.map(order=>`<section class="lpo-card"><div class="lpo-heading"><h5>LPO <bdi>${escape(order.lpoNumber)}</bdi></h5><span class="stage stage-${escape(order.receiptState)}">${escape(window.WorkshopOrders.states[order.receiptState])}</span></div><dl class="lpo-meta"><div><dt>المورد</dt><dd>${escape(order.supplier||'غير مسجل')}</dd></div><div><dt>قيمة الأمر — درهم</dt><dd><bdi>${quantity(order.amountAed)}</bdi></dd></div><div><dt>تاريخ الإصدار</dt><dd>${escape(date(order.issuedDate)||'غير مسجل')}</dd></div><div><dt>موعد التوريد</dt><dd>${escape(date(order.dueDate)||'غير مسجل')}</dd></div><div><dt>تاريخ آخر استلام</dt><dd>${escape(date(order.lastReceiptDate)||'غير مسجل')}</dd></div></dl>${order.lines.length?`<div class="delivery-table-wrap" tabindex="0" role="region" aria-label="كميات التوريد"><table class="delivery-table"><caption class="sr-only">كميات التوريد</caption><thead><tr><th scope="col">البند / الصنف</th><th scope="col">الوحدة</th><th scope="col">المطلوب</th><th scope="col">المستلم</th><th scope="col">المتبقي</th><th scope="col">آخر استلام</th></tr></thead><tbody>${order.lines.map(line=>`<tr><th scope="row"><bdi>${escape(line.lineNumber)}${line.itemCode?' · '+escape(line.itemCode):''}</bdi><span>${escape(line.description)}</span>${line.notes?`<small>${escape(line.notes)}</small>`:''}</th><td>${escape(line.unit)}</td><td>${quantity(line.ordered)}</td><td>${quantity(line.received)}</td><td>${quantity(line.remaining)}</td><td>${escape(date(line.lastReceiptDate)||'غير مسجل')}</td></tr>`).join('')}</tbody></table></div>${!order.linesComplete?'<p class="purchase-sub">لم يتأكد تسجيل جميع بنود هذا الأمر.</p>':''}`:'<p class="missing-value">كميات الأصناف والاستلام لم تُسجل بعد.</p>'}${order.notes?`<p>${escape(order.notes)}</p>`:''}</section>`).join('')}<p class="purchase-sub">إغلاق طلب PR يتطلب تأكيد اكتمال جميع أوامره؛ اكتمال LPO واحد لا يغلق الطلب.</p></div>`;
  }
  function detailRow(row){
    const {item,meta,linked}=row;
    const sources=item.sources.map(s=>`<li><span class="source-title">${escape(s.title)}</span><span class="source-locator">${escape(s.locator)} · <bdi>${escape(date(s.date))}</bdi></span></li>`).join('');
    return `<tr id="pr-detail-${escape(item.id)}" class="purchase-detail" ${expanded.has(item.id)?'':'hidden'}><td colspan="6"><div class="detail-grid"><div><h4>الحالة المسجلة</h4><p>${escape(item.status)}</p><p class="detail-meta"><span>آخر تعديل للبند</span>: <time translate="no" datetime="${escape(item.updatedAt||'')}">${escape(window.WorkshopRecordTime(item.updatedAt))}</time> <span>بتوقيت الإمارات</span></p></div><div><h4>جهة المتابعة</h4><p>${escape(item.followUpWith)}</p></div>${orderDetails(meta)}${window.WorkshopRelations?.forItem(item,feed)||''}${item.notes?`<div class="detail-full"><h4>الملاحظات</h4><p>${escape(item.notes)}</p></div>`:''}${linked.length?`<div class="detail-full"><h4>بنود فنية مرتبطة بنفس الطلب</h4>${linked.map(x=>`<p>${escape(x.title)} — ${escape(x.action)}</p>`).join('')}</div>`:''}<div class="detail-full"><h4>المراجع</h4><ul class="sources">${sources}</ul></div></div></td></tr>`;
  }
  function renderRows(){
    if(!feed)return;
    const visible=rows.filter(x=>(stage==='all'||model.displayStage(x.meta.stage)===stage)&&(!query||normal(I.search([x.item.title,x.meta.prNumber,x.meta.lpoNumber,x.meta.budgetCode,x.item.status,x.item.owner,x.item.action,...(x.meta.orders||[]).flatMap(o=>[o.lpoNumber,o.supplier,...o.lines.flatMap(l=>[l.itemCode,l.description])])])).includes(normal(query))));
    window.WorkshopPresentation?.setItems('procurement', visible.map(({item})=>item), stage==='all'?'طلبات الشراء':model.stageLabels[stage]);
    $('pr-count').textContent=visible.length+' / '+rows.length;
    $('pr-empty').hidden=visible.length!==0;$('pr-records').hidden=visible.length===0;
    const sections=model.stages.filter(([id])=>id!=='all').map(([id,label])=>{
      const group=visible.filter(x=>model.displayStage(x.meta.stage)===id);if(!group.length)return '';
      const body=group.map(row=>{
        const {item,meta}=row;
        const amount=typeof meta.amountAed==='number'?`<bdi>${number.format(meta.amountAed)}</bdi><span class="purchase-sub">${meta.amountBasis==='estimated'?'قيمة تقديرية':meta.amountBasis==='quoted'?'قيمة العرض':'قيمة مسجلة'}</span>`:'<span class="missing-value">غير مسجل</span>';
        return `<tr class="purchase-row"><td class="purchase-number">${rows.indexOf(row)+1}</td><td class="purchase-topic"><span class="purchase-reference">${requestReference(meta)}</span><h4>${escape(item.title)}</h4>${(meta.orders||[]).map(order=>`<span class="purchase-sub">LPO <bdi>${escape(order.lpoNumber)}</bdi> · <span>${escape(window.WorkshopOrders.states[order.receiptState])}</span></span>`).join('')}</td><td class="purchase-amount" data-label="القيمة بالدرهم">${amount}${meta.amountNote?`<span class="purchase-sub">${escape(meta.amountNote)}</span>`:''}</td><td class="purchase-budget" data-label="بند الموازنة"><bdi>${escape(meta.budgetCode||'غير مسجل')}</bdi></td><td class="purchase-action"><span class="stage stage-${escape(item.stage)}">${escape(model.stageLabels[meta.stage])}</span><p>${escape(item.action)}</p><span class="purchase-sub">${escape(item.owner)} · آخر معلومة <bdi>${escape(date(item.informationDate))}</bdi></span></td><td class="purchase-toggle">${window.WorkshopAdmin?.canEdit()?`<button type="button" class="edit-button" data-edit="${escape(item.id)}" aria-label="تعديل ${escape(item.title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z"/></svg></button>`:''}<button class="expand-button" type="button" data-pr-item="${escape(item.id)}" aria-label="تفاصيل ${escape(item.title)}" aria-expanded="${expanded.has(item.id)}" aria-controls="pr-detail-${escape(item.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></td></tr>${detailRow(row)}`;
      }).join('');
      return `<section class="purchase-stage-group" aria-label="${escape(label)}"><h4 class="purchase-stage-heading">${escape(label)} <span>${group.length}</span></h4><table class="purchase-table"><thead><tr><th scope="col">#</th><th scope="col">رقم الطلب والموضوع</th><th scope="col">القيمة — درهم</th><th scope="col">الموازنة</th><th scope="col">الحالة والإجراء المطلوب</th><th scope="col"><span class="sr-only">التفاصيل</span></th></tr></thead><tbody>${body}</tbody></table></section>`;
    }).join('');
    $('pr-records').innerHTML=sections;
  }
  function renderFilters(){
    const buttons=stages=>stages.map(([id,label])=>`<button type="button" data-pr-stage="${id}" class="filter-button ${stage===id?'active':''}" aria-pressed="${stage===id}">${escape(label)}<span class="filter-count">${id==='all'?rows.length:rows.filter(x=>model.displayStage(x.meta.stage)===id).length}</span></button>`).join('');
    const activeStages=stages=>stages.filter(([id])=>!['received','completed','closed_unreceived'].includes(id));
    $('pr-filters').innerHTML=buttons(activeStages(model.primaryStages));
    $('pr-secondary-filters').innerHTML=buttons(activeStages(model.secondaryStages));
  }
  window.addEventListener('workshop-data',event=>{
    feed=event.detail;const F=window.WorkshopFollowups;rows=model.getRows(feed).filter(row=>!F.isClosed(row.item,feed));const stats=model.metrics(rows);
    $('overview-tab-count').textContent=feed.items.filter(item=>!F.isClosed(item,feed)).length;$('procurement-tab-count').textContent=rows.length;
    $('non-purchase-tab-count').textContent=feed.items.filter(item=>F.isGeneral(item,feed)&&!F.isClosed(item,feed)).length;
    $('plans-tab-count').textContent=feed.items.filter(item=>F.home(item,feed)==='development'&&!F.isClosed(item,feed)).length;
    $('closed-tab-count').textContent=F.archiveEntries(feed).length;
    $('pr-numbered').textContent=stats.numbered;$('pr-unnumbered').textContent=stats.unnumbered;$('pr-quotes').textContent=stats.quotes;$('pr-received').textContent=stats.received;
    renderFilters();renderRows();
  });
  for(const id of ['pr-filters','pr-secondary-filters'])$(id).addEventListener('click',event=>{const button=event.target.closest('[data-pr-stage]');if(!button)return;stage=button.dataset.prStage;renderFilters();renderRows();window.WorkshopMotion?.reveal($('pr-records'));});
  $('pr-search').addEventListener('input',event=>{query=event.target.value;renderRows();});
  $('pr-clear').addEventListener('click',()=>{stage='all';query='';$('pr-search').value='';renderFilters();renderRows();});
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
    stage='all';query='';$('pr-search').value='';expanded.add(id);
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
