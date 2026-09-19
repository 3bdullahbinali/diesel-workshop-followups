'use strict';
(() => {
  const store = window.StationsStore;
  const M = window.StationsModel;

  const dialog = document.getElementById('editor');
  const body = document.getElementById('editor-body');
  const title = document.getElementById('editor-title');
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const data = () => store.data;
  const field = (name) => dialog.querySelector(`[name="${name}"]`);
  const value = (name) => (field(name)?.value || '').trim();

  function toast(message, tone = 'ok') {
    const box = document.getElementById('toast');
    box.textContent = message;
    box.className = 'toast toast-' + tone;
    box.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { box.hidden = true; }, 5000);
  }

  function open(heading, html, onSubmit) {
    title.textContent = heading;
    body.innerHTML = html;
    dialog.querySelector('#editor-error').hidden = true;
    dialog.showModal();
    dialog.querySelector('form').onsubmit = (event) => {
      event.preventDefault();
      try {
        onSubmit();
        dialog.close();
      } catch (error) {
        const box = dialog.querySelector('#editor-error');
        box.textContent = error.message;
        box.hidden = false;
      }
    };
  }

  const options = (list, selected) => list
    .map(item => `<option value="${esc(item.id)}" ${item.id === selected ? 'selected' : ''}>${esc(item.label)}</option>`)
    .join('');

  const row = (label, control, hint) => `<label class="form-row">
    <span class="form-label">${esc(label)}</span>${control}
    ${hint ? `<span class="form-hint">${esc(hint)}</span>` : ''}</label>`;

  function downloadFile(name, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ------------------------------------------------------- تعديل وإضافة متابعة
  function openFollowup(id) {
    const record = id ? data().followups.find(f => f.id === id) : null;
    const places = [...data().stations, ...data().locations];

    open(record ? 'تعديل متابعة' : 'إضافة متابعة', `
      ${row('الموضوع', `<input name="title" required value="${esc(record?.title || '')}">`)}
      ${row('النوع', `<select name="kind">${options(data().enums.kinds, record?.kind || 'work')}</select>`)}
      ${row('المحطة أو الموقع', `<select name="stationId">${
        places.map(p => `<option value="${esc(p.id)}" ${p.id === record?.stationId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')
      }</select>`)}
      ${row('المرجع', `<input name="reference" value="${esc(record?.reference || '')}">`,
        'رقم أمر العمل أو رقم الطلب أو مرجع التنسيق كما ورد.')}
      ${row('الحالة', `<select name="state">${options(
        data().enums.states.filter(s => s.id !== 'closed'), record?.state || 'in_progress')}</select>`,
        'الإغلاق لا يتم من هنا؛ يحتاج تاريخاً ودليلاً عبر زر الإغلاق.')}
      ${row('نص الحالة كما ورد', `<input name="stateDetail" value="${esc(record?.stateDetail || '')}">`,
        'يُحفظ كما هو ولا يُستبدل بالتصنيف.')}
      ${row('الجهة المنتظر ردها', `<select name="waitingOn">${options(data().enums.parties, record?.waitingOn || 'internal')}</select>`)}
      ${row('الإجراء التالي', `<textarea name="nextAction" rows="2">${esc(record?.nextAction || '')}</textarea>`)}
      ${row('المسؤول حسب المصدر', `<input name="ownerPerSource" value="${esc(record?.ownerPerSource || '')}">`)}
      ${row('تاريخ آخر إفادة', `<input name="evidenceDate" type="date" value="${esc(record?.evidenceDate || '')}">`,
        'تاريخ آخر معلومة مؤيدة، لا تاريخ فتح الشاشة.')}
      ${row('موعد مؤكد', `<input name="dueDate" type="date" value="${esc(record?.dueDate || '')}">`,
        'اتركه فارغاً ما لم يكن هناك موعد معتمد فعلاً.')}
      ${row('ملاحظة', `<textarea name="notes" rows="2">${esc(record?.notes || '')}</textarea>`)}
      <label class="form-check"><input type="checkbox" name="needsReview"
        ${record ? (record.needsReview ? 'checked' : '') : 'checked'}>
        <span>تحتاج تثبيت حالة أو استكمال دليل</span></label>
    `, () => {
      const changes = {
        title: value('title'), kind: value('kind'), stationId: value('stationId'),
        reference: value('reference'), state: value('state'),
        stateDetail: value('stateDetail') || 'حالة مُدخلة محلياً',
        waitingOn: value('waitingOn'), waitingOnDerived: false,
        nextAction: value('nextAction'), ownerPerSource: value('ownerPerSource'),
        evidenceDate: value('evidenceDate') || null, dueDate: value('dueDate') || null,
        notes: value('notes'), needsReview: field('needsReview').checked
      };
      if (!changes.title) throw new Error('الموضوع مطلوب.');

      if (record) {
        store.patchFollowup(id, changes);
        toast('حُفظ التعديل محلياً في هذا المتصفح.');
      } else {
        store.addFollowup({
          id: 'NEW-' + Date.now().toString(36).toUpperCase(),
          orders: [], stateFromLastRecordOnly: false,
          closed: false, closeDate: null, closeProof: null, prStage: null,
          sourceIds: [], relatedDaily: [], history: [], createdLocally: true,
          ...changes
        });
        toast('أُضيفت المتابعة محلياً. صدّر نسخة JSON قبل إغلاق الصفحة.');
      }
    });
  }

  // ------------------------------------------------------- الإغلاق بدليل
  function openClose(kind, id) {
    const record = kind === 'followup'
      ? data().followups.find(f => f.id === id)
      : data().letters.find(l => l.id === id);
    const name = kind === 'followup' ? record.title : record.subject;
    const consequence = kind === 'followup'
      ? 'إغلاق المتابعة لا يغيّر حالة أي كتاب مرتبط بها.'
      : 'إغلاق الكتاب لا يغيّر حالة العمل أو طلب الشراء المرتبط به.';

    open('إغلاق بدليل', `
      <p class="form-note">${esc(name)}</p>
      ${row('تاريخ الإغلاق', '<input name="closeDate" type="date" required>')}
      ${row('دليل الإغلاق', '<textarea name="closeProof" rows="3" required></textarea>',
        'مرجع الفحص أو الاستلام أو الرد المعتمد. الإغلاق بلا دليل مرفوض.')}
      <p class="form-note warn">${esc(consequence)}</p>
    `, () => {
      store.close(kind, id, { date: value('closeDate'), proof: value('closeProof') });
      toast('أُغلق السجل محلياً بتاريخ ودليل.');
    });
  }

  // ------------------------------------------ متابعة من نشاط يومي غير مغطى
  function openActivity(activityId) {
    const activity = data().daily.find(a => a.id === activityId);

    open('إنشاء متابعة من نشاط', `
      <p class="form-note" dir="ltr" style="text-align:right">${esc(activity.description)}</p>
      <p class="form-hint">${esc(activity.date)} · ${esc(activity.station)} ·
        ${esc(activity.order || activity.orderRaw || 'بلا رقم أمر')} · ${esc(activity.finalStatus)}</p>
      ${row('الموضوع', `<input name="title" required value="${esc(activity.description)}">`,
        'اكتبه بصيغة متابعة، لا بنسخ وصف الجدول كما هو.')}
      ${row('النوع', `<select name="kind">${options(data().enums.kinds, 'work')}</select>`)}
      ${row('الحالة', `<select name="state">${options(
        data().enums.states.filter(s => s.id !== 'closed'), 'awaiting_evidence')}</select>`)}
      ${row('الجهة المنتظر ردها', `<select name="waitingOn">${options(data().enums.parties, 'internal')}</select>`)}
      ${row('الإجراء التالي', '<textarea name="nextAction" rows="2" required></textarea>')}
      <p class="form-note">المحطة والتاريخ والمنفذون ومرجع الصف تُنسخ من النشاط ولا تُعدَّل هنا.</p>
    `, () => {
      if (!value('nextAction')) throw new Error('الإجراء التالي مطلوب.');
      store.followUpActivity(activityId, {
        title: value('title'), kind: value('kind'), state: value('state'),
        waitingOn: value('waitingOn'), nextAction: value('nextAction')
      });
      toast('أُنشئت متابعة مرتبطة بالنشاط، وخرج النشاط من قائمة «بلا متابعة».');
    });
  }

  // ------------------------------------------------------------ إضافة كتاب
  function openLetter() {
    open('إضافة كتاب', `
      ${row('الموضوع', '<input name="subject" required>')}
      ${row('رقم الكتاب', '<input name="number" required>')}
      ${row('الاتجاه', `<select name="direction">
        <option value="incoming">وارد</option><option value="outgoing">صادر</option></select>`,
        'الاتجاه يُثبت عند الإضافة ولا يتغيّر بالتعديل لاحقاً.')}
      ${row('التاريخ', '<input name="date" type="date" required>')}
      ${row('الجهة', '<input name="party">')}
      ${row('المتابعة المرتبطة', `<select name="linkedId"><option value="">بلا ربط</option>${
        data().followups.map(f => `<option value="${esc(f.id)}">${esc(f.title)}</option>`).join('')
      }</select>`)}
      ${row('الإجراء المطلوب', '<textarea name="action" rows="2"></textarea>')}
      <p class="form-note warn">الرد يُسجَّل كتاباً آخر مرتبطاً، ولا يُحوَّل الوارد إلى صادر.
        هذه الشاشة لا ترسل شيئاً عبر تراسل.</p>
    `, () => {
      if (!value('subject') || !value('number')) throw new Error('الموضوع ورقم الكتاب مطلوبان.');
      store.addLetter({
        id: 'LTR-NEW-' + Date.now().toString(36).toUpperCase(),
        number: value('number'), direction: value('direction'), date: value('date'),
        subject: value('subject'), party: value('party'), action: value('action'),
        linkedId: value('linkedId') || null, closed: false, closeDate: null, closeProof: null,
        sourceIds: [], notes: 'أُضيف محلياً؛ لم يُراجع المستند الأصلي.'
      });
      toast('أُضيف الكتاب محلياً.');
    });
  }

  // ------------------------------------------------------- التصدير والاستيراد
  const CSV_COLUMNS = [
    { label: 'المعرّف', get: f => f.id },
    { label: 'النوع', get: f => M.labels(data(), 'kinds')[f.kind] },
    { label: 'الموضوع', get: f => f.title },
    { label: 'المحطة', get: f => f.stationId },
    { label: 'المرجع', get: f => f.reference },
    { label: 'الحالة', get: f => M.labels(data(), 'states')[f.state] },
    { label: 'نص الحالة كما ورد', get: f => f.stateDetail },
    { label: 'الجهة المنتظر ردها', get: f => M.labels(data(), 'parties')[f.waitingOn] },
    { label: 'مشتق', get: f => (f.waitingOnDerived ? 'نعم' : 'لا') },
    { label: 'الإجراء التالي', get: f => f.nextAction },
    { label: 'المسؤول حسب المصدر', get: f => f.ownerPerSource },
    { label: 'آخر إفادة', get: f => f.evidenceDate || '' },
    { label: 'عمر الإفادة بالأيام', get: f => M.ageDays(f, data().meta.buildDate) ?? '' },
    { label: 'موعد مؤكد', get: f => f.dueDate || '' },
    { label: 'تحتاج تثبيت', get: f => (f.needsReview ? 'نعم' : 'لا') },
    { label: 'مغلقة', get: f => (f.closed ? 'نعم' : 'لا') },
    { label: 'دليل الإغلاق', get: f => f.closeProof || '' },
    { label: 'أوامر العمل', get: f => (f.orders || []).join(' | ') },
    { label: 'المصادر', get: f => (f.sourceIds || []).join(' | ') },
    { label: 'ملاحظة', get: f => f.notes }
  ];

  function exportFollowups(rows, name = 'followups') {
    downloadFile(`${name}-${data().meta.buildDate}.csv`,
      store.toCsv(rows, CSV_COLUMNS), 'text/csv;charset=utf-8');
    toast(`صُدِّر ${rows.length} سجلاً بصيغة CSV.`);
  }

  function exportJson() {
    downloadFile(`stations-data-${data().meta.buildDate}.json`,
      store.exportJson(), 'application/json');
    toast('صُدِّرت نسخة JSON كاملة، تشمل التعديلات المحلية.');
  }

  function importJson() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        store.importJson(await file.text());
        toast('استُوردت النسخة وحلّت محل التعديلات المحلية السابقة.');
      } catch (error) {
        toast('تعذّر الاستيراد: ' + error.message, 'error');
      }
    };
    input.click();
  }

  function resetLocal() {
    if (!store.editedCount) return toast('لا تعديلات محلية لإلغائها.');
    if (!confirm(`سيُلغى ${store.editedCount} تعديلاً محلياً وتعود البيانات إلى النسخة المبنية. متابعة؟`)) return;
    store.reset();
    toast('أُلغيت التعديلات المحلية.');
  }

  document.getElementById('editor-cancel').onclick = () => dialog.close();

  window.StationsEditor = {
    openFollowup, openClose, openActivity, openLetter,
    exportFollowups, exportJson, importJson, resetLocal
  };
})();
