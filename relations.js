'use strict';
(() => {
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=value=>value?String(value).slice(0,10).split('-').reverse().join(' / '):'غير مسجل';
  let current=null;
  const linked=(item,data)=>({
    letters:(data?.letters||[]).filter(letter=>letter.taskId===item.id),
    jobs:(data?.jobs||[]).filter(job=>job.taskId===item.id)
  });
  function forItem(item,data) {
    const S=window.WorkshopSheets;
    const editable=Boolean(window.WorkshopAdmin?.canEdit());
    const records=linked(item,data);
    const addLetter=editable&&Array.isArray(data?.letters);
    const addJob=editable&&Array.isArray(data?.jobs);
    if(!records.letters.length&&!records.jobs.length&&!addLetter&&!addJob)return '';
    const letterRows=records.letters.map(letter=>`<li class="related-record">
      <div class="related-heading"><strong>${escape(letter.title)}</strong>
        <button type="button" class="link-button" data-related-kind="letter" data-related-id="${escape(letter.id)}">فتح الكتاب</button></div>
      <p class="related-meta">${escape(S.directions[letter.direction])} · <bdi>${escape(letter.reference||'بلا رقم مسجل')}</bdi> · ${escape(letter.party||'الجهة غير مسجلة')}</p>
      <p class="related-meta">حالة العمل المسجلة في الكتاب: ${escape(S.workStates[letter.work])} · حالة الرد: ${escape(S.replyStates[letter.reply])} · حالة الكتاب: ${escape(S.closureStates[letter.closure])}</p>
      ${letter.action?`<p><strong>الإجراء التالي:</strong> ${escape(letter.action)}</p>`:''}
      ${letter.location?`<p class="related-meta">آخر موقع مسجل: ${escape(letter.location)}</p>`:''}
    </li>`).join('');
    const jobRows=records.jobs.map(job=>`<li class="related-record">
      <div class="related-heading"><strong>${escape(job.title)}</strong>
        <button type="button" class="link-button" data-related-kind="job" data-related-id="${escape(job.id)}">فتح العمل</button></div>
      <p class="related-meta">${escape(S.parties[job.party])} · ${escape(job.counterpart||'بلا جهة مقابلة مسجلة')} · ${escape(S.jobStates[job.state])}</p>
      <p class="related-meta">المسؤول: ${escape(job.owner||'غير مسجل')} · الموعد المتوقع: ${escape(date(job.dueDate))}</p>
      ${job.notes?`<p>${escape(job.notes)}</p>`:''}
    </li>`).join('');
    return `<div class="detail-full related-records">
      <div class="related-heading"><h4>المراسلات المرتبطة</h4><div class="related-actions">
      ${addLetter?`<button type="button" class="link-button" data-related-kind="new-letter" data-task-id="${escape(item.id)}">إضافة كتاب مرتبط</button>`:''}
      ${addJob?`<button type="button" class="link-button" data-related-kind="new-job" data-task-id="${escape(item.id)}">إضافة عمل مرتبط</button>`:''}
      </div></div>
      ${letterRows?`<h5>كتب تراسل</h5><ul class="related-list">${letterRows}</ul>`:''}
      ${jobRows?`<h5>الأعمال</h5><ul class="related-list">${jobRows}</ul>`:''}
      ${!letterRows&&!jobRows?'<p class="related-meta">لا توجد مراسلات أو أعمال مرتبطة بهذه المتابعة بعد.</p>':''}
    </div>`;
  }
  function handle(event) {
    const button=event.target.closest('button[data-related-kind]');
    if(!button)return false;
    const kind=button.dataset.relatedKind;
    if(kind==='letter')window.WorkshopLetters?.reveal(button.dataset.relatedId);
    else if(kind==='job')window.WorkshopJobs?.reveal(button.dataset.relatedId);
    else if(kind==='new-letter')window.WorkshopAdmin?.openLetter(null,button.dataset.taskId);
    else if(kind==='new-job')window.WorkshopAdmin?.openJob(null,button.dataset.taskId);
    return true;
  }
  function revealItem(id) {
    const item=current?.items.find(value=>value.id===id);
    if(!item)return;
    if(window.WorkshopFollowups.isClosed(item,current)){window.WorkshopArchive?.reveal('item:'+id);return;}
    if(window.WorkshopProcurement.isPurchaseRelated(item)&&item.procurement?.kind!=='linked')window.WorkshopPurchases?.reveal(id);
    else window.WorkshopApp?.reveal(id);
  }
  function searchValues(item,data) {
    const records=linked(item,data);
    return [...records.letters.flatMap(letter=>[letter.title,letter.reference,letter.party,letter.action]),
      ...records.jobs.flatMap(job=>[job.title,job.counterpart,job.owner,job.notes])];
  }
  window.WorkshopRelations={forItem,handle,revealItem,searchValues};
  window.addEventListener('workshop-data',event=>{current=event.detail;});
})();
