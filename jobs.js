'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const I = window.WorkshopI18n;
  const S = window.WorkshopSheets;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normal = value => String(value ?? '').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[ً-ٟ]/g,'').trim();
  const shortDate = value => value ? String(value).slice(0,10).split('-').reverse().join(' / ') : 'غير مسجل';
  let jobs = null, items = [], party = 'all', state = 'open', query = '';

  // «قائم» يعني عملاً لم يكتمل ولم يُلغَ؛ هو ما يهم في شاشة الورشة.
  const running = job => !['done','cancelled'].includes(job.state);
  function matches(job) {
    if (party !== 'all' && job.party !== party) return false;
    if (state === 'open' && !running(job)) return false;
    if (state !== 'all' && state !== 'open' && job.state !== state) return false;
    if (!query) return true;
    const task = items.find(item => item.id === job.taskId);
    return normal(I.search([job.title, job.counterpart, job.owner, job.notes, task?.title])).includes(normal(query));
  }
  function gearLine(task) {
    const gear = task?.equipment;
    if (!gear) return '';
    const parts = [S.phases[gear.phase], S.handovers[gear.handover], gear.asset && 'رقم المعدة ' + gear.asset].filter(Boolean);
    return `<p class="job-gear"><span>المعدة المستلمة</span>${escape(parts.join(' · '))}</p>`;
  }
  function card(job) {
    const task = items.find(item => item.id === job.taskId);
    const editable = window.WorkshopAdmin?.canEdit();
    const late = running(job) && job.dueDate && job.dueDate < new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai'}).format(new Date());
    return `<article class="job-card" data-job="${escape(job.id)}">
      <div class="job-top">
        <span class="job-party" data-party="${escape(job.party)}">${escape(S.parties[job.party])}</span>
        <span class="job-state" data-state="${escape(job.state)}">${escape(S.jobStates[job.state])}</span>
        ${editable ? `<button type="button" class="edit-button" data-edit-job="${escape(job.id)}" aria-label="تعديل ${escape(job.title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z"/></svg></button>` : ''}
      </div>
      <h4>${escape(job.title)}</h4>
      <p class="job-counterpart">${escape(job.counterpart || 'بلا جهة مقابلة مسجلة')}</p>
      <dl class="job-meta">
        <div><dt>المسؤول</dt><dd>${escape(job.owner || 'غير مسجل')}</dd></div>
        <div><dt>تاريخ البدء</dt><dd><bdi>${escape(shortDate(job.startDate))}</bdi></dd></div>
        <div><dt>الموعد المتوقع</dt><dd><bdi class="${late ? 'job-late' : ''}">${escape(shortDate(job.dueDate))}</bdi></dd></div>
      </dl>
      ${gearLine(task)}
      ${task ? `<p class="job-link">المتابعة المرتبطة: <button type="button" class="link-button" data-goto="${escape(task.id)}">${escape(task.title)}</button></p>` : ''}
      ${job.notes ? `<p class="job-notes">${escape(job.notes)}</p>` : ''}
    </article>`;
  }
  function render() {
    if (!jobs) return;
    const visible = jobs.filter(matches);
    const byParty = Object.fromEntries(Object.keys(S.parties).map(id => [id, jobs.filter(job => job.party === id).length]));
    $('jobs-parties').innerHTML = [['all','كل الأطراف'], ...Object.entries(S.parties)].map(([id,label]) =>
      `<button type="button" data-party="${escape(id)}" class="filter-button ${party===id?'active':''}" aria-pressed="${party===id}">${escape(label)}<span class="filter-count">${id==='all'?jobs.length:byParty[id]}</span></button>`).join('');
    const byState = {all:jobs.length, open:jobs.filter(running).length, ...Object.fromEntries(Object.keys(S.jobStates).map(id => [id, jobs.filter(job => job.state === id).length]))};
    $('jobs-states').innerHTML = [['open','الأعمال القائمة'],['all','كل الأعمال'],['awaiting_parts',S.jobStates.awaiting_parts],['awaiting_party',S.jobStates.awaiting_party],['done',S.jobStates.done]].map(([id,label]) =>
      `<button type="button" data-state="${escape(id)}" class="filter-button ${state===id?'active':''}" aria-pressed="${state===id}">${escape(label)}<span class="filter-count">${byState[id]}</span></button>`).join('');
    $('jobs-count').textContent = `${visible.length} / ${jobs.length}`;
    // العناوين بنوع العمل: «البيندنق جوب» و«الأعمال القائمة» يظهران كقسمين مستقلين.
    $('jobs-groups').innerHTML = Object.entries(S.jobKinds).map(([id,label]) => {
      const group = visible.filter(job => job.kind === id);
      if (!group.length) return '';
      return `<section class="job-group" aria-label="${escape(label)}"><h4 class="job-group-heading">${escape(label)} <span>${group.length}</span></h4><div class="job-grid">${group.map(card).join('')}</div></section>`;
    }).join('');
    $('jobs-groups').hidden = visible.length === 0;
    $('jobs-empty').hidden = visible.length !== 0;
    $('jobs-add').hidden = !window.WorkshopAdmin?.canEdit();
    $('jobs-open-count').textContent = jobs.filter(running).length;
    $('jobs-tab-count').textContent = jobs.length;
  }
  function adopt(data) {
    items = data.items || [];
    // ورقة الأعمال غير منشأة: يختفي التبويب كأنه غير موجود.
    const enabled = Array.isArray(data.jobs);
    $('jobs-tab').hidden = !enabled;
    if (!enabled) { jobs = null; return; }
    jobs = data.jobs;
    render();
  }
  window.WorkshopJobs = {
    get list() { return jobs || []; },
    find(id) { return (jobs || []).find(job => job.id === id) || null; },
    render,
    reveal(id) {
      const job=(jobs||[]).find(value=>value.id===id);
      if(!job)return;
      party='all';state='all';query='';$('jobs-search').value='';
      window.WorkshopViews?.select('jobs');render();
      const target=document.querySelector('[data-job="'+CSS.escape(id)+'"]');
      target?.setAttribute('tabindex','-1');target?.focus({preventScroll:true});
      target?.scrollIntoView({block:'center',behavior:'smooth'});
    }
  };
  window.addEventListener('workshop-data', event => adopt(event.detail));
  window.addEventListener('workshop-session', render);
  window.addEventListener('workshop-language', render);
  window.addEventListener('workshop-translations', render);
  $('jobs-parties').addEventListener('click', event => {
    const button = event.target.closest('button[data-party]');
    if (!button) return;
    party = button.dataset.party;
    render();
  });
  $('jobs-states').addEventListener('click', event => {
    const button = event.target.closest('button[data-state]');
    if (!button) return;
    state = button.dataset.state;
    render();
  });
  $('jobs-search').addEventListener('input', event => { query = event.target.value; render(); });
  $('jobs-groups').addEventListener('click', event => {
    const edit = event.target.closest('button[data-edit-job]');
    if (edit) { window.WorkshopAdmin?.openJob(edit.dataset.editJob); return; }
    const goto = event.target.closest('button[data-goto]');
    if (goto) {
      window.WorkshopRelations?.revealItem(goto.dataset.goto);
    }
  });
  $('jobs-add').addEventListener('click', () => window.WorkshopAdmin?.openJob(null));
})();
