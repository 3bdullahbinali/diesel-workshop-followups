'use strict';
(() => {
  const normalize = value => String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const arabic = /[\u0621-\u063a\u0641-\u064a]/;
  const baseDictionary = new Map(Object.entries(window.WorkshopEnglish).map(([key,value]) => [normalize(key),value]));
  let liveDictionary = new Map(), dictionary, pattern;
  const cache = new Map();
  function rebuild() {
    dictionary = new Map([...baseDictionary, ...liveDictionary]);
    const keys = [...dictionary.keys()].filter(Boolean).sort((a,b) => b.length-a.length);
    pattern = new RegExp(keys.map(key => key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'), 'g');
    cache.clear();
  }
  rebuild();
  const originalText = new WeakMap(), originalAttributes = new WeakMap();
  let language = 'ar', applying = false;
  try { if(localStorage.getItem('workshop-language') === 'en') language = 'en'; } catch {}
  function english(value) {
    const text = String(value ?? '');
    if (!arabic.test(text)) return text;
    if (cache.has(text)) return cache.get(text);
    const source = normalize(text), exact = dictionary.get(source);
    let translated = exact ?? source.replace(pattern, (match,offset,whole) => {
      // A status such as "مكتمل" must never be substituted inside "مكتملان".
      if ((arabic.test(match[0]) && arabic.test(whole[offset-1] || '')) ||
          (arabic.test(match.at(-1)) && arabic.test(whole[offset+match.length] || ''))) return match;
      return dictionary.get(match);
    });
    // Keep an unknown sentence intact until its reviewed translation is supplied.
    // Never display a partially translated sentence or reuse a different source's translation.
    translated = arabic.test(translated) ? text : (text.match(/^\s*/)?.[0] || '') + translated + (text.match(/\s*$/)?.[0] || '');
    if (cache.size > 5000) cache.clear();
    cache.set(text, translated);
    return translated;
  }
  function setTranslations(entries) {
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return;
    liveDictionary = new Map(Object.entries(entries).filter(([source,target]) => arabic.test(source) && typeof target === 'string' && target.trim() && !arabic.test(target)).map(([source,target]) => [normalize(source),target.trim()]));
    rebuild();
    apply();
    window.dispatchEvent(new CustomEvent('workshop-translations'));
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
        if (node.parentElement?.closest('script,style,noscript,[translate="no"]')) continue;
        let saved = originalText.get(node);
        if (!saved || node.nodeValue !== saved.rendered) saved = {source:node.nodeValue};
        const next = translate(saved.source);
        if (node.nodeValue !== next) node.nodeValue = next;
        saved.rendered = next; originalText.set(node, saved);
      }
      for (const element of document.querySelectorAll('[aria-label],[placeholder],[data-label],[title],[alt],meta[name="description"]')) {
        if(element.closest('[translate="no"]')) continue;
        const saved = originalAttributes.get(element) || {};
        for (const attribute of ['aria-label','placeholder','data-label','title','alt','content']) {
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
  window.WorkshopI18n = {get language(){return language;}, get locale(){return language === 'ar' ? 'ar-AE' : 'en-GB';}, t:translate, english, search:translatedSearch, apply, setLanguage, setTranslations};
  document.querySelector('.language-switch').addEventListener('click', event => {
    const button = event.target.closest('[data-language]');
    if(button) setLanguage(button.dataset.language);
  });
  // Renderers keep their Arabic source text. Translate newly rendered nodes and
  // retain originals so language switches also preserve open panels and filters.
  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, {subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','placeholder','data-label','title','alt','content']});
  apply();
})();
