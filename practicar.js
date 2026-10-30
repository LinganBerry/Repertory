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

  const CFG = { pausa: 650, minutos: 15 };                                     // ms antes de pasar sola a la siguiente tras un acierto
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
  let ses = null, origenFoco = null, temporizador = null, mod = 0, pantalla = 'inicio', modRetos = null;   // modRetos: Retos o Progresiones, el que esté abierto
  let yInicio = 0;   // hasta dónde habías bajado en el menú; al volver de una sesión, lección o estadísticas regresas ahí
  const dejarInicio = () => { if (pantalla === 'inicio') yInicio = caja.scrollTop; };
  const pref = leer(PREF, { nivel: {} });
  const nivelDe = t => pref.nivel[t] || 1;
  const pct = x => (x == null ? '—' : Math.round(x * 100) + '%');
  const mmss = ms => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const barra = (izq, centro) => el('div', { className: 'cbarra' }, izq, el('span', { className: 'ctitulo' }, centro));

  function pintarInicio() {
    const yVuelta = pantalla === 'inicio' ? caja.scrollTop : yInicio;
    clearTimeout(temporizador); ses = null; mod = 0; pantalla = 'inicio'; window.RepertorioAudio?.detener();
    const est = N.estadisticas(todas()), lista = todas();
    const hoyN = lista.filter(s => s.f === hoy()).reduce((x, s) => x + s.n, 0), racha = N.racha(lista, hoy());
    const debiles = Object.entries(est.items).filter(([k, i]) => /^(sol|fa|tec|tecla|ia|id|ih|ac|as|af|an|eg):/.test(k) && i.v >= 3 && i.a / i.v < 0.8).sort((a, b) => a[1].a / a[1].v - b[1].a / b[1].v).slice(0, 3);
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
      el('div', { className: 'chips' }, ...debiles.map(([item, i]) => el('span', { className: 'chip' }, el('b', {}, N.rotulo(item)), el('i', { className: 'rom' }, pct(i.a / i.v)))))) : null;
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
          el('p', {}, el('button', { type: 'button', className: 'primario', onclick: () => empezar(id, nv, 10) }, 'Empezar · 10'), ' ', el('button', { type: 'button', onclick: () => empezar(id, nv, 20) }, 'Empezar · 20'),
            window.Lecciones && window.Lecciones.dePorTema(id) ? [' ', el('button', { type: 'button', className: 'b-leccion', onclick: () => pintarLeccion(id) }, '📖 Lección')] : null));
      })));
    const retos = window.Retos && window.Retos.abrir ? el('div', { className: 'parte', id: 'pr-retos' }, el('h3', {}, 'Retos de acordes'),
      el('p', {}, 'Tócalos en tu piano y compruébalos. Mayores y menores, en los 12 tonos. Sin sonido ni internet.'),
      el('p', {}, el('button', { type: 'button', className: 'primario', id: 'pr-retos-ir', onclick: pintarRetos }, 'Abrir retos'))) : null;
    const progs = window.Progresiones && window.Progresiones.abrir ? el('div', { className: 'parte', id: 'pr-progs' }, el('h3', {}, 'Retos de progresiones'),
      el('p', {}, 'Progresiones de tus canciones en números romanos, en el tono que salga. Tócalas en tu piano y compruébalas. Sin sonido ni internet.'),
      el('p', {}, el('button', { type: 'button', className: 'primario', id: 'pr-progs-ir', onclick: pintarProgresiones }, 'Abrir progresiones'))) : null;
    const escs = window.Escalas && window.Escalas.abrir ? el('div', { className: 'parte', id: 'pr-escalas' }, el('h3', {}, 'Retos de escalas y modos'),
      el('p', {}, 'Una escala o un modo en una tónica al azar. Tócala en tu piano y compruébala. Sin sonido ni internet.'),
      el('p', {}, el('button', { type: 'button', className: 'primario', id: 'pr-escalas-ir', onclick: pintarEscalas }, 'Abrir escalas y modos'))) : null;
    const prep = window.Preparar && window.Preparar.tarjeta ? window.Preparar.tarjeta() : null;
    const diaria = el('div', { className: 'parte', id: 'pr-diaria' }, el('h3', {}, 'Sesión diaria'),
      el('p', {}, 'Mezcla de todos los temas, ' + CFG.minutos + ' minutos. Sale más lo que menos dominas y lo que hace más tiempo que no practicas.'),
      el('p', {}, el('button', { type: 'button', className: 'primario', id: 'pr-diaria-ir', onclick: () => empezarDiaria() }, 'Empezar sesión diaria · ' + CFG.minutos + ' min'), ' ',
        el('button', { type: 'button', id: 'pr-stats-ir', onclick: () => pintarEstadisticas() }, '📊 Estadísticas')));
    caja.replaceChildren(barra(el('button', { type: 'button', title: 'Volver (Esc)', onclick: () => history.back() }, '← Volver'), 'Practicar'),
      el('div', { className: 'ccuerpo' }, estado, diaria, retos, progs, escs, prep, repaso, ...tarjetas,
        el('p', { className: 'a' }, 'Atajos: letras A–G para responder · # o + sube, - baja · Enter o Espacio para seguir · Esc para salir.')));
    caja.scrollTop = yVuelta;
  }

  // --- estadísticas ---
  function pintarRetos() {
    dejarInicio();
    clearTimeout(temporizador); ses = null; mod = 0; pantalla = 'retos'; modRetos = window.Retos;
    window.RepertorioAudio?.detener();
    window.Retos.abrir(caja, pintarInicio);
  }
  function pintarEscalas() {
    dejarInicio();
    clearTimeout(temporizador); ses = null; mod = 0; pantalla = 'retos'; modRetos = window.Escalas;
    window.RepertorioAudio?.detener();
    window.Escalas.abrir(caja, pintarInicio);
  }
  function pintarProgresiones() {
    dejarInicio();
    clearTimeout(temporizador); ses = null; mod = 0; pantalla = 'retos'; modRetos = window.Progresiones;
    window.RepertorioAudio?.detener();
    window.Progresiones.abrir(caja, pintarInicio);
  }
  function pintarEstadisticas() {
    dejarInicio();
    clearTimeout(temporizador); ses = null; pantalla = 'estadisticas'; window.RepertorioAudio?.detener();
    const lista = todas(), est = N.estadisticas(lista), semana = N.resumenSemana(lista, hoy()), deb = N.debiles(est, 8), len = N.lentos(est, 5);
    const total = lista.reduce((x, s) => x + s.n, 0), aciertos = lista.reduce((x, s) => x + s.a, 0);
    const dia = f => new Date(f + 'T12:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric' });
    const filas = Object.entries(est.temas).map(([k, t]) => { const i = k.lastIndexOf(':'), tema = k.slice(0, i), nivel = Number(k.slice(i + 1)); return { tema, nivel, t }; })
      .filter(x => N.TEMAS[x.tema]).sort((a, b) => Object.keys(N.TEMAS).indexOf(a.tema) - Object.keys(N.TEMAS).indexOf(b.tema) || a.nivel - b.nivel);
    caja.replaceChildren(barra(el('button', { type: 'button', title: 'Volver a Practicar', onclick: () => pintarInicio() }, '← Practicar'), 'Estadísticas'),
      el('div', { className: 'ccuerpo' },
        el('h2', { id: 'pr-stats', tabIndex: -1 }, total ? `${total} preguntas · ${pct(aciertos / total)}` : 'Aún no hay práctica'),
        !total && el('p', {}, 'Haz una sesión y aquí verás tu progreso.'),
        total ? el('div', { className: 'parte' }, el('h3', {}, 'Últimos 7 días'), el('div', { className: 'chips' }, ...semana.map(d => el('span', { className: 'chip' }, el('b', {}, dia(d.f)), el('i', { className: 'rom' }, d.n ? d.n + ' · ' + pct(d.a / d.n) : '—'))))) : null,
        filas.length ? el('div', { className: 'parte' }, el('h3', {}, 'Por tema'), el('ul', { className: 'pr-puntos' }, ...filas.map(x => el('li', {}, `${N.TEMAS[x.tema].nombre} · nivel ${x.nivel}: ${pct(N.precision(est, x.tema, x.nivel))} reciente · ${x.t.n} preguntas`)))) : null,
        deb.length ? el('div', { className: 'parte' }, el('h3', {}, 'Puntos débiles'), el('div', { className: 'chips' }, ...deb.map(d => el('span', { className: 'chip' }, el('b', {}, d.rotulo), el('i', { className: 'rom' }, pct(d.acierto) + ' · ' + d.intentos + ' int.'))))) : null,
        len.length ? el('div', { className: 'parte' }, el('h3', {}, 'Los más lentos'), el('div', { className: 'chips' }, ...len.map(d => el('span', { className: 'chip' }, el('b', {}, d.rotulo), el('i', { className: 'rom' }, d.seg + ' s'))))) : null,
        el('p', {}, el('button', { type: 'button', className: 'primario', onclick: () => empezarDiaria() }, 'Empezar sesión diaria · ' + CFG.minutos + ' min'))));
    $('pr-stats').focus(); caja.scrollTop = 0;
  }

  // --- lecciones ---
  function pintarLeccion(tema) {
    const L = window.Lecciones && window.Lecciones.dePorTema(tema);
    if (!L) return pintarInicio();
    dejarInicio();
    clearTimeout(temporizador); ses = null; pantalla = 'leccion';
    const dibujo = v => v.tipo === 'pentagrama' ? N.svgPentagrama(v.clave, N.nota(...v.nota)) : v.tipo === 'armadura' ? N.svgArmadura(v.clave, v.f) : N.svgTeclado({ marcar: v.marcar });
    const pasos = L.temas.map((t, i) => el('button', { type: 'button', className: i === 0 || L.temas.length === 1 ? 'primario' : '', 'data-practicar': t, onclick: () => empezar(t, nivelDe(t), 10) }, 'Practicar: ' + N.TEMAS[t].nombre + ' · 10'));
    caja.replaceChildren(barra(el('button', { type: 'button', title: 'Volver a Practicar', onclick: () => pintarInicio() }, '← Practicar'), 'Lección'),
      el('div', { className: 'ccuerpo leccion' },
        el('h2', { id: 'pr-leccion', tabIndex: -1 }, L.titulo),
        el('ul', { className: 'pr-puntos' }, ...L.puntos.map(x => el('li', {}, x))),
        el('div', { className: 'pr-visuales' }, ...L.visuales.map(v => el('div', { className: 'pr-visual' }, nodoSvg(dibujo(v))))),
        el('div', { className: 'pr-pasos' }, ...pasos.flatMap(b => [el('p', {}, b)]))));
    $('pr-leccion').focus(); caja.scrollTop = 0;
  }

  // --- sonido (oído) ---
  const PREGUNTA_OIDO = { asc: '¿Qué intervalo suena? (sube)', desc: '¿Qué intervalo suena? (baja)', arm: '¿Qué intervalo suena? (a la vez)', acorde: '¿Qué acorde suena?' };
  let audioTexto = '';
  const marcarAudio = t => { audioTexto = t; const n = $('pr-audio'); if (n) n.textContent = t; };
  async function reproducir() {
    const p = ses && ses.preg;
    if (!p || p.tipo !== 'oido') return;
    const A = window.RepertorioAudio;
    try {
      if (!A) throw new Error('sin audio');
      if (!A.esPiano()) marcarAudio('Cargando el piano…');
      await A.tocar(p.pasos);
      marcarAudio('');
    } catch (e) { marcarAudio('No se pudo cargar el sonido (la primera vez necesita internet). Toca “Escuchar otra vez” para reintentar.'); }
  }

  // --- sesión ---
  function empezar(tema, nivel, total) {
    dejarInicio();
    ses = { tema, nivel, total, i: 0, hechas: [], t0: performance.now(), fase: 'pregunta', previa: null, est: N.estadisticas(todas()), errores: [] };
    mod = 0; pantalla = 'sesion'; siguiente(true);
  }
  function empezarDiaria() {
    dejarInicio();
    ses = { diaria: true, tema: null, nivel: 1, total: Infinity, i: 0, hechas: [], marcas: [], t0: performance.now(), fase: 'pregunta', previa: null, previaTema: null, est: N.estadisticas(todas()), errores: [] };
    mod = 0; pantalla = 'sesion'; siguiente(true);
  }
  const restante = () => Math.max(0, CFG.minutos * 60000 - (performance.now() - ses.t0));
  function siguiente(primera) {
    if (!ses) return;
    if (!primera && ses.fase !== 'feedback') return;
    clearTimeout(temporizador);
    if (ses.diaria) {
      if (!primera && restante() <= 0) return terminar();
      const sel = N.elegirTemaDiario(ses.est, todas(), hoy(), nivelDe, Math.random, ses.previaTema);
      ses.tema = sel.tema; ses.nivel = sel.nivel; ses.previaTema = sel.tema;
    } else if (ses.i >= ses.total) return terminar();
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
    else if (p.tipo === 'armadura') visual = nodoSvg(N.svgArmadura(p.clave, p.f));
    else if (p.tipo === 'cuantas' || p.tipo === 'escala') visual = null;
    else if (p.tipo === 'oido') visual = el('div', { className: 'pr-oido' },
      el('p', { className: 'pr-pedido' }, PREGUNTA_OIDO[N.TEMAS[ses.tema].modo]),
      el('button', { type: 'button', className: 'primario pr-oir', id: 'pr-oir', onclick: () => reproducir() }, '🔊 Escuchar otra vez (R)'),
      el('p', { className: 'a', id: 'pr-audio', 'aria-live': 'polite' }, audioTexto));
    else {
      const clases = {};
      if (feedback) for (const o of [4, 5]) clases[12 * (o + 1) + p.respuesta.pc] = 'pk-ok';
      if (feedback && !feedback.ok && feedback.tocada != null) clases[feedback.tocada] = 'pk-mal';
      visual = nodoSvg(N.svgTeclado({ interactivo: !feedback, clases }));
    }
    const pedido = p.tipo === 'tecla' ? el('p', { className: 'pr-pedido', 'aria-live': 'polite' }, 'Toca la tecla: ', el('b', {}, N.NOMBRES_PC[p.respuesta.pc].replace(/#/g, '♯').replace(/b/g, '♭')))
      : p.pedido ? el('p', { className: 'pr-pedido', 'aria-live': 'polite' }, p.pedido) : null;
    const area = el('div', { className: 'pr-visual' }, pedido, visual);
    let respuestas = null;
    if (b.tipo === 'letras') {
      respuestas = el('div', { className: 'pr-resp' },
        b.alteraciones && el('div', { className: 'tg pr-mod', rol: 'group', 'aria-label': 'Alteración' },
          ...[['-1', '♭ bemol'], ['0', '♮ natural'], ['1', '♯ sostenido']].map(([v, t]) => el('button', { type: 'button', 'data-mod': v, 'aria-pressed': String(String(mod) === v), onclick: () => { mod = Number(v); refrescarMod(); } }, t))),
        el('div', { className: 'pr-letras' }, ...b.letras.map(l => el('button', { type: 'button', 'data-letra': l, disabled: !!feedback, onclick: () => responder({ l, a: b.alteraciones ? mod : 0 }) }, l))));
    } else if (b.tipo === 'opciones') {
      respuestas = el('div', { className: 'pr-resp' }, el('div', { className: 'pr-letras pr-opciones' }, ...b.opciones.map((o, i) =>
        el('button', { type: 'button', 'data-op': o.id, title: o.titulo, disabled: !!feedback, onclick: () => responder({ id: o.id }) }, i < 9 ? el('small', { className: 'pr-n' }, (i + 1) + ' ') : null, o.texto))));
    } else if (b.tipo === 'pcs') {
      respuestas = el('div', { className: 'pr-resp' }, el('div', { className: 'pr-letras' }, ...b.pcs.map(x => el('button', { type: 'button', 'data-pc': x.pc, disabled: !!feedback, onclick: () => responder({ pc: x.pc }) }, x.texto.replace(/#/g, '♯').replace(/b/g, '♭')))));
    }
    const cierre = feedback && el('div', { className: 'pr-feedback ' + (feedback.ok ? 'ok' : 'mal'), rol: 'status' },
      el('p', {}, feedback.ok ? '✓ Correcto' : '✗ ' + feedback.texto),
      !feedback.ok && el('p', {}, el('button', { type: 'button', className: 'primario', id: 'pr-sig', onclick: () => siguiente() }, ses.i >= ses.total ? 'Ver resultado' : 'Siguiente')));
    caja.replaceChildren(
      barra(el('button', { type: 'button', title: 'Salir (Esc)', onclick: () => history.back() }, '← Salir'), ses.diaria ? `Diaria · ${mmss(restante())} · ${hechas}` : `${Math.min(hechas + (feedback ? 0 : 1), ses.total)} / ${ses.total}`),
      el('div', { className: 'ccuerpo pr-sesion' },
        el('p', { className: 'a' }, T.nombre + ' · nivel ' + niv.id + ' · ' + niv.nombre + ' · ' + pct(hechas ? aciertos / hechas : null)),
        area, respuestas, cierre));
    if (p.tipo === 'tecla' && !feedback) {
      const svg = area.querySelector('svg');
      svg.addEventListener('click', e => { const k = e.target.closest && e.target.closest('[data-midi]'); if (k) responder({ pc: Number(k.getAttribute('data-midi')) % 12, midi: Number(k.getAttribute('data-midi')) }); });
      svg.addEventListener('keydown', e => { const k = e.target.closest && e.target.closest('[data-midi]'); if (k && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); responder({ pc: Number(k.getAttribute('data-midi')) % 12, midi: Number(k.getAttribute('data-midi')) }); } });
    }
    if (feedback && !feedback.ok) $('pr-sig')?.focus();
    if (p.tipo === 'oido' && (!feedback || !feedback.ok)) reproducir();
  }
  const refrescarMod = () => caja.querySelectorAll('[data-mod]').forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('data-mod') === String(mod))));

  function responder(resp) {
    if (!ses || ses.fase !== 'pregunta') return;
    const p = ses.preg, ok = N.comprobar(p, resp), ms = Math.min(120000, Math.max(0, Math.round(performance.now() - ses.tq)));
    ses.fase = 'feedback'; ses.i++; ses.hechas.push([p.item, ok ? 1 : 0, ms]);
    if (ses.diaria) {
      ses.marcas.push([ses.tema, ses.nivel]);
      const it = ses.est.items[p.item] || (ses.est.items[p.item] = { v: 0, a: 0, ms: 0 }); it.v++; it.a += ok ? 1 : 0; it.ms += ms;   // la sesión se adapta sobre la marcha
    }
    const T = N.TEMAS[ses.tema];
    const dicho = p.tipo === 'oido' ? T.datos.find(d => d.id === resp.id).nombre : (p.tipo === 'armadura' || p.tipo === 'cuantas') ? N.botones(ses.tema, ses.nivel).opciones.find(o => o.id === resp.id).texto : (p.tipo === 'pentagrama' || p.tipo === 'escala') ? N.bonito({ l: resp.l, a: resp.a || 0 }) : N.NOMBRES_PC[((resp.pc % 12) + 12) % 12].replace(/#/g, '♯').replace(/b/g, '♭');
    const era = p.tipo === 'pentagrama' ? N.bonito(p.nota) : p.etiqueta.replace(/#/g, '♯').replace(/b/g, '♭');
    if (!ok) ses.errores.push({ item: p.item, era: p.contexto ? p.contexto + ': ' + era : era, dicho });
    const detalle = p.tipo === 'oido' ? ' (' + p.notas.map(N.nombreMidi).join(T.modo === 'asc' || T.modo === 'desc' ? ' → ' : ' + ').replace(/#/g, '♯') + ')' : p.detalle ? ' ' + p.detalle : '';
    pintarPregunta({ ok, texto: 'Era ' + era + detalle + (p.tipo === 'tecla' ? '' : ' · dijiste ' + dicho), tocada: resp.midi });
    if (ok) temporizador = setTimeout(() => siguiente(), CFG.pausa);
  }

  // Sesión diaria: se guarda una sesión normal por cada tema y nivel que salió (así las estadísticas no cambian).
  function guardarDiaria() {
    const grupos = new Map();
    ses.hechas.forEach((h, i) => { const [t, l] = ses.marcas[i], k = t + ':' + l; if (!grupos.has(k)) grupos.set(k, { tema: t, nivel: l, q: [] }); grupos.get(k).q.push(h); });
    const total = { a: 0, n: 0, ms: 0, grupos: [] };
    for (const g of grupos.values()) {
      const q = g.q.slice(0, 100), a = q.filter(h => h[1]).length, ms = Math.min(3600000, q.reduce((x, h) => x + h[2], 0));
      datos.pend.push({ id: nuevoId(), t: g.tema, l: g.nivel, f: hoy(), n: q.length, a, ms, q });
      total.a += a; total.n += q.length; total.ms += ms; total.grupos.push({ tema: g.tema, nivel: g.nivel, a, n: q.length });
    }
    persistir(); sync = { estado: 'pendiente' };
    if (token()) sincronizar();
    return total;
  }
  function guardarSesion() {
    if (!ses || !ses.hechas.length) return null;
    if (ses.diaria) return guardarDiaria();
    const n = Math.min(100, ses.hechas.length), q = ses.hechas.slice(0, n);
    const s = { id: nuevoId(), t: ses.tema, l: ses.nivel, f: hoy(), n, a: q.filter(h => h[1]).length, ms: Math.min(3600000, q.reduce((x, h) => x + h[2], 0)), q };
    datos.pend.push(s); persistir(); sync = { estado: 'pendiente' };
    if (token()) sincronizar();
    return s;
  }
  function terminar() {
    clearTimeout(temporizador);
    window.RepertorioAudio?.detener();
    const s = guardarSesion(), cfg = ses;
    ses = null; pantalla = 'resultado';
    const est = N.estadisticas(todas());
    const prefijos = new Set(cfg.hechas.map(h => h[0].split(':')[0]));
    const repasar = Object.entries(est.items).filter(([k]) => prefijos.has(k.split(':')[0])).filter(([, i]) => i.v >= 2 && i.a / i.v < 0.8).sort((a, b) => a[1].a / a[1].v - b[1].a / b[1].v).slice(0, 3);
    caja.replaceChildren(barra(el('button', { type: 'button', onclick: () => history.back() }, '← Salir'), 'Resultado'),
      el('div', { className: 'ccuerpo pr-sesion' },
        el('h2', { id: 'pr-resultado', tabIndex: -1 }, s ? `${s.a} de ${s.n} · ${pct(s.a / s.n)}` : 'Sin respuestas'),
        s && el('p', { className: 'a' }, `Tiempo: ${mmss(s.ms)} · ${Math.round(s.ms / s.n / 100) / 10} s por pregunta`),
        s && s.grupos ? el('div', { className: 'parte' }, el('h3', {}, 'Por tema'), el('div', { className: 'chips' }, ...s.grupos.map(g => el('span', { className: 'chip' }, el('b', {}, N.TEMAS[g.tema].nombre), el('i', { className: 'rom' }, g.a + '/' + g.n))))) : null,
        cfg.errores.length ? el('div', { className: 'parte' }, el('h3', {}, 'Fallos de esta sesión'), el('div', { className: 'chips' }, ...cfg.errores.map(e => el('span', { className: 'chip' }, el('b', {}, e.era), el('i', { className: 'rom' }, 'dijiste ' + e.dicho))))) : el('p', {}, 'Sin fallos. 👏'),
        repasar.length ? el('div', { className: 'parte' }, el('h3', {}, 'Para repasar'), el('div', { className: 'chips' }, ...repasar.map(([k, i]) => el('span', { className: 'chip' }, el('b', {}, N.rotulo(k)), el('i', { className: 'rom' }, pct(i.a / i.v)))))) : null,
        el('p', {}, el('button', { type: 'button', className: 'primario', id: 'pr-repetir', onclick: () => (cfg.diaria ? empezarDiaria() : empezar(cfg.tema, cfg.nivel, cfg.total)) }, cfg.diaria ? 'Otra sesión diaria' : 'Repetir'), ' ',
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
    if (b.tipo === 'opciones') {
      if (e.key.toLowerCase() === 'r') { e.preventDefault(); reproducir(); }
      else if (/^[1-9]$/.test(e.key) && b.opciones[Number(e.key) - 1]) { e.preventDefault(); responder({ id: b.opciones[Number(e.key) - 1].id }); }
      return;
    }
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
    pantalla = 'inicio'; yInicio = 0;
    caja.hidden = false; document.body.classList.add('fija');
    pintarInicio(); caja.focus({ preventScroll: true }); caja.scrollTop = 0;
    if (token()) sincronizar();
  }
  function cerrar() {
    window.RepertorioAudio?.detener();
    if (ses && ses.hechas.length >= 3) guardarSesion();        // una sesión a medias se conserva si respondiste 3 o más
    clearTimeout(temporizador); ses = null;
    caja.hidden = true; document.body.classList.remove('fija');
    const o = origenFoco && origenFoco.isConnected ? origenFoco : $('practica-btn');
    if (o) setTimeout(() => o.focus({ preventScroll: true }), 0);
    origenFoco = null;
  }
  // Atrás dentro de Practicar (sesión, resultado, lección, estadísticas) vuelve al menú de Practicar; solo desde el menú se sale.
  window.addEventListener('popstate', () => {
    if (caja.hidden) return;
    if (pantalla === 'inicio') return cerrar();
    if (pantalla === 'retos' && modRetos && modRetos.atras()) { history.pushState({ practica: true }, ''); return; }
    if (ses && ses.hechas.length >= 3) guardarSesion();        // igual que al salir: una sesión a medias se conserva
    history.pushState({ practica: true }, '');
    pintarInicio();
    caja.focus({ preventScroll: true });
  });
  $('practica-btn').addEventListener('click', abrir);
  window.addEventListener('online', () => { if (token() && datos.pend.length) sincronizar(); });
  window.RepertorioPractica = { CFG, datos, todas, sincronizar, empezar, responder: r => responder(r), estadoSesion: () => ses };
})();
