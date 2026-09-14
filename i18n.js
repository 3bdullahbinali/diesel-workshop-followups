'use strict';
(() => {
  const dictionary = window.WorkshopEnglish;
  const keys = Object.keys(dictionary).sort((a,b) => b.length-a.length);
  const arabic = /[\u0600-\u06ff]/;
  const originalText = new WeakMap(), originalAttributes = new WeakMap();
  let language = 'ar', applying = false;
  try { if(localStorage.getItem('workshop-language') === 'en') language = 'en'; } catch {}
  const pattern = new RegExp(keys.map(key => key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'), 'g');
  function english(value) {
    const text = String(value ?? '');
    if (!arabic.test(text)) return text;
    if (Object.hasOwn(dictionary, text)) return dictionary[text];
    // Composed labels (counts, names, dates) use the same current text catalog.
    return text.replace(pattern, match => dictionary[match]);
  }
  function translate(value) { return language === 'en' ? english(value) : String(value ?? ''); }
  function translatedSearch(values) {
    return values.map(value => [value, english(value)].join(' ')).join(' ');
  }
  function apply() {
    if (applying) return;
    applying = true;
    try {
      const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.parentElement?.closest('script,style,noscript,[translate="no"],.source-title')) continue;
        let saved = originalText.get(node);
        if (!saved || node.nodeValue !== saved.rendered) saved = {source:node.nodeValue};
        const next = translate(saved.source);
        if (node.nodeValue !== next) node.nodeValue = next;
        saved.rendered = next; originalText.set(node, saved);
      }
      for (const element of document.querySelectorAll('[aria-label],[placeholder],[data-label],meta[name="description"]')) {
        if(element.closest('[translate="no"]')) continue;
        const saved = originalAttributes.get(element) || {};
        for (const attribute of ['aria-label','placeholder','data-label','content']) {
          if (!element.hasAttribute(attribute)) continue;
          const value = element.getAttribute(attribute);
          let entry = saved[attribute];
          if (!entry || value !== entry.rendered) entry = {source:value};
          const next = translate(entry.source);
          if (value !== next) element.setAttribute(attribute,next);
          entry.rendered = next; saved[attribute] = entry;
        }
        originalAttributes.set(element, saved);
      }
      document.documentElement.lang = language;
      document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
      for(const button of document.querySelectorAll('[data-language]')) button.setAttribute('aria-pressed', String(button.dataset.language === language));
    } finally { applying = false; }
  }
  function setLanguage(next) {
    if(!['ar','en'].includes(next) || next === language) return;
    language = next;
    try { localStorage.setItem('workshop-language', language); } catch {}
    apply();
    window.dispatchEvent(new CustomEvent('workshop-language', {detail:language}));
    apply();
  }
  window.WorkshopI18n = {get language(){return language;}, get locale(){return language === 'ar' ? 'ar-AE' : 'en-GB';}, t:translate, english, search:translatedSearch, apply, setLanguage};
  document.querySelector('.language-switch').addEventListener('click', event => {
    const button = event.target.closest('[data-language]');
    if(button) setLanguage(button.dataset.language);
  });
  // Renderers keep their Arabic source text. Translate newly rendered nodes and
  // retain originals so language switches also preserve open panels and filters.
  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, {subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','placeholder','data-label','content']});
  apply();
})();
