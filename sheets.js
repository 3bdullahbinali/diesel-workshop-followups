'use strict';
(function(root){
  const priorities={high:'عالية',medium:'متوسطة',low:'منخفضة'};
  const stages={preparation:'قيد الإعداد',approvals:'بانتظار الموافقات',number_pending:'بانتظار رقم طلب الشراء',action:'يحتاج إجراء',pr_team_approval:'بانتظار موافقة فريق طلبات الشراء',warehouse_approval:'بانتظار موافقات المستودع',quotes:'بانتظار العروض',offers_received:'وصلت العروض',evaluation:'تحت التقييم',delivery:'بانتظار التوريد',in_progress:'قيد التنفيذ',coordination:'بانتظار المتابعة',on_hold:'مؤجل',closure:'بانتظار الإغلاق',completed:'مكتمل',cancelled:'ملغى'};
  const kinds={pr:'طلب شراء',unnumbered:'طلب غير مرقم',planning:'خطة مستقبلية',linked:'بند مرتبط',lpo:'أمر توريد',request:'طلب غير مرقم'};
  const bases={estimated:'تقديرية',quoted:'عرض سعر',recorded:'مسجلة'};
  // أعمدة تشغيلية اختيارية: تعمل الصفحة قبل إضافتها إلى الشيت وبعدها.
  const areas={procurement:'المشتريات والموازنة',maintenance:'الصيانة والفحص والدعم الفني',rain:'جاهزية الأمطار والقطاعات',inventory:'المخزون والأصول',vehicles:'مركبات الإدارة والسائقون',admin:'الشؤون الإدارية والموظفون'};
  const actions={me:'عندي',team:'عند الفريق',external:'بانتظار جهة أخرى',unassigned:'لم يحدد'};
  const optionalHeaders=['المجال','الإجراء عند','العائق'];
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
      Object.assign(item,{title:text(row[1]),priority:enumValue(row[2],priorities,old?.priority,'الأولوية'),stage:enumValue(row[3],stages,old?.stage,'الحالة'),action:text(row[4]),owner:text(row[5]),informationDate:info,status:text(row[10]),followUpWith:text(row[11]),group:enumValue(row[12],groupMap,old?.group,'التصنيف'),dueDate:dateValue(row[13]),reference:text(row[15]),notes:text(row[16])});
      // المجال والإجراء عند يرجعان إلى النسخة المجهزة عند خلو الخلية، حتى تعمل
      // الصفحة قبل تعبئة الأعمدة الجديدة؛ أما العائق فالشيت مرجعه عند وجود عموده.
      if(text(row[23]))item.area=enumValue(row[23],areas,old?.area,'المجال');
      if(text(row[24]))item.actionAt=enumValue(row[24],actions,old?.actionAt,'الإجراء عند');
      if(row.length>25){const blocker=text(row[25]);if(blocker)item.blocker=blocker;else delete item.blocker;}
      const edited=dateValue(row[14],true);
      // Import/display rounding must never change an existing record's timestamp.
      item.updatedAt=old?.updatedAt && edited && Math.floor(Date.parse(old.updatedAt)/60000)===Math.floor(Date.parse(edited)/60000)?old.updatedAt:edited;
      if(old && (item.informationDate!==old.informationDate||item.status!==old.status))item.evidence='sheet';
      if(row.slice(7,10).some(v=>v!=null&&v!=='')||row.slice(17).some(v=>v!=null&&v!=='')||old?.procurement){
        const meta=old?.procurement?copy(old.procurement):{linkedItemIds:[]};
        const rawKind=text(row[17]);
        // The prepared file retains raw values for legacy procurement kinds.
        meta.kind=rawKind===old?.procurement?.kind?rawKind:enumValue(rawKind,{...kinds,unregistered:'طلب غير مرقم',dpr:'طلب مباشر',cancelled:'ملغى',lpo_only:'أمر توريد'},old?.procurement?.kind,'نوع طلب الشراء');
        if(rawKind==='طلب غير مرقم' && !['request','unnumbered'].includes(old?.procurement?.kind))meta.kind='unregistered';
        if(rawKind==='أمر توريد' && old?.procurement?.kind!=='lpo')meta.kind='lpo_only';
        meta.stage=enumValue(row[18],stages,old?.procurement?.stage,'مرحلة الشراء');
        meta.prNumber=text(row[7])||null;meta.budgetCode=text(row[9])||null;
        meta.numberType=text(row[19])||null;meta.lpoNumber=text(row[20])||null;
        meta.amountAed=row[8]==null||row[8]===''?null:Number(text(row[8]).replaceAll(',',''));
        if(meta.amountAed!==null&&(!Number.isFinite(meta.amountAed)||meta.amountAed<0))return fail('قيمة مالية غير صالحة في بند '+id+'.');
        meta.amountBasis=text(row[21])?enumValue(row[21],bases,old?.procurement?.amountBasis,'أساس القيمة'):null;
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
  function query(sheetId,tabId,range){
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
      const timer=setTimeout(()=>finish(new Error('تعذر الوصول إلى ملف Google Sheets.')),25000);
      const url=new URL('https://docs.google.com/spreadsheets/d/'+encodeURIComponent(sheetId)+'/gviz/tq');
      url.search=new URLSearchParams({gid:String(tabId),headers:'1',range,tqx:'out:json;responseHandler:'+name,tq:'select *',_t:String(Date.now())});
      script.src=url.href;script.referrerPolicy='no-referrer';
      script.onerror=()=>finish(new Error('تعذر الوصول إلى ملف Google Sheets.'));
      document.head.appendChild(script);
    });
  }
  async function load(config,snapshot){
    const [main,refs]=await Promise.all([query(config.spreadsheetId,config.mainSheetId,'A1:Z5001'),query(config.spreadsheetId,config.sourceSheetId,'A1:E20001')]);
    return merge(snapshot,tableRows(main,headers,optionalHeaders),tableRows(refs,sourceHeaders));
  }
  root.WorkshopSheets={load,merge,tableRows,dateValue,headers,sourceHeaders,optionalHeaders,stages,areas,actions};
})(globalThis);
