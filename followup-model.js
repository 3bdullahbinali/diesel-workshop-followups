'use strict';
(() => {
  // Display classification only; the operational source is Google Sheets.
  const S=window.WorkshopSheets;
  const sourceLabels={all:'كل المصادر',tarasel:'تراسل',email:'بريد إلكتروني',internal:'تكليف داخلي',unknown:'غير محدد'};
  const isClosed=(item,data)=>{
    if(window.WorkshopProcurement.isClosed(item))return true;
    // A completed technical job is explicit completion evidence; a letter is not.
    const jobs=!item.procurement?(data?.jobs||[]).filter(job=>job.taskId===item.id):[];
    return jobs.length>0&&jobs.every(job=>job.state==='done');
  };
  function jobFor(item,data){return (data?.jobs||[]).find(j=>j.taskId===item.id);}
  const homeLabels={technical:'الأعمال الفنية',coordination:'التنسيق والجاهزية',vehicles:'المركبات',personnel:'شؤون الموظفين',admin:'الشؤون الإدارية',development:'خطط التطوير',procurement:'طلبات الشراء'};
  const generalCategories=['technical','coordination','vehicles','personnel','admin'];
  const closedKinds={all:'الكل',general:'المتابعات العامة',procurement:'طلبات الشراء',letters:'مراسلات تراسل',development:'خطط التطوير'};
  const coordinationLabels={all:'الكل',rain:'استعدادات الأمطار',sector_needs:'احتياجات القطاعات',handover:'تسليم واسترجاع المعدات',support:'الدعم والتنسيق الميداني'};
  // Display classification only: source records and their evidence remain untouched.
  const assignments={
    'base-28':'coordination','base-33':'admin','base-34':'personnel',
    'new-driving-test-31043':'personnel','new-driver-nomination-muhammed-haris':'personnel',
    'new-machine-operator-vacancy-16293':'personnel'
  };
  function home(item,data){
    if(item.procurement)return 'procurement';
    if(['technical','personnel','admin','development'].includes(item.group))return item.group;
    if(assignments[item.id])return assignments[item.id];
    const title=String(item.title||'');
    if(/تطوير نظام المتابعة|تنظيم الأرشفة|تحسين إجراءات العمل|خطط التطوير|development plan|archive organi[sz]ation/i.test(title))return 'development';
    if(/تدريب|ترقي[ةات]|تعيين|تقييم.{0,15}موظف|تقييم الأداء|اختبار قيادة|تصريح قيادة|ترشيح.{0,25}شاغر|شؤون الموظفين|staff appraisal|staff training/i.test(title))return 'personnel';
    if(item.area==='vehicles'||item.group==='vehicles')return 'vehicles';
    if(jobFor(item,data)||item.area==='maintenance')return 'technical';
    if(item.area==='admin')return 'admin';
    return 'coordination';
  }
  function isGeneral(item,data){return generalCategories.includes(home(item,data));}
  function matchesGroup(item,group,data){return group==='all'||home(item,data)===group;}
  function coordinationTopic(item,data){
    if(home(item,data)!=='coordination')return null;
    const normalize=value=>String(value||'').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/[\u064B-\u065F]/g,'');
    const title=normalize(item.title);
    // Classify the current action before the subject or older status/history.
    const action=normalize(String(item.action||'').split(/[؛.!?\n]/)[0]);
    function classify(text){
      if(/ديزل|وقود|تناكر|واتساب|تواصل|اتصال|مناوب|الشرطه|الدفاع المدني|diesel|fuel|tanker|whatsapp|contact|duty|police|civil defen[cs]e/.test(text))return 'support';
      if(/(?:تسليم|توزيع|استرجاع|ارجاع|اعاده|نقل|استلام).{0,45}(?:معدات|مضخ|خراطيم|بطار|مولد)|ارجاعها|استرجاعها|handover|(?:deliver|distribut|transfer|return|receiv).{0,45}(?:equipment|pump|hose|batter|generator)/.test(text))return 'handover';
      if(/قطاع|sector/.test(text+' '+title)&&/احتياج|احتياجات|متطلبات|كميات|مطبات|خراطيم|خرائط|مراجعه|فروقات|جدول|requirement|quantit|ramp|hose|map|discrepanc|review/.test(text))return 'sector_needs';
      if(/جاهزي|استعداد|امطار|rain|readiness|preparedness/.test(text))return 'rain';
      return null;
    }
    return classify(action)||classify(title)||'support';
  }
  function technicalEntries(data){
    const entries=(data?.items||[]).filter(item=>home(item,data)==='technical').map(item=>{
      const job=jobFor(item,data);
      if(job)return {...job,state:isClosed(item,data)?'done':job.state};
      const state=isClosed(item,data)?'done':({preparation:'not_started',action:'not_started',in_progress:'in_progress',coordination:'follow_up',quotes:'quotes',on_hold:'on_hold',cancelled:'cancelled'}[item.stage]||'follow_up');
      return {id:'task:'+item.id,taskId:item.id,title:item.title,state,owner:item.owner,party:'unspecified',counterpart:item.followUpWith||'',startDate:null,dueDate:item.dueDate,notes:item.status,recordView:true};
    });
    for(const job of data?.jobs||[])if(!(data.items||[]).some(item=>item.id===job.taskId))entries.push(job);
    return entries;
  }
  function archiveEntries(data){
    const entries=(data.items||[]).filter(item=>isClosed(item,data)).map(item=>{
      const category=home(item,data),kind=generalCategories.includes(category)?'general':category;
      return {key:'item:'+item.id,type:'item',kind,category,record:item};
    });
    for(const letter of data.letters||[])if(letter.closure==='closed')entries.push({key:'letter:'+letter.id,type:'letter',kind:'letters',record:letter});
    for(const job of data.jobs||[])if(job.state==='done'&&!(data.items||[]).some(item=>item.id===job.taskId))entries.push({key:'job:'+job.id,type:'job',kind:'general',category:'technical',record:job});
    return entries;
  }
  function sources(item,data){
    if(!item)return ['unknown'];
    const found=new Set();
    if((data?.letters||[]).some(l=>l.taskId===item.id))found.add('tarasel');
    const text=[item.reference,item.notes,...(item.sources||[]).flatMap(s=>[s.title,s.locator])].join(' ');
    if(/تراسل|Tarasel|كتاب وارد|كتاب صادر/i.test(text))found.add('tarasel');
    if(/e-?mail|بريد إلكتروني|البريد الإلكتروني|\bRE:|\bFW:/i.test(text))found.add('email');
    if(/تكليف داخلي/i.test(text))found.add('internal');
    return found.size?[...found]:['unknown'];
  }
  function execution(item,data){
    if(!item)return null;
    const job=jobFor(item,data);
    return {label:isClosed(item,data)?S.stages.completed:job?S.jobStates[job.state]:S.stages[item.stage],action:item.action,owner:job?.owner||item.owner,home:homeLabels[home(item,data)]};
  }
  function isOverdue(item,data,today){
    if(isClosed(item,data)||item.stage==='cancelled')return false;
    const due=item.dueDate||jobFor(item,data)?.dueDate;
    return typeof due==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(due)&&!Number.isNaN(Date.parse(due))&&due<today;
  }
  window.WorkshopFollowups={isOverdue,home,homeLabels,generalCategories,closedKinds,archiveEntries,coordinationLabels,coordinationTopic,isGeneral,technicalEntries,matchesGroup,sources,sourceLabels,jobFor,isClosed,execution};
})();
