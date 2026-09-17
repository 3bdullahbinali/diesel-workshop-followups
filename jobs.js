'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const I = window.WorkshopI18n;
  const S = window.WorkshopSheets;
  const F=window.WorkshopFollowups;
  const partyLabels={...S.parties,unspecified:'الطرف غير محدد'};
  const stateLabels={...S.jobStates,follow_up:'بانتظار المتابعة',quotes:'بانتظار العروض',on_hold:'مؤجل'};
  let feed=null,source='all';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normal = value => String(value ?? '').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[ً-ٟ]/g,'').trim();
  const shortDate = value => value ? String(value).slice(0,10).split('-').reverse().join(' / ') : 'غير مسجل';
  let jobs = null, items = [], party = 'all', state = 'open', query = '';
  const expanded=new Set();

  // «قائم» يعني عملاً لم يكتمل ولم يُلغَ؛ هو ما يهم في شاشة الورشة.
  const running = job => !['done','cancelled'].includes(job.state);
  function matches(job) {
    if (party !== 'all' && job.party !== party) return false;
    if (state === 'open' && !running(job)) return false;
    if (state !== 'all' && state !== 'open' && job.state !== state) return false;
    if(source!=='all'&&!F.sources(items.find(i=>i.id===job.taskId),feed).includes(source))return false;
    if (!query) return true;
    const task = items.find(item => item.id === job.taskId);
    return normal(I.search([job.title, job.counterpart, job.owner, job.notes, task?.title, task?.reference, task?.action, task?.status, task?.notes, ...(task?.sources||[]).flatMap(source=>[source.title,source.locator])])).includes(normal(query));
  }
  function gearLine(task) {
    const gear = task?.equipment;
    if (!gear) return '';
    const parts = [S.phases[gear.phase], S.handovers[gear.handover], gear.asset && 'رقم المعدة ' + gear.asset].filter(Boolean);
    return `<p class="job-gear"><span>المعدة المستلمة</span>${escape(parts.join(' · '))}</p>`;
  }
  function card(job) {
    const task = items.find(item => item.id === job.taskId);
    const linked=task?window.WorkshopRelations.forItem(task,{...feed,jobs:[]}):'';
    const editable = window.WorkshopAdmin?.canEdit();
    const late = running(job) && job.dueDate && job.dueDate < new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai'}).format(new Date());
    return `<article class="job-card" data-job="${escape(job.id)}">
      <div class="job-top">
        <span class="job-party" data-party="${escape(job.party)}">${escape(partyLabels[job.party])}</span>
        <span class="job-state" data-state="${escape(job.state)}">${escape(stateLabels[job.state])}</span>
        ${editable ? `<button type="button" class="edit-button" ${job.recordView?`data-edit-task="${escape(task.id)}"`:`data-edit-job="${escape(job.id)}"`} aria-label="تعديل ${escape(job.title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z"/></svg></button>` : ''}
      </div>
      <h4>${escape(job.title)}</h4><div class="record-context">${F.sources(task,feed).map(id=>`<span class="source-tag">${escape(F.sourceLabels[id])}</span>`).join('')}</div>${task?`<div class="job-action"><h5>الإجراء الحالي</h5><p>${escape(task.action)}</p></div>`:''}
      <p class="job-counterpart">${escape(job.counterpart || 'بلا جهة مقابلة مسجلة')}</p>
      <dl class="job-meta">
        <div><dt>المسؤول</dt><dd>${escape(job.owner || 'غير مسجل')}</dd></div>
        <div><dt>تاريخ البدء</dt><dd><bdi>${escape(shortDate(job.startDate))}</bdi></dd></div>
        <div><dt>الموعد المتوقع</dt><dd><bdi class="${late ? 'job-late' : ''}">${escape(shortDate(job.dueDate))}</bdi></dd></div>
      </dl>
      ${gearLine(task)}
      ${linked}
      ${job.notes ? `<p class="job-notes">${escape(job.notes)}</p>` : ''}
      ${task ? `<details class="job-followup" data-job-task="${escape(job.id)}" ${expanded.has(job.id)?'open':''}><summary>التفاصيل</summary>${window.WorkshopApp.detailContent(task,job.id)}${editable?`<button type="button" class="link-button" data-edit-task="${escape(task.id)}" aria-label="تعديل ${escape(task.title)}">تعديل</button>`:''}</details>` : ''}
    </article>`;
  }
  function render() {
    if (!jobs) return;
    const visible = jobs.filter(matches).sort((a,b)=>{const x=items.find(i=>i.id===a.taskId),y=items.find(i=>i.id===b.taskId);return ({high:0,medium:1,low:2}[x?.priority]??3)-({high:0,medium:1,low:2}[y?.priority]??3)||(a.dueDate||'9999').localeCompare(b.dueDate||'9999');});
    const byParty = Object.fromEntries(Object.keys(partyLabels).map(id => [id, jobs.filter(job => job.party === id).length]));
    const partyButtons = entries => entries.map(([id,label]) =>
      `<button type="button" data-party="${escape(id)}" class="filter-button ${party===id?'active':''}" aria-pressed="${party===id}">${escape(label)}<span class="filter-count">${id==='all'?jobs.length:byParty[id]}</span></button>`).join('');
    $('jobs-parties').innerHTML = partyButtons([['all','كل الأطراف'], ...Object.entries(S.parties)]);
    $('jobs-other-parties').innerHTML = partyButtons([['unspecified',partyLabels.unspecified]]);
    const byState = {all:jobs.length, open:jobs.filter(running).length, ...Object.fromEntries(Object.keys(stateLabels).map(id => [id, jobs.filter(job => job.state === id).length]))};
    const stateButtons = entries => entries.map(([id,label]) =>
      `<button type="button" data-state="${escape(id)}" class="filter-button ${state===id?'active':''}" aria-pressed="${state===id}">${escape(label)}<span class="filter-count">${byState[id]}</span></button>`).join('');
    $('jobs-states').innerHTML = stateButtons([['open','الأعمال القائمة'],['all','كل الأعمال'],['awaiting_parts',stateLabels.awaiting_parts],['awaiting_party',stateLabels.awaiting_party]]);
    $('jobs-other-states').innerHTML = stateButtons(['not_started','in_progress','follow_up','quotes','on_hold','cancelled'].map(id => [id,stateLabels[id]]));
    $('jobs-sources').innerHTML=Object.entries(F.sourceLabels).map(([id,label])=>{const n=jobs.filter(job=>id==='all'||F.sources(items.find(i=>i.id===job.taskId),feed).includes(id)).length;return `<button type="button" data-job-source="${id}" class="filter-button ${source===id?'active':''}" aria-pressed="${source===id}">${escape(label)}<span class="filter-count">${n}</span></button>`;}).join('');
    $('jobs-count').textContent = `${visible.length} / ${jobs.length}`;
    // One technical task per card, whether or not a detailed job is registered.
    $('jobs-groups').innerHTML = `<div class="job-grid">${visible.map(card).join('')}</div>`;
    const parts=[party!=='all'?partyLabels[party]:'',state!=='open'?(state==='all'?'كل الأعمال':stateLabels[state]):'',source!=='all'?F.sourceLabels[source]:''].filter(Boolean);
    $('jobs-filter-count').textContent=parts.length;
    $('jobs-filter-count').hidden=!parts.length;
    $('jobs-filter-summary').hidden=!parts.length;
    $('jobs-filter-description').innerHTML=parts.map(label=>`<span>${escape(label)}</span>`).join('<span aria-hidden="true"> · </span>');
    $('jobs-groups').hidden = visible.length === 0;
    $('jobs-empty').hidden = visible.length !== 0;
    $('jobs-add').hidden = !window.WorkshopAdmin?.canEdit() || !Array.isArray(feed.jobs);
    $('jobs-open-count').textContent = jobs.filter(running).length;
    if($('jobs-tab-count'))$('jobs-tab-count').textContent=jobs.filter(running).length;
  }
  function adopt(data) {
    feed=data;items = data.items || [];
    jobs=F.technicalEntries(data).filter(job=>job.state!=='done');
    render();
  }
  window.WorkshopJobs = {
    get list() { return jobs || []; },
    find(id) { return (feed?.jobs || []).find(job => job.id === id) || null; },
    render,card,
    revealTask(taskId,openDetails=false){const item=items.find(item=>item.id===taskId);if(item&&F.isClosed(item,feed)){window.WorkshopArchive?.reveal('item:'+taskId);return;}const job=(jobs||[]).find(j=>j.taskId===taskId);if(job)this.reveal(job.id,openDetails);},
    reveal(id,openDetails=false) {
      const archived=F.technicalEntries(feed||{}).find(job=>job.id===id&&job.state==='done');
      if(archived){window.WorkshopArchive?.reveal(items.some(item=>item.id===archived.taskId)?'item:'+archived.taskId:'job:'+id);return;}
      const job=(jobs||[]).find(value=>value.id===id);
      if(!job)return;
      if(openDetails)expanded.add(id);
      party='all';state='all';source='all';query='';$('jobs-search').value='';
      window.WorkshopViews?.select('jobs');render();
      const target=document.querySelector('[data-job="'+CSS.escape(id)+'"]');
      target?.setAttribute('tabindex','-1');target?.focus({preventScroll:true});
      target?.scrollIntoView({block:'center',behavior:'smooth'});
    }
  };
  window.addEventListener('workshop-data', event => adopt(event.detail));
  window.addEventListener('workshop-view',event=>{if(event.detail==='jobs')render();});
  window.addEventListener('workshop-session', render);
  window.addEventListener('workshop-language', render);
  window.addEventListener('workshop-translations', render);
  for (const id of ['jobs-parties','jobs-other-parties']) $(id).addEventListener('click', event => {
    const button = event.target.closest('button[data-party]');
    if (!button) return;
    party = button.dataset.party;
    render();
  });
  for (const id of ['jobs-states','jobs-other-states']) $(id).addEventListener('click', event => {
    const button = event.target.closest('button[data-state]');
    if (!button) return;
    state = button.dataset.state;
    render();
  });
  $('jobs-sources').addEventListener('click',event=>{const button=event.target.closest('[data-job-source]');if(button){source=button.dataset.jobSource;render();}});
  $('jobs-search').addEventListener('input', event => { query = event.target.value; render(); });
  $('jobs-groups').addEventListener('click', event => {
    if(window.WorkshopRelations?.handle(event))return;
    const taskEdit=event.target.closest('button[data-edit-task]');
    if(taskEdit){window.WorkshopAdmin?.open(taskEdit.dataset.editTask);return;}
    const edit = event.target.closest('button[data-edit-job]');
    if (edit) { window.WorkshopAdmin?.openJob(edit.dataset.editJob); return; }
  });
  $('jobs-groups').addEventListener('toggle',event=>{
    const detail=event.target;
    if(!detail.matches('details[data-job-task]')||!detail.isConnected)return;
    if(detail.open)expanded.add(detail.dataset.jobTask);else expanded.delete(detail.dataset.jobTask);
  },true);
  for(const id of ['jobs-filter-reset','jobs-filter-clear'])$(id).addEventListener('click',()=>{party='all';state='open';source='all';render();});
  $('jobs-add').addEventListener('click', () => window.WorkshopAdmin?.openJob(null));
})();
