// Retos de acordes: sale un acorde mayor o menor, lo tocas en tu piano y compruebas. No usa sonido ni internet.
// La lógica (nombres de notas, inversiones, estadísticas) no usa el DOM y se prueba en test/. La pantalla se abre desde Practicar.
(function (raiz) {
  'use strict';
  const LETRAS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const SIMBOLO = { '-2': 'bb', '-1': 'b', '0': '', '1': '#', '2': '##' };
  // Las 12 raíces de cada calidad, escritas como se usan en la práctica (Db, Eb, F#, Ab, Bb / C#m, G#m...).
  const RAICES = {
    M: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
    m: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']
  };
  const POSICIONES = ['Posición fundamental', '1ª inversión', '2ª inversión'];
  const CORTAS = ['fundamental', '1ª inv.', '2ª inv.'];

  // --- acordes ---
  function acorde(raizNombre, calidad) {
    const l = raizNombre[0], a = raizNombre.length > 1 ? (raizNombre[1] === '#' ? 1 : -1) : 0;
    const pcRaiz = (PC[l] + a + 12) % 12, base = LETRAS.indexOf(l);
    const pasos = calidad === 'm' ? [0, 3, 7] : [0, 4, 7];
    const tonos = pasos.map((p, i) => {
      const letra = LETRAS[(base + [0, 2, 4][i]) % 7], pc = (pcRaiz + p) % 12;
      const alt = ((((pc - PC[letra] + 6) % 12) + 12) % 12) - 6;     // alteración de esa letra (-6..5)
      return { pc, nombre: letra + SIMBOLO[alt] };
    });
    return { raiz: raizNombre, calidad, nombre: raizNombre + (calidad === 'm' ? 'm' : ''), tonos };
  }
  // Notas de grave a agudo para una posición (0 fundamental, 1 y 2 inversiones) y sus números MIDI en el teclado
  // dibujado (C4 = 60 hasta B5 = 83). El bajo siempre queda entre 60 y 71, así que nada se sale del teclado.
  function posicion(ac, inv) {
    const orden = [0, 1, 2].map(i => ac.tonos[(i + inv) % 3]);
    const midis = [60 + orden[0].pc];
    for (const t of orden.slice(1)) { const m = midis[midis.length - 1]; midis.push(m + ((((t.pc - (m % 12)) % 12) + 12) % 12)); }
    return { notas: orden.map(t => t.nombre), midis };
  }
  const calidadesDe = op => (op.calidad === 'M' ? ['M'] : op.calidad === 'm' ? ['m'] : ['M', 'm']);
  // Retos que fallas (y que encajan con lo que elegiste ahora), con más peso mientras más los has fallado.
  function debiles(est, op = {}) {
    const cals = calidadesDe(op), out = [];
    for (const [item, x] of Object.entries(est.items)) {
      if (!describir(item) || x.v - x.a < 1 || x.a / x.v >= 0.8) continue;
      const [nombre, calidad, inv] = item.split('|');
      if (cals.includes(calidad) && (op.inversiones || Number(inv) === 0)) out.push({ item, nombre, calidad, inv: Number(inv), peso: x.v - x.a });
    }
    return out;
  }
  function crearReto(op = {}, azar = Math.random, previo = null, est = null) {
    const cals = calidadesDe(op), flojos = op.repasar && est ? debiles(est, op) : [];
    let r;
    for (let i = 0; i < 20; i++) {
      if (flojos.length && azar() < 0.4) {                      // 4 de cada 10 retos salen de tus fallos
        let t = azar() * flojos.reduce((s, f) => s + f.peso, 0), f = flojos[flojos.length - 1];
        for (const c of flojos) { t -= c.peso; if (t < 0) { f = c; break; } }
        r = { item: f.item, raiz: f.nombre, calidad: f.calidad, inv: f.inv };
      } else {
        const calidad = cals[Math.floor(azar() * cals.length)];
        const nombre = RAICES[calidad][Math.floor(azar() * 12)];
        const inv = op.inversiones ? Math.floor(azar() * 3) : 0;
        r = { item: `${nombre}|${calidad}|${inv}`, raiz: nombre, calidad, inv };
      }
      if (r.item !== previo) break;
    }
    const ac = acorde(r.raiz, r.calidad), pos = posicion(ac, r.inv);
    return { ...r, nombre: ac.nombre, posicion: POSICIONES[r.inv], corta: CORTAS[r.inv], notas: pos.notas, midis: pos.midis };
  }
  // "Db|M|1" -> datos para mostrar; null si el texto no es un reto válido (por ejemplo, datos alterados).
  function describir(item) {
    const [raizNombre, calidad, inv] = String(item).split('|'), i = Number(inv);
    if (!RAICES[calidad] || !RAICES[calidad].includes(raizNombre) || !(i >= 0 && i <= 2) || !Number.isInteger(i)) return null;
    return { nombre: raizNombre + (calidad === 'm' ? 'm' : ''), corta: CORTAS[i] };
  }

  // --- estadísticas (por reto: veces, aciertos, suma de milisegundos de los aciertos, mejor tiempo) ---
  const vacias = () => ({ items: {} });
  const numero = x => (Number.isFinite(x) && x >= 0 ? Math.min(x, 1e9) : 0);
  function limpiar(raw) {
    const est = vacias();
    if (!raw || typeof raw !== 'object' || !raw.items || typeof raw.items !== 'object') return est;
    for (const [k, x] of Object.entries(raw.items)) {
      if (!describir(k) || !x || typeof x !== 'object') continue;
      const v = numero(x.v), a = Math.min(numero(x.a), v);
      est.items[k] = { v, a, ms: numero(x.ms), mejor: numero(x.mejor) };
    }
    return est;
  }
  function registrar(est, item, bien, ms) {
    const x = est.items[item] || (est.items[item] = { v: 0, a: 0, ms: 0, mejor: 0 });
    x.v++;
    if (bien) { x.a++; if (ms > 0) { x.ms += ms; x.mejor = x.mejor ? Math.min(x.mejor, ms) : ms; } }
    return est;
  }
  function resumen(est) {
    const filas = Object.entries(est.items).map(([item, x]) => ({ item, ...x, ...describir(item), prom: x.a ? x.ms / x.a : 0 })).filter(f => f.nombre);
    const v = filas.reduce((s, f) => s + f.v, 0), a = filas.reduce((s, f) => s + f.a, 0);
    const repasar = filas.filter(f => f.v - f.a >= 1 && f.a / f.v < 0.8).sort((p, q) => p.a / p.v - q.a / q.v || q.v - p.v).slice(0, 6);
    const lentos = filas.filter(f => f.a >= 2 && f.prom > 0).sort((p, q) => q.prom - p.prom).slice(0, 5);
    return { v, a, repasar, lentos };
  }

  const api = { RAICES, POSICIONES, acorde, posicion, crearReto, debiles, describir, vacias, limpiar, registrar, resumen, CFG: { guardia: 350, escala: 1 } };
  raiz.Retos = api;
  if (typeof document === 'undefined') return;

  // --- pantalla (dentro de la capa de Practicar) ---
  const N = raiz.Notacion;
  if (!N) return;
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) k === 'rol' ? n.setAttribute('role', v) : k.includes('-') ? n.setAttribute(k, v) : (n[k] = v);
    n.append(...kids.flat().filter(k => k != null && k !== false));
    return n;
  };
  const nodoSvg = texto => document.importNode(new DOMParser().parseFromString(texto, 'image/svg+xml').documentElement, true);
  const PREF = 'repertorio-retos-pref', EST = 'repertorio-retos-v1';
  const leer = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin espacio: no pasa nada grave */ } };
  const seg = ms => (ms / 1000).toFixed(1) + ' s';

  const PREF0 = { calidad: 'ambos', inversiones: false, tiempo: 0, teclado: true, repasar: true };
  let caja = null, volverFn = null, vista = 'menu', ses = null, pref = { ...PREF0 }, est = vacias(), reloj = null;
  const parar = () => { if (reloj) { clearInterval(reloj); reloj = null; } };
  const barra = (izq, centro) => el('div', { className: 'cbarra' }, izq, el('span', { className: 'ctitulo' }, centro));
  const atrasBtn = (texto, titulo = 'Salir') => el('button', { type: 'button', title: titulo, onclick: () => history.back() }, texto);
  const poner = (...hijos) => { caja.replaceChildren(...hijos); caja.scrollTop = 0; };

  function menu(conservar) {
    vista = 'menu'; ses = null; parar();
    const y = conservar ? caja.scrollTop : 0, r = resumen(est);
    const opcion = (campo, valor, texto) => el('button', {
      type: 'button', 'data-op': campo + ':' + valor, 'aria-pressed': String(pref[campo] === valor),
      onclick: () => { pref[campo] = valor; guardar(PREF, pref); menu(true); const b = caja.querySelector(`[data-op="${campo}:${valor}"]`); if (b) b.focus({ preventScroll: true }); }
    }, texto);
    poner(
      barra(el('button', { type: 'button', title: 'Volver a Practicar', onclick: () => { vista = 'fuera'; parar(); volverFn(); } }, '← Practicar'), 'Retos de acordes'),
      el('div', { className: 'ccuerpo', 'data-retos': '1' },
        el('p', {}, 'Sale un acorde. Tócalo en tu piano y luego compruébalo. No usa sonido ni internet.'),
        el('div', { className: 'parte' }, el('h3', {}, 'Acordes'),
          el('div', { className: 'tg', rol: 'group', 'aria-label': 'Acordes' }, opcion('calidad', 'M', 'Mayores'), opcion('calidad', 'm', 'Menores'), opcion('calidad', 'ambos', 'Ambos'))),
        el('div', { className: 'parte' }, el('h3', {}, 'Posición'),
          el('div', { className: 'tg', rol: 'group', 'aria-label': 'Posición' }, opcion('inversiones', false, 'Fundamental'), opcion('inversiones', true, 'Con inversiones'))),
        el('div', { className: 'parte' }, el('h3', {}, 'Ayudas'),
          el('p', { className: 'a' }, 'Tiempo para tocar cada acorde'),
          el('div', { className: 'tg', rol: 'group', 'aria-label': 'Tiempo por acorde' }, opcion('tiempo', 0, 'Sin límite'), opcion('tiempo', 10, '10 s'), opcion('tiempo', 6, '6 s')),
          el('p', { className: 'a' }, 'Al ver la respuesta'),
          el('div', { className: 'tg', rol: 'group', 'aria-label': 'Al ver la respuesta' }, opcion('teclado', true, 'Notas y teclado'), opcion('teclado', false, 'Solo notas')),
          el('p', { className: 'a' }, 'Repasar lo que fallo'),
          el('div', { className: 'tg', rol: 'group', 'aria-label': 'Repasar lo que fallo' }, opcion('repasar', true, 'Sí'), opcion('repasar', false, 'No'))),
        el('p', {}, el('button', { type: 'button', className: 'primario', id: 'rt-empezar-10', onclick: () => empezar(10) }, 'Empezar · 10'), ' ',
          el('button', { type: 'button', id: 'rt-empezar-20', onclick: () => empezar(20) }, 'Empezar · 20')),
        el('div', { className: 'parte', id: 'rt-progreso' }, el('h3', {}, 'Tu progreso'),
          r.v ? el('p', {}, `${r.v} retos · ${Math.round((r.a / r.v) * 100)}% bien`) : el('p', {}, 'Aún no has hecho retos.'),
          r.repasar.length ? [el('p', { className: 'a' }, 'Para repasar'), el('div', { className: 'chips' }, ...r.repasar.map(f => el('span', { className: 'chip' }, el('b', {}, f.nombre), el('i', { className: 'rom' }, f.corta + ' · ' + Math.round((f.a / f.v) * 100) + '%'))))] : null,
          r.lentos.length ? [el('p', { className: 'a' }, 'Los más lentos'), el('div', { className: 'chips' }, ...r.lentos.map(f => el('span', { className: 'chip' }, el('b', {}, f.nombre), el('i', { className: 'rom' }, f.corta + ' · ' + seg(f.prom)))))] : null)));
    caja.scrollTop = y;
  }

  function empezar(total) {
    ses = { total, i: 0, hechas: [], reto: null, fase: 'pregunta', t0: 0, ms: 0, tRevela: 0, expiro: false };
    siguiente();
  }
  function siguiente() {
    if (ses.i >= ses.total) return resultado();
    ses.reto = crearReto(pref, Math.random, ses.reto && ses.reto.item, est);
    ses.i++; ses.fase = 'pregunta'; ses.expiro = false; ses.t0 = performance.now(); vista = 'sesion';
    pintarReto();
  }
  function revelar(fase) {
    if (!ses || ses.fase !== 'pregunta') return;
    parar();
    ses.ms = Math.min(120000, Math.max(0, Math.round(performance.now() - ses.t0)));
    ses.fase = fase; ses.tRevela = performance.now();
    pintarReto();
  }
  const limite = () => pref.tiempo * 1000 * api.CFG.escala;
  function tic() {
    if (!ses || vista !== 'sesion' || ses.fase !== 'pregunta' || !caja || caja.hidden) return parar();
    const resta = limite() - (performance.now() - ses.t0), bar = document.getElementById('rt-barra'), cuenta = document.getElementById('rt-cuenta');
    if (resta <= 0) { ses.expiro = true; return revelar('visto'); }          // se acabó el tiempo: cuenta como fallo y ves la respuesta
    if (bar) bar.style.width = Math.max(0, (resta / limite()) * 100) + '%';
    if (cuenta) cuenta.textContent = 'Quedan ' + Math.ceil(resta / 1000 / api.CFG.escala) + ' s';
  }
  const enGuardia = () => performance.now() - ses.tRevela < api.CFG.guardia;     // evita que un doble toque conteste por error
  function responder(bien) {
    if (!ses || ses.fase === 'pregunta' || enGuardia()) return;
    const r = ses.reto, cuenta = bien && ses.fase === 'toque';
    registrar(est, r.item, cuenta, ses.ms); guardar(EST, est);
    ses.hechas.push({ item: r.item, nombre: r.nombre, corta: r.corta, bien: cuenta, ms: ses.ms });
    siguiente();
  }
  function pintarReto() {
    const r = ses.reto, f = ses.fase, ultimo = ses.i >= ses.total;
    const boton = (texto, id, fn, primario) => el('button', { type: 'button', id, className: primario ? 'primario' : '', onclick: fn }, texto);
    const revelado = f === 'pregunta' ? null : el('div', { className: 'parte', id: 'rt-revela', 'aria-live': 'polite' },
      ses.expiro ? el('p', { className: 'a', id: 'rt-expiro' }, 'Se acabó el tiempo.') : null,
      el('h3', {}, 'Las notas, de grave a agudo'), el('p', { className: 'rt-notas' }, r.notas.join(' – ')),
      pref.teclado ? el('div', { className: 'pr-visual' }, nodoSvg(N.svgTeclado({ marcar: r.midis }))) : null);
    const cuenta = f === 'pregunta' && pref.tiempo > 0 ? el('div', { id: 'rt-cuenta-caja' },
      el('div', { className: 'rt-pista' }, el('div', { id: 'rt-barra', className: 'rt-barra' })), el('p', { className: 'a', id: 'rt-cuenta' }, 'Quedan ' + pref.tiempo + ' s')) : null;
    const botones = f === 'pregunta' ? [boton('Ya lo toqué', 'rt-toque', () => revelar('toque'), true), boton('No me sale (ver)', 'rt-ver', () => revelar('visto'))]
      : f === 'toque' ? [el('p', { className: 'a', id: 'rt-tiempo' }, 'Tardaste ' + seg(ses.ms) + '. ¿Lo tocaste bien?'), boton('Sí, bien', 'rt-bien', () => responder(true), true), boton('Fallé', 'rt-fallo', () => responder(false))]
        : [boton(ultimo ? 'Ver resultado' : 'Siguiente', 'rt-sig', () => responder(false), true)];
    poner(
      barra(atrasBtn('← Salir', 'Salir (Esc)'), `${ses.i} / ${ses.total}`),
      el('div', { className: 'ccuerpo pr-sesion', 'data-retos': '1' },
        el('p', { className: 'rt-acorde', id: 'rt-acorde' }, r.nombre), el('p', { className: 'rt-pos' }, r.posicion),
        cuenta, el('div', { className: 'rt-botones' }, ...botones), revelado));
    parar();
    if (cuenta) reloj = setInterval(tic, 100);
    const primero = caja.querySelector('.rt-botones .primario'); if (primero) primero.focus({ preventScroll: true });
  }
  function resultado() {
    vista = 'resultado'; parar();
    const h = ses.hechas, a = h.filter(x => x.bien), total = ses.total;
    const medio = a.length ? a.reduce((s, x) => s + x.ms, 0) / a.length : 0;
    const fallos = h.filter(x => !x.bien), lentos = [...a].sort((p, q) => q.ms - p.ms).slice(0, 3);
    const chip = (x, texto) => el('span', { className: 'chip' }, el('b', {}, x.nombre), el('i', { className: 'rom' }, texto));
    poner(
      barra(atrasBtn('← Salir', 'Salir (Esc)'), 'Resultado'),
      el('div', { className: 'ccuerpo pr-sesion', 'data-retos': '1' },
        el('h2', { id: 'rt-resultado', tabIndex: -1 }, `${a.length} de ${total} bien · ${Math.round((a.length / total) * 100)}%`),
        a.length ? el('p', { className: 'a' }, 'Tiempo medio de los que tocaste bien: ' + seg(medio)) : null,
        fallos.length ? el('div', { className: 'parte' }, el('h3', {}, 'Para repasar'), el('div', { className: 'chips' }, ...fallos.map(x => chip(x, x.corta)))) : el('p', {}, 'Sin fallos.'),
        lentos.length > 1 ? el('div', { className: 'parte' }, el('h3', {}, 'Los más lentos'), el('div', { className: 'chips' }, ...lentos.map(x => chip(x, x.corta + ' · ' + seg(x.ms))))) : null,
        el('p', {}, el('button', { type: 'button', className: 'primario', id: 'rt-repetir', onclick: () => empezar(total) }, 'Repetir'), ' ', el('button', { type: 'button', id: 'rt-opciones', onclick: () => menu() }, 'Cambiar opciones'))));
    const t = document.getElementById('rt-resultado'); if (t) t.focus({ preventScroll: true });
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ses && vista === 'sesion' && ses.fase === 'pregunta' && pref.tiempo > 0) ses.t0 = performance.now();
  });

  // Atajos de teclado (PC/tablet): V = ver las notas, F = fallé. Enter ya funciona en el botón que tiene el foco.
  document.addEventListener('keydown', e => {
    if (!caja || caja.hidden || vista !== 'sesion' || !ses || !caja.querySelector('[data-retos]')) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'v' && ses.fase === 'pregunta') { e.preventDefault(); revelar('visto'); }
    else if (k === 'f' && ses.fase === 'toque') { e.preventDefault(); responder(false); }
  });

  // Practicar llama a abrir() al entrar y a atras() cuando se usa Atrás: dentro de un reto o del resultado vuelve al menú de
  // los retos (devuelve true); desde el menú devuelve false y Practicar vuelve a su propio menú.
  api.abrir = (cajaPracticar, volver) => {
    caja = cajaPracticar; volverFn = volver; ses = null;
    const g = leer(PREF) || {};
    pref = { ...PREF0, ...(typeof g === 'object' ? g : {}) };
    if (!['M', 'm', 'ambos'].includes(pref.calidad)) pref.calidad = 'ambos';
    if (![0, 6, 10].includes(pref.tiempo)) pref.tiempo = 0;
    for (const k of ['inversiones', 'teclado', 'repasar']) pref[k] = typeof pref[k] === 'boolean' ? pref[k] : PREF0[k];
    est = limpiar(leer(EST));
    menu(); caja.focus({ preventScroll: true });
  };
  api.atras = () => {
    parar();
    if (vista === 'sesion' || vista === 'resultado') { menu(); return true; }
    return false;
  };
})(typeof window !== 'undefined' ? window : globalThis);
