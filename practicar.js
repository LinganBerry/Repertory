// Pantalla "Practicar": ejercicios de lectura de notas (pentagrama y teclado) con progreso sincronizado.
// La lógica pura (preguntas, dibujo, estadísticas) está en notacion.js. Aquí: pantallas, teclado y sincronización.
// El progreso se guarda en este dispositivo y, si entraste con tu contraseña, también en el servidor (/api/progreso).
(() => {
  'use strict';
  const N = window.Notacion;
  if (!N) return;
  const $ = id => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) k === 'rol' ? n.setAttribute('role', v) : k.includes('-') ? n.setAttribute(k, v) : (n[k] = v);
    n.append(...kids.flat().filter(k => k != null && k !== false));
    return n;
  };
  // Texto SVG de notacion.js (hecho solo con números y símbolos propios) -> nodo, sin innerHTML.
  const nodoSvg = texto => document.importNode(new DOMParser().parseFromString(texto, 'image/svg+xml').documentElement, true);

  const CFG = { pausa: 650 };                                     // ms antes de pasar sola a la siguiente tras un acierto
  const SESION = 'repertorio-sesion-v3', GUARDADO = 'repertorio-practica-v1', PREF = 'repertorio-practica-pref';
  const leer = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin espacio: no pasa nada grave */ } };
  const token = () => { try { return sessionStorage.getItem(SESION) || localStorage.getItem(SESION) || ''; } catch (e) { return ''; } };
  const olvidarToken = () => { try { sessionStorage.removeItem(SESION); localStorage.removeItem(SESION); } catch (e) { /* nada */ } };
  const guardarToken = (v, fija) => { olvidarToken(); try { (fija ? localStorage : sessionStorage).setItem(SESION, v); } catch (e) { /* nada */ } };
  const nuevoId = () => { try { return crypto.randomUUID().replace(/-/g, '').slice(0, 16); } catch (e) { return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join(''); } };
  const hoy = () => new Date().toLocaleDateString('en-CA');       // AAAA-MM-DD en tu zona horaria

  // --- estado y sincronización ---
  // servidor: lo último que se sabe del servidor; pend: sesiones hechas aquí que el servidor aún no confirmó.
  const datos = leer(GUARDADO, { servidor: [], pend: [] });
  const persistir = () => guardar(GUARDADO, { servidor: datos.servidor.slice(-500), pend: datos.pend.slice(-200) });
  const todas = () => { const m = new Map(); for (const s of [...datos.servidor, ...datos.pend]) m.set(s.id, s); return [...m.values()]; };
  let sync = { estado: datos.pend.length ? 'pendiente' : 'local', texto: '' };

  async function llamar(accion, extra = {}) {
    const r = await fetch('/api/progreso', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token(), accion, ...extra }) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, j };
  }
  async function sincronizar() {
    if (!token()) { sync = { estado: datos.pend.length ? 'pendiente' : 'local' }; return pintarEstado(); }
    sync = { estado: 'sincronizando' }; pintarEstado();
    try {
      while (datos.pend.length) {
        const lote = datos.pend.slice(0, 20);
        const r = await llamar('sesiones', { sesiones: lote });
        if (r.status === 401) { olvidarToken(); sync = { estado: 'sin-pase' }; return pintarEstado(); }
        if (!r.ok) { sync = { estado: 'error', texto: r.j.error || 'No se pudo guardar.' }; return pintarEstado(); }
        const ids = new Set(lote.map(s => s.id));
        datos.servidor.push(...lote); datos.pend = datos.pend.filter(s => !ids.has(s.id)); persistir();
      }
      const r = await llamar('leer');
      if (r.status === 401) { olvidarToken(); sync = { estado: 'sin-pase' }; return pintarEstado(); }
      if (r.ok && Array.isArray(r.j.sesiones)) { datos.servidor = r.j.sesiones; persistir(); sync = { estado: 'ok' }; }
      else sync = { estado: 'error', texto: r.j.error || 'No se pudo leer el progreso.' };
    } catch (e) { sync = { estado: 'sin-red' }; }
    pintarEstado();
    if (!caja.hidden && pantalla === 'inicio') pintarInicio();
  }
  const TEXTO_ESTADO = {
    local: 'Progreso solo en este dispositivo. Entra con tu contraseña para verlo en todos.',
    pendiente: 'Hay sesiones sin sincronizar. Entra con tu contraseña para guardarlas.',
    sincronizando: 'Sincronizando…', ok: 'Sincronizado con tus otros dispositivos.',
    'sin-red': 'Sin conexión: se sincronizará cuando vuelva la señal.', 'sin-pase': 'Tu sesión venció. Entra de nuevo para sincronizar.', error: 'No se pudo sincronizar.'
  };
  const pintarEstado = () => { const n = $('pr-estado'); if (n) n.textContent = (TEXTO_ESTADO[sync.estado] || '') + (sync.texto ? ' ' + sync.texto : ''); };

  // --- pantalla ---
  const caja = el('div', { id: 'practica', hidden: true, tabIndex: -1, 'aria-modal': 'true', 'aria-label': 'Practicar' });
  caja.setAttribute('role', 'dialog');
  document.body.append(caja);
  let ses = null, origenFoco = null, temporizador = null, mod = 0, pantalla = 'inicio';
  const pref = leer(PREF, { nivel: {} });
  const nivelDe = t => pref.nivel[t] || 1;
  const pct = x => (x == null ? '—' : Math.round(x * 100) + '%');
  const mmss = ms => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const barra = (izq, centro) => el('div', { className: 'cbarra' }, izq, el('span', { className: 'ctitulo' }, centro));

  function pintarInicio() {
    clearTimeout(temporizador); ses = null; mod = 0; pantalla = 'inicio';
    const est = N.estadisticas(todas()), lista = todas();
    const hoyN = lista.filter(s => s.f === hoy()).reduce((x, s) => x + s.n, 0), racha = N.racha(lista, hoy());
    const debiles = Object.entries(est.items).filter(([k, i]) => /^(sol|fa|tec|tecla):/.test(k) && i.v >= 3 && i.a / i.v < 0.8).sort((a, b) => a[1].a / a[1].v - b[1].a / b[1].v).slice(0, 3);
    const pass = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña', id: 'pr-pass', 'aria-label': 'Contraseña del editor' });
    const rec = el('input', { type: 'checkbox', id: 'pr-rec' });
    const msg = el('p', { className: 'aviso-e', id: 'pr-msg' });
    const entrar = async () => {
      if (!pass.value) { pass.focus(); return; }
      msg.textContent = 'Entrando…';
      try {
        const r = await fetch('/api/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave: pass.value }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.token) { msg.textContent = j.error || 'No se pudo entrar (error ' + r.status + ').'; pass.select(); return; }
        guardarToken(j.token, rec.checked); pass.value = ''; await sincronizar(); pintarInicio();
      } catch (e) { msg.textContent = 'Sin conexión con el servidor.'; }
    };
    pass.addEventListener('keydown', e => { if (e.key === 'Enter') entrar(); });
    const conPase = !!token();
    const estado = el('div', { className: 'parte' },
      el('p', { className: 'pr-datos' }, el('b', {}, 'Hoy: '), hoyN + ' preguntas · ', el('b', {}, 'Racha: '), racha + (racha === 1 ? ' día' : ' días')),
      el('p', { className: 'a', id: 'pr-estado', 'aria-live': 'polite' }, TEXTO_ESTADO[sync.estado] || ''),
      !conPase && el('details', {}, el('summary', {}, 'Entrar para sincronizar'),
        el('label', { className: 'campo' }, el('span', {}, 'Contraseña del editor'), pass),
        el('label', { className: 'campo' }, rec, ' Recordar en este dispositivo (30 días)'),
        el('p', {}, el('button', { type: 'button', className: 'primario', onclick: entrar }, 'Entrar')), msg),
      conPase && el('p', {}, el('button', { type: 'button', onclick: sincronizar }, 'Sincronizar ahora'), ' ', el('button', { type: 'button', onclick: () => { olvidarToken(); sync = { estado: datos.pend.length ? 'pendiente' : 'local' }; pintarInicio(); } }, 'Cerrar sesión')));
    const repaso = debiles.length ? el('div', { className: 'parte' }, el('h3', {}, 'Para repasar'),
      el('div', { className: 'chips' }, ...debiles.map(([item, i]) => el('span', { className: 'chip' }, el('b', {}, item.replace(/^[a-z]+:/, '')), el('i', { className: 'rom' }, pct(i.a / i.v)))))) : null;
    const grupos = {};
    for (const [id, T] of Object.entries(N.TEMAS)) (grupos[T.grupo] || (grupos[T.grupo] = [])).push([id, T]);
    const tarjetas = Object.entries(grupos).map(([g, temas]) => el('section', {}, el('h2', { className: 'pr-grupo' }, g),
      ...temas.map(([id, T]) => {
        const nv = nivelDe(id);
        return el('div', { className: 'parte pr-tema', 'data-tema': id },
          el('h3', {}, T.nombre),
          el('div', { className: 'tg', rol: 'group', 'aria-label': 'Nivel de ' + T.nombre },
            ...T.niveles.map(n => el('button', { type: 'button', 'aria-pressed': String(n.id === nv), title: n.nombre, onclick: () => { pref.nivel[id] = n.id; guardar(PREF, pref); pintarInicio(); $('practica').querySelector(`[data-tema="${id}"] [aria-pressed="true"]`)?.focus(); } },
              n.id + ' · ' + n.nombre, el('small', { className: 'pr-pct' }, ' ' + pct(N.precision(est, id, n.id)))))),
          el('p', {}, el('button', { type: 'button', className: 'primario', onclick: () => empezar(id, nv, 10) }, 'Empezar · 10'), ' ', el('button', { type: 'button', onclick: () => empezar(id, nv, 20) }, 'Empezar · 20')));
      })));
    caja.replaceChildren(barra(el('button', { type: 'button', title: 'Volver (Esc)', onclick: () => history.back() }, '← Volver'), 'Practicar'),
      el('div', { className: 'ccuerpo' }, estado, repaso, ...tarjetas,
        el('p', { className: 'a' }, 'Atajos: letras A–G para responder · # o + sube, - baja · Enter o Espacio para seguir · Esc para salir.')));
  }

  // --- sesión ---
  function empezar(tema, nivel, total) {
    ses = { tema, nivel, total, i: 0, hechas: [], t0: performance.now(), fase: 'pregunta', previa: null, est: N.estadisticas(todas()), errores: [] };
    mod = 0; pantalla = 'sesion'; siguiente(true);
  }
  function siguiente(primera) {
    if (!ses) return;
    if (!primera && ses.fase !== 'feedback') return;
    clearTimeout(temporizador);
    if (ses.i >= ses.total) return terminar();
    ses.preg = N.crearPregunta(ses.tema, ses.nivel, ses.est, Math.random, ses.previa);
    ses.previa = ses.preg.item; ses.fase = 'pregunta'; ses.tq = performance.now(); mod = 0;
    pintarPregunta();
  }
  function pintarPregunta(feedback) {
    const T = N.TEMAS[ses.tema], p = ses.preg, niv = T.niveles.find(n => n.id === ses.nivel), b = N.botones(ses.tema, ses.nivel);
    const hechas = ses.hechas.length, aciertos = ses.hechas.filter(h => h[1]).length;
    let visual;
    if (p.tipo === 'pentagrama') visual = nodoSvg(N.svgPentagrama(p.clave, p.nota));
    else if (p.tipo === 'teclado') visual = nodoSvg(N.svgTeclado({ marcar: [p.midi], clases: feedback ? { [p.midi]: feedback.ok ? 'pk-ok' : 'pk-mal' } : {} }));
    else {
      const clases = {};
      if (feedback) for (const o of [4, 5]) clases[12 * (o + 1) + p.respuesta.pc] = 'pk-ok';
      if (feedback && !feedback.ok && feedback.tocada != null) clases[feedback.tocada] = 'pk-mal';
      visual = nodoSvg(N.svgTeclado({ interactivo: !feedback, clases }));
    }
    const area = el('div', { className: 'pr-visual' }, p.tipo === 'tecla' ? el('p', { className: 'pr-pedido', 'aria-live': 'polite' }, 'Toca la tecla: ', el('b', {}, N.NOMBRES_PC[p.respuesta.pc].replace(/#/g, '♯').replace(/b/g, '♭'))) : null, visual);
    let respuestas = null;
    if (b.tipo === 'letras') {
      respuestas = el('div', { className: 'pr-resp' },
        b.alteraciones && el('div', { className: 'tg pr-mod', rol: 'group', 'aria-label': 'Alteración' },
          ...[['-1', '♭ bemol'], ['0', '♮ natural'], ['1', '♯ sostenido']].map(([v, t]) => el('button', { type: 'button', 'data-mod': v, 'aria-pressed': String(String(mod) === v), onclick: () => { mod = Number(v); refrescarMod(); } }, t))),
        el('div', { className: 'pr-letras' }, ...b.letras.map(l => el('button', { type: 'button', 'data-letra': l, disabled: !!feedback, onclick: () => responder({ l, a: b.alteraciones ? mod : 0 }) }, l))));
    } else if (b.tipo === 'pcs') {
      respuestas = el('div', { className: 'pr-resp' }, el('div', { className: 'pr-letras' }, ...b.pcs.map(x => el('button', { type: 'button', 'data-pc': x.pc, disabled: !!feedback, onclick: () => responder({ pc: x.pc }) }, x.texto.replace(/#/g, '♯').replace(/b/g, '♭')))));
    }
    const cierre = feedback && el('div', { className: 'pr-feedback ' + (feedback.ok ? 'ok' : 'mal'), rol: 'status' },
      el('p', {}, feedback.ok ? '✓ Correcto' : '✗ ' + feedback.texto),
      !feedback.ok && el('p', {}, el('button', { type: 'button', className: 'primario', id: 'pr-sig', onclick: () => siguiente() }, ses.i >= ses.total ? 'Ver resultado' : 'Siguiente')));
    caja.replaceChildren(
      barra(el('button', { type: 'button', title: 'Salir (Esc)', onclick: () => history.back() }, '← Salir'), `${Math.min(hechas + (feedback ? 0 : 1), ses.total)} / ${ses.total}`),
      el('div', { className: 'ccuerpo pr-sesion' },
        el('p', { className: 'a' }, T.nombre + ' · nivel ' + niv.id + ' · ' + niv.nombre + ' · ' + pct(hechas ? aciertos / hechas : null)),
        area, respuestas, cierre));
    if (p.tipo === 'tecla' && !feedback) {
      const svg = area.querySelector('svg');
      svg.addEventListener('click', e => { const k = e.target.closest && e.target.closest('[data-midi]'); if (k) responder({ pc: Number(k.getAttribute('data-midi')) % 12, midi: Number(k.getAttribute('data-midi')) }); });
      svg.addEventListener('keydown', e => { const k = e.target.closest && e.target.closest('[data-midi]'); if (k && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); responder({ pc: Number(k.getAttribute('data-midi')) % 12, midi: Number(k.getAttribute('data-midi')) }); } });
    }
    if (feedback && !feedback.ok) $('pr-sig')?.focus();
  }
  const refrescarMod = () => caja.querySelectorAll('[data-mod]').forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('data-mod') === String(mod))));

  function responder(resp) {
    if (!ses || ses.fase !== 'pregunta') return;
    const p = ses.preg, ok = N.comprobar(p, resp), ms = Math.min(120000, Math.max(0, Math.round(performance.now() - ses.tq)));
    ses.fase = 'feedback'; ses.i++; ses.hechas.push([p.item, ok ? 1 : 0, ms]);
    const dicho = p.tipo === 'pentagrama' ? N.bonito({ l: resp.l, a: resp.a || 0 }) : N.NOMBRES_PC[((resp.pc % 12) + 12) % 12].replace(/#/g, '♯').replace(/b/g, '♭');
    const era = p.tipo === 'pentagrama' ? N.bonito(p.nota) : p.etiqueta.replace(/#/g, '♯').replace(/b/g, '♭');
    if (!ok) ses.errores.push({ item: p.item, era, dicho });
    pintarPregunta({ ok, texto: 'Era ' + era + (p.tipo === 'tecla' ? '' : ' (dijiste ' + dicho + ')'), tocada: resp.midi });
    if (ok) temporizador = setTimeout(() => siguiente(), CFG.pausa);
  }

  function guardarSesion() {
    if (!ses || !ses.hechas.length) return null;
    const n = Math.min(100, ses.hechas.length), q = ses.hechas.slice(0, n);
    const s = { id: nuevoId(), t: ses.tema, l: ses.nivel, f: hoy(), n, a: q.filter(h => h[1]).length, ms: Math.min(3600000, q.reduce((x, h) => x + h[2], 0)), q };
    datos.pend.push(s); persistir(); sync = { estado: 'pendiente' };
    if (token()) sincronizar();
    return s;
  }
  function terminar() {
    clearTimeout(temporizador);
    const s = guardarSesion(), cfg = ses;
    ses = null; pantalla = 'resultado';
    const est = N.estadisticas(todas());
    const repasar = Object.entries(est.items).filter(([k, i]) => k.startsWith(cfg.tema + ':') || k.startsWith('tec:') || k.startsWith('tecla:')).filter(([, i]) => i.v >= 2 && i.a / i.v < 0.8).sort((a, b) => a[1].a / a[1].v - b[1].a / b[1].v).slice(0, 3);
    caja.replaceChildren(barra(el('button', { type: 'button', onclick: () => history.back() }, '← Salir'), 'Resultado'),
      el('div', { className: 'ccuerpo pr-sesion' },
        el('h2', { id: 'pr-resultado', tabIndex: -1 }, s ? `${s.a} de ${s.n} · ${pct(s.a / s.n)}` : 'Sin respuestas'),
        s && el('p', { className: 'a' }, `Tiempo: ${mmss(s.ms)} · ${Math.round(s.ms / s.n / 100) / 10} s por pregunta`),
        cfg.errores.length ? el('div', { className: 'parte' }, el('h3', {}, 'Fallos de esta sesión'), el('div', { className: 'chips' }, ...cfg.errores.map(e => el('span', { className: 'chip' }, el('b', {}, e.era), el('i', { className: 'rom' }, 'dijiste ' + e.dicho))))) : el('p', {}, 'Sin fallos. 👏'),
        repasar.length ? el('div', { className: 'parte' }, el('h3', {}, 'Para repasar'), el('div', { className: 'chips' }, ...repasar.map(([k, i]) => el('span', { className: 'chip' }, el('b', {}, k.replace(/^[a-z]+:/, '')), el('i', { className: 'rom' }, pct(i.a / i.v)))))) : null,
        el('p', {}, el('button', { type: 'button', className: 'primario', id: 'pr-repetir', onclick: () => empezar(cfg.tema, cfg.nivel, cfg.total) }, 'Repetir'), ' ',
          el('button', { type: 'button', onclick: () => { pintarInicio(); } }, 'Otro ejercicio')),
        el('p', { className: 'a', id: 'pr-estado', 'aria-live': 'polite' }, TEXTO_ESTADO[sync.estado] || '')));
    $('pr-resultado').focus();
  }

  // --- teclado del ordenador / tablet con teclado ---
  document.addEventListener('keydown', e => {
    if (caja.hidden || !ses || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (ses.fase === 'feedback' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); siguiente(); return; }
    if (ses.fase !== 'pregunta') return;
    const b = N.botones(ses.tema, ses.nivel);
    if (b.tipo === 'ninguno') return;
    if (e.key === '#' || e.key === '+') { mod = 1; refrescarMod(); return; }
    if (e.key === '-') { mod = -1; refrescarMod(); return; }
    if (e.key === '0' || e.key === '=') { mod = 0; refrescarMod(); return; }
    const k = e.key.toUpperCase();
    if (!/^[A-G]$/.test(k)) return;
    e.preventDefault();
    if (b.tipo === 'letras') return responder({ l: k, a: b.alteraciones ? mod : 0 });
    const pc = (N.PC[k] + mod + 12) % 12;
    if (b.pcs.some(x => x.pc === pc)) responder({ pc });
  });

  // --- abrir y cerrar ---
  function abrir() {
    origenFoco = $('practica-btn');
    history.pushState({ practica: true }, '');
    caja.hidden = false; document.body.classList.add('fija');
    pintarInicio(); caja.focus({ preventScroll: true }); caja.scrollTop = 0;
    if (token()) sincronizar();
  }
  function cerrar() {
    if (ses && ses.hechas.length >= 3) guardarSesion();        // una sesión a medias se conserva si respondiste 3 o más
    clearTimeout(temporizador); ses = null;
    caja.hidden = true; document.body.classList.remove('fija');
    const o = origenFoco && origenFoco.isConnected ? origenFoco : $('practica-btn');
    if (o) setTimeout(() => o.focus({ preventScroll: true }), 0);
    origenFoco = null;
  }
  window.addEventListener('popstate', () => { if (!caja.hidden) cerrar(); });
  $('practica-btn').addEventListener('click', abrir);
  window.addEventListener('online', () => { if (token() && datos.pend.length) sincronizar(); });
  window.RepertorioPractica = { CFG, datos, todas, sincronizar, empezar, responder: r => responder(r), estadoSesion: () => ses };
})();
