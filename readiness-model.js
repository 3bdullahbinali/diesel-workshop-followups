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
  const dataKinds={demo:'تجريبية',verified:'فعلية'};
  const hoseKinds={discharge:'خرطوم طرد',suction:'خرطوم سحب'};
  // «نوع رقم المعدة» عمود وصفي لا يحرّك عدّاداً، فيُعرض كما كُتب بدل رفض الصف.
  const temporaryAssetNumber=value=>/مؤقت/.test(text(value));
  const hoseUnits={roll:'لفة',piece:'عدد',metre:'متر'};
  const hoseConditions={serviceable:'صالح',needs_repair:'يحتاج إصلاحًا',damaged:'تالف'};
  // الجهات: القطاعات الخمسة ومواقع أخرى. القطاع يُشتق منها، فلا يحتاج عموداً مستقلاً للعرض.
  const places={workshop:'الورشة',store:'المستودع',operations:'مواقع التشغيل',sector_1:'القطاع ١',sector_2:'القطاع ٢',sector_3:'القطاع ٣',sector_4:'القطاع ٤',sector_5:'القطاع ٥',kalba:'بلدية كلباء'};
  const sectorPlaces=['sector_1','sector_2','sector_3','sector_4','sector_5'];

  // الرؤوس منقولة حرفياً من الشيت القائم. أعمدة الربط والمعادلات في آخر كل
  // ورقة تُقرأ ولا تُستعمل، لأن مطابقة العناوين تشترط العدد نفسه.
  const equipmentSheetName='المعدات';
  const equipmentHeaders=['معرف السجل','رقم المعدة','نوع المعدة','المقاس (بوصة)','الشركة','الطراز','الرقم التسلسلي','الحالة الفنية','حالة التشغيل','الجهة الحالية','رمز القطاع','الموقع الدقيق','حالة التسليم','اسم المستلم','تاريخ التسليم','ساعات التشغيل','آخر صيانة','الصيانة القادمة','الأعطال والملاحظات الفنية','آخر تحديث فعلي','حُدّث بواسطة','نوع البيانات','نوع رقم المعدة','معرف المتابعة','رقم طلب الشراء','رابط الصورة','ملاحظات السجل','تاريخ إنشاء السجل','مراجعة البيانات'];
  const hoseSheetName='الخراطيم';
  const hoseHeaders=['معرف مجموعة الخراطيم','رمز الصنف','النوع','المقاس (بوصة)','الوحدة','الكمية','طول الوحدة (م)','إجمالي الطول (م)','كمية سليمة','كمية تحتاج إصلاحًا','الجهة الحالية','رمز القطاع','الموقع الدقيق','اسم المستلم','تاريخ التسليم','الحالة','آخر تحديث فعلي','نوع البيانات','معرف المتابعة','ملاحظات'];
  const catalogSheetName='دليل الخراطيم';
  const catalogHeaders=['رمز الصنف','النوع','المقاس (بوصة)','طول الوحدة المرجعي (م)','الوحدة','الوصلات','نطاق البيانات'];
  const sectorSheetName='القطاعات';
  const sectorHeaders=['رمز القطاع','القطاع','المسؤول الرئيسي','الرقم الوظيفي','الهاتف الرئيسي','المسؤول البديل','هاتف البديل','آخر تحديث فعلي','حُدّث بواسطة','ملاحظات','المعدات بالقطاع','تعمل','جاهزة احتياط','للصيانة والإصلاح','مسلّمة','بيانات فعلية','بيانات تجريبية'];

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
  // الشيت يكتب التواريخ سنة/شهر/يوم؛ قارئ المتابعات يعرف يوم/شهر/سنة. تُحوَّل قبل تسليمها.
  function date(value,withTime=false){
    if(value==null||value==='')return null;
    const raw=text(value),ymd=raw.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    return root.WorkshopSheets.dateValue(ymd?ymd[1]+'-'+ymd[2]+'-'+ymd[3]:value,withTime);
  }

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
        dataKind:optionalEnum(row[21],dataKinds,'نوع البيانات في '+where),
        temporaryAsset:temporaryAssetNumber(row[22]),
        assetNumberNote:text(row[22])||null,
        taskId:text(row[23])||null,
        prNumber:text(row[24])||null,
        photo:text(row[25])||null,
        recordNotes:text(row[26])||null
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
      const place=optionalEnum(row[10],places,'الجهة الحالية في '+where);
      return {
        id,
        code:text(row[1])||null,
        kind:optionalEnum(row[2],hoseKinds,'النوع في '+where),
        size:optionalNumber(row[3],'المقاس في '+where),
        unit:optionalEnum(row[4],hoseUnits,'الوحدة في '+where),
        quantity:optionalNumber(row[5],'الكمية في '+where),
        length:optionalNumber(row[6],'طول الوحدة في '+where),
        totalLength:optionalNumber(row[7],'إجمالي الطول في '+where),
        sound:optionalNumber(row[8],'الكمية السليمة في '+where),
        needsRepair:optionalNumber(row[9],'الكمية التي تحتاج إصلاحاً في '+where),
        place,
        sector:sectorOf(place,row[11],where),
        site:text(row[12])||null,
        receiver:text(row[13])||null,
        handoverDate:date(row[14]),
        condition:optionalEnum(row[15],hoseConditions,'الحالة في '+where),
        updatedAt:date(row[16],true),
        dataKind:optionalEnum(row[17],dataKinds,'نوع البيانات في '+where),
        taskId:text(row[18])||null,
        notes:text(row[19])||null,
        coupling:null
      };
    });
  }

  function catalogEntries(rows){
    return rows.map(row=>{
      const code=text(row[0]);
      if(!code)return fail('رقم صنف مفقود في دليل الخراطيم.');
      return {
        code,
        kind:optionalEnum(row[1],hoseKinds,'النوع في الصنف '+code),
        size:optionalNumber(row[2],'المقاس في الصنف '+code),
        length:optionalNumber(row[3],'طول الوحدة المرجعي في الصنف '+code),
        unit:optionalEnum(row[4],hoseUnits,'الوحدة في الصنف '+code),
        coupling:text(row[5])||null,
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
        staffNumber:text(row[3])||null,
        phone:text(row[4])||null,
        deputy:text(row[5])||null,
        deputyPhone:text(row[6])||null,
        updatedAt:date(row[7],true),
        updatedBy:text(row[8])||null,
        notes:text(row[9])||null
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
      // الشيت يميّز التجريبي عن المتحقق منه؛ هذا هو مقياس الثقة الحقيقي.
      verified:equipment.filter(unit=>unit.dataKind==='verified').length,
      demo:equipment.filter(unit=>unit.dataKind==='demo').length,
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
    pending:unit=>!unit.technical,
    demo:unit=>unit.dataKind==='demo'
  };
  const filterLabels={all:'الكل',ready:'جاهزة للتسليم',delivered:'مسلّمة',workshop:'في الورشة',maintenance:'صيانة وإصلاح',store:'المستودع',pending:'بلا حالة فنية',demo:'بيانات تجريبية'};

  root.WorkshopReadinessModel={
    technicalStates,operationStates,handoverStates,equipmentKinds,dataKinds,
    hoseKinds,hoseUnits,hoseConditions,places,sectorPlaces,
    equipmentSheetName,equipmentHeaders,hoseSheetName,hoseHeaders,
    catalogSheetName,catalogHeaders,sectorSheetName,sectorHeaders,
    equipmentEntries,hoseEntries,catalogEntries,sectorEntries,
    summary,sizeGroups,filters,filterLabels,optionalEnum,optionalNumber,sectorOf
  };
})(globalThis);
