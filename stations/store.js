'use strict';
(function (root) {
  /**
   * طبقة تعديل محلية فوق البيانات المبنية.
   *
   * حدودها المقصودة: التعديلات تُحفظ في LocalStorage لهذا المتصفح وهذا الأصل فقط.
   * لا تنتقل إلى جهاز أو مستخدم آخر، ولا تُكتب في تراسل أو SAP أو Google Sheets.
   * سجل التغييرات هنا محلي وغير موثق، وليس سجل تدقيق محمياً.
   */

  const KEY = 'stations-followups-overlay-v1';
  const EMPTY = { followups: {}, letters: {}, added: [], addedLetters: [], log: [] };

  let available = true;
  try {
    const probe = '__probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
  } catch {
    available = false;
  }

  function readOverlay() {
    if (!available) return structuredClone(EMPTY);
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...structuredClone(EMPTY), ...JSON.parse(raw) } : structuredClone(EMPTY);
    } catch {
      return structuredClone(EMPTY);
    }
  }

  let overlay = readOverlay();
  let base = null;
  let merged = null;
  const listeners = new Set();

  function persist() {
    if (!available) return false;
    try {
      localStorage.setItem(KEY, JSON.stringify(overlay));
      return true;
    } catch {
      available = false;
      return false;
    }
  }

  // الدمج يعيد بناء النسخة المعروضة كاملة؛ البيانات المبنية تبقى دون مساس.
  function rebuild() {
    merged = structuredClone(base);
    merged.followups = merged.followups.map(f =>
      overlay.followups[f.id] ? { ...f, ...overlay.followups[f.id] } : f);
    merged.letters = merged.letters.map(l =>
      overlay.letters[l.id] ? { ...l, ...overlay.letters[l.id] } : l);
    merged.followups.push(...overlay.added);
    merged.letters.push(...overlay.addedLetters);

    // الأنشطة التي صارت لها متابعة تخرج من قائمة «بلا متابعة».
    const linked = new Set(merged.followups.flatMap(f => f.relatedDaily || []));
    merged.orphanActivities = merged.orphanActivities.filter(o => !linked.has(o.activityId));
    merged.meta = {
      ...merged.meta,
      coverage: {
        ...merged.meta.coverage,
        followups: merged.followups.length,
        needsReview: merged.followups.filter(f => f.needsReview).length,
        activitiesLinked: merged.daily.length - merged.orphanActivities.length,
        activitiesUnlinked: merged.orphanActivities.length
      }
    };
    return merged;
  }

  function note(action, targetId, detail) {
    overlay.log.unshift({
      at: new Date().toISOString(),
      action, targetId, detail,
      editor: 'تعديل محلي — الاسم غير موثق'
    });
    overlay.log = overlay.log.slice(0, 400);
  }

  function emit() {
    rebuild();
    for (const fn of listeners) fn(merged);
  }

  const store = {
    get available() { return available; },
    get data() { return merged; },
    get log() { return overlay.log; },
    get editedCount() {
      return Object.keys(overlay.followups).length + Object.keys(overlay.letters).length
        + overlay.added.length + overlay.addedLetters.length;
    },

    init(baseData) {
      base = baseData;
      rebuild();
      return merged;
    },

    /** يستبدل النسخة الأساسية ببيانات حيّة من الشيت، ويعيد بناء العرض. */
    replaceBase(baseData) {
      base = baseData;
      emit();
      return merged;
    },

    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    patchFollowup(id, changes) {
      overlay.followups[id] = { ...(overlay.followups[id] || {}), ...changes };
      note('تعديل متابعة', id, Object.keys(changes).join('، '));
      persist();
      emit();
    },

    addFollowup(record) {
      overlay.added.push(record);
      note('إضافة متابعة', record.id, record.title);
      persist();
      emit();
    },

    /**
     * الإغلاق يتطلب تاريخاً ودليلاً. إغلاق الكتاب لا يغيّر المتابعة المرتبطة،
     * وإغلاق المتابعة لا يغيّر حالة الكتاب.
     */
    close(kind, id, { date, proof }) {
      if (!date || !proof || !proof.trim()) {
        throw new Error('الإغلاق يتطلب تاريخاً ودليل إغلاق.');
      }
      const changes = { closed: true, closeDate: date, closeProof: proof.trim() };
      if (kind === 'followup') {
        changes.state = 'closed';
        overlay.followups[id] = { ...(overlay.followups[id] || {}), ...changes };
      } else {
        overlay.letters[id] = { ...(overlay.letters[id] || {}), ...changes };
      }
      note(kind === 'followup' ? 'إغلاق متابعة' : 'إغلاق كتاب', id, proof.trim());
      persist();
      emit();
    },

    patchLetter(id, changes) {
      // اتجاه الكتاب مثبت من المستند ولا يتغيّر بالتعديل.
      const { direction, ...rest } = changes;
      overlay.letters[id] = { ...(overlay.letters[id] || {}), ...rest };
      note('تعديل كتاب', id, Object.keys(rest).join('، '));
      persist();
      emit();
    },

    addLetter(record) {
      overlay.addedLetters.push(record);
      note('إضافة كتاب', record.id, record.subject);
      persist();
      emit();
    },

    /** تحويل نشاط يومي غير مغطى إلى متابعة، مع حفظ مرجع النشاط ومصدره. */
    followUpActivity(activityId, fields) {
      const activity = base.daily.find(a => a.id === activityId);
      if (!activity) throw new Error('النشاط غير موجود.');
      const record = {
        id: 'NEW-' + activityId,
        kind: fields.kind || 'work',
        title: fields.title,
        stationId: activity.station,
        reference: activity.order || activity.orderRaw || 'رقم أمر العمل غير مكتمل',
        orders: activity.order ? [activity.order] : [],
        state: fields.state || 'awaiting_evidence',
        stateDetail: fields.stateDetail || 'أُنشئت من نشاط يومي غير مغطى',
        stateFromLastRecordOnly: false,
        waitingOn: fields.waitingOn || 'internal',
        waitingOnDerived: false,
        evidenceDate: activity.date,
        ownerPerSource: activity.staff.join(' / '),
        nextAction: fields.nextAction,
        needsReview: true,
        dueDate: fields.dueDate || null,
        closed: false, closeDate: null, closeProof: null,
        prStage: null,
        sourceIds: [activity.sourceId],
        notes: `أُنشئت من النشاط ${activityId} (${activity.sourceId}، صفوف ${activity.sourceRows}).`,
        relatedDaily: [activityId],
        history: [],
        createdLocally: true
      };
      overlay.added.push(record);
      note('متابعة من نشاط', record.id, activity.description);
      persist();
      emit();
      return record;
    },

    reset() {
      overlay = structuredClone(EMPTY);
      persist();
      emit();
    },

    exportJson() {
      return JSON.stringify({
        ...merged,
        meta: { ...merged.meta, exportedAt: new Date().toISOString(), localEdits: store.editedCount },
        localChangeLog: overlay.log
      }, null, 1);
    },

    importJson(text) {
      const incoming = JSON.parse(text);
      if (!Array.isArray(incoming.followups)) throw new Error('ملف غير مطابق: لا يحتوي متابعات.');
      overlay = structuredClone(EMPTY);
      const byId = new Map(base.followups.map(f => [f.id, f]));
      for (const record of incoming.followups) {
        if (byId.has(record.id)) overlay.followups[record.id] = record;
        else overlay.added.push(record);
      }
      const lettersById = new Map(base.letters.map(l => [l.id, l]));
      for (const record of incoming.letters || []) {
        if (lettersById.has(record.id)) overlay.letters[record.id] = record;
        else overlay.addedLetters.push(record);
      }
      overlay.log = incoming.localChangeLog || [];
      note('استيراد ملف', '—', `${incoming.followups.length} متابعة`);
      persist();
      emit();
    },

    /** CSV بفاصلة منقوطة وBOM حتى يفتح Excel العربية دون تشويه. */
    toCsv(rows, columns) {
      const cell = (value) => {
        const text = String(value ?? '').replace(/"/g, '""');
        return /[";\n]/.test(text) ? `"${text}"` : text;
      };
      const lines = [columns.map(c => cell(c.label)).join(';')];
      for (const row of rows) lines.push(columns.map(c => cell(c.get(row))).join(';'));
      return '﻿' + lines.join('\r\n');
    }
  };

  root.StationsStore = store;
})(globalThis);
