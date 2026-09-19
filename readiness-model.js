'use strict';
/**
 * قارئ سجل جاهزية المضخات والخراطيم — ملف Google Sheets منفصل عن سجل المتابعات.
 *
 * القاعدة الحاكمة هنا تختلف عن قارئ المتابعات: هذا السجل يبدأ فارغاً ويُملأ
 * على دفعات، فالخلية الفارغة حالة مشروعة تعني «لم يُدخل بعد» ولا تعني صفراً
 * ولا تُسقط الصف. أما القيمة المكتوبة فتُقرأ بصرامة: قيمة خارج القائمة تُرفض
 * ولا تُخمَّن، تماماً كما في سجل المتابعات.
 */
(function(root){
  const text=value=>String(value??'').trim();
  function fail(message){throw new Error(message);}

  // القيم المسموح بها — نسخة واحدة تخدم القارئ وتبويب «دليل الاستخدام» في الشيت.
  const technicalStates={ready:'جاهزة',needs_maintenance:'تحتاج صيانة',under_maintenance:'تحت الصيانة',needs_inspection:'تحتاج فحصًا',write_off:'مرشحة للشطب'};
  const operationStates={running:'تعمل',standby:'احتياط',stopped:'متوقفة',unused:'غير مستخدمة'};
  const handoverStates={delivered:'مسلّمة',not_delivered:'غير مسلّمة'};
  const equipmentKinds={pump:'مضخة',dam:'وحدة سد'};
  const assetNumberKinds={permanent:'دائم',temporary:'مؤقت'};
  const hoseKinds={discharge:'خرطوم طرد',suction:'خرطوم سحب'};
  const hoseUnits={roll:'لفة',piece:'عدد',metre:'متر'};
  const hoseConditions={serviceable:'صالح',needs_repair:'يحتاج إصلاحًا',damaged:'تالف'};
  // الجهات: القطاعات الخمسة ومواقع أخرى. القطاع يُشتق منها، فلا يحتاج عموداً مستقلاً للعرض.
  const places={workshop:'الورشة',store:'المستودع',operations:'مواقع التشغيل',sector_1:'القطاع ١',sector_2:'القطاع ٢',sector_3:'القطاع ٣',sector_4:'القطاع ٤',sector_5:'القطاع ٥',kalba:'بلدية كلباء'};
  const sectorPlaces=['sector_1','sector_2','sector_3','sector_4','sector_5'];

  const equipmentSheetName='المعدات';
  const equipmentHeaders=['معرف السجل','رقم المعدة','نوع المعدة','المقاس (بوصة)','الشركة','الطراز','الرقم التسلسلي','الحالة الفنية','حالة التشغيل','الجهة الحالية','رمز القطاع','الموقع الدقيق','حالة التسليم','اسم المستلم','تاريخ التسليم','ساعات التشغيل','آخر صيانة','الصيانة القادمة','الأعطال والملاحظات الفنية','آخر تحديث فعلي','حُدّث بواسطة','نوع البيانات','نوع رقم المعدة'];
  const hoseSheetName='الخراطيم';
  const hoseHeaders=['معرف السجل','رقم الصنف','نوع الخرطوم','المقاس (بوصة)','الطول (متر)','نوع الوصلة','وحدة القياس','الكمية المتاحة','الجهة الحالية','رمز القطاع','حالة التسليم','اسم المستلم','تاريخ التسليم','الحالة','ملاحظات','آخر تحديث فعلي','حُدّث بواسطة'];
  const catalogSheetName='دليل الخراطيم';
  const catalogHeaders=['رقم الصنف','نوع الخرطوم','المقاس (بوصة)','الطول القياسي (متر)','نوع الوصلة','وحدة القياس','ملاحظات'];
  const sectorSheetName='القطاعات';
  const sectorHeaders=['رمز القطاع','اسم القطاع','مسؤول القطاع','البديل','هاتف التواصل','البريد الإلكتروني','ملاحظات','آخر تحديث فعلي','حُدّث بواسطة'];

  // خلية فارغة ⇦ null. قيمة مكتوبة ⇦ مفتاحها، أو رفض. لا تخمين بينهما.
  function optionalEnum(value,map,label){
    const raw=text(value);
    if(!raw)return null;
    if(Object.hasOwn(map,raw))return raw;
    const entry=Object.entries(map).find(([,name])=>name===raw);
    if(entry)return entry[0];
    return fail('قيمة غير معروفة في '+label+': '+raw);
  }
  function optionalNumber(value,label){
    const raw=text(value);
    if(!raw)return null;
    const number=Number(raw.replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/,/g,''));
    if(!Number.isFinite(number)||number<0)return fail('قيمة رقمية غير صالحة في '+label+': '+raw);
    return number;
  }
  const date=(value,withTime=false)=>value==null||value===''?null:root.WorkshopSheets.dateValue(value,withTime);

  // رمز القطاع عمود مساعد؛ إن خالف الجهة الحالية فالتناقض يُرفَض بدل أن يُخفى.
  function sectorOf(place,code,label){
    const raw=text(code);
    const fromPlace=sectorPlaces.includes(place)?'SEC-'+(sectorPlaces.indexOf(place)+1):null;
    if(!raw)return fromPlace;
    if(!/^SEC-[1-5]$/.test(raw))return fail('رمز قطاع غير معروف في '+label+': '+raw);
    if(fromPlace&&fromPlace!==raw)return fail('رمز القطاع لا يطابق الجهة الحالية في '+label+'.');
    return raw;
  }

  function equipmentEntries(rows){
    const seen=new Set();
    return rows.map(row=>{
      const id=text(row[0]),asset=text(row[1]);
      if(!id)return fail('معرف سجل مفقود في ورقة المعدات.');
      if(seen.has(id))return fail('معرف سجل مكرر في ورقة المعدات: '+id+'.');
      seen.add(id);
      if(!asset)return fail('رقم المعدة مفقود في '+id+'.');
      const where='المعدة '+asset;
      const place=optionalEnum(row[9],places,'الجهة الحالية في '+where);
      return {
        id,asset,
        kind:optionalEnum(row[2],equipmentKinds,'نوع المعدة في '+where),
        size:optionalNumber(row[3],'المقاس في '+where),
        make:text(row[4])||null,
        model:text(row[5])||null,
        serial:text(row[6])||null,
        technical:optionalEnum(row[7],technicalStates,'الحالة الفنية في '+where),
        operation:optionalEnum(row[8],operationStates,'حالة التشغيل في '+where),
        place,
        sector:sectorOf(place,row[10],where),
        site:text(row[11])||null,
        handover:optionalEnum(row[12],handoverStates,'حالة التسليم في '+where),
        receiver:text(row[13])||null,
        handoverDate:date(row[14]),
        operatingHours:optionalNumber(row[15],'ساعات التشغيل في '+where),
        lastMaintenance:date(row[16]),
        nextMaintenance:date(row[17]),
        notes:text(row[18])||null,
        updatedAt:date(row[19],true),
        updatedBy:text(row[20])||null,
        assetNumberKind:optionalEnum(row[22],assetNumberKinds,'نوع رقم المعدة في '+where)
      };
    });
  }

  function hoseEntries(rows){
    const seen=new Set();
    return rows.map(row=>{
      const id=text(row[0]);
      if(!id)return fail('معرف سجل مفقود في ورقة الخراطيم.');
      if(seen.has(id))return fail('معرف سجل مكرر في ورقة الخراطيم: '+id+'.');
      seen.add(id);
      const where='الخرطوم '+(text(row[1])||id);
      const place=optionalEnum(row[8],places,'الجهة الحالية في '+where);
      return {
        id,
        code:text(row[1])||null,
        kind:optionalEnum(row[2],hoseKinds,'نوع الخرطوم في '+where),
        size:optionalNumber(row[3],'المقاس في '+where),
        length:optionalNumber(row[4],'الطول في '+where),
        coupling:text(row[5])||null,
        unit:optionalEnum(row[6],hoseUnits,'وحدة القياس في '+where),
        quantity:optionalNumber(row[7],'الكمية المتاحة في '+where),
        place,
        sector:sectorOf(place,row[9],where),
        handover:optionalEnum(row[10],handoverStates,'حالة التسليم في '+where),
        receiver:text(row[11])||null,
        handoverDate:date(row[12]),
        condition:optionalEnum(row[13],hoseConditions,'حالة الخرطوم في '+where),
        notes:text(row[14])||null,
        updatedAt:date(row[15],true)
      };
    });
  }

  function catalogEntries(rows){
    return rows.map(row=>{
      const code=text(row[0]);
      if(!code)return fail('رقم صنف مفقود في دليل الخراطيم.');
      return {
        code,
        kind:optionalEnum(row[1],hoseKinds,'نوع الخرطوم في الصنف '+code),
        size:optionalNumber(row[2],'المقاس في الصنف '+code),
        length:optionalNumber(row[3],'الطول القياسي في الصنف '+code),
        coupling:text(row[4])||null,
        unit:optionalEnum(row[5],hoseUnits,'وحدة القياس في الصنف '+code),
        notes:text(row[6])||null
      };
    });
  }

  function sectorEntries(rows){
    const seen=new Set();
    return rows.map(row=>{
      const code=text(row[0]);
      if(!/^SEC-[1-5]$/.test(code))return fail('رمز قطاع غير معروف في ورقة القطاعات: '+code+'.');
      if(seen.has(code))return fail('رمز قطاع مكرر في ورقة القطاعات: '+code+'.');
      seen.add(code);
      return {
        code,
        name:text(row[1])||places[sectorPlaces[+code.slice(4)-1]],
        owner:text(row[2])||null,
        deputy:text(row[3])||null,
        phone:text(row[4])||null,
        email:text(row[5])||null,
        notes:text(row[6])||null,
        updatedAt:date(row[7],true)
      };
    });
  }

  /**
   * العدّادات. كل عدّاد يحمل مقامه: «٩ من ٢٥٩» لا «٩»، لأن السجل ناقص
   * بطبيعته في هذه المرحلة، ورقم بلا مقام يوحي بجاهزية لم تُقَس.
   */
  function summary(equipment){
    const entered=equipment.filter(unit=>unit.technical);
    const placed=equipment.filter(unit=>unit.place);
    const at=key=>placed.filter(unit=>unit.place===key).length;
    return {
      total:equipment.length,
      entered:entered.length,
      pending:equipment.length-entered.length,
      // «جاهزة للتسليم» = سليمة فنياً، في الورشة، وغير مسلّمة. الثلاثة معاً.
      readyToHandOver:equipment.filter(unit=>unit.technical==='ready'&&unit.place==='workshop'&&unit.handover!=='delivered').length,
      delivered:equipment.filter(unit=>unit.handover==='delivered').length,
      workshop:at('workshop'),
      store:at('store'),
      operations:at('operations'),
      maintenance:equipment.filter(unit=>['needs_maintenance','under_maintenance'].includes(unit.technical)).length,
      writeOff:equipment.filter(unit=>unit.technical==='write_off').length,
      placeless:equipment.length-placed.length,
      sectors:sectorPlaces.map((key,index)=>({code:'SEC-'+(index+1),place:key,label:places[key],count:at(key)}))
    };
  }

  // تجميع حسب المقاس: وحدات السد تُعرض مجموعة مستقلة لأن مقاسها غير مسجّل.
  function sizeGroups(equipment){
    const groups=new Map();
    for(const unit of equipment){
      const key=unit.kind==='dam'?'dam':unit.size==null?'unknown':String(unit.size);
      const label=unit.kind==='dam'?'وحدات السد':unit.size==null?'مقاس غير مدخل':unit.size+' بوصة';
      const group=groups.get(key)||{key,label,count:0,size:unit.kind==='dam'?null:unit.size};
      group.count++;groups.set(key,group);
    }
    const rank=group=>group.key==='dam'?1e6:group.key==='unknown'?1e7:group.size;
    return [...groups.values()].sort((a,b)=>rank(a)-rank(b));
  }

  const filters={
    all:()=>true,
    ready:unit=>unit.technical==='ready'&&unit.place==='workshop'&&unit.handover!=='delivered',
    delivered:unit=>unit.handover==='delivered',
    workshop:unit=>unit.place==='workshop',
    maintenance:unit=>['needs_maintenance','under_maintenance'].includes(unit.technical),
    store:unit=>unit.place==='store',
    pending:unit=>!unit.technical
  };
  const filterLabels={all:'الكل',ready:'جاهزة للتسليم',delivered:'مسلّمة',workshop:'في الورشة',maintenance:'صيانة وإصلاح',store:'المستودع',pending:'لم تُدخل حالتها'};

  root.WorkshopReadinessModel={
    technicalStates,operationStates,handoverStates,equipmentKinds,assetNumberKinds,
    hoseKinds,hoseUnits,hoseConditions,places,sectorPlaces,
    equipmentSheetName,equipmentHeaders,hoseSheetName,hoseHeaders,
    catalogSheetName,catalogHeaders,sectorSheetName,sectorHeaders,
    equipmentEntries,hoseEntries,catalogEntries,sectorEntries,
    summary,sizeGroups,filters,filterLabels,optionalEnum,optionalNumber,sectorOf
  };
})(globalThis);
