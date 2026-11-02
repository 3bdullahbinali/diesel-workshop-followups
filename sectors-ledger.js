/* The October distribution is a dated baseline. Physical receipts come only
   from named, verified movements. Workshop receipt of a rental is separate. */
(function(root){
  'use strict';
  const fleetHeader=['معرف السجل','الملكية','رقم المضخة','المقاس','الشركة أو الطراز','الرقم التسلسلي','معرف السجل السابق','تاريخ استلام الإيجار','حالة المضخة','جهة التشغيل أو القطاع','الموقع الحالي','رابط الخريطة','تاريخ التحقق'];
  const planHeader=['القطاع','المقاس','المطلوب','صفة الطلب','تاريخ الطلب','الموزّع حسب الورشة','تاريخ التوزيع','الإجمالي المكتوب للقطاع','طرد مطلوب بالمتر','سحب مطلوب بالقطعة','مواقع بأطوال طرد غير محددة','قطع سحب غير محددة المقاس'];
  const movementHeader=['معرف الحركة','تاريخ الحركة','نوع الأصل','معرف الأصل','الكمية','نوع الحركة','من جهة','إلى جهة','من قطاع','إلى قطاع','الموقع بعد الحركة','اسم المستلم','الحالة عند الحركة','نوع البيانات'];
  const sectorCodes=['SEC-1','SEC-2','SEC-3','SEC-4','SEC-5'];
  const sizes=['3 بوصة','4 بوصة','6 بوصة','8 بوصة','10 بوصة','12 بوصة','السد'];
  const str=v=>String(v??'').trim();
  const normal=v=>str(v).toUpperCase().replace(/[\s/-]+/g,'');
  function quantity(v){
    if(v==null||str(v)==='')return null;
    const n=Number(v);
    if(!Number.isFinite(n)||n<0)throw new Error('قيمة كمية غير صالحة');
    return n;
  }
  const iso=v=>root.WorkshopSheets.dateValue(v);
  async function readSheet(id,name,headers,last){
    const range='A1:'+root.WorkshopReadinessModel.columnLetter(headers.length)+last;
    const response=await root.WorkshopSheets.query(id,name,range,15000);
    return root.WorkshopReadinessModel.sheetRows(response,headers,headers.length,name);
  }
  function build(fleetRows,planRows,movements){
    const fleet=fleetRows.map(r=>({id:str(r[0]),owner:str(r[1]),asset:str(r[2]),size:str(r[3]),make:str(r[4]),serial:str(r[5]),legacy:str(r[6]),received:iso(r[7]),state:str(r[8]),assignment:str(r[9]),location:str(r[10]),verified:iso(r[12])}));
    const aliases=new Map(), ids=new Set();
    for(const unit of fleet){
      if(!unit.id||ids.has(unit.id)||!sizes.includes(unit.size)||!['مملوكة','إيجار'].includes(unit.owner))throw new Error('هوية مضخة أو مقاس غير صالح');
      ids.add(unit.id);
      for(const alias of [unit.id,unit.asset,unit.serial,unit.legacy].map(normal).filter(Boolean)){
        if(aliases.has(alias)&&aliases.get(alias)!==unit)aliases.set(alias,null);
        else aliases.set(alias,unit);
      }
    }
    const plans=new Map();
    for(const r of planRows){
      const sector=str(r[0]),size=str(r[1]),key=sector+'|'+size;
      if(!sectorCodes.includes(sector)||!sizes.includes(size)||plans.has(key))throw new Error('صف قطاع أو مقاس غير صالح');
      plans.set(key,{sector,size,need:quantity(r[2]),basis:str(r[3]),needDate:iso(r[4]),issued:quantity(r[5]),issuedDate:iso(r[6]),reported:quantity(r[7]),delivery:quantity(r[8]),suction:quantity(r[9]),missingLength:quantity(r[10]),missingSize:quantity(r[11])});
    }
    if(plans.size!==sectorCodes.length*sizes.length)throw new Error('جدول القطاعات غير مكتمل');
    const receipts=new Map(),checked=new Map(),hoseBalances=new Map(),seen=new Set(),lastMoves=new Map();
    let invalid=0;
    function touched(sector,size,date){
      if(sector)checked.set(sector+'|'+size,date);
    }
    // Only movements marked actual participate. A missing date, recipient, or
    // identifier is never treated as confirmation, even on a delivery row.
    const events=[];
    for(const r of movements){
      if(!['فعلية','verified'].includes(str(r[13])))continue;
      let date;try{date=iso(r[1]);}catch{date=null;}
      const moveId=str(r[0]),from=str(r[8]).toUpperCase(),to=str(r[9]).toUpperCase(),kind=str(r[5]);
      if(!['مضخة','خرطوم طرد','خرطوم سحب'].includes(str(r[2])))continue;
      const validRoute=kind==='تسليم'?Boolean(to)&&!from:kind==='نقل'?Boolean(from&&to):kind==='إرجاع'||kind==='إعادة'?Boolean(from)&&!to:false;
      if(!moveId||!date||!str(r[11])||!validRoute||from===to||(from&&!sectorCodes.includes(from))||(to&&!sectorCodes.includes(to))||seen.has(moveId)){invalid++;continue;}
      seen.add(moveId);events.push({date,from,to,r});
    }
    events.sort((a,b)=>a.date.localeCompare(b.date));
    for(const {date,from,to,r} of events){
      const type=str(r[2]);const qty=Number(r[4]);
      if(type==='مضخة'){
        const unit=aliases.get(normal(r[3]));
        if(!unit||qty!==1){invalid++;continue;}
        const previous=lastMoves.get(unit.id);
        if(previous&&previous.sector!==from){invalid++;continue;}
        lastMoves.set(unit.id,{sector:to,date});
        touched(from,unit.size,date);touched(to,unit.size,date);
        if(to)receipts.set(unit.id,{sector:to,date});else receipts.delete(unit.id);
      }else{
        const size=str(r[3]).replace(/^(\d+)$/,'$1 بوصة');
        if(!sizes.slice(0,-1).includes(size)||!Number.isFinite(qty)||qty<=0||(type==='خرطوم سحب'&&!Number.isInteger(qty))){invalid++;continue;}
        const key=s=>[s,size,type].join('|');
        if(from&&(hoseBalances.get(key(from))?.qty??0)<qty){invalid++;continue;}
        for(const [sector,delta] of [[from,-qty],[to,qty]]){
          if(sector)hoseBalances.set(key(sector),{qty:(hoseBalances.get(key(sector))?.qty??0)+delta,date});
        }
      }
    }
    const confirmed=new Map();
    for(const unit of fleet){
      const receipt=receipts.get(unit.id);
      if(!receipt)continue;
      const key=receipt.sector+'|'+unit.size;
      confirmed.set(key,(confirmed.get(key)||0)+1);
    }
    return {fleet,plans:[...plans.values()].map(p=>{
      const key=p.sector+'|'+p.size;
      return {...p,confirmed:checked.has(key)?confirmed.get(key)||0:null,confirmationDate:checked.get(key)||null,
        deliveryReceived:hoseBalances.get(key+'|خرطوم طرد')?.qty??null,suctionReceived:hoseBalances.get(key+'|خرطوم سحب')?.qty??null};
    }),receipts,invalid};
  }
  const departmentCodes=['Operations','STW','Civil','Town Drainage','Irrigation','Other'];
  function departmentRequirements(rows){
    const byCode=new Map();
    for(const r of rows){
      const code=str(r[0]);
      if(!departmentCodes.includes(code)||byCode.has(code))throw new Error('جهة تشغيل غير معروفة أو مكررة');
      const required=sizes.map((_,i)=>quantity(r[i+1]));
      if(required.some(v=>v!==null&&!Number.isInteger(v)))throw new Error('عدد المضخات يجب أن يكون عدداً صحيحاً');
      byCode.set(code,{code,required,source:str(r[8])});
    }
    if(byCode.size!==departmentCodes.length)throw new Error('قائمة جهات التشغيل غير مكتملة');
    return departmentCodes.map(code=>byCode.get(code));
  }
  async function loadDepartments(id){
    return departmentRequirements(await readSheet(id,'احتياجات إدارة التشغيل',['جهة التخصيص',...sizes,'المرجع'],100));
  }
  async function load(id){
    const rows=await Promise.all([readSheet(id,'سجل مضخات الورشة',fleetHeader,1200),readSheet(id,'تغطية قطاعات الأمطار',planHeader,150),readSheet(id,'الحركات',movementHeader,5000)]);
    return build(...rows);
  }
  root.WorkshopSectorLedger={load,build,loadDepartments,departmentRequirements,sectorCodes,sizes};
})(typeof window==='undefined'?globalThis:window);
