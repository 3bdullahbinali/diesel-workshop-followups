'use strict';
(function(root){
  const stages=[['all','جميع الطلبات'],['preparation','قيد الإعداد'],['approvals','بانتظار الموافقات'],['number_pending','بانتظار رقم طلب الشراء'],['warehouse_approval','بانتظار موافقات المستودع'],['quotes','بانتظار العروض'],['offers_evaluation','تحت التقييم'],['delivery','بانتظار التوريد'],['on_hold','مؤجل'],['cancelled','ملغى']];
  const primaryStages=stages.filter(([id])=>!['on_hold','cancelled'].includes(id));
  const secondaryStages=stages.filter(([id])=>['on_hold','cancelled'].includes(id));
  // Combine the display category while retaining the actual evidence-backed stage.
  const stageLabels={...Object.fromEntries(stages),offers_received:'وصلت العروض',evaluation:'تحت التقييم'};
  const displayStage=stage=>['offers_received','evaluation'].includes(stage)?'offers_evaluation':stage;
  // Unnumbered, linked, deferred and cancelled purchase records remain purchase-related.
  const isPurchaseRelated=item=>Boolean(item.procurement);
  // Awaiting closure and cancelled purchase requests are not confirmed completion.
  const isClosed=item=>item.stage==='completed';
  function getRows(data){
    const linked=data.items.filter(x=>x.procurement?.kind==='linked');
    return data.items.filter(x=>x.procurement && x.procurement.kind!=='linked').map(item=>({item,meta:item.procurement,linked:linked.filter(x=>x.procurement.parentItemId===item.id)})).sort((a,b)=>{
      const order=stages.findIndex(s=>s[0]===displayStage(a.meta.stage))-stages.findIndex(s=>s[0]===displayStage(b.meta.stage));
      return order || ({high:0,medium:1,low:2}[a.item.priority]-{high:0,medium:1,low:2}[b.item.priority]) || b.item.informationDate.localeCompare(a.item.informationDate) || a.item.id.localeCompare(b.item.id);
    });
  }
  function metrics(rows){return {numbered:rows.filter(x=>['pr','dpr'].includes(x.meta.kind)).length,unnumbered:rows.filter(x=>x.meta.kind==='unregistered').length,quotes:rows.filter(x=>x.meta.stage==='quotes').length,received:rows.filter(x=>displayStage(x.meta.stage)==='offers_evaluation').length};}
  root.WorkshopProcurement={stages,primaryStages,secondaryStages,stageLabels,displayStage,isPurchaseRelated,isClosed,getRows,metrics};
})(globalThis);
