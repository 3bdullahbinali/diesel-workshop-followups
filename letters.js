'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const I = window.WorkshopI18n;
  const S = window.WorkshopSheets;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normal = value => String(value ?? '').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[ً-ٟ]/g,'').trim();
  const shortDate = value => value ? String(value).slice(0,10).split('-').reverse().join(' / ') : 'غير مسجل';
  let letters = null, items = [], direction = 'all', state = 'all', query = '';

  const open = letter => letter.closure !== 'closed';
  function matches(letter) {
    if (direction !== 'all' && letter.direction !== direction) return false;
    if (state === 'open' && letter.closure === 'closed') return false;
    if (state !== 'all' && state !== 'open' && letter.closure !== state) return false;
    if (!query) return true;
    return normal(I.search([letter.title, letter.reference, letter.party, letter.location, letter.action])).includes(normal(query));
  }
  function counts() {
    return {all: letters.length, out: letters.filter(l => l.direction === 'out').length, in: letters.filter(l => l.direction === 'in').length};
  }
  function card(letter) {
    const task = items.find(item => item.id === letter.taskId);
    const editable = window.WorkshopAdmin?.canEdit();
    return `<article class="letter-card" data-letter="${escape(letter.id)}">
      <div class="letter-top">
        <span class="letter-direction" data-direction="${escape(letter.direction)}">${escape(S.directions[letter.direction])}</span>
        <span class="letter-reference" dir="auto">${escape(letter.reference || 'بلا رقم مسجل')}</span>
        ${editable ? `<button type="button" class="edit-button" data-edit-letter="${escape(letter.id)}" aria-label="تعديل ${escape(letter.title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z"/></svg></button>` : ''}
      </div>
      <h4>${escape(letter.title)}</h4>
      <p class="letter-party">${escape(letter.party || 'الجهة غير مسجلة')}</p>
      <div class="letter-states">
        <span class="letter-state" data-kind="work">${escape(S.workStates[letter.work])}</span>
        <span class="letter-state" data-kind="reply">${escape(S.replyStates[letter.reply])}</span>
        <span class="letter-state" data-kind="closure" data-closure="${escape(letter.closure)}">${escape(S.closureStates[letter.closure])}</span>
      </div>
      <dl class="letter-meta">
        <div><dt>آخر موقع مسجل</dt><dd>${escape(letter.location || 'غير مسجل')}</dd></div>
        <div><dt>تاريخ التحقق</dt><dd><bdi>${escape(shortDate(letter.verifiedDate))}</bdi></dd></div>
        ${letter.dueDate ? `<div><dt>موعد المتابعة</dt><dd><bdi>${escape(shortDate(letter.dueDate))}</bdi></dd></div>` : ''}
        ${letter.replyReference ? `<div><dt>رقم كتاب الرد</dt><dd dir="auto">${escape(letter.replyReference)}</dd></div>` : ''}
      </dl>
      ${letter.action ? `<div class="letter-action"><h5>الإجراء التالي</h5><p>${escape(letter.action)}</p></div>` : ''}
      ${task ? `<p class="letter-link">المتابعة المرتبطة: <button type="button" class="link-button" data-goto="${escape(task.id)}">${escape(task.title)}</button></p>` : ''}
      ${letter.notes ? `<p class="letter-notes">${escape(letter.notes)}</p>` : ''}
    </article>`;
  }
  function render() {
    if (!letters) return;
    const visible = letters.filter(matches);
    const total = counts();
    $('letters-filters').innerHTML = [['all','جميع الكتب'],['out','صادر'],['in','وارد']].map(([id,label]) =>
      `<button type="button" data-direction="${id}" class="filter-button ${direction===id?'active':''}" aria-pressed="${direction===id}">${escape(label)}<span class="filter-count">${total[id]}</span></button>`).join('');
    const byState = {all:letters.length, open:letters.filter(open).length, pending:letters.filter(l=>l.closure==='pending').length, closed:letters.filter(l=>l.closure==='closed').length};
    $('letters-states').innerHTML = [['all','كل الحالات'],['open','مفتوحة'],['pending','بانتظار الإغلاق'],['closed','مغلقة']].map(([id,label]) =>
      `<button type="button" data-state="${id}" class="filter-button ${state===id?'active':''}" aria-pressed="${state===id}">${escape(label)}<span class="filter-count">${byState[id]}</span></button>`).join('');
    $('letters-count').textContent = query || direction !== 'all' || state !== 'all' ? `${visible.length} / ${letters.length}` : letters.length;
    $('letters-grid').innerHTML = visible.map(card).join('');
    $('letters-grid').hidden = visible.length === 0;
    $('letters-empty').hidden = visible.length !== 0;
    $('letters-add').hidden = !window.WorkshopAdmin?.canEdit();
    $('letters-open-count').textContent = letters.filter(open).length;
    $('letters-tab-count').textContent = letters.length;
  }
  function adopt(data) {
    items = data.items || [];
    // ورقة المراسلات غير منشأة: يختفي التبويب كأنه غير موجود.
    const enabled = Array.isArray(data.letters);
    document.getElementById('letters-tab').hidden = !enabled;
    if (!enabled) { letters = null; return; }
    letters = data.letters;
    render();
  }
  window.WorkshopLetters = {
    get list() { return letters || []; },
    find(id) { return (letters || []).find(letter => letter.id === id) || null; },
    render
  };
  window.addEventListener('workshop-data', event => adopt(event.detail));
  window.addEventListener('workshop-session', render);
  window.addEventListener('workshop-language', render);
  window.addEventListener('workshop-translations', render);
  $('letters-filters').addEventListener('click', event => {
    const button = event.target.closest('button[data-direction]');
    if (!button) return;
    direction = button.dataset.direction;
    render();
  });
  $('letters-states').addEventListener('click', event => {
    const button = event.target.closest('button[data-state]');
    if (!button) return;
    state = button.dataset.state;
    render();
  });
  $('letters-search').addEventListener('input', event => { query = event.target.value; render(); });
  $('letters-grid').addEventListener('click', event => {
    const edit = event.target.closest('button[data-edit-letter]');
    if (edit) { window.WorkshopAdmin?.openLetter(edit.dataset.editLetter); return; }
    const goto = event.target.closest('button[data-goto]');
    if (goto) {
      document.querySelector('.view-tabs [data-view=overview]')?.click();
      const row = document.getElementById('row-' + goto.dataset.goto);
      row?.scrollIntoView({block:'center', behavior:'smooth'});
      row?.querySelector('.expand-button')?.focus();
    }
  });
  $('letters-add').addEventListener('click', () => window.WorkshopAdmin?.openLetter(null));
})();
