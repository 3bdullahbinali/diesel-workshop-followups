'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const F=window.WorkshopFollowups, S=window.WorkshopSheets, P=window.WorkshopProcurement, I=window.WorkshopI18n;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normal=value=>String(value??'').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[\u064B-\u065F]/g,'').trim();
  const date=value=>value?String(value).slice(0,10).split('-').reverse().join(' / '):'غير مسجل';
  const number=value=>typeof value==='number'?new Intl.NumberFormat('en-AE').format(value):'غير مسجل';
  const parties={all:'كل الأطراف',...S.parties,unspecified:'الطرف غير محدد'};
  const general={all:'الكل',...Object.fromEntries(F.generalCategories.map(id=>[id,F.homeLabels[id]]))};
  const completion={all:'الكل',completed:P.stageLabels.completed,received:P.stageLabels.received,closed_unreceived:P.stageLabels.closed_unreceived};
  let feed=null, entries=[], kind='all', category='all', detail='all', query='';
  const expanded=new Set();
  const endState=entry=>['completed','received','closed_unreceived'].includes(entry.record.stage)?entry.record.stage:'completed';
  function detailLabels(){
    if(kind==='general'&&category==='coordination')return F.coordinationLabels;
    if(kind==='general'&&category==='technical')return parties;
    if(kind==='letters')return {all:'الكل',out:S.directions.out,in:S.directions.in};
    if(kind==='procurement')return completion;
    return null;
  }
  function detailValue(entry){
    if(kind==='letters')return entry.record.direction;
    if(kind==='procurement')return endState(entry);
    if(category==='coordination')return F.coordinationTopic(entry.record,feed);
    if(category==='technical')return (entry.type==='job'?entry.record:F.jobFor(entry.record,feed))?.party||'unspecified';
    return null;
  }
  function matchesSearch(entry){
    const r=entry.record,p=r.procurement;
    const values=[r.title,r.reference,r.owner,r.party,r.counterpart,r.action,r.status,r.notes,p?.prNumber,p?.lpoNumber,p?.budgetCode];
    if(entry.type==='item')values.push(...(window.WorkshopRelations?.searchValues(r,feed)||[]),...(p?.orders||[]).flatMap(o=>[o.lpoNumber,o.supplier,...o.lines.flatMap(l=>[l.itemCode,l.description])]));
    return !query||normal(I.search(values)).includes(normal(query));
  }
  function buttons(host,labels,selected,list,value){
    $(host).innerHTML=Object.entries(labels).map(([id,label])=>`<button type="button" data-archive-filter="${id}" class="filter-button ${selected===id?'active':''}" aria-pressed="${selected===id}">${escape(label)}<span class="filter-count">${id==='all'?list.length:list.filter(entry=>value(entry)===id).length}</span></button>`).join('');
  }
  function taskCard(entry){
    const item=entry.record,meta=item.procurement,job=F.jobFor(item,feed),linked=meta?.kind==='linked';
    const editable=window.WorkshopAdmin?.canEdit();
    const linkedJobs=(feed.jobs||[]).filter(job=>job.taskId===item.id);
    const closureLabel=linked?'متابعة مرتبطة بطلب شراء — مكتملة':P.stageLabels[endState(entry)];
    const ref=meta?.prNumber?'PR '+meta.prNumber:item.reference;
    const field=(label,value)=>`<div><dt>${escape(label)}</dt><dd>${escape(value||'غير مسجل')}</dd></div>`;
    const purchase=meta?`<dl class="archive-meta">${field('القيمة — درهم',number(meta.amountAed))}${field('بند الموازنة',meta.budgetCode)}${field('رقم PR',meta.prNumber)}</dl>`:'';
    const jobMeta=job?`<dl class="archive-meta">${field('طرف العمل',parties[job.party]||parties.unspecified)}${field('الجهة',job.counterpart)}${field('تاريخ البدء',date(job.startDate))}</dl>`:'';
    return `<article class="archive-card">
      <div class="record-context"><span class="source-tag">${escape(F.closedKinds[entry.kind])}</span>${entry.kind==='general'?`<span>${escape(F.homeLabels[entry.category])}</span>`:''}<span class="stage stage-completed">${escape(closureLabel)}</span></div>
      <h4>${escape(item.title)}</h4><p class="reference" dir="auto">${escape(ref)}</p>
      <p class="archive-status">${escape(item.status)}</p><p class="archive-action">${escape(item.action)}</p>
      ${purchase}${jobMeta}<p class="owner">${escape(item.owner)}</p><p class="archive-time"><span>آخر معلومة</span>: <time datetime="${escape(item.informationDate||'')}">${escape(date(item.informationDate))}</time></p>
      <p class="archive-time"><span>آخر تعديل للبند</span>: <time translate="no" datetime="${escape(item.updatedAt||'')}">${escape(window.WorkshopRecordTime(item.updatedAt))}</time> <span>بتوقيت الإمارات</span></p>
      ${linked&&meta.parentItemId?`<button type="button" class="link-button" data-goto="${escape(meta.parentItemId)}">فتح طلب الشراء المرتبط</button>`:''}
      ${editable?`<div class="archive-edit-actions"><button type="button" class="link-button" data-edit="${escape(item.id)}">تعديل المتابعة</button>${linkedJobs.map(job=>`<button type="button" class="link-button" data-edit-job="${escape(job.id)}">تعديل العمل</button>`).join('')}</div>`:''}
      <details class="archive-details" data-archive-detail="${escape(entry.key)}" ${expanded.has(entry.key)?'open':''}><summary>التفاصيل</summary>${window.WorkshopApp.detailContent(item)}${meta&&meta.kind!=='linked'?`<div class="archive-orders">${window.WorkshopPurchases.orderDetails(meta)}</div>`:''}</details>
    </article>`;
  }
  function presentationItem(entry){
    const r=entry.record;
    if(entry.type==='item')return {...r,id:entry.key,stage:endState(entry)};
    return {id:entry.key,title:r.title,reference:r.reference||'',stage:'completed',status:entry.type==='letter'?S.closureStates.closed:S.jobStates.done,action:r.action||r.notes||'',owner:r.owner||r.party||'',informationDate:r.verifiedDate||null,updatedAt:r.updatedAt||null};
  }
  function render(){
    if(!feed)return;
    const searched=entries.filter(matchesSearch);
    buttons('archive-kinds',F.closedKinds,kind,searched,e=>e.kind);
    const selected=searched.filter(entry=>kind==='all'||entry.kind===kind);
    $('archive-categories').hidden=kind!=='general';
    if(kind==='general')buttons('archive-categories',general,category,selected,e=>e.category);
    const scoped=selected.filter(entry=>kind!=='general'||category==='all'||entry.category===category);
    const labels=detailLabels();$('archive-detail-filters').hidden=!labels;
    if(labels)buttons('archive-detail-filters',labels,detail,scoped,detailValue);
    const visible=scoped.filter(entry=>!labels||detail==='all'||detailValue(entry)===detail);
    $('archive-count').textContent=visible.length+' / '+entries.length;
    $('closed-tab-count').textContent=entries.length;
    $('archive-grid').innerHTML=visible.map(entry=>`<div class="archive-entry" data-archive-key="${escape(entry.key)}">${entry.type==='letter'?window.WorkshopLetters.card(entry.record):entry.type==='job'?window.WorkshopJobs.card(entry.record):taskCard(entry)}</div>`).join('');
    $('archive-grid').hidden=!visible.length;$('archive-empty').hidden=Boolean(visible.length);
    window.WorkshopPresentation?.setItems('closed',visible.map(presentationItem),'المتابعات المغلقة');
  }
  function adopt(data){
    feed=data;entries=F.archiveEntries(data).sort((a,b)=>String(b.record.updatedAt||b.record.verifiedDate||'').localeCompare(String(a.record.updatedAt||a.record.verifiedDate||''))||a.key.localeCompare(b.key));
    render();
  }
  for(const [id,apply] of [
    ['archive-kinds',value=>{kind=value;category='all';detail='all';}],
    ['archive-categories',value=>{category=value;detail='all';}],
    ['archive-detail-filters',value=>{detail=value;}]
  ])$(id).addEventListener('click',event=>{const button=event.target.closest('button[data-archive-filter]');if(!button)return;const value=button.dataset.archiveFilter;apply(value);render();$(id).querySelector(`[data-archive-filter="${value}"]`)?.focus({preventScroll:true});});
  $('archive-search').addEventListener('input',event=>{query=event.target.value;render();});
  $('archive-reset').addEventListener('click',()=>{kind='all';category='all';detail='all';query='';$('archive-search').value='';render();});
  $('archive-grid').addEventListener('click',event=>{
    if(window.WorkshopRelations.handle(event))return;
    const edit=event.target.closest('[data-edit], [data-edit-task], [data-edit-letter], [data-edit-job]');
    if(edit){
      if(edit.dataset.editLetter)window.WorkshopAdmin?.openLetter(edit.dataset.editLetter);
      else if(edit.dataset.editJob)window.WorkshopAdmin?.openJob(edit.dataset.editJob);
      else window.WorkshopAdmin?.open(edit.dataset.edit||edit.dataset.editTask);
      return;
    }
    const button=event.target.closest('[data-goto]');if(button)window.WorkshopRelations.revealItem(button.dataset.goto);
  });
  $('archive-grid').addEventListener('toggle',event=>{
    const node=event.target;if(!node.matches('details[data-archive-detail]')||!node.isConnected)return;
    if(node.open)expanded.add(node.dataset.archiveDetail);else expanded.delete(node.dataset.archiveDetail);
  },true);
  window.WorkshopArchive={get list(){return entries;},render,reveal(key){
    const entry=entries.find(entry=>entry.key===key);if(!entry)return;
    kind=entry.kind;category=entry.kind==='general'?entry.category:'all';detail='all';query='';$('archive-search').value='';expanded.add(key);
    window.WorkshopViews.select('closed');render();
    const target=[...$('archive-grid').children].find(node=>node.dataset.archiveKey===key);target?.setAttribute('tabindex','-1');target?.focus({preventScroll:true});target?.scrollIntoView({block:'center',behavior:'smooth'});
  }};
  window.addEventListener('workshop-data',event=>adopt(event.detail));
  window.addEventListener('workshop-view',event=>{if(event.detail==='closed')render();});
  window.addEventListener('workshop-session',render);
  window.addEventListener('workshop-language',render);
  window.addEventListener('workshop-translations',render);
})();
