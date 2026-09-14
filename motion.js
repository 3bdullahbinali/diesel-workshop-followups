'use strict';
(() => {
  const root=document.documentElement;
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const button=document.getElementById('motion-toggle');
  const label=document.getElementById('motion-label');
  const animations=new Set(), running=new WeakMap();
  let requested=true;
  try { requested=localStorage.getItem('workshop-motion')!=='off'; } catch {}
  const enabled=()=>requested&&!preference.matches&&!document.hidden;
  function sync(){
    const on=enabled();
    root.dataset.motion=on?'on':'off';
    button.hidden=false;
    button.disabled=preference.matches;
    button.setAttribute('aria-pressed',String(on));
    button.setAttribute('aria-label',preference.matches?'الحركة مخفّضة حسب إعدادات جهازك':on?'إيقاف الحركة':'تشغيل الحركة');
    label.textContent=on?'الحركة مفعّلة':'الحركة متوقفة';
    if(!on){for(const animation of animations)animation.cancel();animations.clear();}
  }
  function reveal(element,kind='panel'){
    if(!enabled()||!element||element.closest('[hidden]')||typeof element.animate!=='function')return;
    running.get(element)?.cancel();
    const distance=kind==='detail'?5:9;
    const animation=element.animate([
      {opacity:.4,transform:`translateY(${distance}px)`},
      {opacity:1,transform:'translateY(0)'}
    ],{duration:kind==='detail'?200:280,easing:'cubic-bezier(.22,1,.36,1)'});
    running.set(element,animation);animations.add(animation);
    const clear=()=>{animations.delete(animation);if(running.get(element)===animation)running.delete(element);};
    animation.onfinish=clear;animation.oncancel=clear;
  }
  button.addEventListener('click',()=>{
    requested=!requested;
    try{localStorage.setItem('workshop-motion',requested?'on':'off');}catch{}
    sync();
  });
  preference.addEventListener('change',sync);
  document.addEventListener('visibilitychange',sync);
  // The register drawing only runs while it is actually on screen.
  const scene=document.querySelector('.page-scene');
  if(scene&&'IntersectionObserver' in window){
    new IntersectionObserver(entries=>{for(const entry of entries)scene.dataset.visible=String(entry.isIntersecting);},{rootMargin:'140px'}).observe(scene);
  }
  window.WorkshopMotion={reveal};
  sync();
})();
