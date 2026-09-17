'use strict';
(function(root){
  const priorities={high:'عالية',medium:'متوسطة',low:'منخفضة'};
  const stages={preparation:'قيد الإعداد',approvals:'بانتظار الموافقات',number_pending:'بانتظار رقم طلب الشراء',action:'يحتاج إجراء',pr_team_approval:'بانتظار موافقة فريق طلبات الشراء',warehouse_approval:'بانتظار موافقات المستودع',quotes:'بانتظار العروض',offers_received:'وصلت العروض',evaluation:'تحت التقييم',lpo_pending:'بانتظار LPO',delivery:'بانتظار التوريد',partial_delivery:'استلام جزئي',received:'مستلم بالكامل ومغلق',closed_unreceived:'مغلق — المتبقي غير مستلم',in_progress:'قيد التنفيذ',coordination:'بانتظار المتابعة',on_hold:'مؤجل',closure:'بانتظار الإغلاق',completed:'مكتمل',cancelled:'ملغى'};
  const kinds={pr:'طلب شراء',unnumbered:'طلب غير مرقم',planning:'خطة مستقبلية',linked:'بند مرتبط',lpo:'أمر توريد',request:'طلب غير مرقم'};
  const bases={estimated:'تقديرية',quoted:'عرض سعر',recorded:'مسجلة'};
  // أعمدة تشغيلية اختيارية: تعمل الصفحة قبل إضافتها إلى الشيت وبعدها.
  const areas={procurement:'المشتريات والموازنة',maintenance:'الصيانة والفحص والدعم الفني',rain:'جاهزية الأمطار والقطاعات',inventory:'المخزون والأصول',vehicles:'مركبات الإدارة والسائقون',admin:'الشؤون الإدارية والموظفون'};
  const actions={me:'عندي',team:'عند الفريق',external:'بانتظار جهة أخرى',unassigned:'لم يحدد'};
  const optionalHeaders=['المجال','الإجراء عند','العائق'];
  // المراسلات: ورقة اختيارية تُقرأ بالاسم، فلا تحتاج معرّفاً في الإعداد.
  const letterSheetName='المراسلات';
  const letterHeaders=['معرّف الكتاب','الاتجاه','الموضوع','رقم الكتاب','الجهة','معرّف المتابعة','آخر موقع','تاريخ التحقق','حالة العمل','حالة الرد','حالة الكتاب','الإجراء التالي','موعد المتابعة','رقم كتاب الرد','الملاحظات','آخر تعديل بتوقيت الإمارات'];
  const directions={out:'صادر',in:'وارد'};
  // الأعمال: ما هو قيد الانتظار وما هو قائم، لنا وللجهات الأخرى.
  const jobSheetName='الأعمال';
  const jobHeaders=['معرّف العمل','الموضوع','الطرف','الجهة','نوع العمل','الحالة','المسؤول','تاريخ البدء','الموعد المتوقع','معرّف المتابعة','الملاحظات','آخر تعديل بتوقيت الإمارات'];
  const parties={outbound:'نقدّمه لجهة',inbound:'تقدّمه لنا جهة',internal:'داخلي'};
  const jobKinds={pending:'الأعمال المطلوب إنجازها',ongoing:'عمل قائم',periodic:'صيانة دورية',support:'دعم وتوفير معدات'};
  // التسميات السابقة تبقى مقروءة، فلا يسقط صف كُتب قبل تعريب الاسم.
  const jobKindAliases={'بيندنق جوب':'pending','عمل قيد الانتظار':'pending'};
  const jobStates={not_started:'لم يبدأ',in_progress:'قيد التنفيذ',awaiting_parts:'بانتظار قطع غيار',awaiting_party:'بانتظار الجهة',done:'اكتمل',cancelled:'ملغى'};
  // المعدات المستلمة للصيانة: ورقة اختيارية تُقرأ بالاسم وتُربط ببنود السجل.
  const equipmentSheetName='المعدات';
  const equipmentHeaders=['معرّف البند','الجهة صاحبة المعدة','رقم المعدة','تاريخ الاستلام','المستلم في الورشة','مرحلة العمل الفني','حالة التسليم','تاريخ الإعادة','المستلم من الجهة','الملاحظات','آخر تعديل بتوقيت الإمارات'];
  const phases={intake:'بانتظار الاستلام',inspection:'تحت الفحص',approval:'بانتظار اعتماد',parts:'بانتظار قطع غيار',repair:'تحت الإصلاح',done:'اكتمل الإصلاح'};
  const handovers={none:'غير مسجل',in_workshop:'في الورشة',ready:'جاهزة للتسليم',delivered:'تم التسليم'};
  const workStates={not_started:'لم يبدأ',in_progress:'قيد التنفيذ',done:'اكتمل العمل',awaiting_party:'بانتظار إجراء الجهة',filed:'للعلم والحفظ'};
  const replyStates={none:'لم يُعد الرد',not_required:'لا يتطلب رداً',draft:'مسودة بانتظار المراجعة',sent:'تم إرسال الرد',awaiting:'بانتظار رد الجهة',received:'تم استلام الرد'};
  const closureStates={open:'مفتوح',pending:'بانتظار الإغلاق',closed:'مغلق'};
  const headers=['معرّف البند','الموضوع','الأولوية','الحالة','الإجراء المطلوب','المسؤول','تاريخ المعلومة','رقم PR','القيمة بالدرهم','بند الموازنة','تفاصيل الحالة','جهة المتابعة','التصنيف','الموعد المرتبط','آخر تعديل بتوقيت الإمارات','المرجع','الملاحظات','نوع طلب الشراء','مرحلة الشراء','نوع الرقم','رقم LPO','أساس القيمة','ملاحظة القيمة'];
  const sourceHeaders=['معرّف البند','نوع المرجع','تاريخ المصدر','العنوان','التفاصيل'];
  const text=value=>String(value??'').trim();
  const copy=value=>JSON.parse(JSON.stringify(value));
  function fail(message){throw new Error(message);}
  function enumValue(value,map,old,label){
    const raw=text(value);
    if(old && (raw===old || raw===(map[old]||old)))return old;
    if(Object.hasOwn(map,raw))return raw;
    const entry=Object.entries(map).find(([,name])=>name===raw);
    if(entry)return entry[0];
    return fail('قيمة غير معروفة في '+label+': '+raw);
  }
  function dateValue(value,withTime=false){
    if(value==null || value==='')return null;
    let parts,wall;
    if(typeof value==='number')wall=new Date(Date.UTC(1899,11,30)+Math.round(value*86400000));
    else if((parts=text(value).match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+)(?:,(\d+))?)?\)$/)))wall=new Date(Date.UTC(+parts[1],+parts[2],+parts[3],+(parts[4]||0),+(parts[5]||0),+(parts[6]||0),+(parts[7]||0)));
    else if((parts=text(value).match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/)))wall=new Date(Date.UTC(+parts[3],+parts[2]-1,+parts[1],+(parts[4]||0),+(parts[5]||0),+(parts[6]||0)));
    else if(/^\d{4}-\d{2}-\d{2}$/.test(text(value)))wall=new Date(text(value)+'T00:00:00Z');
    else return fail('صيغة تاريخ غير صالحة في Google Sheets.');
    if(Number.isNaN(wall.getTime()))return fail('تاريخ غير صالح في Google Sheets.');
    return withTime ? new Date(wall.getTime()-4*3600000).toISOString() : wall.toISOString().slice(0,10);
  }
  function tableRows(response,expected,optional=[]){
    if(response?.status!=='ok' || !response.table || !Array.isArray(response.table.rows))return fail('تعذر قراءة Google Sheets.');
    let cols=response.table.cols;
    // المدى يشمل أعمدة قد لا تكون أُنشئت بعد؛ تُهمل الأعمدة الفارغة في آخره.
    while(cols.length>expected.length && !text(cols[cols.length-1]?.label))cols=cols.slice(0,-1);
    const extra=cols.length-expected.length;
    if(extra<0 || extra>optional.length)return fail('عناوين أعمدة Google Sheets لا تطابق ملف المتابعات.');
    const all=[...expected,...optional.slice(0,extra)];
    if(all.some((h,i)=>text(cols[i]?.label)!==h))return fail('عناوين أعمدة Google Sheets لا تطابق ملف المتابعات.');
    return response.table.rows.map(row=>all.map((_,i)=>row.c?.[i]?.v??null)).filter(row=>row.some(v=>v!=null&&v!==''));
  }
  function merge(snapshot,mainRows,sourceRows){
    const prior=new Map(snapshot.items.map(item=>[item.id,item]));
    // سطر «محذوف» في ورقة المراجع يوثّق حذفاً مقصوداً من الموقع.
    const removed=new Set(sourceRows.filter(row=>text(row[1])==='محذوف').map(row=>text(row[0])));
    const groupMap=Object.fromEntries(snapshot.groups.filter(g=>g.id!=='all').map(g=>[g.id,g.label]));
    const seen=new Set();
    const items=mainRows.map(row=>{
      const id=text(row[0]);
      if(!/^[a-zA-Z0-9_-]+$/.test(id)||seen.has(id))return fail('معرّف بند مفقود أو مكرر في Google Sheets.');
      seen.add(id);
      const old=prior.get(id),item=old?copy(old):{id,baseIds:[],kind:'new',sources:[],history:[],evidence:'sheet'};
      const info=dateValue(row[6]);
      if(!info||!text(row[1]))return fail('الموضوع أو تاريخ المعلومة مفقود في بند '+id+'.');
      Object.assign(item,{title:text(row[1]),priority:enumValue(row[2],priorities,old?.priority,'الأولوية في بند '+id),stage:enumValue(row[3],stages,old?.stage,'الحالة في بند '+id),action:text(row[4]),owner:text(row[5]),informationDate:info,status:text(row[10]),followUpWith:text(row[11]),group:enumValue(row[12],groupMap,old?.group,'التصنيف في بند '+id),dueDate:dateValue(row[13]),reference:text(row[15]),notes:text(row[16])});
      // المجال والإجراء عند يرجعان إلى النسخة المجهزة عند خلو الخلية، حتى تعمل
      // الصفحة قبل تعبئة الأعمدة الجديدة؛ أما العائق فالشيت مرجعه عند وجود عموده.
      if(text(row[23]))item.area=enumValue(row[23],areas,old?.area,'المجال في بند '+id);
      if(text(row[24]))item.actionAt=enumValue(row[24],actions,old?.actionAt,'الإجراء عند في بند '+id);
      if(row.length>25){const blocker=text(row[25]);if(blocker)item.blocker=blocker;else delete item.blocker;}
      const edited=dateValue(row[14],true);
      // Import/display rounding must never change an existing record's timestamp.
      item.updatedAt=old?.updatedAt && edited && Math.floor(Date.parse(old.updatedAt)/60000)===Math.floor(Date.parse(edited)/60000)?old.updatedAt:edited;
      if(old && (item.informationDate!==old.informationDate||item.status!==old.status))item.evidence='sheet';
      // أعمدة الشراء وحدها (17..22)؛ المدى يمتد إلى Z فلا يصح تركها مفتوحة.
      if(row.slice(7,10).some(v=>v!=null&&v!=='')||row.slice(17,23).some(v=>v!=null&&v!=='')||old?.procurement){
        const meta=old?.procurement?copy(old.procurement):{linkedItemIds:[]};
        const rawKind=text(row[17]);
        // خلية فارغة في بند شراء تُستنتج من أرقامه بدل أن تُسقط قراءة السجل كله.
        const guessedKind=text(row[7])?'pr':text(row[20])?'lpo':'unregistered';
        // The prepared file retains raw values for legacy procurement kinds.
        meta.kind=!rawKind?(old?.procurement?.kind||guessedKind):rawKind===old?.procurement?.kind?rawKind:enumValue(rawKind,{...kinds,unregistered:'طلب غير مرقم',dpr:'طلب مباشر',cancelled:'ملغى',lpo_only:'أمر توريد'},old?.procurement?.kind,'نوع طلب الشراء في بند '+id);
        if(rawKind==='طلب غير مرقم' && !['request','unnumbered'].includes(old?.procurement?.kind))meta.kind='unregistered';
        if(rawKind==='أمر توريد' && old?.procurement?.kind!=='lpo')meta.kind='lpo_only';
        meta.stage=text(row[18])?enumValue(row[18],stages,old?.procurement?.stage,'مرحلة الشراء في بند '+id):(old?.procurement?.stage||item.stage);
        meta.prNumber=text(row[7])||null;meta.budgetCode=text(row[9])||null;
        meta.numberType=text(row[19])||null;meta.lpoNumber=text(row[20])||null;
        meta.amountAed=row[8]==null||row[8]===''?null:Number(text(row[8]).replaceAll(',',''));
        if(meta.amountAed!==null&&(!Number.isFinite(meta.amountAed)||meta.amountAed<0))return fail('قيمة مالية غير صالحة في بند '+id+'.');
        meta.amountBasis=text(row[21])?enumValue(row[21],bases,old?.procurement?.amountBasis,'أساس القيمة في بند '+id):null;
        if(text(row[22])||Object.hasOwn(meta,'amountNote'))meta.amountNote=text(row[22])||null;
        for(const key of Object.keys(meta))if(meta[key]===null&&old?.procurement&&!Object.hasOwn(old.procurement,key))delete meta[key];
        item.procurement=meta;
      }
      return item;
    });
    if(!items.length)return fail('ورقة المتابعات فارغة.');
    // Never silently lose a baseline or merged record after a malformed edit.
    for(const id of prior.keys())if(!seen.has(id)&&!removed.has(id))return fail('بند من السجل المجهز مفقود في Google Sheets: '+id+'.');
    const byId=new Map(items.map(item=>[item.id,item]));
    const sourceMap=new Map(),historyMap=new Map();
    for(const row of sourceRows){
      const id=text(row[0]),type=text(row[1]);
      if(type==='محذوف')continue;
      const item=byId.get(id);
      if(!item)return fail('مرجع مرتبط بمعرّف غير موجود: '+id+'.');
      const date=dateValue(row[2]);
      if(type==='مرجع'){
        const source={title:text(row[3]),locator:text(row[4]),date};
        const previous=prior.get(id)?.sources.find(s=>s.title===source.title&&s.locator===source.locator&&s.date===source.date);
        const list=sourceMap.get(id)||[];list.push(previous?copy(previous):{...source,type:'sheet'});sourceMap.set(id,list);
      }else if(type==='حالة سابقة'){
        const history={date,status:text(row[4])};
        const previous=prior.get(id)?.history?.find(h=>h.date===history.date&&h.status===history.status);
        const list=historyMap.get(id)||[];list.push(previous?copy(previous):history);historyMap.set(id,list);
      }else return fail('نوع مرجع غير معروف في Google Sheets.');
    }
    for(const item of items){
      item.sources=sourceMap.get(item.id)||[];item.history=historyMap.get(item.id)||[];
      if(prior.get(item.id)?.sources.length&&!item.sources.length)return fail('مراجع البند مفقودة: '+item.id+'.');
    }
    const result={...copy(snapshot),items};
    result.latestInformationDate=items.map(i=>i.informationDate).sort().at(-1);
    result.updatedAt=items.map(i=>i.updatedAt).filter(Boolean).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1)||snapshot.updatedAt;
    result.connectionSource='google-sheets';
    return result;
  }
  let requestNo=0;
  function query(sheetId,tabId,range,timeout=25000){
    return new Promise((resolve,reject)=>{
      const name='workshopSheetsResponse'+(++requestNo),script=document.createElement('script');
      let done=false;
      const finish=(error,response)=>{
        if(done)return;done=true;clearTimeout(timer);script.remove();
        // A slow JSONP response may still execute after its script is removed.
        if(error){root[name]=()=>{};setTimeout(()=>delete root[name],60000);reject(error);}
        else{delete root[name];resolve(response);}
      };
      root[name]=response=>finish(null,response);
      const timer=setTimeout(()=>finish(new Error('تعذر الوصول إلى ملف Google Sheets.')),timeout);
      const url=new URL('https://docs.google.com/spreadsheets/d/'+encodeURIComponent(sheetId)+'/gviz/tq');
      const params={headers:'1',range,tqx:'out:json;responseHandler:'+name,tq:'select *',_t:String(Date.now())};
      // رقم = معرّف ورقة، ونص = اسمها كما يظهر في الشيت.
      if(/^\d+$/.test(String(tabId)))params.gid=String(tabId);else params.sheet=String(tabId);
      url.search=new URLSearchParams(params);
      script.src=url.href;script.referrerPolicy='no-referrer';
      script.onerror=()=>finish(new Error('تعذر الوصول إلى ملف Google Sheets.'));
      document.head.appendChild(script);
    });
  }
  async function load(config,snapshot){
    const translations = config.translationSheetId == null ? Promise.resolve(null) :
      query(config.spreadsheetId,config.translationSheetId,'A1:B5001',6000)
        .then(response=>translationEntries(tableRows(response,['النص العربي','English'])))
        .catch(()=>null); // A translation outage must not suppress current operational records.
    // غياب ورقة المراسلات لا يمنع عرض السجل؛ يختفي تبويبها فقط.
    const readLetters=query(config.spreadsheetId,letterSheetName,'A1:P2001',8000)
      .then(response=>letterEntries(tableRows(response,letterHeaders)))
      .catch(()=>null);
    const readJobs=query(config.spreadsheetId,jobSheetName,'A1:L2001',8000)
      .then(response=>jobEntries(tableRows(response,jobHeaders)))
      .catch(()=>null);
    const readEquipment=query(config.spreadsheetId,equipmentSheetName,'A1:K2001',8000)
      .then(response=>equipmentEntries(tableRows(response,equipmentHeaders)))
      .catch(()=>null);
    const readOrders=config.orderSheetId==null?Promise.resolve([]):query(config.spreadsheetId,config.orderSheetId,'A1:K5001').then(r=>tableRows(r,root.WorkshopOrders.orderHeaders));
    const readLines=config.deliverySheetId==null?Promise.resolve([]):query(config.spreadsheetId,config.deliverySheetId,'A1:J20001').then(r=>tableRows(r,root.WorkshopOrders.lineHeaders));
    // المدى يمتد إلى Z ليشمل أعمدة المجال والإجراء عند والعائق إن أُضيفت.
    const [main,refs,english,orders,lines,letters,equipment,jobs]=await Promise.all([query(config.spreadsheetId,config.mainSheetId,'A1:Z5001'),query(config.spreadsheetId,config.sourceSheetId,'A1:E20001'),translations,readOrders,readLines,readLetters,readEquipment,readJobs]);
    const result=root.WorkshopOrders.attach(merge(snapshot,tableRows(main,headers,optionalHeaders),tableRows(refs,sourceHeaders)),orders,lines);
    result.translations=english;
    result.letters=letters;
    result.jobs=jobs;
    // تُربط المعدة ببندها، ويبقى البند ظاهراً حتى لو لم تُسجَّل له معدة.
    result.equipmentEnabled=Array.isArray(equipment);
    if(Array.isArray(equipment)){
      const byId=new Map(result.items.map(item=>[item.id,item]));
      for(const record of equipment){
        const item=byId.get(record.itemId);
        if(!item)return fail('سجل معدة مرتبط بمعرّف غير موجود: '+record.itemId+'.');
        item.equipment=record;
      }
    }
    return result;
  }
  function jobEntries(rows){
    const seen=new Set();
    return rows.map(row=>{
      const id=text(row[0]);
      if(!/^[a-zA-Z0-9_-]+$/.test(id)||seen.has(id))return fail('معرّف عمل مفقود أو مكرر في ورقة الأعمال.');
      seen.add(id);
      if(!text(row[1]))return fail('موضوع العمل مفقود: '+id+'.');
      return {
        id,
        title:text(row[1]),
        party:enumValue(row[2],parties,null,'طرف العمل في '+id),
        counterpart:text(row[3]),
        kind:enumValue(jobKindAliases[text(row[4])]||row[4],jobKinds,null,'نوع العمل في '+id),
        state:enumValue(row[5],jobStates,null,'حالة العمل في '+id),
        owner:text(row[6]),
        startDate:dateValue(row[7]),
        dueDate:dateValue(row[8]),
        taskId:text(row[9])||null,
        notes:text(row[10]),
        updatedAt:dateValue(row[11],true)
      };
    });
  }
  function equipmentEntries(rows){
    const seen=new Set();
    return rows.map(row=>{
      const id=text(row[0]);
      if(!id||seen.has(id))return fail('معرّف بند مفقود أو مكرر في ورقة المعدات.');
      seen.add(id);
      return {
        itemId:id,
        owner:text(row[1]),
        asset:text(row[2]),
        receivedDate:dateValue(row[3]),
        receiver:text(row[4]),
        phase:enumValue(row[5],phases,null,'مرحلة العمل الفني'),
        handover:enumValue(row[6],handovers,null,'حالة التسليم'),
        returnedDate:dateValue(row[7]),
        returnedTo:text(row[8]),
        notes:text(row[9]),
        updatedAt:dateValue(row[10],true)
      };
    });
  }
  function letterEntries(rows){
    const seen=new Set();
    return rows.map(row=>{
      const id=text(row[0]);
      if(!/^[a-zA-Z0-9_-]+$/.test(id)||seen.has(id))return fail('معرّف كتاب مفقود أو مكرر في ورقة المراسلات.');
      seen.add(id);
      if(!text(row[2]))return fail('موضوع الكتاب مفقود: '+id+'.');
      const letter={
        id,
        direction:enumValue(row[1],directions,null,'اتجاه الكتاب'),
        title:text(row[2]),
        reference:text(row[3]),
        party:text(row[4]),
        taskId:text(row[5])||null,
        location:text(row[6]),
        verifiedDate:dateValue(row[7]),
        work:enumValue(row[8],workStates,null,'حالة العمل'),
        reply:enumValue(row[9],replyStates,null,'حالة الرد'),
        closure:enumValue(row[10],closureStates,null,'حالة الكتاب'),
        action:text(row[11]),
        dueDate:dateValue(row[12]),
        replyReference:text(row[13]),
        notes:text(row[14]),
        updatedAt:dateValue(row[15],true)
      };
      return letter;
    });
  }
  function translationEntries(rows){
    const entries=new Map();
    for(const row of rows){
      const source=text(row[0]),target=text(row[1]);
      if(!source||!target)continue;
      if(/[\u0621-\u063a\u0641-\u064a]/.test(target))continue;
      if(entries.has(source)&&entries.get(source)!==target)throw new Error('Conflicting English translations');
      entries.set(source,target);
    }
    return Object.fromEntries(entries);
  }
  root.WorkshopSheets={load,merge,tableRows,dateValue,translationEntries,letterEntries,headers,sourceHeaders,optionalHeaders,letterHeaders,letterSheetName,equipmentHeaders,equipmentSheetName,jobHeaders,jobSheetName,stages,areas,actions,directions,workStates,replyStates,closureStates,phases,handovers,equipmentEntries,parties,jobKinds,jobStates,jobEntries};
})(globalThis);
