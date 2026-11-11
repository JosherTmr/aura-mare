/* Aura Mare · JL Arquitectos — comportamiento del sitio (index.html y nosotros.html).
   Vanilla, sin dependencias. Cada bloque comprueba que su elemento exista. */
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad = n => String(n).padStart(2, '0');

  /* 1. Menú móvil (drawer) */
  const drawer = $('#drawer'), menuBtn = $('.menu-btn');
  function closeDrawer() {
    if (!drawer || !drawer.classList.contains('is-open')) return;
    drawer.classList.remove('is-open'); drawer.setAttribute('aria-hidden', 'true');
    menuBtn.setAttribute('aria-expanded', 'false'); document.body.style.overflow = '';
  }
  if (drawer && menuBtn) {
    menuBtn.addEventListener('click', () => {
      drawer.classList.add('is-open'); drawer.setAttribute('aria-hidden', 'false');
      menuBtn.setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden';
    });
    $('[data-close-drawer]', drawer)?.addEventListener('click', closeDrawer);
    $$('nav a', drawer).forEach(a => a.addEventListener('click', closeDrawer));
  }

  /* 2. Franja del horizonte */
  const strip = $('#strip'), caps = $('#capstrip');
  if (strip) {
    if (caps) strip.addEventListener('scroll', () => { caps.scrollLeft = strip.scrollLeft; }, { passive: true });
    $$('[data-strip]').forEach(b => b.addEventListener('click', () => {
      const card = $('.card', strip);
      strip.scrollBy({ left: (card.offsetWidth + 20) * +b.dataset.strip, behavior: reduce ? 'instant' : 'smooth' });
    }));
  }

  /* 3. Pestañas (WAI-ARIA, sin animación) */
  function tabs(sel) {
    const ts = $$(sel);
    if (!ts.length) return;
    const select = i => ts.forEach((t, j) => {
      t.setAttribute('aria-selected', i === j); t.tabIndex = i === j ? 0 : -1;
      $('#' + t.getAttribute('aria-controls')).hidden = i !== j;
    });
    ts.forEach((t, i) => {
      t.addEventListener('click', () => select(i));
      t.addEventListener('keydown', e => {
        let n = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') n = (i + (e.key === 'ArrowRight' ? 1 : -1) + ts.length) % ts.length;
        else if (e.key === 'Home') n = 0;
        else if (e.key === 'End') n = ts.length - 1;
        if (n !== null) { e.preventDefault(); select(n); ts[n].focus(); }
      });
    });
  }
  tabs('.mtab'); tabs('.ptab'); tabs('.atab');

  /* 5. Lightbox (galería y planos) */
  const lb = $('#lightbox');
  let openLb = () => {};
  if (lb) {
    const lbImg = $('#lb-img'), stage = $('#lb-stage'), prev = $('#lb-prev'), next = $('#lb-next'), zoom = $('#lb-zoom');
    let list = [], li = 0, last = null;
    const render = () => {
      const it = list[li];
      lbImg.src = it.src; lbImg.alt = it.alt;
      $('#lb-cap').textContent = it.cap;
      $('#lb-count').textContent = list.length > 1 ? `${pad(li + 1)} / ${pad(list.length)}` : '';
      prev.hidden = next.hidden = list.length < 2;
      stage.classList.remove('is-zoomed');
      zoom.setAttribute('aria-label', 'Acercar');
    };
    openLb = (arr, i, plan = false) => {
      list = arr; li = i; last = document.activeElement;
      stage.classList.toggle('is-plan', plan); zoom.hidden = !plan;
      render(); lb.classList.add('is-open'); document.body.style.overflow = 'hidden';
      $('#lb-close').focus();
    };
    const closeLb = () => {
      if (!lb.classList.contains('is-open')) return;
      lb.classList.remove('is-open'); document.body.style.overflow = '';
      last?.focus();
    };
    $('#lb-close').addEventListener('click', closeLb);
    prev.addEventListener('click', () => { li = (li - 1 + list.length) % list.length; render(); });
    next.addEventListener('click', () => { li = (li + 1) % list.length; render(); });
    zoom.addEventListener('click', () => {
      const z = stage.classList.toggle('is-zoomed');
      zoom.setAttribute('aria-label', z ? 'Alejar' : 'Acercar');
    });
    stage.addEventListener('click', e => { if (e.target === stage) closeLb(); });
    $$('[data-plan]').forEach(b => b.addEventListener('click', () =>
      openLb([{ src: b.dataset.plan, cap: b.dataset.cap, alt: $('img', b).alt }], 0, true)));
    addEventListener('keydown', e => {
      if (e.key === 'Escape') closeLb();
      if (lb.classList.contains('is-open') && list.length > 1) {
        if (e.key === 'ArrowRight') next.click();
        if (e.key === 'ArrowLeft') prev.click();
      }
    });
  }
  addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

  /* 4. Galería: scroll-snap nativo + contador + miniaturas */
  const track = $('#track');
  if (track) {
    const counter = $('#counter'), thumbs = $('#thumbs');
    const slides = $$('.slide', track);
    slides.forEach((s, i) => {
      const im = $('img', s), base = im.getAttribute('src').replace(/\.jpg$/, '-640');
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'thumb';
      b.setAttribute('aria-label', 'Ver ' + $('figcaption', s).textContent);
      b.innerHTML = `<picture><source type="image/avif" srcset="${base}.avif"><img src="${base}.webp" alt="" width="640" height="${Math.round(640 * im.getAttribute('height') / im.getAttribute('width'))}" loading="lazy" decoding="async"></picture>`;
      b.addEventListener('click', () => go(i));
      thumbs.append(b);
      im.addEventListener('click', () => openLb(items(), i));
    });
    const tbs = $$('.thumb', thumbs);
    let idx = 0;
    const go = i => track.scrollTo({ left: slides[i].offsetLeft, behavior: reduce ? 'instant' : 'smooth' });
    const sync = () => {
      idx = Math.min(slides.length - 1, Math.max(0, Math.round(track.scrollLeft / (track.clientWidth || 1))));
      counter.textContent = `${pad(idx + 1)} / ${pad(slides.length)}`;
      tbs.forEach((t, j) => t.setAttribute('aria-current', j === idx));
    };
    const items = () => slides.map(s => {
      const im = $('img', s);
      return { src: im.dataset.full || im.currentSrc || im.src, cap: $('figcaption', s).textContent, alt: im.alt };
    });
    track.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
    $('[data-prev]').addEventListener('click', () => go((idx - 1 + slides.length) % slides.length));
    $('[data-next]').addEventListener('click', () => go((idx + 1) % slides.length));
    $('[data-open]').addEventListener('click', () => openLb(items(), idx));
    track.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { e.preventDefault(); $('[data-next]').click(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); $('[data-prev]').click(); }
    });
    sync();
  }

  /* 6. Video: se crea solo al pulsar */
  const play = $('#play');
  if (play) play.addEventListener('click', () => {
    const v = document.createElement('video');
    v.src = 'assets/video/aura-mare-recorrido.mp4';
    v.controls = true; v.playsInline = true; v.autoplay = true; v.preload = 'none';
    v.setAttribute('aria-label', 'Video del proyecto Aura Mare');
    $('#vframe').replaceChildren(v);
    v.play().catch(() => {});
    v.focus();
  });

  /* 7. Formulario de demostración: valida y no envía nada */
  const form = $('#form');
  if (form) form.addEventListener('submit', e => {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    $('#form-note').textContent = 'Formulario de demostración: no se enviaron datos.';
    form.reset();
  });

  /* 8. Barra móvil: se oculta mientras la ficha con el formulario está en pantalla */
  const mbar = $('#mbar'), aside = $('#asesoria');
  if (mbar && aside && 'IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => mbar.classList.toggle('is-hidden', en.isIntersecting), { threshold: 0.15 }).observe(aside);
  }
})();
