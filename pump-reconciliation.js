/* Compare owned pump identities. Archive demo states are deliberately ignored;
   an absent identifier is a register discrepancy, not a physical loss. */
(function(root){
  'use strict';
  const text=v=>String(v??'').trim();
  const assetKey=v=>text(v).toUpperCase().replace(/^ATC/,'ACT').replace(/\d+/g,n=>n.replace(/^0+(?=\d)/,'')).replace(/[\s/#-]/g,'');
  const serialKey=v=>text(v).toUpperCase().replace(/[\s-]/g,'');
  function keys(asset){
    return [assetKey(asset),assetKey(text(asset).replace(/\s*\([^()]+\)\s*$/,''))].filter(Boolean);
  }
  const headers=['معرف السجل','رقم المعدة','نوع المعدة','المقاس (بوصة)','الشركة','الطراز','الرقم التسلسلي','نوع رقم المعدة','الحالة في مرجع 2025'];
  async function loadArchive(id){
    const source=await root.WorkshopSheets.query(id,'المعدات','A1:AF',15000,'select A,B,C,D,E,F,G,W,AF');
    return root.WorkshopReadinessModel.sheetRows(source,headers,headers.length,'المعدات');
  }
  function compare(rows,fleet){
    const archive=rows.filter(r=>['مضخة','وحدة السد','وحدة سد','pump','dam'].includes(text(r[2]))).map(r=>({
      id:text(r[0]),asset:text(r[1]),size:['وحدة السد','وحدة سد','dam'].includes(text(r[2]))?'السد':text(r[3])+' بوصة',
      make:text(r[4]),serial:text(r[6]),state:text(r[8]),temporary:/مؤقت|temporary/i.test(text(r[7]))||/^DEMO-/i.test(text(r[1]))
    }));
    const owned=fleet.filter(u=>u.owner==='مملوكة');
    const temporary=archive.filter(u=>u.temporary);
    const records=archive.filter(u=>!u.temporary);
    const edges=new Map(),byCurrent=new Map();
    for(const old of records){
      const aliases=keys(old.asset),serial=serialKey(old.serial);
      const candidates=owned.filter(u=>u.legacy===old.id||(serial&&serial===serialKey(u.serial))||
        (u.size===old.size&&keys(u.asset).some(k=>aliases.includes(k))));
      edges.set(old,candidates);
      for(const u of candidates)byCurrent.set(u,(byCurrent.get(u)||0)+1);
    }
    const absent=[],review=[],matched=[];
    for(const old of records){
      const candidates=edges.get(old);
      if(!candidates.length){absent.push(old);continue;}
      const u=candidates[0];
      if(candidates.length===1&&byCurrent.get(u)===1&&u.size===old.size&&
         (!u.legacy||u.legacy===old.id)&&(!old.serial||!u.serial||serialKey(u.serial)===serialKey(old.serial))){
        matched.push(old);
      }else review.push({...old,candidates:candidates.map(c=>c.id).join(' / ')});
    }
    return {absent,temporary,review,matched,currentOnly:owned.filter(u=>!byCurrent.has(u))};
  }
  root.WorkshopPumpReconciliation={compare,loadArchive};
})(typeof window==='undefined'?globalThis:window);
