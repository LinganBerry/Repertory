// Retos de escalas y modos: sale "D dórico" (o "Bb menor armónica"...), la tocas en tu piano subiendo una octava y la compruebas.
// Los modos y las notas salen de Tonal (vendor/tonal.min.js, la misma librería de Teoría): nada inventado a mano. No usa sonido ni internet.
// La lógica no usa el DOM y se prueba en test/. La pantalla se abre desde Practicar.
(function (raiz) {
  'use strict';
  // Las 12 tónicas; si hay dos nombres (C#/Db) se elige el que dé la escala más limpia (sin dobles sostenidos ni dobles bemoles).
  const TONICAS = [['C'], ['C#', 'Db'], ['D'], ['D#', 'Eb'], ['E'], ['F'], ['F#', 'Gb'], ['G'], ['G#', 'Ab'], ['A'], ['A#', 'Bb'], ['B']];
  const MAYOR = [0, 2, 4, 5, 7, 9, 11];
  const OTRAS = [['harmonic minor', 'Menor armónica'], ['melodic minor', 'Menor melódica'], ['major pentatonic', 'Pentatónica mayor'], ['minor pentatonic', 'Pentatónica menor']];
  const ITEM = /^[a-z]+( [a-z]+)?$/;
  const EXTRA = { ionian: 'mayor', aeolian: 'menor natural' };

  const lista = (modos, tipo) => {
    const m = modos.map(x => ({ id: x[0], nombre: x[1], extra: EXTRA[x[0]] || '', grupo: 'modos' }));
    const o = OTRAS.map(x => ({ id: x[0], nombre: x[1], extra: '', grupo: 'otras' }));
    return tipo === 'modos' ? m : tipo === 'otras' ? o : [...m, ...o];
  };
  // Suma de alteraciones de las notas; un doble sostenido o doble bemol pesa mucho más (así se evita).
  const peso = notas => notas.reduce((s, n) => { const a = /^[A-G]([#b]*)/.exec(n)[1].length; return s + (a > 1 ? 100 : a); }, 0);
  function armar(T, pc, id) {
    let mejor = null;
    for (const tonica of TONICAS[pc]) {
      const s = T.Scale.get(tonica + ' ' + id);
      if (s.empty) return null;
      const p = peso(s.notes);
      if (!mejor || p < mejor.p) mejor = { tonica, notas: s.notes, intervalos: s.intervals, p };
    }
    return mejor.p >= 100 ? null : mejor;
  }
  const marca = a => (a < 0 ? '♭' : a > 0 ? '♯' : '');
  // "1 2 ♭3 4 5 6 ♭7": cada grado comparado con la escala mayor.
  function grados(T, intervalos) {
    return intervalos.map(i => { const v = T.Interval.get(i); const dif = v.semitones - MAYOR[(v.num - 1) % 7]; return { texto: marca(dif) + v.num, cambia: dif !== 0 }; });
  }

  // Elige el siguiente reto (4 de cada 10 de lo fallado si lo activaste), sin repetir el anterior.
  function crearReto({ T, modos }, op = {}, azar = Math.random, previo = null, est = null) {
    const base = lista(modos, op.tipo);
    if (!base.length) return null;
    const flojos = op.repasar && est ? base.filter(x => { const s = est.items[x.id]; return s && s.v - s.a >= 1 && s.a / s.v < 0.8; }) : [];
    for (let i = 0; i < 40; i++) {
      let p;
      if (flojos.length && azar() < 0.4) {
        const peso = x => est.items[x.id].v - est.items[x.id].a;
        let t = azar() * flojos.reduce((s, f) => s + peso(f), 0);
        p = flojos[flojos.length - 1];
        for (const f of flojos) { t -= peso(f); if (t < 0) { p = f; break; } }
      } else p = base[Math.floor(azar() * base.length)];
      if (p.id === previo && base.length > 1) continue;
      const e = armar(T, Math.floor(azar() * 12), p.id);
      if (!e) continue;
      const g = grados(T, e.intervalos);
      return { item: p.id, nombre: p.nombre, extra: p.extra, grupo: p.grupo, tonica: e.tonica,
        titulo: e.tonica + ' ' + p.nombre.toLowerCase() + (p.extra ? ' (' + p.extra + ')' : ''),
        notas: [...e.notas, e.notas[0]], grados: g.map(x => x.texto).concat('1').join(' '),
        cambia: g.length === 7 ? g.filter(x => x.cambia).map(x => x.texto) : null };
    }
    return null;
  }

  // --- estadísticas por escala o modo (veces, aciertos, suma de milisegundos de los aciertos, mejor tiempo) ---
  const vacias = () => ({ items: {} });
  const numero = x => (Number.isFinite(x) && x >= 0 ? Math.min(x, 1e9) : 0);
  function limpiar(raw) {
    const est = vacias();
    if (!raw || typeof raw !== 'object' || !raw.items || typeof raw.items !== 'object') return est;
    for (const [k, x] of Object.entries(raw.items)) {
      if (!ITEM.test(k) || !x || typeof x !== 'object') continue;
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
  function resumen(est, modos) {
    const por = new Map(lista(modos, 'todas').map(x => [x.id, x]));
    const filas = Object.entries(est.items).filter(([k]) => por.has(k)).map(([k, x]) => ({ ...por.get(k), ...x }));
    const v = filas.reduce((s, f) => s + f.v, 0), a = filas.reduce((s, f) => s + f.a, 0);
    const repasar = filas.filter(f => f.v - f.a >= 1 && f.a / f.v < 0.8).sort((p, q) => p.a / p.v - q.a / q.v || q.v - p.v).slice(0, 6);
    return { v, a, repasar };
  }

  const api = { TONICAS, OTRAS, lista, armar, grados, crearReto, vacias, limpiar, registrar, resumen, CFG: { guardia: 350 } };
  raiz.Escalas = api;
  if (typeof document === 'undefined') return;

  // --- pantalla (dentro de la capa de Practicar) ---
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) k === 'rol' ? n.setAttribute('role', v) : k.includes('-') ? n.setAttribute(k, v) : (n[k] = v);
    n.append(...kids.flat().filter(k => k != null && k !== false));
    return n;
  };
  const PREF = 'repertorio-esc-pref', EST = 'repertorio-esc-v1';
  const leer = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin espacio: no pasa nada grave */ } };
  const seg = ms => (ms / 1000).toFixed(1) + ' s';
  const PREF0 = { tipo: 'modos', repasar: true };
  let caja = null, volverFn = null, vista = 'menu', ses = null, pref = { ...PREF0 }, est = vacias(), datos = null;
  const barra = (izq, centro) => el('div', { className: 'cbarra' }, izq, el('span', { className: 'ctitulo' }, centro));
  const atrasBtn = (texto, titulo = 'Salir') => el('button', { type: 'button', title: titulo, onclick: () => history.back() }, texto);
  const poner = (...hijos) => { caja.replaceChildren(...hijos); caja.scrollTop = 0; };

  function menu(conservar) {
    vista = 'menu'; ses = null;
    const y = conservar ? caja.scrollTop : 0, r = datos ? resumen(est, datos.modos) : { v: 0, a: 0, repasar: [] };
    const opcion = (campo, valor, texto) => el('button', {
      type: 'button', 'data-op': campo + ':' + valor, 'aria-pressed': String(pref[campo] === valor),
      onclick: () => { pref[campo] = valor; guardar(PREF, pref); menu(true); const b = caja.querySelector(`[data-op="${campo}:${valor}"]`); if (b) b.focus({ preventScroll: true }); }
    }, texto);
    poner(
      barra(el('button', { type: 'button', title: 'Volver a Practicar', onclick: () => { vista = 'fuera'; volverFn(); } }, '← Practicar'), 'Retos de escalas y modos'),
      el('div', { className: 'ccuerpo', 'data-esc': '1' },
        el('p', {}, 'Sale una escala o un modo en una tónica al azar. Tócala en tu piano, subiendo una octava, y luego compruébala. No usa sonido ni internet.'),
        !datos ? el('p', { id: 'es-vacio' }, 'No se pudo cargar la teoría. Abre la pantalla Teoría una vez con internet y vuelve aquí.') : null,
        el('div', { className: 'parte' }, el('h3', {}, 'Qué practicar'),
          el('div', { className: 'tg', rol: 'group', 'aria-label': 'Qué practicar' }, opcion('tipo', 'modos', 'Los 7 modos'), opcion('tipo', 'otras', 'Otras escalas'), opcion('tipo', 'todas', 'Todo')),
          el('p', { className: 'a' }, pref.tipo === 'otras' ? 'Menor armónica, menor melódica y pentatónicas.' : 'Jónico, dórico, frigio, lidio, mixolidio, eólico y locrio.')),
        el('div', { className: 'parte' }, el('h3', {}, 'Repasar lo que fallo'),
          el('div', { className: 'tg', rol: 'group', 'aria-label': 'Repasar lo que fallo' }, opcion('repasar', true, 'Sí'), opcion('repasar', false, 'No'))),
        el('p', {}, el('button', { type: 'button', className: 'primario', id: 'es-empezar-5', disabled: !datos, onclick: () => empezar(5) }, 'Empezar · 5'), ' ',
          el('button', { type: 'button', id: 'es-empezar-10', disabled: !datos, onclick: () => empezar(10) }, 'Empezar · 10')),
        el('div', { className: 'parte', id: 'es-progreso' }, el('h3', {}, 'Tu progreso'),
          r.v ? el('p', {}, `${r.v} retos · ${Math.round((r.a / r.v) * 100)}% bien`) : el('p', {}, 'Aún no has hecho retos.'),
          r.repasar.length ? [el('p', { className: 'a' }, 'Para repasar'), el('div', { className: 'chips' }, ...r.repasar.map(f => el('span', { className: 'chip' }, el('b', {}, f.nombre), el('i', { className: 'rom' }, Math.round((f.a / f.v) * 100) + '%'))))] : null)));
    caja.scrollTop = y;
  }
  function empezar(total) { ses = { total, i: 0, hechas: [], reto: null, fase: 'pregunta', t0: 0, ms: 0, tRevela: 0 }; siguiente(); }
  function siguiente() {
    if (ses.i >= ses.total) return resultado();
    const r = crearReto(datos, pref, Math.random, ses.reto && ses.reto.item, est);
    if (!r) return menu();
    ses.reto = r; ses.i++; ses.fase = 'pregunta'; ses.t0 = performance.now(); vista = 'sesion';
    pintarReto();
  }
  function revelar(fase) {
    if (!ses || ses.fase !== 'pregunta') return;
    ses.ms = Math.min(300000, Math.max(0, Math.round(performance.now() - ses.t0)));
    ses.fase = fase; ses.tRevela = performance.now();
    pintarReto();
  }
  const enGuardia = () => performance.now() - ses.tRevela < api.CFG.guardia;     // evita que un doble toque conteste por error
  function responder(bien) {
    if (!ses || ses.fase === 'pregunta' || enGuardia()) return;
    const r = ses.reto, cuenta = bien && ses.fase === 'toque';
    registrar(est, r.item, cuenta, ses.ms); guardar(EST, est);
    ses.hechas.push({ rotulo: r.titulo, bien: cuenta, ms: ses.ms });
    siguiente();
  }
  function pintarReto() {
    const r = ses.reto, f = ses.fase, ultimo = ses.i >= ses.total;
    const boton = (texto, id, fn, primario) => el('button', { type: 'button', id, className: primario ? 'primario' : '', onclick: fn }, texto);
    const revelado = f === 'pregunta' ? null : el('div', { className: 'parte', id: 'es-revela', 'aria-live': 'polite' },
      el('h3', {}, 'Las notas'), el('p', { className: 'rt-prog', id: 'es-notas' }, r.notas.join(' ')),
      el('p', { className: 'a', id: 'es-grados' }, 'Grados: ' + r.grados),
      r.cambia ? el('p', { className: 'a', id: 'es-cambia' }, r.cambia.length ? 'Cambia respecto a la mayor: ' + r.cambia.join(' ') : 'Es la escala mayor.') : null);
    const botones = f === 'pregunta' ? [boton('Ya la toqué', 'es-toque', () => revelar('toque'), true), boton('No me sale (ver)', 'es-ver', () => revelar('visto'))]
      : f === 'toque' ? [el('p', { className: 'a', id: 'es-tiempo' }, 'Tardaste ' + seg(ses.ms) + '. ¿La tocaste bien?'), boton('Sí, bien', 'es-bien', () => responder(true), true), boton('Fallé', 'es-fallo', () => responder(false))]
        : [boton(ultimo ? 'Ver resultado' : 'Siguiente', 'es-sig', () => responder(false), true)];
    poner(
      barra(atrasBtn('← Salir', 'Salir (Esc)'), `${ses.i} / ${ses.total}`),
      el('div', { className: 'ccuerpo pr-sesion', 'data-esc': '1' },
        el('p', { className: 'rt-acorde', id: 'es-titulo' }, r.titulo), el('p', { className: 'rt-pos' }, 'Tócala subiendo, una octava'),
        el('div', { className: 'rt-botones' }, ...botones), revelado));
    const primero = caja.querySelector('.rt-botones .primario'); if (primero) primero.focus({ preventScroll: true });
  }
  function resultado() {
    vista = 'resultado';
    const h = ses.hechas, a = h.filter(x => x.bien), total = ses.total;
    const medio = a.length ? a.reduce((s, x) => s + x.ms, 0) / a.length : 0;
    const fallos = h.filter(x => !x.bien), lentos = [...a].sort((p, q) => q.ms - p.ms).slice(0, 3);
    const chip = (x, texto) => el('span', { className: 'chip' }, el('b', {}, x.rotulo), el('i', { className: 'rom' }, texto));
    poner(
      barra(atrasBtn('← Salir', 'Salir (Esc)'), 'Resultado'),
      el('div', { className: 'ccuerpo pr-sesion', 'data-esc': '1' },
        el('h2', { id: 'es-resultado', tabIndex: -1 }, `${a.length} de ${total} bien · ${Math.round((a.length / total) * 100)}%`),
        a.length ? el('p', { className: 'a' }, 'Tiempo medio de las que tocaste bien: ' + seg(medio)) : null,
        fallos.length ? el('div', { className: 'parte' }, el('h3', {}, 'Para repasar'), el('div', { className: 'chips' }, ...fallos.map(x => chip(x, 'fallada')))) : el('p', {}, 'Sin fallos.'),
        lentos.length > 1 ? el('div', { className: 'parte' }, el('h3', {}, 'Las más lentas'), el('div', { className: 'chips' }, ...lentos.map(x => chip(x, seg(x.ms))))) : null,
        el('p', {}, el('button', { type: 'button', className: 'primario', id: 'es-repetir', onclick: () => empezar(total) }, 'Repetir'), ' ', el('button', { type: 'button', id: 'es-opciones', onclick: () => menu() }, 'Cambiar opciones'))));
    const t = document.getElementById('es-resultado'); if (t) t.focus({ preventScroll: true });
  }
  // Atajos de teclado (PC/tablet): V = ver la respuesta, F = fallé.
  document.addEventListener('keydown', e => {
    if (!caja || caja.hidden || vista !== 'sesion' || !ses || !caja.querySelector('[data-esc]')) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'v' && ses.fase === 'pregunta') { e.preventDefault(); revelar('visto'); }
    else if (k === 'f' && ses.fase === 'toque') { e.preventDefault(); responder(false); }
  });

  // Practicar llama a abrir() al entrar y a atras() con Atrás: dentro de un reto o del resultado vuelve al menú de estos retos (true);
  // desde el menú devuelve false y Practicar vuelve a su propio menú.
  api.abrir = (cajaPracticar, volver) => {
    caja = cajaPracticar; volverFn = volver; ses = null; datos = null;
    const g = leer(PREF) || {};
    pref = { ...PREF0, ...(typeof g === 'object' ? g : {}) };
    if (!['modos', 'otras', 'todas'].includes(pref.tipo)) pref.tipo = 'modos';
    pref.repasar = typeof pref.repasar === 'boolean' ? pref.repasar : PREF0.repasar;
    est = limpiar(leer(EST));
    menu(); caja.focus({ preventScroll: true });
    const t = raiz.RepertorioTeoria;
    if (t && t.cargarTonal) t.cargarTonal().then(T => { datos = { T, modos: t.modos }; if (vista === 'menu') menu(true); }).catch(() => { /* queda el aviso del menú */ });
  };
  api.atras = () => {
    if (vista === 'sesion' || vista === 'resultado') { menu(); return true; }
    return false;
  };
})(typeof window !== 'undefined' ? window : globalThis);
