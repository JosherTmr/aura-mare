/* Aura Mare · JL Arquitectos — modo videobeam (presentacion.html).
   Vanilla, script clásico (sin módulos ni fetch) para que funcione también
   abierto desde file:// en una memoria USB. */
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement, body = document.body;
  const canvas = $('#canvas'), bar = $('#progreso'), fsBtn = $('#fs-btn'), live = $('#anuncio');
  const slides = $$('.s', canvas), N = slides.length;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Duración por slide: ?t=12 (4 a 30 s); cualquier otro valor usa 8 s */
  const t = Number(new URLSearchParams(location.search).get('t'));
  const DUR = (Number.isFinite(t) && t >= 4 && t <= 30 ? t : 8) * 1000;
  const FADE = reduce ? 300 : 1400;  // igual que --pres-fade
  const HOLD = 15000;                // reanudación tras una acción manual
  const CURSOR = 2000;               // el cursor se oculta tras 2 s quieto
  root.style.setProperty('--pres-dur', DUR + 'ms');

  /* 1. Escala del lienzo de 1920 × 1080 */
  const fit = () => root.style.setProperty('--pres-k', Math.min(innerWidth / 1920, innerHeight / 1080));
  addEventListener('resize', fit);
  fit();

  /* 2. Carga diferida: cada slide carga sus imágenes al mostrarse el anterior */
  const hydrate = i => {
    const s = slides[(i + N) % N];
    $$('[data-srcset]', s).forEach(el => { el.srcset = el.dataset.srcset; delete el.dataset.srcset; });
    $$('[data-src]', s).forEach(el => { el.src = el.dataset.src; delete el.dataset.src; });
  };
  // Espera a que las imágenes (y el video, si hay) estén listos, con tope, para no mostrar nada a medio cargar
  const videoReady = v => v.readyState >= 3 ? Promise.resolve()
    : new Promise(r => v.addEventListener('canplaythrough', r, { once: true }));
  const ready = (i, max) => Promise.race([
    Promise.all([
      ...$$('img', slides[i]).map(img => img.decode().catch(() => {})),
      ...$$('video', slides[i]).map(videoReady)
    ]),
    new Promise(r => setTimeout(r, max))
  ]);

  /* Video de apertura: dura lo que dura el video (no ?t=). Con movimiento reducido
     no se reproduce: queda la imagen fija durante la duración normal. */
  const vid = i => $('video', slides[i]);
  const durOf = i => {
    const v = vid(i);
    if (!v || reduce) return DUR;
    return (Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 10) * 1000;
  };
  const playVid = i => {
    const v = vid(i);
    if (!v || reduce) return;
    if (v.ended) v.currentTime = 0;
    const p = v.play(); if (p && p.catch) p.catch(() => {});
  };
  const pauseVid = i => { const v = vid(i); if (v) v.pause(); };
  const rewindVid = i => { const v = vid(i); if (v) { v.pause(); v.currentTime = 0; } };

  /* 3. Reloj del avance automático. La barra es una animación CSS que se pausa
        junto con el temporizador, así ambos quedan sincronizados. */
  let cur = 0, want = 0, timer = null, hold = null, startAt = 0, elapsed = 0, paused = false, seq = 0, curDur = DUR;
  const running = () => timer !== null;
  const resetBar = () => {
    curDur = durOf(cur);
    bar.style.setProperty('--pres-dur', curDur + 'ms');
    bar.classList.remove('is-anim'); void bar.offsetWidth; bar.classList.add('is-anim');
    bar.style.animationPlayState = 'paused';
    elapsed = 0;
  };
  const run = () => {
    clearTimeout(hold); hold = null;
    if (running() || paused || document.hidden) return;
    startAt = performance.now();
    bar.style.animationPlayState = 'running';
    playVid(cur);
    timer = setTimeout(() => { timer = null; go(cur + 1, false); }, curDur - elapsed);
  };
  const stop = () => {
    if (running()) { elapsed += performance.now() - startAt; clearTimeout(timer); timer = null; }
    bar.style.animationPlayState = 'paused';
    pauseVid(cur);
  };
  const restartAnim = s => { s.classList.remove('is-anim'); void s.offsetWidth; s.classList.add('is-anim'); };

  /* Transición video → portada: el logo que apareció sobre el cielo es el mismo de la portada.
     Al cambiar de slide, el logo de la portada arranca exactamente donde estaba el del video
     (fundido entre dos imágenes idénticas en el mismo lugar: no se nota) y, cuando el video
     ya se fue a negro, viaja a su lugar en el centro. Patrón FLIP; solo transform. */
  const sVideo = $('.s-video'), sPortada = $('.s-portada');
  const vLogo = $('.video-logo'), pLogo = $('.portada-logo');
  const VIAJE = 2200;                            // igual que --pres-viaje
  const limpiarPortada = () => {
    sPortada.classList.remove('desde-video');
    pLogo.style.transition = ''; pLogo.style.transform = '';
  };
  function flipLogo() {
    limpiarPortada();
    const k = Number(getComputedStyle(root).getPropertyValue('--pres-k')) || 1;
    const a = vLogo.getBoundingClientRect(), b = pLogo.getBoundingClientRect();
    if (!a.height || !b.height) return;
    pLogo.style.transform = `translate(${(a.left - b.left) / k}px, ${(a.top - b.top) / k}px) scale(${a.height / b.height})`;
    void pLogo.offsetWidth;
    sPortada.classList.add('desde-video');
    pLogo.style.transition = `transform ${VIAJE}ms var(--ease-in-out) ${FADE}ms`;
    pLogo.style.transform = '';
  }
  // El logo aparece lentamente en los últimos 5 s del video
  const v0 = $('video', sVideo);
  v0.addEventListener('timeupdate', () => {
    if (v0.duration && v0.currentTime >= v0.duration - 5) sVideo.classList.add('logo-in');
  });

  function show(i, manual) {
    const prev = slides[cur], next = slides[i];
    if (prev !== next) {
      // Llegar a la portada justo después del video con el logo ya visible: el logo viaja
      if (prev === sVideo && next === sPortada && sVideo.classList.contains('logo-in') && !reduce) flipLogo();
      else if (next === sPortada) limpiarPortada();
      $$('.s.is-leaving', canvas).forEach(s => { if (s !== prev) s.classList.remove('is-leaving'); });
      prev.classList.add('is-leaving');           // queda opaco debajo mientras el nuevo aparece encima
      prev.classList.remove('is-active');
      prev.setAttribute('aria-hidden', 'true'); prev.inert = true;
      // El saliente conserva su acercamiento (y su video) mientras el nuevo lo cubre
      const prevIdx = slides.indexOf(prev);
      setTimeout(() => {
        if (prev === slides[cur]) return;
        prev.classList.remove('is-leaving', 'is-anim'); rewindVid(prevIdx);
        if (prev === sVideo) sVideo.classList.remove('logo-in');
      }, FADE + 50);
    }
    if (next === sVideo && reduce) sVideo.classList.add('logo-in');   // sin video: logo fijo desde el inicio
    next.classList.remove('is-leaving');
    next.classList.add('is-active');
    next.removeAttribute('aria-hidden'); next.inert = false;
    restartAnim(next);
    cur = i;
    hydrate(i + 1);                              // precarga del siguiente
    resetBar();
    const v = vid(i); if (v) v.currentTime = 0;  // el video siempre arranca desde el principio
    if (manual) { live.textContent = next.getAttribute('aria-label'); if (!paused) playVid(i); }
    else run();
  }

  function go(i, manual) {
    i = (i + N) % N;
    want = i;                                    // destino pendiente: dos pulsaciones rápidas avanzan dos slides
    const token = ++seq;
    hydrate(i);
    ready(i, manual ? 1200 : 4000).then(() => {
      if (token !== seq) return;
      show(i, manual);
      if (manual && !paused) { clearTimeout(hold); hold = setTimeout(run, HOLD); }
    });
  }

  // Acción manual: detiene el avance, la barra vuelve a cero y se reanuda a los 15 s (salvo pausa con P)
  function manual(i) {
    stop(); clearTimeout(hold); hold = null;
    go(i, true);
  }

  function togglePause() {
    paused = !paused;
    canvas.classList.toggle('is-paused', paused);
    if (paused) { clearTimeout(hold); hold = null; stop(); }
    else run();
  }

  /* 4. Pestaña oculta: se detiene; al volver, el slide actual empieza de nuevo */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stop(); clearTimeout(hold); hold = null; return; }
    restartAnim(slides[cur]);
    rewindVid(cur);
    if (slides[cur] === sVideo && !reduce) sVideo.classList.remove('logo-in');
    resetBar();
    run();
    requestWake();
  });

  /* 5. Pantalla encendida (Wake Lock); si no se puede, sigue sin avisar */
  let wake = null;
  function requestWake() {
    if (!('wakeLock' in navigator) || document.hidden) return;
    navigator.wakeLock.request('screen').then(l => { wake = l; }).catch(() => {});
  }

  /* 6. Cursor: se oculta tras 2 s sin moverse; el botón de pantalla completa va con él */
  let cursorTimer = null;
  const wakeCursor = () => {
    body.classList.remove('sin-cursor');
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => body.classList.add('sin-cursor'), CURSOR);
  };
  addEventListener('mousemove', wakeCursor, { passive: true });

  /* 7. Pantalla completa */
  const enterFs = () => {
    const el = document.documentElement;
    try { const p = el.requestFullscreen && el.requestFullscreen(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  };
  const exitFs = () => {
    try { if (document.fullscreenElement) { const p = document.exitFullscreen(); if (p && p.catch) p.catch(() => {}); } } catch (e) {}
  };
  fsBtn.addEventListener('click', e => { e.stopPropagation(); enterFs(); fsBtn.blur(); });
  document.addEventListener('fullscreenchange', () => {
    body.classList.toggle('en-pantalla-completa', !!document.fullscreenElement);
    fit();
  });

  /* 8. Control manual: teclas de puntero de presentación, clic por mitades */
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Spacebar') { e.preventDefault(); manual(want + 1); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); manual(want - 1); }
    else if (k === 'Home') { e.preventDefault(); manual(0); }
    else if (k === 'p' || k === 'P') togglePause();
    else if (k === 'f' || k === 'F') enterFs();
    else if (k === 'Escape') exitFs();
  });
  addEventListener('click', e => {
    if (e.target.closest('.fs-btn')) return;
    manual(e.clientX >= innerWidth / 2 ? want + 1 : want - 1);
  });

  /* Inicio */
  hydrate(0); hydrate(1);
  slides[0].classList.add('is-anim');
  if (reduce) sVideo.classList.add('logo-in');
  resetBar();
  wakeCursor();
  requestWake();
  ready(0, 4000).then(() => { resetBar(); run(); });  // resetBar otra vez: ya se conoce la duración del video
})();
