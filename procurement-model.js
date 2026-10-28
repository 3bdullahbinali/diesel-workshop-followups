'use strict';
(function(root){
  // Transaction route is independent of whether a PR/LPO number has been issued.
  const transactionTypes=[['all','جميع المعاملات'],['pr','طلبات الشراء'],['direct','الشراء المباشر'],['contract','العقود'],['petty_cash','النثريات']];
  const transactionLabels=Object.fromEntries(transactionTypes.filter(([id])=>id!=='all'));
  const pettyCashStages=[['all','جميع المراحل'],['preparation','الإعداد'],['approvals','الموافقة'],['execution_payment','التنفيذ والصرف'],['settlement','التسوية'],['closure','الإغلاق']];
  const cashStageLabels=Object.fromEntries(pettyCashStages);
  const cashStageCompatibility={preparation:['preparation'],approvals:['approvals','pr_team_approval','warehouse_approval'],execution_payment:['in_progress','delivery','partial_delivery'],settlement:['in_progress'],closure:['closure','completed','received','closed_unreceived']};
  const transactionType=meta=>Object.hasOwn(transactionLabels,meta?.transactionType)?meta.transactionType:meta?.kind==='dpr'?'direct':'pr';
  function cashStage(meta){
    // A later edit to the general stage takes precedence over an incompatible
    // optional phase. Settlement is explicit; status prose never implies it.
    if(cashStageCompatibility[meta?.transactionStage]?.includes(meta.stage))return meta.transactionStage;
    return Object.keys(cashStageCompatibility).find(id=>id!=='settlement'&&cashStageCompatibility[id].includes(meta?.stage))||'other';
  }
  const stages=[['all','جميع المراحل'],['preparation','قيد الإعداد'],['approvals','بانتظار الموافقات'],['number_pending','بانتظار رقم طلب الشراء'],['pr_team_approval','بانتظار موافقة فريق طلبات الشراء'],['warehouse_approval','بانتظار موافقات المستودع'],['quotes','بانتظار العروض'],['revised_quotes','بانتظار عروض الأسعار المعدّلة'],['offers_evaluation','تحت التقييم'],['lpo_pending','بانتظار LPO'],['delivery','بانتظار التوريد'],['partial_delivery','استلام جزئي'],['closure','بانتظار الإغلاق'],['received','مستلم بالكامل ومغلق'],['completed','مكتمل'],['closed_unreceived','مغلق — المتبقي غير مستلم'],['action','يحتاج إجراء'],['coordination','بانتظار المتابعة'],['in_progress','قيد التنفيذ'],['on_hold','مؤجل'],['cancelled','ملغى']];
  const secondaryIds=['pr_team_approval','completed','closed_unreceived','action','coordination','in_progress','on_hold','cancelled'];
  const primaryStages=stages.filter(([id])=>!secondaryIds.includes(id));
  const secondaryStages=stages.filter(([id])=>secondaryIds.includes(id));
  // Combine the display category while retaining the actual evidence-backed stage.
  const stageLabels={...Object.fromEntries(stages),offers_received:'وصلت العروض',evaluation:'تحت التقييم'};
  const displayStage=stage=>['offers_received','evaluation'].includes(stage)?'offers_evaluation':stage;
  const stageLabel=meta=>transactionType(meta)==='petty_cash'?(cashStageLabels[cashStage(meta)]||stageLabels[meta?.stage]||'حالات أخرى'):(stageLabels[meta?.stage]||'حالات أخرى');
  // Unnumbered, linked, deferred and cancelled purchase records remain purchase-related.
  const isPurchaseRelated=item=>Boolean(item.procurement);
  // Awaiting closure and cancelled purchase requests are not confirmed completion.
  const isClosed=item=>['completed','received','closed_unreceived'].includes(item.stage);
  function getRows(data){
    const linked=data.items.filter(x=>x.procurement?.kind==='linked');
    return data.items.filter(x=>x.procurement && x.procurement.kind!=='linked').map(item=>({item,meta:item.procurement,linked:linked.filter(x=>x.procurement.parentItemId===item.id)})).sort((a,b)=>{
      const order=stages.findIndex(s=>s[0]===displayStage(a.meta.stage))-stages.findIndex(s=>s[0]===displayStage(b.meta.stage));
      return order || ({high:0,medium:1,low:2}[a.item.priority]-{high:0,medium:1,low:2}[b.item.priority]) || b.item.informationDate.localeCompare(a.item.informationDate) || a.item.id.localeCompare(b.item.id);
    });
  }
  function metrics(rows){return {numbered:rows.filter(x=>['pr','dpr'].includes(x.meta.kind)).length,unnumbered:rows.filter(x=>x.meta.kind==='unregistered').length,quotes:rows.filter(x=>x.meta.stage==='quotes').length,received:rows.filter(x=>displayStage(x.meta.stage)==='offers_evaluation').length};}
  root.WorkshopProcurement={stages,primaryStages,secondaryStages,stageLabels,displayStage,isPurchaseRelated,isClosed,getRows,metrics,transactionTypes,transactionLabels,transactionType,pettyCashStages,cashStage,stageLabel};
})(globalThis);

