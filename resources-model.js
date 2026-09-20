'use strict';
/**
 * قارئ الموارد — دليل الأصناف والمخزون واحتياجات القطاعات.
 *
 * الأوراق الثلاث في شيت الجاهزية نفسه، ورؤوسها منقولة حرفياً عنه. وتقوم
 * القراءة على القاعدة نفسها: الخلية الفارغة «لم يُدخل» لا صفر، والقيمة
 * المكتوبة خارج القائمة تُرفض ويُسمّى صاحبها.
 *
 * وما يميّز هذا السجل أن نقصه هو خبره: ٤٧٧ صنفاً مكوّداً و٤٠٣ احتياجات
 * مسجّلة، ولا رصيد واحد مجرود. فالصفحة تقيس هذه الفجوة ولا تخفيها.
 */
(function(root){
  const text=value=>String(value??'').trim();
  function fail(message){throw new Error(message);}

  const groups={spare:'قطع غيار',equipment:'معدات',accessory:'ملحقات',tool:'أدوات',consumable:'مستهلكات'};
  const units={piece:'عدد',roll:'لفة',metre:'متر',set:'طقم',litre:'لتر',kg:'كجم'};
  const tracking={quantity:'كمي',individual:'فردي'};
  const stockStates={not_counted:'لم يُجرد بعد',incomplete:'لم يكتمل الجرد',counted:'مجرود',verified:'مدقق'};
  const needKinds={pump:'مضخة',suction:'خرطوم سحب',discharge:'خرطوم طرد',generator:'مولد',spare:'قطع غيار',other:'أخرى'};
  const needStates={study:'قيد الدراسة',approved:'معتمد',partial:'ملبّى جزئياً',met:'ملبّى',cancelled:'ملغى'};

  const catalogSheetName='دليل الأصناف';
  const catalogHeaders=['كود الصنف','المجموعة','اسم الصنف','الموديل أو المواصفة','رقم القطعة','الشركة','القطر (بوصة)','الطول المرجعي (م)','الوصلات أو المقاس','الوحدة','طريقة التتبع','اعتماد المواصفة','حالة الجرد','كود SAP','مرجع الصنف','عائلة المعدة','دور الصنف','مجموعة التغطية','وحدة التغطية','معامل التحويل المرجعي','اعتماد الربط الفني','ملاحظات المصدر'];
  const stockSheetName='المواد والموارد';
  const stockHeaders=['معرف سجل المورد','كود الصنف','اسم المورد','التصنيف','المواصفة','الوحدة','المخزن أو الموقع الحالي','الموجود الفعلي','الصالح للاستخدام','المخصص من الصالح','تحت الإصلاح','للفحص أو غير صالح','المتاح بعد التحقق','تاريخ الجرد','القائم بالجرد','المدقق المستقل','تاريخ التدقيق','حالة الجرد','رصيد PR التاريخي','وحدة الرصيد التاريخي','مرجع الرصيد التاريخي','نوع البيانات','ملاحظات المصدر'];
  const needSheetName='احتياجات القطاعات';
  const needHeaders=['معرف الاحتياج','رمز القطاع','الموقع','نوع الاحتياج','المقاس (بوصة)','الوحدة','الكمية المطلوبة','الكمية المسلّمة','المتبقي','الوصلات المطلوبة','حالة الطلب','تاريخ الطلب','مقدم الطلب','نوع البيانات','ملاحظات','الجهة المستفيدة بالمصدر','كود الصنف المصدر','الإحداثيات بالمصدر','مرجع الاحتياج','الموسم المرجعي','اعتماد الاحتياج بالمصدر','صف الاحتياج المصدر','المقاس كما ورد بالمصدر'];

  const R=root.WorkshopReadinessModel;
  const optionalEnum=(v,map,label)=>R.optionalEnum(v,map,label);
  const optionalNumber=(v,label)=>R.optionalNumber(v,label);
  const sheetRows=(response,headers,required,tab)=>R.sheetRows(response,headers,required,tab);
  const dataKinds=R.dataKinds;

  function catalogEntries(rows){
    const seen=new Set();
    return rows.map(row=>{
      const code=text(row[0]);
      if(!code)return fail('كود صنف مفقود في دليل الأصناف.');
      if(seen.has(code))return fail('كود صنف مكرر في دليل الأصناف: '+code+'.');
      seen.add(code);
      const where='الصنف '+code;
      return {
        code,
        group:optionalEnum(row[1],groups,'المجموعة في '+where),
        name:text(row[2])||null,
        spec:text(row[3])||null,
        partNumber:text(row[4])||null,
        maker:text(row[5])||null,
        size:optionalNumber(row[6],'القطر في '+where),
        length:optionalNumber(row[7],'الطول في '+where),
        coupling:text(row[8])||null,
        unit:optionalEnum(row[9],units,'الوحدة في '+where),
        tracking:optionalEnum(row[10],tracking,'طريقة التتبع في '+where),
        stockState:optionalEnum(row[12],stockStates,'حالة الجرد في '+where),
        sapCode:text(row[13])||null,
        reference:text(row[14])||null,
        family:text(row[15])||null,
        notes:text(row[21])||null
      };
    });
  }

  function stockEntries(rows){
    const seen=new Set();
    return rows.map(row=>{
      const id=text(row[0]);
      if(!id)return fail('معرف سجل مفقود في ورقة المواد والموارد.');
      if(seen.has(id))return fail('معرف سجل مكرر في المواد والموارد: '+id+'.');
      seen.add(id);
      const code=text(row[1]);
      if(!code)return fail('كود الصنف مفقود في السجل '+id+'.');
      const where='السجل '+id;
      return {
        id,code,
        name:text(row[2])||null,
        group:optionalEnum(row[3],groups,'التصنيف في '+where),
        spec:text(row[4])||null,
        unit:optionalEnum(row[5],units,'الوحدة في '+where),
        place:text(row[6])||null,
        onHand:optionalNumber(row[7],'الموجود الفعلي في '+where),
        serviceable:optionalNumber(row[8],'الصالح في '+where),
        assigned:optionalNumber(row[9],'المخصص في '+where),
        underRepair:optionalNumber(row[10],'تحت الإصلاح في '+where),
        inspect:optionalNumber(row[11],'للفحص في '+where),
        available:optionalNumber(row[12],'المتاح في '+where),
        countedAt:text(row[13])||null,
        countedBy:text(row[14])||null,
        state:optionalEnum(row[17],stockStates,'حالة الجرد في '+where),
        priorBalance:optionalNumber(row[18],'رصيد PR التاريخي في '+where),
        priorUnit:text(row[19])||null,
        dataKind:optionalEnum(row[21],dataKinds,'نوع البيانات في '+where),
        notes:text(row[22])||null
      };
    });
  }

  function needEntries(rows){
    const seen=new Set();
    return rows.map(row=>{
      const id=text(row[0]);
      if(!id)return fail('معرف احتياج مفقود.');
      if(seen.has(id))return fail('معرف احتياج مكرر: '+id+'.');
      seen.add(id);
      const where='الاحتياج '+id;
      const sector=text(row[1]);
      if(sector&&!/^SEC-[1-5]$/.test(sector))return fail('رمز قطاع غير معروف في '+where+': '+sector+'.');
      return {
        id,
        sector:sector||null,
        place:text(row[2])||null,
        kind:optionalEnum(row[3],needKinds,'نوع الاحتياج في '+where),
        size:optionalNumber(row[4],'المقاس في '+where),
        unit:optionalEnum(row[5],units,'الوحدة في '+where),
        wanted:optionalNumber(row[6],'الكمية المطلوبة في '+where),
        delivered:optionalNumber(row[7],'الكمية المسلّمة في '+where),
        state:optionalEnum(row[10],needStates,'حالة الطلب في '+where),
        dataKind:optionalEnum(row[13],dataKinds,'نوع البيانات في '+where),
        sourceCode:text(row[16])||null,
        coords:coordsOf(row[17],where),
        reference:text(row[18])||null,
        season:text(row[19])||null,
        notes:text(row[14])||null
      };
    });
  }

  /**
   * الإحداثيات تأتي نصاً واحداً «خط العرض, خط الطول». تُرفض قيمة خارج حدود
   * الإمارات بدل أن تُرسم نقطة في البحر: خطأ في خانة إحداثي لا يُرى على
   * الخريطة إلا بعد أن يضلّل.
   */
  function coordsOf(value,label){
    const raw=text(value);
    if(!raw)return null;
    const parts=raw.split(',').map(x=>Number(x.trim()));
    if(parts.length!==2||parts.some(n=>!Number.isFinite(n)))
      return fail('إحداثيات غير صالحة في '+label+': '+raw);
    const [lat,lng]=parts;
    if(lat<22||lat>27||lng<51||lng>57)
      return fail('إحداثيات خارج حدود الدولة في '+label+': '+raw);
    return {lat,lng};
  }

  // المتبقي لا يُحسب قبل تسجيل تسليم: الفراغ «لم يُسلَّم شيء بعد» لا صفر باقياً.
  const remaining=need=>need.wanted==null?null:need.wanted-(need.delivered||0);

  /**
   * العدّادات. الكميات تُجمع بالوحدة لا جملةً، فجمع مضخة إلى متر خرطوم
   * رقم بلا معنى. و«جُرد» تعني أن «الموجود الفعلي» كُتب، لا أن السطر موجود.
   */
  function summary(catalog,stock,needs){
    const counted=stock.filter(row=>row.onHand!=null);
    const byUnit=list=>{
      const map=new Map();
      for(const item of list){
        const q=item.quantity;
        if(q==null)continue;
        const key=item.unit||'unknown';
        map.set(key,(map.get(key)||0)+q);
      }
      return [...map.entries()].map(([unit,total])=>({unit,label:units[unit]||'بلا وحدة',total}))
        .sort((a,b)=>b.total-a.total);
    };
    return {
      items:catalog.length,
      stockRows:stock.length,
      counted:counted.length,
      uncounted:stock.length-counted.length,
      // أصناف في الدليل بلا سطر جرد أصلاً — لا يعرف أحد أنها تُعدّ
      unlisted:catalog.filter(item=>!stock.some(row=>row.code===item.code)).length,
      needs:needs.length,
      openNeeds:needs.filter(need=>remaining(need)!==0).length,
      sectors:['SEC-1','SEC-2','SEC-3','SEC-4','SEC-5'].map(code=>({
        code,label:'القطاع '+'١٢٣٤٥'[+code.slice(4)-1],
        count:needs.filter(need=>need.sector===code).length
      })),
      placeless:needs.filter(need=>!need.sector).length,
      wanted:byUnit(needs.map(need=>({unit:need.unit,quantity:need.wanted}))),
      groups:Object.entries(groups).map(([key,label])=>({
        key,label,count:catalog.filter(item=>item.group===key).length
      })).filter(group=>group.count)
    };
  }

  // الاحتياج مكتوب بالنوع والمقاس لا بكود صنف، فيُجمع كما كُتب.
  function needGroups(needs){
    const map=new Map();
    for(const need of needs){
      const key=(need.kind||'other')+'|'+(need.size==null?'':need.size);
      const label=(needKinds[need.kind]||'غير محدد')+(need.size==null?'':' · '+need.size+' بوصة');
      const group=map.get(key)||{key,label,kind:need.kind,size:need.size,count:0,unit:need.unit,total:0,sectors:new Set()};
      group.count++;
      if(need.wanted!=null)group.total+=need.wanted;
      if(need.sector)group.sectors.add(need.sector);
      map.set(key,group);
    }
    return [...map.values()].map(group=>({...group,sectors:group.sectors.size}))
      .sort((a,b)=>b.total-a.total);
  }

  /** نقاط الخريطة: تُجمَّع البنود على الإحداثية الواحدة، فالموقع واحد وإن تعددت بنوده. */
  function mapPoints(needs){
    const map=new Map();
    for(const need of needs){
      if(!need.coords)continue;
      const key=need.coords.lat+','+need.coords.lng;
      const point=map.get(key)||{key,lat:need.coords.lat,lng:need.coords.lng,
        place:need.place,sector:need.sector,count:0,kinds:new Map()};
      point.count++;
      if(need.wanted!=null){
        const k=(needKinds[need.kind]||'غير محدد')+(need.unit?' · '+units[need.unit]:'');
        point.kinds.set(k,(point.kinds.get(k)||0)+need.wanted);
      }
      map.set(key,point);
    }
    return [...map.values()].map(p=>({...p,kinds:[...p.kinds.entries()].map(([label,total])=>({label,total}))}))
      .sort((a,b)=>b.count-a.count);
  }

  const filters={
    all:()=>true,
    spare:item=>item.group==='spare',
    equipment:item=>item.group==='equipment',
    accessory:item=>item.group==='accessory',
    tool:item=>item.group==='tool',
    consumable:item=>item.group==='consumable',
    uncounted:item=>item.stockState!=='counted'&&item.stockState!=='verified'
  };
  const filterLabels={all:'كل الأصناف',spare:'قطع غيار',equipment:'معدات',accessory:'ملحقات',
    tool:'أدوات',consumable:'مستهلكات',uncounted:'لم تُجرد'};

  root.WorkshopResourcesModel={
    groups,units,tracking,stockStates,needKinds,needStates,
    catalogSheetName,catalogHeaders,stockSheetName,stockHeaders,needSheetName,needHeaders,
    catalogEntries,stockEntries,needEntries,sheetRows,
    summary,needGroups,remaining,filters,filterLabels,coordsOf,mapPoints
  };
})(globalThis);
