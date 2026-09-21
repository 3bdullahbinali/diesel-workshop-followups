'use strict';
/**
 * «حركة النص» — أدوات صغيرة تُخرج النص نفسه مشهداً: كشف كلمةً كلمة، وكشف
 * جملةً جملة، وعدّاد يعدّ، وشريط يمشي، وحلقة تقدّم.
 *
 * بلا مكتبة: Web Animations API وCSS فقط. وكل حركة هنا تُسأل أولاً:
 * هل الحركة مسموحة؟ فإن لم تكن (تقليل الحركة في الجهاز، أو زر الحركة في
 * الصفحة) ظهر النص كاملاً فوراً — المحتوى واحد في الحالتين، والحركة زينة
 * عليه لا شرط له.
 */
(() => {
  const K = {};
  const latin = /^[A-Za-z0-9#@&./:\-–+()_%,'"]+$/;
  const arabic = /[؀-ۿ]/;

  /**
   * تقطيع نص إلى قطع تُحرَّك كل واحدة على حدة، مع دمج الكلمات اللاتينية
   * والأرقام المتجاورة في قطعة واحدة: صندوقان لاتينيان منفصلان في فقرة
   * عربية يُرتَّبان من اليمين فتنقلب «Atlas Copco» إلى «Copco Atlas».
   * الدمج يبقيهما في صندوق واحد فيُقرآن كما كُتبا.
   */
  K.chunks = text => {
    const out = [];
    for (const word of String(text || '').trim().split(/\s+/).filter(Boolean)){
      const last = out[out.length - 1];
      if (last && latin.test(word) && latin.test(last) && !arabic.test(word)) out[out.length - 1] = last + ' ' + word;
      else out.push(word);
    }
    return out;
  };

  /** تقطيع فقرة إلى جمل عند علامات الوقف والأسطر، من غير كسر جملة بلا وقف. */
  K.sentences = text => String(text || '').replace(/\r/g, '')
    .split(/(?<=[.!?؟؛;:])\s+|\n+/).map(s => s.trim()).filter(Boolean);

  /** يبني القطع كعناصر متتالية داخل الحاوية، ويعيدها ليُحرَّك كل منها. */
  function fill(node, parts, className){
    node.textContent = '';
    const spans = parts.map((part, i) => {
      const span = document.createElement('span');
      span.className = className;
      span.textContent = part;
      node.appendChild(span);
      if (i < parts.length - 1) node.appendChild(document.createTextNode(' '));
      return span;
    });
    return spans;
  }

  const ease = 'cubic-bezier(.22,1,.36,1)';

  /**
   * كشف متدرّج: كل قطعة تصعد وتظهر بعد سابقتها بخطوة. `from` اتجاه الدخول
   * بالبكسل، و`step` الفاصل بين قطعة وأخرى، و`delay` قبل الأولى.
   */
  K.reveal = (spans, {animate, step = 60, delay = 0, from = 14, duration = 620} = {}) => {
    if (!animate) return delay + step*spans.length;
    spans.forEach((span, i) => {
      span.animate([
        {opacity: 0, transform: `translateY(${from}px)`, filter: 'blur(4px)'},
        {opacity: 1, transform: 'translateY(0)', filter: 'blur(0)'}
      ], {duration, delay: delay + i*step, easing: ease, fill: 'both'});
    });
    return delay + step*(spans.length - 1) + duration;
  };

  /** كلمة كلمة: للعناوين القصيرة. */
  K.words = (node, text, opts) => K.reveal(fill(node, K.chunks(text), 'k-word'), opts);

  /** جملة جملة: للفقرات، فكاسكاد الكلمات على فقرة طويلة يطول ويملّ. */
  K.lines = (node, text, opts) => K.reveal(fill(node, K.sentences(text), 'k-line'), opts);

  /** خروج: السطور ترتفع وتذوب متتابعة — الاتجاه يقول إن الطابور يتقدّم. */
  K.leave = (node, {step = 30, duration = 380} = {}) => {
    const parts = [...node.querySelectorAll('.k-word, .k-line, .k-part')];
    const targets = parts.length ? parts : [node];
    targets.forEach((el, i) => el.animate([
      {opacity: 1, transform: 'translateY(0)'},
      {opacity: 0, transform: 'translateY(-16px)', filter: 'blur(3px)'}
    ], {duration, delay: i*step, easing: 'cubic-bezier(.4,0,.8,.4)', fill: 'forwards'}));
    return step*(targets.length - 1) + duration;
  };

  /**
   * عدّاد يعدّ من صفر إلى الرقم: للأرقام في المرجع فقط. النص غير الرقمي
   * يُكتب كما هو — لا يُخترع له عدّ.
   */
  K.count = (node, text, {animate, duration = 900, delay = 0} = {}) => {
    const value = String(text || '');
    const m = value.match(/\d{2,}/);
    if (!animate || !m){ node.textContent = value; return 0; }
    const target = Number(m[0]), start = performance.now() + delay;
    const write = n => { node.textContent = value.replace(m[0], String(n).padStart(m[0].length, '0')); };
    write(0);
    const tick = now => {
      const t = Math.min(1, Math.max(0, (now - start)/duration));
      const e = 1 - Math.pow(1 - t, 3);
      write(Math.round(target*e));
      if (t < 1) requestAnimationFrame(tick); else node.textContent = value;
    };
    requestAnimationFrame(tick);
    return delay + duration;
  };

  /** خط يرسم نفسه: للفاصل الذهبي بجانب الإجراء. */
  K.rule = (node, {animate, delay = 0, duration = 700} = {}) => {
    if (!animate){ node.style.transform = ''; return 0; }
    node.animate([{transform: 'scaleY(0)'}, {transform: 'scaleY(1)'}],
                 {duration, delay, easing: ease, fill: 'both'});
    return delay + duration;
  };

  /** مسحة من الجانب: للمعوّق. */
  K.wipe = (node, {animate, delay = 0, duration = 560, rtl = true} = {}) => {
    if (!animate) return 0;
    const side = rtl ? 'right' : 'left';
    node.animate([
      {clipPath: `inset(0 ${rtl ? 0 : '100%'} 0 ${rtl ? '100%' : 0})`, opacity: .4},
      {clipPath: 'inset(0 0 0 0)', opacity: 1}
    ], {duration, delay, easing: ease, fill: 'both'});
    node.style.transformOrigin = side;
    return delay + duration;
  };

  /**
   * شريط يمشي بسرعة القراءة: يكرّر محتواه مرتين ويحرّكه بمقدار نصف عرضه
   * فيبدو بلا نهاية. `pxPerSecond` سرعة المشي؛ وبلا حركة يبقى ساكناً.
   */
  K.ticker = (track, {animate, pxPerSecond = 46, rtl = true} = {}) => {
    track.getAnimations?.().forEach(a => a.cancel());
    if (!animate || !track.firstChild) return null;
    const width = track.scrollWidth/2;
    if (width < 10) return null;
    const dir = rtl ? 1 : -1;
    return track.animate([{transform: 'translateX(0)'}, {transform: `translateX(${dir*width}px)`}],
                         {duration: (width/pxPerSecond)*1000, iterations: Infinity, easing: 'linear'});
  };

  /** حلقة تقدّم: نسبة من 0 إلى 1 على دائرة SVG. */
  K.ring = (circle, ratio) => {
    const r = Number(circle.getAttribute('r')), c = 2*Math.PI*r;
    circle.style.strokeDasharray = String(c);
    circle.style.strokeDashoffset = String(c*(1 - Math.min(1, Math.max(0, ratio))));
  };

  window.WorkshopKinetic = K;
})();
