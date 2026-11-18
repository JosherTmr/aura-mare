/* Aura Mare · JL Arquitectos — modo videobeam (presentacion.html).
   Vanilla, script clásico (sin módulos ni fetch) para que funcione también
   abierto desde file:// en una memoria USB.

   Reproducción: dos estados y nada más, «reproduciendo» (inicial) y «pausado».
   - Pausar/reanudar (botón, P, K): congela o retoma el tiempo restante del slide.
   - Navegar (botones, flechas, Espacio, deslizar, clic por mitades, Inicio): el slide
     nuevo arranca su tiempo completo si se estaba reproduciendo, o queda en pausa.

   Lienzo: horizontal 1920 × 1080 en pantallas horizontales y en pantalla completa;
   vertical 1080 × 1920 en un teléfono o tableta de pie sin pantalla completa. En pantalla
   completa de pie, si el navegador no puede bloquear la orientación, el lienzo horizontal
   se muestra girado 90° (modo «girado»). */
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement, body = document.body;
  const canvas = $('#canvas'), bar = $('#progreso'), fsBtn = $('#fs-btn'), live = $('#anuncio');
  const escenario = $('#escenario'), aviso = $('#aviso-giro'), sugerencia = $('#sugerencia');
  const btnPrev = $('#btn-prev'), btnPlay = $('#btn-play'), btnNext = $('#btn-next'), etiqueta = $('#pausa-etiqueta');
  const slides = $$('.s', canvas), N = slides.length;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(location.search);

  /* Duración por slide: ?t=12 (4 a 30 s); cualquier otro valor usa 8 s */
  const t = Number(params.get('t'));
  const DUR = (Number.isFinite(t) && t >= 4 && t <= 30 ? t : 8) * 1000;
  const FADE = reduce ? 300 : 1400;  // igual que --pres-fade
  const VIAJE = 2200;                // igual que --pres-viaje
  const UI_ESPERA = 2500;            // controles y cursor se ocultan tras 2,5 s sin actividad
  const AVISO = 3000, SUGERENCIA = 5000;
  const SWIPE_PX = 50, SWIPE_V = 0.11, SWIPE_MIN = 10;   // umbral, velocidad (px/ms) y distancia mínima para la velocidad
  const ARRIBA = 20 + 44 + 8, ABAJO = 24 + 60 + 8;       // px de pantalla que ocupan los botones superiores y la pastilla
  const SIMULAR_GIRO = params.get('simular-giro') === '1'; // fuerza el respaldo girado para probarlo en escritorio
  root.style.setProperty('--pres-dur', DUR + 'ms');

  /* 1. Pantalla completa: real (Fullscreen API) y/o «sesión» de pantalla completa simulada */
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  let giroActivo = false;            // respaldo: pantalla completa sin bloqueo de orientación
  const enPantallaCompleta = () => giroActivo || !!fsElement();

  /* 2. Escala y lienzo */
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)';
  body.append(probe);
  let modo = '';                     // 'h' horizontal, 'v' vertical, 'g' horizontal girado
  function fit() {
    // clientWidth/Height: el viewport visible; en móvil innerWidth puede crecer con el contenido
    const W = root.clientWidth || innerWidth, H = root.clientHeight || innerHeight, dePie = H > W;
    const fs = enPantallaCompleta();
    const nuevo = dePie ? (giroActivo ? 'g' : fs ? 'h' : 'v') : 'h';
    const vertical = nuevo === 'v', girada = nuevo === 'g';
    if (modo && nuevo !== modo) cancelarViaje();          // el lienzo cambió: el logo va directo a su lugar
    if (girada && modo !== 'g') mostrarAviso();
    modo = nuevo;
    root.classList.toggle('is-vertical', vertical);
    root.classList.toggle('is-girada', girada);
    // En el modo girado el escenario mide H de ancho y W de alto antes de rotar
    const EW = girada ? H : W, EH = girada ? W : H;
    root.style.setProperty('--esc-w', EW + 'px');
    root.style.setProperty('--esc-h', EH + 'px');
    const cw = vertical ? 1080 : 1920, ch = vertical ? 1920 : 1080;
    const k = Math.min(EW / cw, EH / ch);
    let top = 96, bottom = 96;
    if (vertical) {
      // Margen de 96 px + zona segura del equipo (muesca, barra de inicio) en px del lienzo,
      // y nunca menos de lo necesario para que los controles flotantes no tapen texto.
      const cs = getComputedStyle(probe), inT = parseFloat(cs.paddingTop) || 0, inB = parseFloat(cs.paddingBottom) || 0;
      const franja = (EH - ch * k) / 2;
      top = Math.max(96 + inT / k, (inT + ARRIBA - franja) / k);
      bottom = Math.max(96 + inB / k, (inB + ABAJO - franja) / k);
    }
    root.style.setProperty('--pres-k', k);
    root.style.setProperty('--pres-safe-top', Math.round(top) + 'px');
    root.style.setProperty('--pres-safe-bottom', Math.round(bottom) + 'px');
    body.classList.toggle('en-pantalla-completa', fs);
    fsBtn.textContent = fs ? 'Salir de pantalla completa' : 'Pantalla completa';
    if (!dePie || fs) ocultarSugerencia();
  }

  /* 3. Carga diferida: cada slide carga sus imágenes al mostrarse el anterior */
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

  /* 4. Reloj. La barra es una animación CSS que se pausa junto con el temporizador. */
  let cur = 0, want = 0, timer = null, startAt = 0, elapsed = 0, paused = false, seq = 0, curDur = DUR;
  const running = () => timer !== null;
  const resetBar = () => {
    curDur = durOf(cur);
    bar.style.setProperty('--pres-dur', curDur + 'ms');
    bar.classList.remove('is-anim'); void bar.offsetWidth; bar.classList.add('is-anim');
    bar.style.animationPlayState = 'paused';
    elapsed = 0;
  };
  const run = () => {
    if (running() || paused || document.hidden) return;
    startAt = performance.now();
    bar.style.animationPlayState = 'running';
    playVid(cur);
    timer = setTimeout(() => { timer = null; go(cur + 1, false); }, Math.max(0, curDur - elapsed));
  };
  const stop = () => {
    if (running()) { elapsed += performance.now() - startAt; clearTimeout(timer); timer = null; }
    bar.style.animationPlayState = 'paused';
    pauseVid(cur);
  };
  const restartAnim = s => { s.classList.remove('is-anim'); void s.offsetWidth; s.classList.add('is-anim'); };

  /* Transición video → portada: el logo que apareció sobre el cielo es el mismo de la portada.
     Al cambiar de slide, el logo de la portada arranca exactamente donde estaba el del video
     y, cuando el video ya se fue a negro, viaja a su lugar. Patrón FLIP; solo transform.
     Las posiciones se miden en px del lienzo (offsets, no getBoundingClientRect), así el cálculo
     es el mismo en horizontal, en vertical y con el escenario girado. */
  const sVideo = $('.s-video'), sPortada = $('.s-portada');
  const vLogo = $('.video-logo'), pLogo = $('.portada-logo');
  let viajeHasta = 0;
  const enLienzo = el => {
    let x = 0, y = 0, n = el;
    while (n && n !== canvas) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform);
    return { x: x + m.e, y: y + m.f, h: el.offsetHeight * m.d };
  };
  const limpiarPortada = () => {
    sPortada.classList.remove('desde-video');
    pLogo.style.transition = ''; pLogo.style.transform = '';
    viajeHasta = 0;
  };
  function flipLogo() {
    limpiarPortada();
    const a = enLienzo(vLogo), b = enLienzo(pLogo);
    if (!a.h || !b.h) return;
    pLogo.style.transform = `translate(${a.x - b.x}px, ${a.y - b.y}px) scale(${a.h / b.h})`;
    void pLogo.offsetWidth;
    sPortada.classList.add('desde-video');
    pLogo.style.transition = `transform ${VIAJE}ms var(--ease-in-out) ${FADE}ms`;
    pLogo.style.transform = '';
    viajeHasta = performance.now() + FADE + VIAJE;
  }
  // Si el lienzo cambia a mitad del viaje, el logo queda en su lugar final sin animar
  function cancelarViaje() {
    if (performance.now() >= viajeHasta) return;
    pLogo.style.transition = 'none'; pLogo.style.transform = '';
    void pLogo.offsetWidth; pLogo.style.transition = '';
    viajeHasta = 0;
  }
  // El logo aparece lentamente en los últimos 5 s del video; nunca mientras está en pausa
  const v0 = $('video', sVideo);
  v0.addEventListener('timeupdate', () => {
    if (!paused && v0.duration && v0.currentTime >= v0.duration - 5) sVideo.classList.add('logo-in');
  });

  function show(i, manual) {
    const prev = slides[cur], next = slides[i];
    if (prev !== next) {
      // Salir del video con el logo ya visible (automático o manual): el logo viaja a la portada
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
        if (prev === sVideo && !reduce) sVideo.classList.remove('logo-in');
      }, FADE + 50);
    }
    // El slide del video siempre empieza en el segundo 0 y sin logo
    if (next === sVideo) sVideo.classList.toggle('logo-in', reduce);
    next.classList.remove('is-leaving');
    next.classList.add('is-active');
    next.removeAttribute('aria-hidden'); next.inert = false;
    restartAnim(next);
    cur = i;
    hydrate(i + 1);                              // precarga del siguiente
    rewindVid(i);
    resetBar();
    if (manual) live.textContent = next.getAttribute('aria-label');
    run();                                       // en pausa no hace nada: queda en el primer cuadro y la línea en cero
  }

  function go(i, manual) {
    i = (i + N) % N;
    want = i;                                    // destino pendiente: dos pulsaciones rápidas avanzan dos slides
    const token = ++seq;
    hydrate(i);
    ready(i, manual ? 1200 : 4000).then(() => {
      if (token !== seq) return;
      show(i, manual);
    });
  }

  // Navegación manual: el slide nuevo arranca su tiempo completo de inmediato (o sigue en pausa)
  function nav(i) { stop(); go(i, true); }

  function setPaused(p) {
    paused = p;
    canvas.classList.toggle('is-paused', p);
    body.classList.toggle('en-pausa', p);
    btnPlay.setAttribute('aria-pressed', String(p));
    btnPlay.setAttribute('aria-label', p ? 'Reanudar presentación' : 'Pausar presentación');
    etiqueta.hidden = !p;
    if (p) stop(); else run();                   // reanuda desde donde quedó
    showUI();
  }

  /* 5. Pestaña oculta: se detiene. Al volver: si se estaba reproduciendo, el slide actual
        empieza de nuevo; si estaba en pausa, sigue en pausa. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stop(); return; }
    requestWake();
    if (paused) return;
    restartAnim(slides[cur]);
    rewindVid(cur);
    if (slides[cur] === sVideo && !reduce) sVideo.classList.remove('logo-in');
    resetBar();
    run();
  });

  /* 6. Pantalla encendida (Wake Lock); si no se puede, sigue sin avisar */
  let wake = null;
  function requestWake() {
    if (!('wakeLock' in navigator) || document.hidden || (wake && !wake.released)) return;
    navigator.wakeLock.request('screen').then(l => { wake = l; }).catch(() => {});
  }

  /* 7. Controles y cursor: visibles con actividad, ocultos a los 2,5 s.
        En pausa, o con el foco del teclado en ellos, no se ocultan. */
  let uiTimer = null;
  const uiFocused = () => {
    const a = document.activeElement;
    return !!(a && a !== body && a.closest && a.closest('.controles, .fs-btn') && a.matches(':focus-visible'));
  };
  function scheduleHide() { clearTimeout(uiTimer); uiTimer = setTimeout(tryHide, UI_ESPERA); }
  function tryHide() {
    if (paused || uiFocused()) { scheduleHide(); return; }
    body.classList.add('ui-oculta');
  }
  function showUI() { body.classList.remove('ui-oculta'); scheduleHide(); }
  function toggleUI() {
    if (body.classList.contains('ui-oculta')) showUI();
    else if (!paused) { clearTimeout(uiTimer); body.classList.add('ui-oculta'); }
  }
  addEventListener('pointermove', e => { if (e.pointerType === 'mouse') showUI(); }, { passive: true });
  document.addEventListener('focusin', e => { if (e.target.closest && e.target.closest('.controles, .fs-btn')) showUI(); });

  /* 8. Avisos: «Gira tu teléfono» (3 s al entrar al modo girado) y sugerencia única en táctil de pie */
  let avisoTimer = null, sugTimer = null;
  function mostrarAviso() {
    clearTimeout(avisoTimer);
    aviso.classList.add('is-visible');
    avisoTimer = setTimeout(() => aviso.classList.remove('is-visible'), AVISO);
  }
  function ocultarSugerencia() {
    clearTimeout(sugTimer);
    sugerencia.classList.remove('is-visible');
  }
  function quizaSugerir() {
    if (!matchMedia('(pointer: coarse)').matches || modo !== 'v') return;
    let vista = false;
    try { vista = sessionStorage.getItem('aura-sugerencia-giro') === '1'; } catch (e) {}
    if (vista) return;
    try { sessionStorage.setItem('aura-sugerencia-giro', '1'); } catch (e) {}
    sugerencia.classList.add('is-visible');
    sugTimer = setTimeout(ocultarSugerencia, SUGERENCIA);
    addEventListener('pointerdown', ocultarSugerencia, { once: true, passive: true });
  }

  /* 9. Pantalla completa en horizontal.
        A) Navegadores que bloquean la orientación (Chrome, Edge, Samsung Internet en Android):
           pantalla completa real + screen.orientation.lock('landscape').
        B) Respaldo (iPhone, iPad, Safari, Firefox o ?simular-giro=1): la pantalla completa que
           se pueda y, si el teléfono sigue de pie, el lienzo horizontal girado 90°. */
  // Tope de espera: algunos navegadores embebidos dejan la promesa de requestFullscreen pendiente para siempre
  const conTope = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('tope')), ms))]);
  async function entrarPantallaCompleta() {
    const el = root;
    let fsOk = false;
    try {
      if (el.requestFullscreen) { await conTope(el.requestFullscreen({ navigationUI: 'hide' }), 1000); fsOk = true; }
      else if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); fsOk = true; }   // la versión webkit no devuelve promesa
    } catch (e) { fsOk = !!fsElement(); }
    let bloqueada = false;
    if (fsOk && !SIMULAR_GIRO && screen.orientation && typeof screen.orientation.lock === 'function') {
      try { await screen.orientation.lock('landscape'); bloqueada = true; } catch (e) {}
    }
    const dePie = (root.clientHeight || innerHeight) > (root.clientWidth || innerWidth);
    if (!bloqueada && (fsOk || dePie)) giroActivo = true;
    fit();
    requestWake();
  }
  function salirPantallaCompleta() {
    giroActivo = false;
    try {
      if (document.fullscreenElement && document.exitFullscreen) { const p = document.exitFullscreen(); if (p && p.catch) p.catch(() => {}); }
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (e) {}
    fit();
    requestWake();
  }
  const alternarPantallaCompleta = () => enPantallaCompleta() ? salirPantallaCompleta() : entrarPantallaCompleta();
  fsBtn.addEventListener('click', () => { alternarPantallaCompleta(); fsBtn.blur(); });
  function alCambiarPantallaCompleta() {
    if (!fsElement()) {                          // se salió (botón, Esc, gesto atrás del sistema)
      giroActivo = false;
      try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}
    }
    fit();
    requestWake();
  }
  document.addEventListener('fullscreenchange', alCambiarPantallaCompleta);
  document.addEventListener('webkitfullscreenchange', alCambiarPantallaCompleta);
  addEventListener('resize', fit);
  addEventListener('orientationchange', fit);
  if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', fit);

  /* 10. Botones de la pastilla */
  btnPrev.addEventListener('click', () => nav(want - 1));
  btnNext.addEventListener('click', () => nav(want + 1));
  btnPlay.addEventListener('click', () => setPaused(!paused));

  /* 11. Teclado: teclas de puntero de presentación */
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    showUI();
    const k = e.key;
    // Espacio y Enter sobre un botón o enlace enfocado lo activan, no navegan
    if ((k === ' ' || k === 'Spacebar' || k === 'Enter') && e.target.closest && e.target.closest('button, a')) return;
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Spacebar') { e.preventDefault(); nav(want + 1); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); nav(want - 1); }
    else if (k === 'Home') { e.preventDefault(); nav(0); }
    else if (k === 'p' || k === 'P' || k === 'k' || k === 'K') { if (!e.repeat) setPaused(!paused); }
    else if ((k === 'f' || k === 'F') && !e.repeat) alternarPantallaCompleta();
    else if (k === 'Escape' && enPantallaCompleta()) salirPantallaCompleta();
  });

  /* 12. Mouse: clic en las mitades. Táctil: un toque muestra u oculta los controles y
         deslizar navega. Los controles y los botones superiores nunca navegan.
         En el modo girado, la izquierda y la derecha de lo que ve la persona están sobre
         el eje vertical físico: rotate(90deg) lleva la x del lienzo a la y de la pantalla. */
  const enControles = el => !!(el && el.closest && el.closest('.controles, .fs-btn, a, button'));
  const girada = () => modo === 'g';
  let lastPointer = 'mouse', sw = null;
  addEventListener('pointerdown', e => {
    lastPointer = e.pointerType || 'mouse';
    sw = (lastPointer !== 'mouse' && !enControles(e.target))
      ? { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId } : null;
  }, { passive: true });
  addEventListener('pointerup', e => {
    if (!sw || e.pointerId !== sw.id) return;
    let dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    const dt = Math.max(1, e.timeStamp - sw.t);
    sw = null;
    if (girada()) [dx, dy] = [dy, -dx];          // desplazamiento en ejes del lienzo
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax > ay && (ax >= SWIPE_PX || (ax >= SWIPE_MIN && ax / dt > SWIPE_V))) nav(dx < 0 ? want + 1 : want - 1);
    else if (ax < SWIPE_MIN && ay < SWIPE_MIN) toggleUI();
  }, { passive: true });
  addEventListener('pointercancel', () => { sw = null; });
  addEventListener('click', e => {
    if (enControles(e.target)) return;
    const tipo = e.pointerType || lastPointer;
    if (tipo !== 'mouse') return;                // táctil: lo resuelve pointerup
    const derecha = girada()
      ? e.clientY >= (root.clientHeight || innerHeight) / 2
      : e.clientX >= (root.clientWidth || innerWidth) / 2;
    nav(derecha ? want + 1 : want - 1);
  });

  /* Inicio */
  fit();
  hydrate(0); hydrate(1);
  slides[0].classList.add('is-anim');
  if (reduce) sVideo.classList.add('logo-in');
  resetBar();
  showUI();
  requestWake();
  quizaSugerir();
  const inicio = seq;
  ready(0, 4000).then(() => {                    // resetBar otra vez: ya se conoce la duración del video
    if (seq !== inicio || running()) return;     // si ya se navegó, no pisar el estado nuevo
    resetBar(); run();
  });
})();
