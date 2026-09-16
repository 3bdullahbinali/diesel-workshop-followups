'use strict';
(() => {
  const I = window.WorkshopI18n;
  const $ = id => document.getElementById(id);
  const labels = {...window.WorkshopSheets.stages};
  const priorities = {high:'عالية',medium:'متوسطة',low:'منخفضة'};
  const rank = {high:0,medium:1,low:2};
  let data = null, selectedGroup = 'all', query = '', lastFetch = null, fetching = false, poller = null, connected = false;
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
    return group?.id==='all' && overviewView==='non-purchase' ? 'متابعات غير شرائية' : group?.label || 'جميع المتابعات';
  }
  function orderedItems(){return [...viewItems()].sort(compare);}
  function validPayload(value){
    return value && value.schemaVersion === 1 && Array.isArray(value.items) && value.items.length > 0 && Array.isArray(value.groups) && value.items.every(x => typeof x.id==='string' && typeof x.title==='string' && typeof x.status==='string' && typeof x.action==='string' && /^\d{4}-\d{2}-\d{2}$/.test(x.informationDate) && ['high','medium','low'].includes(x.priority) && labels[x.stage] && Array.isArray(x.sources)) && new Set(value.items.map(x=>x.id)).size===value.items.length;
  }
  function details(item){
    const source = item.sources.map(s => `<li><span class="source-title">${escape(s.title)}</span><span class="source-locator">${escape(s.locator)} · <bdi>${escape(shortDate(s.date))}</bdi></span></li>`).join('');
    const old = item.history?.length ? `<div class="detail-full"><h4>الحالة السابقة</h4>${item.history.map(h=>`<p><bdi>${escape(shortDate(h.date))}</bdi> — ${escape(h.status)}</p>`).join('')}</div>` : '';
    const base = item.baseIds?.length ? `بند السجل الأساسي: ${item.baseIds.join(' + ')}` : 'متابعة أحدث أُضيفت إلى السجل';
    return `<tr class="detail-row" id="detail-${escape(item.id)}" ${expanded.has(item.id)?'':'hidden'}><td colspan="6"><div class="detail-grid"><div><h4>آخر حالة مسجلة</h4><p>${escape(item.status)}</p><p class="detail-meta">${escape(base)}${item.dueDate ? ' · الموعد المرتبط: '+escape(shortDate(item.dueDate)):''}</p></div><div><h4>جهة المتابعة</h4><p>${escape(item.followUpWith)}</p><p class="detail-meta">المسؤول: ${escape(item.owner)}</p></div>${item.notes?`<div class="detail-full"><h4>الملاحظات والتفاصيل</h4><p>${escape(item.notes)}</p></div>`:''}<div class="detail-full"><h4>المراجع — للرجوع والبحث</h4><ul class="sources">${source}</ul></div>${old}</div></td></tr>`;
  }
  function renderRows(){
    if(!data)return;
    const items = orderedItems();
    const indexed = items.map((item,i)=>({item,index:i+1}));
    const visible = indexed.filter(({item}) => (selectedGroup === 'all' || item.group === selectedGroup) && (!query || normal(I.search([item.title,item.reference,item.owner,item.status,item.action,item.notes])).includes(normal(query))));
    window.WorkshopPresentation?.setItems(overviewView, visible.map(({item})=>item), groupLabel(data.groups.find(g=>g.id===selectedGroup)));
    $('rows').innerHTML = visible.map(({item,index})=>{
      const isOld = item.evidence === 'baseline';
      return `<tr class="record-row ${expanded.has(item.id)?'is-open':''}" id="row-${escape(item.id)}"><td class="number-cell"><span class="row-number">${index}</span></td><td class="topic-cell"><h4 class="item-title">${escape(item.title)}</h4><span class="reference" dir="auto">${escape(item.reference)}</span></td><td class="status-cell"><div class="badges"><span class="priority priority-${escape(item.priority)}">${priorities[item.priority]}</span></div><span class="stage stage-${escape(item.stage)}">${labels[item.stage]}</span></td><td class="action-cell"><p class="next-action">${escape(item.action)}</p><span class="owner">${escape(item.owner)}</span></td><td class="date-cell"><time class="information-date" datetime="${escape(item.informationDate)}">${escape(shortDate(item.informationDate))}</time><span class="date-note ${isOld?'':'current'}">${isOld?'حالة من السجل الأساسي':'تحديث مسجل'}</span><span class="purchase-sub record-edit-time"><span>آخر تعديل للبند</span>: <time translate="no" datetime="${escape(item.updatedAt || '')}">${escape(window.WorkshopRecordTime(item.updatedAt))}</time> <span>بتوقيت الإمارات</span></span></td><td class="expand-cell"><button type="button" class="expand-button" data-item="${escape(item.id)}" aria-label="تفاصيل ${escape(item.title)}" aria-expanded="${expanded.has(item.id)}" aria-controls="detail-${escape(item.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></td></tr>${details(item)}`;
    }).join('');
    $('shown-count').textContent = query || selectedGroup !== 'all' ? `${visible.length} / ${items.length}` : items.length;
    $('records-title').firstChild.textContent = groupLabel(data.groups.find(g=>g.id===selectedGroup))+' ';
    const noClosed=overviewView==='closed' && items.length===0;
    $('empty-title').textContent = noClosed ? 'لا توجد متابعات مغلقة بعد' : 'لا توجد متابعات مطابقة';
    $('empty-description').textContent = noClosed ? 'تظهر هنا المتابعات بعد تأكيد إنجازها وتحديث حالتها في السجل إلى «مكتمل».' : 'جرّب رقماً أو كلمة أخرى، أو أعد ضبط البحث والتصنيف.';
    $('clear-filters').hidden = noClosed;
    $('clear-filters').textContent = overviewView==='closed' ? 'عرض المتابعات المغلقة' : overviewView==='non-purchase' ? 'عرض المتابعات غير الشرائية' : 'عرض جميع المتابعات';
    $('empty').hidden = visible.length !== 0;
    document.querySelector('.table-wrap').hidden = visible.length === 0;
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
    renderGroups();renderRows();
  }
  function setConnection(ok){
    connected=ok;
    $('connection-dot').className = 'connection-dot'+(ok?'':' offline');
    $('connection-label').textContent = ok ? 'متصل بـ Google Sheets' : data?.connectionSource==='google-sheets' ? 'تعذر التحديث — آخر قراءة من Google Sheets' : 'نسخة محفوظة — Google Sheets غير متصل';
    window.WorkshopPresentation?.setConnection($('connection-label').textContent, ok);
    $('fetch-time').textContent = lastFetch ? 'آخر قراءة من Google Sheets '+time(lastFetch)+' · تحديث كل 30 ثانية' : '';
    $('sheet-status').textContent = ok ? 'البيانات مقروءة من ملف المتابعات في Google Sheets. تتجدد أثناء فتح الشاشة.' : data?.connectionSource==='google-sheets' ? 'تعذرت القراءة الجديدة من Google Sheets؛ تُعرض آخر قراءة ناجحة لحين عودة الاتصال.' : 'إعداد الربط جاهز؛ لم تنجح القراءة المباشرة من Google Sheets بعد. البيانات الظاهرة نسخة محفوظة، وليست تأكيداً لنجاح الربط.';
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
      if(value.translations && JSON.stringify(value.translations)!==JSON.stringify(data?.translations)) I.setTranslations(value.translations);
      const first=!data;data=value;lastFetch=new Date();
      if(changed){render();window.dispatchEvent(new CustomEvent('workshop-data',{detail:data}));}
      setConnection(true);
      if(manual)notice(changed&&!first?'وصلت تحديثات جديدة من Google Sheets.':'تمت قراءة Google Sheets؛ لا توجد تغييرات جديدة.');
      else if(changed&&!first)notice('تم تحديث السجل من Google Sheets.');
      else if($('notice').classList.contains('error'))notice('');
    }catch(error){
      setConnection(false);
      notice((data ? 'تعذر الاتصال الآن؛ ما زالت آخر نسخة محمّلة معروضة. ستُعاد المحاولة تلقائياً. ' : 'تعذر تحميل السجل. ')+(error.message==='invalid'?'بيانات Google Sheets غير صالحة.':error.message),true);
      if(!data)$('rows').innerHTML='<tr><td colspan="6" class="loading-cell">لا توجد نسخة محمّلة بعد.</td></tr>';
    }finally{fetching=false;$('refresh').disabled=false;}
  }
  $('rows').addEventListener('click',event=>{
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
  window.addEventListener('workshop-view',event=>{
    const next=event.detail;
    if(next==='procurement' || next===overviewView)return;
    overviewView=next;selectedGroup='all';query='';$('search').value='';if(data)render();
  });
  $('refresh').addEventListener('click',()=>fetchData(true));
  $('clear-filters').addEventListener('click',()=>{selectedGroup='all';query='';$('search').value='';renderGroups();renderRows();});
  function restartPolling(){clearInterval(poller);if(document.visibilityState!=='hidden')poller=setInterval(()=>fetchData(),30000);}
  document.addEventListener('visibilitychange',()=>{restartPolling();if(document.visibilityState!=='hidden')fetchData();});
  window.addEventListener('online',()=>fetchData());
  window.addEventListener('offline',()=>{setConnection(false);notice('الاتصال بالإنترنت غير متاح؛ البيانات الظاهرة هي آخر نسخة محمّلة.',true);});
  function renderToday(){ $('today').textContent = new Intl.DateTimeFormat(I.locale,{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Dubai'}).format(new Date());
  }
  window.addEventListener('workshop-language',()=>{renderToday();if(data){render();setConnection(connected);}});
  renderToday();fetchData();restartPolling();
})();
