'use strict';
(function(root){
  const orderHeaders=['رقم LPO','معرّف البند','المورد','تاريخ الإصدار','قيمة الأمر بالدرهم','موعد التوريد','حالة الأمر','بنود الأمر مكتملة','تاريخ آخر استلام','آخر تعديل بتوقيت الإمارات','ملاحظات'];
  const lineHeaders=['رقم LPO','رقم البند','كود الصنف','الوصف','الوحدة','الكمية المطلوبة','الكمية المستلمة','الكمية المتبقية','تاريخ آخر استلام','ملاحظات'];
  const states={delivery:'بانتظار التوريد',partial_delivery:'استلام جزئي',received:'مستلم بالكامل',closed_unreceived:'مغلق — المتبقي غير مستلم',cancelled:'ملغى',unknown:'بحاجة لتأكيد الاستلام'};
  const text=value=>String(value??'').trim();
  const present=value=>value!=null&&value!=='';
  function number(value,label){
    if(!present(value))return null;
    const n=Number(text(value).replaceAll(',',''));
    if(!Number.isFinite(n)||n<0)throw new Error('كمية أو قيمة غير صالحة: '+label);
    return n;
  }
  function state(value){
    const raw=text(value)||'unknown';
    const found=Object.entries(states).find(([id,label])=>raw===id||raw===label);
    if(!found)throw new Error('حالة أمر شراء غير معروفة: '+raw);
    return found[0];
  }
  function summarize(order){
    const lines=order.lines||[];
    const hasReceipts=lines.some(line=>line.received>0);
    const allReceived=order.linesComplete&&lines.length>0&&lines.every(line=>line.received!==null&&line.received>=line.ordered);
    if(['closed_unreceived','cancelled'].includes(order.state))return order.state;
    if(order.state==='received'){
      if(lines.some(line=>line.received!==null&&line.received<line.ordered))throw new Error('حالة استلام الأمر تتعارض مع الكميات: '+order.lpoNumber);
      return 'received'; // Explicit confirmation is valid even when historical quantities are unavailable.
    }
    if(allReceived)return 'received';
    if(hasReceipts)return 'partial_delivery';
    return order.state;
  }
  function attach(data,orderRows,lineRows){
    const byItem=new Map(data.items.map(item=>[item.id,item]));
    const orders=new Map();
    for(const row of orderRows){
      // Native checkbox columns emit false even in otherwise empty template rows.
      if(!row.some((value,index)=>index!==7&&present(value)))continue;
      const lpoNumber=text(row[0]),itemId=text(row[1]);
      if(!lpoNumber||orders.has(lpoNumber))throw new Error('رقم LPO مفقود أو مكرر: '+lpoNumber);
      if(!byItem.get(itemId)?.procurement)throw new Error('أمر الشراء مرتبط بطلب غير موجود: '+itemId);
      const flag=row[7];
      if(present(flag)&&![true,false,'TRUE','FALSE'].includes(flag))throw new Error('قيمة بنود الأمر مكتملة غير صالحة: '+lpoNumber);
      orders.set(lpoNumber,{lpoNumber,itemId,supplier:text(row[2]),issuedDate:root.WorkshopSheets.dateValue(row[3]),amountAed:number(row[4],lpoNumber),dueDate:root.WorkshopSheets.dateValue(row[5]),state:state(row[6]),linesComplete:flag===true||flag==='TRUE',lastReceiptDate:root.WorkshopSheets.dateValue(row[8]),updatedAt:root.WorkshopSheets.dateValue(row[9],true),notes:text(row[10]),lines:[]});
    }
    const seen=new Set();
    for(const row of lineRows){
      if(!row.some(present))continue;
      const lpo=text(row[0]),lineNumber=text(row[1]),order=orders.get(lpo),key=lpo+'|'+lineNumber;
      if(!order||!lineNumber||seen.has(key))throw new Error('بند توريد مكرر أو غير مرتبط بأمر شراء: '+key);
      seen.add(key);
      const ordered=number(row[5],key),received=number(row[6],key);
      if(ordered===null||ordered<=0)throw new Error('الكمية المطلوبة مفقودة أو غير موجبة: '+key);
      if(received!==null&&received>ordered)throw new Error('الكمية المستلمة تتجاوز المطلوبة: '+key);
      if(!text(row[3])||!text(row[4]))throw new Error('وصف الصنف أو وحدته مفقود: '+key);
      order.lines.push({lineNumber,itemCode:text(row[2]),description:text(row[3]),unit:text(row[4]),ordered,received,remaining:received===null?null:ordered-received,lastReceiptDate:root.WorkshopSheets.dateValue(row[8]),notes:text(row[9])});
    }
    // Work on a copy so a rejected import cannot damage the current display.
    const result=JSON.parse(JSON.stringify(data));
    for(const item of result.items){
      if(!item.procurement)continue;
      const list=[...orders.values()].filter(order=>order.itemId===item.id);
      const legacy=item.procurement.lpoNumber;
      if(legacy&&!list.some(order=>order.lpoNumber===legacy)){
        if(orders.has(legacy))throw new Error('رقم LPO مرتبط بطلبين مختلفين: '+legacy);
        list.push({lpoNumber:legacy,itemId:item.id,state:'unknown',linesComplete:false,lines:[],legacy:true});
      }
      item.procurement.orders=list.map(order=>({...order,receiptState:summarize(order)}));
      // Never infer PR closure from one LPO, or from an incomplete catalogue of lines.
      if(item.procurement.stage==='delivery'&&list.some(order=>['partial_delivery','received'].includes(summarize(order)))){
        item.procurement.stage='partial_delivery';
        if(item.stage==='delivery')item.stage='partial_delivery';
      }
    }
    result.updatedAt=[result.updatedAt,...[...orders.values()].map(order=>order.updatedAt)].filter(Boolean).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1);
    return result;
  }
  root.WorkshopOrders={orderHeaders,lineHeaders,states,summarize,attach};
})(globalThis);
