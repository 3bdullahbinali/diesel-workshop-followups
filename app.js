'use strict';
(() => {
  const I = window.WorkshopI18n;
  const $ = id => document.getElementById(id);
  const labels = {...window.WorkshopSheets.stages};
  const priorities = {high:'عالية',medium:'متوسطة',low:'منخفضة'};
  const rank = {high:0,medium:1,low:2};
  const areas = window.WorkshopSheets.areas, actionLabels = window.WorkshopSheets.actions;
  const focusLabels = {all:'الكل', me:'مطلوب مني', team:'عند الفريق', external:'بانتظار جهة', due:'حان موعدها', blocked:'متعطل', gear:'معدات في الورشة', unassigned:'لم يحدد الإجراء'};
  const inWorkshop = item => Boolean(item.equipment) && ['in_workshop','ready'].includes(item.equipment.handover);
  const isClosed = item => window.WorkshopProcurement.isClosed(item) || item.stage==='cancelled';
  const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai'}).format(new Date());
  function matchesFocus(item,focus){
    if(focus==='all')return true;
    // المعدة في الورشة تهم حتى لو أُغلق بندها.
    if(focus==='gear')return inWorkshop(item);
    if(isClosed(item))return false;
    if(focus==='due')return Boolean(item.dueDate) && item.dueDate<=today();
    if(focus==='blocked')return Boolean(item.blocker);
    return (item.actionAt || 'unassigned')===focus;
  }
  let data = null, selectedGroup = 'all', query = '', selectedFocus = 'all', selectedArea = '', lastFetch = null, fetching = false, poller = null, connected = false;
  let snapshot = null, sheetConfig = null;
  let overviewView = location.hash === '#non-purchase' ? 'non-purchase' : location.hash === '#closed' ? 'closed' : 'overview';
  const expanded = new Set();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normal = text => String(text ?? '').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[\u064B-\u065F]/g,'').replace(/\s+/g,' ').trim();
  const shortDate = date => date ? String(date).slice(0,10).split('-').reverse().join(' / ') : 'غير محدد';
  const time = date => new Intl.DateTimeFormat(I.locale,{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dubai'}).format(date);
  const fullTime = date => new Intl.DateTimeFormat(I.locale,{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dubai'}).format(new Date(date));
  const compare = (a,b) => (rank[a.priority]??3)-(rank[b.priority]??3) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || b.informationDate.localeCompare(a.informationDate) || Number(a.baseIds?.[0]??999)-Number(b.baseIds?.[0]??999) || a.id.localeCompare(b.id);
  function viewItems(){
    if(overviewView==='closed')return data.items.filter(window.WorkshopProcurement.isClosed);
    return overviewView==='non-purchase' ? data.items.filter(item=>!window.WorkshopProcurement.isPurchaseRelated(item)) : data.items;
  }
  function groupLabel(group){
    if(group?.id==='all' && overviewView==='closed')return 'المتابعات المغلقة';
    return group?.id==='all' && overviewView==='non-purchase' ? 'متابعات عامة' : group?.label || 'جميع المتابعات';
  }
  function orderedItems(){return [...viewItems()].sort(compare);}
  function validPayload(value){
    return value && value.schemaVersion === 1 && Array.isArray(value.items) && value.items.length > 0 && Array.isArray(value.groups) && value.items.every(x => typeof x.id==='string' && typeof x.title==='string' && typeof x.status==='string' && typeof x.action==='string' && /^\d{4}-\d{2}-\d{2}$/.test(x.informationDate) && ['high','medium','low'].includes(x.priority) && labels[x.stage] && Array.isArray(x.sources)) && new Set(value.items.map(x=>x.id)).size===value.items.length;
  }
  function details(item){
    const source = item.sources.map(s => `<li><span class="source-title">${escape(s.title)}</span><span class="source-locator">${escape(s.locator)} · <bdi>${escape(shortDate(s.date))}</bdi></span></li>`).join('');
    const gear = item.equipment ? (()=>{
      const g=item.equipment, S=window.WorkshopSheets;
      const line=(label,value)=>value?`<p class="detail-meta">${label}: ${escape(value)}</p>`:'';
      return `<div class="detail-full detail-equipment"><h4>المعدة المستلمة للصيانة</h4>
        <p><strong>${escape(S.phases[g.phase])}</strong> · ${escape(S.handovers[g.handover])}</p>
        ${line('الجهة صاحبة المعدة',g.owner)}${line('رقم المعدة',g.asset)}
        ${line('تاريخ الاستلام',shortDate(g.receivedDate))}${line('المستلم في الورشة',g.receiver)}
        ${g.returnedDate?line('تاريخ الإعادة',shortDate(g.returnedDate)):''}${line('المستلم من الجهة',g.returnedTo)}
        ${g.notes?`<p>${escape(g.notes)}</p>`:''}</div>`;
    })() : '';
    const blocked = item.blocker ? `<div class="detail-full detail-blocker"><h4>العائق</h4><p>${escape(item.blocker)}</p></div>` : '';
    const old = item.history?.length ? `<div class="detail-full"><h4>الحالة السابقة</h4>${item.history.map(h=>`<p><bdi>${escape(shortDate(h.date))}</bdi> — ${escape(h.status)}</p>`).join('')}</div>` : '';
    const base = item.baseIds?.length ? `بند السجل الأساسي: ${item.baseIds.join(' + ')}` : 'متابعة أحدث أُضيفت إلى السجل';
    return `<tr class="detail-row" id="detail-${escape(item.id)}" ${expanded.has(item.id)?'':'hidden'}><td colspan="6"><div class="detail-grid"><div><h4>آخر حالة مسجلة</h4><p>${escape(item.status)}</p><p class="detail-meta">${escape(base)}${item.dueDate ? ' · الموعد المرتبط: '+escape(shortDate(item.dueDate)):''}</p></div><div><h4>جهة المتابعة</h4><p>${escape(item.followUpWith)}</p><p class="detail-meta">المسؤول: ${escape(item.owner)}</p><p class="detail-meta">الإجراء عند: ${escape(actionLabels[item.actionAt]||'لم يحدد')}${item.area?' · المجال: '+escape(areas[item.area]):''}</p></div>${gear}${blocked}${item.notes?`<div class="detail-full"><h4>الملاحظات والتفاصيل</h4><p>${escape(item.notes)}</p></div>`:''}<div class="detail-full"><h4>المراجع — للرجوع والبحث</h4><ul class="sources">${source}</ul></div>${old}</div></td></tr>`;
  }
  function renderRows(){
    if(!data)return;
    const items = orderedItems();
    const indexed = items.map((item,i)=>({item,index:i+1}));
    const base = indexed.filter(({item}) => (selectedGroup === 'all' || item.group === selectedGroup) && (!selectedArea || item.area === selectedArea) && (!query || normal(I.search([item.title,item.reference,item.owner,item.status,item.action,item.notes,item.blocker])).includes(normal(query))));
    const visible = base.filter(({item}) => matchesFocus(item,selectedFocus));
    renderFocus(base.map(({item})=>item));
    window.WorkshopPresentation?.setItems(overviewView, visible.map(({item})=>item), groupLabel(data.groups.find(g=>g.id===selectedGroup)));
    $('rows').innerHTML = visible.map(({item,index})=>{
      const isOld = item.evidence === 'baseline';
      return `<tr class="record-row ${expanded.has(item.id)?'is-open':''}" id="row-${escape(item.id)}"><td class="number-cell"><span class="row-number">${index}</span></td><td class="topic-cell"><h4 class="item-title">${escape(item.title)}</h4><span class="reference" dir="auto">${escape(item.reference)}</span>${item.blocker?`<span class="blocker">${escape(item.blocker)}</span>`:''}</td><td class="status-cell"><div class="badges"><span class="priority priority-${escape(item.priority)}">${priorities[item.priority]}</span>${inWorkshop(item)?`<span class="gear-badge">${escape(window.WorkshopSheets.handovers[item.equipment.handover])}</span>`:''}</div><span class="stage stage-${escape(item.stage)}">${labels[item.stage]}</span></td><td class="action-cell"><p class="next-action">${escape(item.action)}</p><span class="owner">${escape(item.owner)}</span><span class="action-at" data-at="${escape(item.actionAt||'unassigned')}">${escape(actionLabels[item.actionAt]||actionLabels.unassigned)}</span></td><td class="date-cell"><time class="information-date" datetime="${escape(item.informationDate)}">${escape(shortDate(item.informationDate))}</time><span class="date-note ${isOld?'':'current'}">${isOld?'حالة من السجل الأساسي':'تحديث مسجل'}</span><span class="purchase-sub record-edit-time"><span>آخر تعديل للبند</span>: <time translate="no" datetime="${escape(item.updatedAt || '')}">${escape(window.WorkshopRecordTime(item.updatedAt))}</time> <span>بتوقيت الإمارات</span></span></td><td class="expand-cell">${window.WorkshopAdmin?.canEdit()?`<button type="button" class="edit-button" data-edit="${escape(item.id)}" aria-label="تعديل ${escape(item.title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z"/></svg></button>`:''}<button type="button" class="expand-button" data-item="${escape(item.id)}" aria-label="تفاصيل ${escape(item.title)}" aria-expanded="${expanded.has(item.id)}" aria-controls="detail-${escape(item.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></td></tr>${details(item)}`;
    }).join('');
    $('shown-count').textContent = query || selectedGroup !== 'all' || selectedArea || selectedFocus !== 'all' ? `${visible.length} / ${items.length}` : items.length;
    $('records-title').firstChild.textContent = groupLabel(data.groups.find(g=>g.id===selectedGroup))+' ';
    const noClosed=overviewView==='closed' && items.length===0;
    $('empty-title').textContent = noClosed ? 'لا توجد متابعات مغلقة بعد' : 'لا توجد متابعات مطابقة';
    $('empty-description').textContent = noClosed ? 'تظهر هنا المتابعات بعد تأكيد إنجازها وتحديث حالتها في السجل إلى «مكتمل».' : 'جرّب رقماً أو كلمة أخرى، أو أعد ضبط البحث والتصنيف.';
    $('clear-filters').hidden = noClosed;
    $('clear-filters').textContent = overviewView==='closed' ? 'عرض المتابعات المغلقة' : overviewView==='non-purchase' ? 'عرض المتابعات العامة' : 'عرض جميع المتابعات';
    $('empty').hidden = visible.length !== 0;
    document.querySelector('.table-wrap').hidden = visible.length === 0;
  }
  function renderFocus(items){
    $('focus-filters').innerHTML = Object.entries(focusLabels).map(([id,label])=>{
      const count = id==='all' ? items.length : items.filter(item=>matchesFocus(item,id)).length;
      return `<button type="button" data-focus="${id}" class="filter-button ${selectedFocus===id?'active':''}" aria-pressed="${selectedFocus===id}">${escape(label)}<span class="filter-count">${count}</span></button>`;
    }).join('');
  }
  function renderAreas(){
    const items=viewItems();
    const used=Object.entries(areas).filter(([id])=>items.some(item=>item.area===id));
    $('area-filter').innerHTML = `<option value="">كل المجالات</option>`+used.map(([id,label])=>`<option value="${escape(id)}"${selectedArea===id?' selected':''}>${escape(label)} (${items.filter(item=>item.area===id).length})</option>`).join('');
    $('area-filter').hidden = used.length<2;
  }
  function renderGroups(){
    const items=viewItems();
    $('groups').innerHTML = data.groups.filter(group=>overviewView==='overview' || group.id==='all' || items.some(item=>item.group===group.id)).map(group=>{
      const count = group.id==='all' ? items.length : items.filter(x=>x.group===group.id).length;
      return `<button type="button" data-group="${escape(group.id)}" class="filter-button ${selectedGroup===group.id?'active':''}" aria-pressed="${selectedGroup===group.id}">${escape(groupLabel(group))}<span class="filter-count">${count}</span></button>`;
    }).join('');
  }
  function render(){
    const items=viewItems();
    if(overviewView!=='overview' && selectedGroup!=='all' && !items.some(item=>item.group===selectedGroup))selectedGroup='all';
    $('record-updated-time').textContent = window.WorkshopRecordTime(data.updatedAt);
    $('record-updated-time').dateTime = data.updatedAt || '';
    $('total').textContent = items.length;
    $('high').textContent = items.filter(x=>x.priority==='high' && (overviewView==='closed' || !window.WorkshopProcurement.isClosed(x))).length;
    $('quotes').textContent = items.filter(x=>x.stage==='quotes').length;
    const latestMonth = data.latestInformationDate.slice(0,7);
    $('recent').textContent = items.filter(x=>x.informationDate.slice(0,7)===latestMonth).length;
    document.querySelectorAll('.metric-label')[3].textContent = 'معلومات من '+new Intl.DateTimeFormat(I.locale,{month:'long',timeZone:'Asia/Dubai'}).format(new Date(data.latestInformationDate+'T12:00:00Z'));
    const base = items.filter(x=>x.kind==='baseline').length;
    $('composition').textContent = `${base} من السجل + ${items.length-base} أحدث`;
    $('scope').textContent = 'كل بند مع الإجراء والمسؤول وتاريخ آخر معلومة. افتح التفاصيل لمراجعة الحالة والمراجع.';
    const sync=data.sync;
    $('sync-summary').textContent = 'التحديث من Google Sheets';
    $('sync-explanation').textContent = 'تقرأ الشاشة ورقتَي المتابعات والمراجع والسجل كل 30 ثانية أثناء فتحها. عدّل البيانات في Google Sheets؛ زر تحديث العرض يعيد القراءة. حدّث تاريخ المعلومة وآخر تعديل عند توثيق تحديث، وحافظ على معرّف كل بند. قد تتأخر نسخة Google قليلاً بعد التعديل. '+(sync.message || 'المراجعة الدورية للمحادثات غير مفعلة.');
    $('review-time').textContent = 'آخر مراجعة مسجلة للمصادر: '+fullTime(sync.lastReviewAt)+'.';
    renderGroups();renderAreas();renderRows();
  }
  function setConnection(ok){
    connected=ok;
    $('connection-dot').className = 'connection-dot'+(ok?'':' offline');
    $('connection-label').textContent = ok ? 'متصل بـ Google Sheets' : data?.connectionSource==='google-sheets' ? 'تعذر التحديث — آخر قراءة من Google Sheets' : 'نسخة محفوظة — Google Sheets غير متصل';
    window.WorkshopPresentation?.setConnection($('connection-label').textContent, ok);
    $('fetch-time').textContent = lastFetch ? 'آخر قراءة من Google Sheets '+time(lastFetch)+' · تحديث كل 30 ثانية' : '';
    $('sheet-status').textContent = ok ? 'البيانات مقروءة من ملف المتابعات في Google Sheets. تتجدد أثناء فتح الشاشة.' : data?.connectionSource==='google-sheets' ? 'تعذرت القراءة الجديدة من Google Sheets؛ تُعرض آخر قراءة ناجحة لحين عودة الاتصال.' : 'إعداد الربط جاهز؛ لم تنجح القراءة المباشرة من Google Sheets بعد. البيانات الظاهرة نسخة محفوظة، وليست تأكيداً لنجاح الربط.';
  }
  // وصف ما تغيّر فعلاً بين قراءتين، ليظهر كإشعارات بدل رسالة عامة.
  function describe(before,after){
    const S=window.WorkshopSheets, P=window.WorkshopProcurement;
    const old=new Map((before?.items||[]).map(item=>[item.id,item]));
    const fresh=new Map((after?.items||[]).map(item=>[item.id,item]));
    const news=[];
    const fields=[
      ['stage','الحالة',v=>S.stages[v]||v],
      ['priority','الأولوية',v=>({high:'عالية',medium:'متوسطة',low:'منخفضة'}[v]||v)],
      ['actionAt','الإجراء عند',v=>S.actions[v]||'لم يحدد'],
      ['owner','المسؤول',v=>v],
      ['action','الإجراء المطلوب',v=>v],
      ['status','تفاصيل الحالة',v=>v],
      ['blocker','العائق',v=>v||'—'],
      ['informationDate','تاريخ المعلومة',v=>shortDate(v)],
      ['dueDate','الموعد المرتبط',v=>shortDate(v)]
    ];
    for(const [id,item] of fresh){
      const was=old.get(id);
      if(!was){news.push({kind:'add',title:'متابعة جديدة',body:item.title});continue;}
      for(const [key,label,show] of fields){
        if((was[key]||'')===(item[key]||''))continue;
        news.push({kind:'change',title:item.title,body:`${label}: ${show(was[key])} ← ${show(item[key])}`});
      }
      const wasStage=was.procurement?.stage, nowStage=item.procurement?.stage;
      if(wasStage!==nowStage&&nowStage)news.push({kind:'change',title:item.title,body:`مرحلة الشراء: ${P.stageLabels[wasStage]||'—'} ← ${P.stageLabels[nowStage]}`});
      const wasGear=was.equipment, gear=item.equipment;
      if(gear&&(!wasGear||wasGear.phase!==gear.phase||wasGear.handover!==gear.handover)){
        news.push({kind:'change',title:item.title,body:`المعدة: ${S.phases[gear.phase]} · ${S.handovers[gear.handover]}`});
      }
    }
    for(const [id,item] of old)if(!fresh.has(id))news.push({kind:'remove',title:'حُذفت متابعة',body:item.title});
    const oldLetters=new Map((before?.letters||[]).map(letter=>[letter.id,letter]));
    for(const letter of after?.letters||[]){
      const was=oldLetters.get(letter.id);
      if(!was){news.push({kind:'add',title:'كتاب جديد',body:letter.title});continue;}
      if(was.closure!==letter.closure)news.push({kind:'change',title:letter.title,body:`حالة الكتاب: ${S.closureStates[was.closure]} ← ${S.closureStates[letter.closure]}`});
      else if(was.reply!==letter.reply)news.push({kind:'change',title:letter.title,body:`حالة الرد: ${S.replyStates[was.reply]} ← ${S.replyStates[letter.reply]}`});
      else if(was.work!==letter.work)news.push({kind:'change',title:letter.title,body:`حالة العمل: ${S.workStates[was.work]} ← ${S.workStates[letter.work]}`});
      else if(was.location!==letter.location)news.push({kind:'change',title:letter.title,body:`موقع الكتاب: ${letter.location||'غير مسجل'}`});
    }
    const oldJobs=new Map((before?.jobs||[]).map(job=>[job.id,job]));
    for(const job of after?.jobs||[]){
      const was=oldJobs.get(job.id);
      if(!was){news.push({kind:'add',title:'عمل جديد',body:`${S.jobKinds[job.kind]} — ${job.title}`});continue;}
      if(was.state!==job.state)news.push({kind:'change',title:job.title,body:`حالة العمل: ${S.jobStates[was.state]} ← ${S.jobStates[job.state]}`});
      else if(was.dueDate!==job.dueDate)news.push({kind:'change',title:job.title,body:`الموعد المتوقع: ${shortDate(job.dueDate)}`});
      else if(was.owner!==job.owner)news.push({kind:'change',title:job.title,body:`المسؤول: ${job.owner||'غير مسجل'}`});
    }
    return news;
  }
  function notice(message,isError=false){$('notice').textContent=message;$('notice').hidden=!message;$('notice').className='notice'+(isError?' error':'');}
  async function fetchData(manual=false){
    if(fetching)return;
    fetching=true;$('refresh').disabled=true;
    try{
      if(!snapshot || !sheetConfig){
        const responses=await Promise.all(['./data.json','./sheets-config.json'].map(url=>fetch(url+'?t='+Date.now(),{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(12000)})));
        if(responses.some(response=>!response.ok))throw new Error('تعذر تحميل إعداد الربط.');
        const values=await Promise.all(responses.map(response=>response.json()));
        if(!validPayload(values[0]))throw new Error('النسخة المحفوظة غير صالحة.');
        [snapshot,sheetConfig]=values;
        if(!data){data=snapshot;render();window.dispatchEvent(new CustomEvent('workshop-data',{detail:data}));}
      }
      const value=await window.WorkshopSheets.load(sheetConfig,snapshot);
      if(!validPayload(value))throw new Error('invalid');
      const changed=!data || JSON.stringify(data)!==JSON.stringify(value);
      const news=changed&&data?describe(data,value):[];
      if(value.translations && JSON.stringify(value.translations)!==JSON.stringify(data?.translations)) I.setTranslations(value.translations);
      const first=!data;data=value;lastFetch=new Date();
      if(changed){render();window.dispatchEvent(new CustomEvent('workshop-data',{detail:data}));}
      setConnection(true);
      if(news.length)window.WorkshopToast?.pushAll(news);
      if(manual&&!news.length)notice('تمت قراءة Google Sheets؛ لا توجد تغييرات جديدة.');
      else if(news.length)notice('');
      else if($('notice').classList.contains('error'))notice('');
    }catch(error){
      setConnection(false);
      notice((data ? 'تعذر الاتصال الآن؛ ما زالت آخر نسخة محمّلة معروضة. ستُعاد المحاولة تلقائياً. ' : 'تعذر تحميل السجل. ')+(error.message==='invalid'?'بيانات Google Sheets غير صالحة.':error.message),true);
      if(!data)$('rows').innerHTML='<tr><td colspan="6" class="loading-cell">لا توجد نسخة محمّلة بعد.</td></tr>';
    }finally{fetching=false;$('refresh').disabled=false;}
  }
  $('rows').addEventListener('click',event=>{
    const edit=event.target.closest('button[data-edit]');
    if(edit){window.WorkshopAdmin?.open(edit.dataset.edit);return;}
    const button=event.target.closest('button[data-item]');if(!button)return;
    const id=button.dataset.item;const open=!expanded.has(id);if(open)expanded.add(id);else expanded.delete(id);
    button.setAttribute('aria-expanded',String(open));$('detail-'+id).hidden=!open;$('row-'+id).classList.toggle('is-open',open);
    if(open)window.WorkshopMotion?.reveal($('detail-'+id).querySelector('.detail-grid'),'detail');
  });
  $('groups').addEventListener('click',event=>{
    const button=event.target.closest('button[data-group]');if(!button)return;
    selectedGroup=button.dataset.group;
    for(const el of $('groups').querySelectorAll('button')){el.classList.toggle('active',el===button);el.setAttribute('aria-pressed',String(el===button));}
    renderRows();window.WorkshopMotion?.reveal(document.querySelector('.table-wrap'));
  });
  $('search').addEventListener('input',event=>{query=event.target.value;renderRows();});
  $('focus-filters').addEventListener('click',event=>{
    const button=event.target.closest('button[data-focus]');if(!button)return;
    selectedFocus=button.dataset.focus;renderRows();window.WorkshopMotion?.reveal(document.querySelector('.table-wrap'));
  });
  $('area-filter').addEventListener('change',event=>{selectedArea=event.target.value;renderRows();});
  window.addEventListener('workshop-view',event=>{
    const next=event.detail;
    if(next==='procurement' || next==='letters' || next==='jobs' || next==='stats' || next===overviewView)return;
    overviewView=next;selectedGroup='all';query='';selectedFocus='all';selectedArea='';$('search').value='';if(data)render();
  });
  $('refresh').addEventListener('click',()=>fetchData(true));
  $('clear-filters').addEventListener('click',()=>{selectedGroup='all';query='';selectedFocus='all';selectedArea='';$('search').value='';renderGroups();renderAreas();renderRows();});
  function restartPolling(){clearInterval(poller);if(document.visibilityState!=='hidden')poller=setInterval(()=>fetchData(),30000);}
  document.addEventListener('visibilitychange',()=>{restartPolling();if(document.visibilityState!=='hidden')fetchData();});
  window.addEventListener('online',()=>fetchData());
  window.addEventListener('offline',()=>{setConnection(false);notice('الاتصال بالإنترنت غير متاح؛ البيانات الظاهرة هي آخر نسخة محمّلة.',true);});
  function renderToday(){ $('today').textContent = new Intl.DateTimeFormat(I.locale,{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Dubai'}).format(new Date());
  }
  window.addEventListener('workshop-language',()=>{renderToday();if(data){render();setConnection(connected);}});
  window.addEventListener('workshop-session',()=>{if(data)renderRows();});
  // أدوات التعديل تحتاج إعادة القراءة وإظهار الرسائل بعد كل حفظ.
  window.WorkshopApp={refresh:()=>fetchData(true),notice};
  renderToday();fetchData();restartPolling();
})();
