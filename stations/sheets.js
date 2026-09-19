'use strict';
(function (root) {
  /**
   * قراءة السجل من Google Sheets المستقل للمحطات الخارجية.
   *
   * القراءة عبر gviz بأسلوب JSONP، وهو ما يعمل من المتصفح دون خادم وسيط.
   * يشترط أن يكون الملف قابلاً للعرض بالرابط؛ فإن لم يكن، يبقى الموقع على
   * النسخة المضمّنة ويعلن ذلك بدل أن يعرض بيانات ناقصة على أنها حيّة.
   *
   * هذه الطبقة تقرأ فقط. لا تكتب في الشيت ولا في تراسل ولا في SAP.
   */

  const TIMEOUT = 9000;

  // ---------------------------------------------------------- أدوات التحويل
  // تقبل شكل خلية gviz ({v,f}) والقيمة المجردة الآتية من واجهة Apps Script.
  const raw = (cell) => (cell && typeof cell === 'object' && ('v' in cell || 'f' in cell))
    ? (cell.f ?? cell.v) : cell;

  const text = (cell) => {
    const value = raw(cell);
    return value === null || value === undefined ? '' : String(value).trim();
  };

  const bool = (cell) => {
    const value = raw(cell);
    if (typeof value === 'boolean') return value;
    return /^(true|نعم|1)$/i.test(text(cell));
  };

  /** يقبل Date(y,m,d) من gviz وصيغة dd/mm/yyyy المعروضة في الشيت. */
  function dateValue(cell) {
    const value = (cell && typeof cell === 'object' && 'v' in cell) ? cell.v : raw(cell);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const serial = /^Date\((\d+),(\d+),(\d+)/.exec(String(value ?? ''));
    if (serial) {
      const [, y, m, d] = serial;
      return `${y}-${String(+m + 1).padStart(2, '0')}-${String(+d).padStart(2, '0')}`;
    }
    const shown = text(cell);
    const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(shown);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(shown) ? shown : null;
  }

  const list = (cell) => text(cell).split(/[;،]/).map(s => s.trim()).filter(Boolean);
  const number = (cell) => {
    const value = raw(cell);
    const parsed = typeof value === 'number' ? value : parseFloat(text(cell).replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  };

  // ------------------------------------------------------------- طلب gviz
  let counter = 0;
  function query(spreadsheetId, tab, range) {
    return new Promise((resolve, reject) => {
      const name = '__stationsSheet' + (counter += 1);
      const script = document.createElement('script');
      let settled = false;
      const finish = (error, response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        script.remove();
        if (error) {
          // يُترك اسم الدالة لحظةً تحسباً لوصول رد متأخر بعد انتهاء المهلة.
          root[name] = () => {};
          setTimeout(() => { delete root[name]; }, 60000);
          reject(error);
        } else {
          delete root[name];
          resolve(response);
        }
      };
      root[name] = (response) => finish(null, response);
      const timer = setTimeout(() => finish(new Error(`تعذّر الوصول إلى تبويب ${tab}.`)), TIMEOUT);

      const url = new URL(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/gviz/tq`);
      url.search = new URLSearchParams({
        headers: '1', sheet: tab, range,
        tqx: 'out:json;responseHandler:' + name,
        tq: 'select *', _t: String(Date.now())
      });
      script.src = url.href;
      script.referrerPolicy = 'no-referrer';
      script.onerror = () => finish(new Error(`تعذّر الوصول إلى تبويب ${tab}.`));
      document.head.appendChild(script);
    });
  }

  /** يحوّل رد gviz إلى صفوف مفهرسة بأسماء الأعمدة كما وردت في الشيت. */
  function rows(response, tab) {
    if (response?.status === 'error') {
      throw new Error(`${tab}: ${(response.errors || []).map(e => e.detailed_message || e.message).join(' ')}`);
    }
    const columns = (response?.table?.cols || []).map(col => (col.label || col.id || '').trim());
    return (response?.table?.rows || []).map(row => {
      const cells = {};
      columns.forEach((label, index) => { if (label) cells[label] = row.c?.[index] ?? null; });
      return cells;
    });
  }

  // --------------------------------------------------------- تحويل التبويبات
  // الصفوف الفارغة في القوالب الممددة تُتجاهل: لا معرّف يعني لا سجل.
  const withId = (list, key) => list.filter(row => text(row[key]));

  const STATE_BY_TEXT = new Map();
  function classify(recordedStatus, fallbackStates) {
    const key = recordedStatus.trim();
    if (STATE_BY_TEXT.has(key)) return STATE_BY_TEXT.get(key);
    // حالة جديدة يكتبها الفريق في الشيت: تُعرض كما هي وتُصنَّف الأقرب دلالياً.
    const guess = /مغلق/.test(key) ? 'closed'
      : /بانتظار رد|بانتظار .*(مورد|مشاريع|عقود|LPO|تراسل)/i.test(key) ? 'awaiting_reply'
      : /تحتاج تحديث|بحاجة تحديث|بانتظار تحديث/.test(key) ? 'stale'
      : /بيانات|استكمال البيانات/.test(key) ? 'needs_data'
      : /بانتظار|تأكيد|مطابقة|إثبات/.test(key) ? 'awaiting_evidence'
      : fallbackStates.includes('in_progress') ? 'in_progress' : 'needs_data';
    return guess;
  }

  function followups(list, snapshot) {
    const known = new Map(snapshot.followups.map(f => [f.id, f]));
    for (const entry of snapshot.enums.states) STATE_BY_TEXT.set(entry.label, entry.id);
    const stateIds = snapshot.enums.states.map(s => s.id);
    // الشيت يخزّن الجهة بنصها العربي؛ النموذج يعمل برموز، فيُعاد النص إلى رمزه.
    const partyByLabel = new Map(snapshot.enums.parties.map(p => [p.label, p.id]));
    const partyIds = new Set(snapshot.enums.parties.map(p => p.id));
    const partyId = (value) => partyByLabel.get(value) || (partyIds.has(value) ? value : null);

    return withId(list, 'ID').map(row => {
      const id = text(row.ID);
      const base = known.get(id) || {};
      const recorded = text(row.Recorded_Status);
      const closed = bool(row.Closed);
      return {
        ...base,
        id,
        kind: text(row.Type) || base.kind || 'general',
        title: text(row.Subject),
        stationId: text(row.Station) || base.stationId || 'UNASSIGNED',
        reference: text(row.Reference),
        state: closed ? 'closed' : classify(recorded, stateIds),
        stateDetail: recorded,
        // الجهة المنتظر ردها صارت عموداً في الشيت؛ ما يُدخل هناك ليس مشتقاً.
        // نص غير معروف لا يُسقط السجل: يُعرض «غير محددة» ويبقى موسوماً للمراجعة.
        waitingOn: partyId(text(row.Waiting_On)) || base.waitingOn || 'unknown',
        waitingOnDerived: !partyId(text(row.Waiting_On)),
        evidenceDate: dateValue(row.Evidence_Date),
        ownerPerSource: text(row.Owner_Per_Source),
        nextAction: text(row.Next_Action),
        needsReview: bool(row.Needs_Review),
        dueDate: dateValue(row.Due_Date),
        closed,
        closeDate: dateValue(row.Closed_Date),
        closeProof: text(row.Closing_Evidence),
        prStage: text(row.PR_Stage) || null,
        prNumber: text(row.PR_Number) || null,
        priority: text(row.Priority) || null,
        sourceIds: list_(row.Sources),
        notes: text(row.Notes),
        relatedDaily: list_(row.Related_Daily_IDs),
        updatedAt: text(row.Updated_At),
        updatedBy: text(row.Updated_By),
        orders: base.orders || [],
        history: base.history || []
      };
    });
  }
  const list_ = list;

  const procurement = (rowsIn) => withId(rowsIn, 'Followup_ID').map(row => ({
    followupId: text(row.Followup_ID),
    prNumber: text(row.PR_Number),
    stage: text(row.Stage),
    supplier: text(row.Supplier),
    lpoNumber: text(row.LPO_Number),
    approvalDate: dateValue(row.Approval_Date),
    lpoDate: dateValue(row.LPO_Date),
    deliveryDue: dateValue(row.Delivery_Due),
    receiptStatus: text(row.Receipt_Status),
    evaluationFile: text(row.Evaluation_File),
    lpoFile: text(row.LPO_File),
    receiptEvidence: text(row.Receipt_Evidence),
    notes: text(row.Notes)
  }));

  const items = (rowsIn) => withId(rowsIn, 'Item_ID').map(row => ({
    id: text(row.Item_ID),
    followupId: text(row.Followup_ID),
    lineNo: number(row.Line_No),
    code: text(row.Item_Code),
    description: text(row.Description),
    unit: text(row.Unit),
    requested: number(row.Qty_Requested),
    ordered: number(row.Qty_Ordered),
    received: number(row.Qty_Received),
    remaining: number(row.Qty_Remaining),
    receiptDate: dateValue(row.Receipt_Date),
    receiptReference: text(row.Receipt_Reference),
    notes: text(row.Notes)
  }));

  const daily = (rowsIn, snapshot) => {
    const known = new Map(snapshot.daily.map(a => [a.id, a]));
    return withId(rowsIn, 'Activity_ID').map(row => {
      const id = text(row.Activity_ID);
      const order = text(row.Work_Order_Validated);
      return {
        ...(known.get(id) || {}),
        id,
        date: dateValue(row.File_Date),
        dateVerified: bool(row.Date_Verified),
        station: text(row.Station),
        description: text(row.Description_As_Recorded),
        order: order || null,
        orderRaw: text(row.Work_Order_Raw) || null,
        finalStatus: text(row.Final_Status) || text(row.Recorded_Final_Status),
        currentStatus: text(row.Current_Status),
        workType: text(row.Work_Type),
        staff: list(row.Team_Names),
        sourceId: text(row.Source_ID),
        sourceRows: text(row.Source_Rows),
        findings: list(row.Source_Findings),
        linkedFollowups: list(row.Linked_Followups)
      };
    });
  };

  const letters = (rowsIn) => withId(rowsIn, 'Letter_ID').map(row => ({
    id: text(row.Letter_ID),
    number: text(row.Number),
    direction: text(row.Direction) === 'outgoing' ? 'outgoing' : 'incoming',
    date: dateValue(row.Date),
    subject: text(row.Subject),
    party: text(row.Party),
    action: text(row.Action),
    linkedId: text(row.Parent_ID) || null,
    replyToId: text(row.Reply_To_ID) || null,
    closed: bool(row.Closed),
    closeDate: dateValue(row.Closed_Date),
    closeProof: text(row.Closing_Evidence),
    file: text(row.Letter_File),
    sourceIds: list(row.Sources),
    notes: text(row.Notes)
  }));

  const places = (rowsIn) => withId(rowsIn, 'Reference_ID').map(row => ({
    id: text(row.Reference_ID),
    name: text(row.Name),
    readiness: text(row.Readiness),
    readinessDate: dateValue(row.Readiness_Date),
    readinessEvidence: text(row.Readiness_Evidence),
    // الجاهزية لا تُعتمد إلا بتاريخ ودليل؛ النص وحده لا يكفي.
    readinessConfirmed: Boolean(dateValue(row.Readiness_Date) && text(row.Readiness_Evidence)),
    owner: text(row.Owner),
    notes: text(row.Notes),
    locationOnly: bool(row.Location_Only)
  }));

  const issues = (rowsIn) => withId(rowsIn, 'Finding_ID').map(row => ({
    id: text(row.Finding_ID),
    severity: text(row.Priority) || 'normal',
    title: text(row.Subject),
    description: text(row.Finding),
    action: text(row.Required_Action),
    status: text(row.Status),
    owner: text(row.Owner),
    resolution: text(row.Resolution),
    closeDate: dateValue(row.Closed_Date),
    evidence: text(row.Evidence),
    resolved: /تمت المعالجة/.test(text(row.Status)),
    sourceIds: list(row.Sources)
  }));

  const sources = (rowsIn) => withId(rowsIn, 'Source_ID').map(row => ({
    id: text(row.Source_ID),
    name: text(row.Title),
    date: dateValue(row.Source_Date),
    url: text(row.Source_URL),
    headerDate: text(row.Header_Date),
    note: [text(row.Notes), text(row.Access_Note)].filter(Boolean).join(' — ')
  }));

  // ----------------------------------------------------------------- التحميل
  /**
   * يعيد بناء نسخة العرض من الشيت فوق النسخة المضمّنة.
   * أي تبويب يفشل يُترك على بيانات النسخة المضمّنة ويُذكر في warnings.
   */
  /**
   * يبني نسخة العرض من صفوف خام، أياً كان مصدرها: gviz العام أو الواجهة الموثقة.
   * التحويل واحد للمسارين حتى لا يتفرّع سلوك القراءة بينهما.
   */
  function build(tabData, snapshot, warnings, sourceName) {
    const take = (key, transform) => {
      const list = tabData[key];
      if (!Array.isArray(list)) return null;
      try {
        return transform(list);
      } catch (error) {
        warnings.push(`${key}: ${error.message}`);
        return null;
      }
    };

    const f = take('followups', list => followups(list, snapshot));
    const pr = take('procurement', procurement);
    const prItems = take('items', items);
    const d = take('daily', list => daily(list, snapshot));
    const l = take('letters', letters);
    const s = take('stations', places);
    const i = take('issues', issues);
    const src = take('sources', sources);

    if (!f) throw new Error('تعذّر قراءة تبويب المتابعات؛ أُبقي العرض على النسخة المضمّنة. ' + warnings.join(' '));

    const merged = {
      ...snapshot,
      followups: f,
      daily: d || snapshot.daily,
      letters: l || snapshot.letters,
      issues: i || snapshot.issues,
      sources: src || snapshot.sources,
      procurement: pr || [],
      prItems: prItems || [],
      meta: { ...snapshot.meta, source: sourceName, fetchedAt: new Date().toISOString() }
    };

    if (s) {
      merged.stations = s.filter(p => !p.locationOnly);
      merged.locations = s.filter(p => p.locationOnly);
    }

    rebuildDerived(merged, snapshot);
    merged.warnings = warnings;
    return merged;
  }

  /** المسار العام: قراءة gviz مباشرة. يتطلب ملفاً قابلاً للعرض بالرابط. */
  async function loadPublic(config, snapshot) {
    const warnings = [];
    const tabData = {};
    await Promise.all(Object.keys(config.tabs).map(async (key) => {
      const tab = config.tabs[key];
      try {
        tabData[key] = rows(await query(config.spreadsheetId, tab.name, tab.range), tab.name);
      } catch (error) {
        warnings.push(error.message);
      }
    }));
    return build(tabData, snapshot, warnings, 'google-sheets-public');
  }

  /** المسار الموثق: القراءة عبر Apps Script بعد تسجيل الدخول. */
  async function loadAuthenticated(snapshot) {
    return fromApi(snapshot, () => root.StationsApi.read(), 'apps-script');
  }

  /** القراءة العامة عبر الواجهة: بيانات حيّة بلا حساب، والشيت يبقى غير مشارَك. */
  async function loadPublicApi(snapshot) {
    return fromApi(snapshot, () => root.StationsApi.readPublic(), 'apps-script-public');
  }

  async function fromApi(snapshot, fetcher, sourceName) {
    const response = await fetcher();
    const warnings = (response.missing || []).map(name => `الورقة غير موجودة: ${name}`);
    const merged = build(response.tabs || {}, snapshot, warnings, sourceName);
    merged.meta.readAt = response.readAt;
    merged.meta.reader = response.user;
    return merged;
  }

  /** يعيد اشتقاق ما لا يخزَّن في الشيت: فهرس الأوامر والأنشطة غير المغطاة. */
  function rebuildDerived(merged, snapshot) {
    const byOrder = new Map();
    const touch = (numberText, station) => {
      if (!numberText) return null;
      if (!byOrder.has(numberText)) {
        byOrder.set(numberText, { number: numberText, stations: new Set(), activityIds: [], followupIds: [] });
      }
      const entry = byOrder.get(numberText);
      if (station) entry.stations.add(station);
      return entry;
    };

    for (const activity of merged.daily) {
      const entry = touch(activity.order, activity.station);
      if (entry) entry.activityIds.push(activity.id);
    }
    for (const followup of merged.followups) {
      const fromRef = String(followup.reference || '').match(/\b5[24]\d{8}\b/g) || [];
      const fromDaily = (followup.relatedDaily || [])
        .map(id => merged.daily.find(a => a.id === id)?.order).filter(Boolean);
      followup.orders = [...new Set([...fromRef, ...fromDaily])];
      for (const order of followup.orders) {
        const entry = touch(order, followup.stationId);
        if (entry) entry.followupIds.push(followup.id);
      }
    }

    merged.workOrders = [...byOrder.values()].map(entry => {
      const stations = [...entry.stations].sort();
      return {
        number: entry.number,
        isSapNumber: /^5[24]\d{8}$/.test(entry.number),
        stations,
        multiStation: stations.length > 1,
        activityIds: entry.activityIds,
        followupIds: [...new Set(entry.followupIds)]
      };
    }).sort((a, b) => a.number.localeCompare(b.number));

    const linked = new Set(merged.followups.flatMap(f => f.relatedDaily || []));
    for (const activity of merged.daily) {
      for (const id of activity.linkedFollowups || []) linked.add(activity.id);
      if ((activity.linkedFollowups || []).length) linked.add(activity.id);
    }
    const previous = new Map((snapshot.orphanActivities || []).map(o => [o.activityId, o]));
    merged.orphanActivities = merged.daily.filter(a => !linked.has(a.id)).map(activity => {
      const routine = /^pm work/i.test(activity.description || '')
        && activity.finalStatus === 'Completed' && !(activity.findings || []).length;
      return previous.get(activity.id) || {
        activityId: activity.id,
        category: routine ? 'routine_pm' : 'unlinked_work',
        reason: routine ? 'صيانة وقائية منجزة دون ملاحظات'
          : 'عمل مسجل دون متابعة تغطيه؛ يُعرض للفريق لإنشاء متابعة أو استبعاده'
      };
    });

    merged.meta = {
      ...merged.meta,
      coverage: {
        followups: merged.followups.length,
        needsReview: merged.followups.filter(f => f.needsReview).length,
        activities: merged.daily.length,
        activitiesLinked: merged.daily.length - merged.orphanActivities.length,
        activitiesUnlinked: merged.orphanActivities.length,
        multiStationOrders: merged.workOrders.filter(w => w.multiStation).length
      }
    };
  }

  root.StationsSheets = { loadPublic, loadPublicApi, loadAuthenticated, build, query, rows, dateValue };
})(globalThis);
