// Retos de progresiones: sale una progresión de TUS canciones escrita en números romanos y un tono. La tocas en tu piano y compruebas.
// La canción no se muestra hasta que ves la respuesta (así no te la sabes de memoria). No usa sonido ni internet.
// La lógica (transposición, estadísticas, elección del reto) no usa el DOM y se prueba en test/. La pantalla se abre desde Practicar.
(function (raiz) {
  'use strict';
  const LETRAS = 'CDEFGAB', PC_LETRA = [0, 2, 4, 5, 7, 9, 11];
  const ESC_MAYOR = [0, 2, 4, 5, 7, 9, 11], ESC_MENOR = [0, 2, 3, 5, 7, 8, 10];
  const SIMBOLO = { '-1': 'b', '0': '', '1': '#' };
  const NOMBRE_PC = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  // Los 12 tonos de cada calidad, escritos como se usan en la práctica (igual que en los retos de acordes).
  const TONOS = {
    M: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
    m: ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm']
  };
  const MIN_ACORDES = 2, MAX_ACORDES = 16;

  // --- notas y tonos ---
  const parseNota = s => {
    const m = /^([A-G])([#♯b♭]*)/.exec(s || '');
    return m && { letra: LETRAS.indexOf(m[1]), alt: [...m[2]].reduce((a, x) => a + (x === '#' || x === '♯' ? 1 : -1), 0), largo: m[0].length };
  };
  const clase = n => (PC_LETRA[n.letra] + n.alt + 120) % 12;
  const parseTono = t => { const n = parseNota(t); return n && { nota: n, menor: String(t).slice(n.largo).startsWith('m') }; };
  const calidadDe = t => { const p = parseTono(t); return p ? (p.menor ? 'm' : 'M') : null; };
  const escribir = (letra, alt) => LETRAS[letra] + SIMBOLO[alt];

  // Mueve una nota (con su nombre) de un tono a otro conservando su GRADO y su alteración: en C mayor, Bb (♭VII) pasa a Db en Eb.
  function mover(n, de, a) {
    const d = (n.letra - de.nota.letra + 7) % 7;
    const esperado = (clase(de.nota) + (de.menor ? ESC_MENOR : ESC_MAYOR)[d]) % 12;
    const dif = ((clase(n) - esperado + 18) % 12) - 6;
    const letra = (a.nota.letra + d) % 7;
    const pc = (clase(a.nota) + (a.menor ? ESC_MENOR : ESC_MAYOR)[d] + dif + 120) % 12;
    const alt = ((pc - PC_LETRA[letra] + 18) % 12) - 6;
    return alt >= -1 && alt <= 1 ? escribir(letra, alt) : NOMBRE_PC[pc];   // nada de ## ni bb: se escribe de forma sencilla
  }
  // "Em7/B" de G mayor a Eb mayor -> "Cm7/G". Devuelve null si el acorde o los tonos no se pueden leer.
  function transponer(acorde, tonoOrigen, tonoDestino) {
    const de = parseTono(tonoOrigen), a = parseTono(tonoDestino);
    const barra = /^(.*?)\/([A-G][#♯b♭]*)$/.exec(acorde || '');
    const base = barra ? barra[1] : (acorde || ''), raizN = parseNota(base), bajoN = barra && parseNota(barra[2]);
    if (!de || !a || !raizN) return null;
    return mover(raizN, de, a) + base.slice(raizN.largo) + (bajoN ? '/' + mover(bajoN, de, a) : '');
  }

  // --- progresiones disponibles (salen de tus canciones guardadas) ---
  const hash = s => { let h = 5381; for (const c of s) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return h.toString(36); };
  const claveCancion = c => (typeof c.id === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(c.id)) ? c.id : 'x' + hash((c.titulo || '') + '|' + (c.artista || ''));
  const ITEM = /^[A-Za-z0-9_-]{6,40}\|\d{1,2}$/;
  // Hacen falta compases y romano (de app.js): se pasan para poder probar esto sin la página.
  function progresiones(canciones, { compases, romano }) {
    const out = [];
    for (const c of Array.isArray(canciones) ? canciones : []) {
      if (!c || c.borrada || !Array.isArray(c.partes)) continue;
      c.partes.forEach((p, k) => {
        const tono = (p && p.tono) || c.tono, cal = calidadDe(tono);
        if (!p || !p.prog || !cal) return;
        const grupos = compases(p.prog), acordes = grupos.flat();
        if (acordes.length < MIN_ACORDES || acordes.length > MAX_ACORDES || !acordes.every(a => parseNota(a.split('/')[0]) && romano(a, tono))) return;
        out.push({ item: claveCancion(c) + '|' + k, titulo: c.titulo || '', artista: c.artista || '', parte: (p.nombre || 'Parte ' + (k + 1)), tono, cal, grupos,
          formula: grupos.map(g => g.map(a => romano(a, tono)).join(' ')).join(' | '),
          original: grupos.map(g => g.join(' ')).join(' | ') });
      });
    }
    return out;
  }
  const calidadesDe = op => (op.calidad === 'M' ? ['M'] : op.calidad === 'm' ? ['m'] : ['M', 'm']);
  const enPool = (pool, op) => pool.filter(x => calidadesDe(op).includes(x.cal));

  // Elige el siguiente reto: 4 de cada 10 salen de lo que has fallado (si lo activaste), sin repetir el anterior.
  function crearReto(pool, op = {}, azar = Math.random, previo = null, est = null) {
    const base = enPool(pool, op);
    if (!base.length) return null;
    const flojos = op.repasar && est ? base.filter(x => { const s = est.items[x.item]; return s && s.v - s.a >= 1 && s.a / s.v < 0.8; }) : [];
    let p;
    for (let i = 0; i < 20; i++) {
      if (flojos.length && azar() < 0.4) {
        const peso = x => est.items[x.item].v - est.items[x.item].a;
        let t = azar() * flojos.reduce((s, f) => s + peso(f), 0);
        p = flojos[flojos.length - 1];
        for (const f of flojos) { t -= peso(f); if (t < 0) { p = f; break; } }
      } else p = base[Math.floor(azar() * base.length)];
      if (p.item !== previo || base.length === 1) break;
    }
    const lista = TONOS[p.cal];
    const destino = op.tono === 'original' ? p.tono : lista[Math.floor(azar() * 12)];
    const acordes = p.grupos.map(g => g.map(a => transponer(a, p.tono, destino)));
    if (acordes.some(g => g.some(a => !a))) return null;
    return { ...p, destino, acordes: acordes.map(g => g.join(' ')).join(' | ') };
  }

  // --- estadísticas (por progresión: veces, aciertos, suma de milisegundos de los aciertos, mejor tiempo) ---
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
  // Solo cuentan las progresiones que todavía existen en tus canciones.
  function resumen(est, pool) {
    const por = new Map(pool.map(x => [x.item, x]));
    const filas = Object.entries(est.items).filter(([k]) => por.has(k)).map(([k, x]) => ({ ...por.get(k), ...x, prom: x.a ? x.ms / x.a : 0 }));
    const v = filas.reduce((s, f) => s + f.v, 0), a = filas.reduce((s, f) => s + f.a, 0);
    const repasar = filas.filter(f => f.v - f.a >= 1 && f.a / f.v < 0.8).sort((p, q) => p.a / p.v - q.a / q.v || q.v - p.v).slice(0, 6);
    return { v, a, repasar };
  }

  const api = { TONOS, parseTono, calidadDe, transponer, progresiones, crearReto, vacias, limpiar, registrar, resumen, CFG: { guardia: 350 } };
  raiz.Progresiones = api;
  if (typeof document === 'undefined') return;

  // --- pantalla (dentro de la capa de Practicar) ---
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) k === 'rol' ? n.setAttribute('role', v) : k.includes('-') ? n.setAttribute(k, v) : (n[k] = v);
    n.append(...kids.flat().filter(k => k != null && k !== false));
    return n;
  };
  const PREF = 'repertorio-prog-pref', EST = 'repertorio-prog-v1';
  const leer = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin espacio: no pasa nada grave */ } };
  const seg = ms => (ms / 1000).toFixed(1) + ' s';

  const PREF0 = { calidad: 'ambos', tono: 'azar', repasar: true };
  let caja = null, volverFn = null, vista = 'menu', ses = null, pref = { ...PREF0 }, est = vacias(), pool = [];
  const barra = (izq, centro) => el('div', { className: 'cbarra' }, izq, el('span', { className: 'ctitulo' }, centro));
  const atrasBtn = (texto, titulo = 'Salir') => el('button', { type: 'button', title: titulo, onclick: () => history.back() }, texto);
  const poner = (...hijos) => { caja.replaceChildren(...hijos); caja.scrollTop = 0; };
  const rotulo = f => f.titulo + ' · ' + f.parte;

  function menu(conservar) {
    vista = 'menu'; ses = null;
    const y = conservar ? caja.scrollTop : 0, r = resumen(est, pool), disponibles = enPool(pool, pref).length;
    const opcion = (campo, valor, texto) => el('button', {
      type: 'button', 'data-op': campo + ':' + valor, 'aria-pressed': String(pref[campo] === valor),
      onclick: () => { pref[campo] = valor; guardar(PREF, pref); menu(true); const b = caja.querySelector(`[data-op="${campo}:${valor}"]`); if (b) b.focus({ preventScroll: true }); }
    }, texto);
    poner(
      barra(el('button', { type: 'button', title: 'Volver a Practicar', onclick: () => { vista = 'fuera'; volverFn(); } }, '← Practicar'), 'Retos de progresiones'),
      el('div', { className: 'ccuerpo', 'data-prog': '1' },
        el('p', {}, 'Sale una progresión de tus canciones en números romanos y un tono. Tócala en tu piano y luego compruébala. No usa sonido ni internet.'),
        !pool.length ? el('p', { id: 'pg-vacio' }, 'Aún no tienes progresiones para practicar. Guarda canciones con partes y acordes (con internet) y vuelve aquí.') : null,
        el('div', { className: 'parte' }, el('h3', {}, 'Canciones en'),
          el('div', { className: 'tg', rol: 'group', 'aria-label': 'Tonalidad de la canción' }, opcion('calidad', 'M', 'Mayor'), opcion('calidad', 'm', 'Menor'), opcion('calidad', 'ambos', 'Ambas')),
          el('p', { className: 'a', id: 'pg-cuantas' }, disponibles ? disponibles + (disponibles === 1 ? ' progresión disponible' : ' progresiones disponibles') : 'Ninguna progresión con esta opción.')),
        el('div', { className: 'parte' }, el('h3', {}, 'Tono'),
          el('div', { className: 'tg', rol: 'group', 'aria-label': 'Tono del reto' }, opcion('tono', 'azar', 'Al azar (12 tonos)'), opcion('tono', 'original', 'El de la canción'))),
        el('div', { className: 'parte' }, el('h3', {}, 'Repasar lo que fallo'),
          el('div', { className: 'tg', rol: 'group', 'aria-label': 'Repasar lo que fallo' }, opcion('repasar', true, 'Sí'), opcion('repasar', false, 'No'))),
        el('p', {}, el('button', { type: 'button', className: 'primario', id: 'pg-empezar-5', disabled: !disponibles, onclick: () => empezar(5) }, 'Empezar · 5'), ' ',
          el('button', { type: 'button', id: 'pg-empezar-10', disabled: !disponibles, onclick: () => empezar(10) }, 'Empezar · 10')),
        el('div', { className: 'parte', id: 'pg-progreso' }, el('h3', {}, 'Tu progreso'),
          r.v ? el('p', {}, `${r.v} retos · ${Math.round((r.a / r.v) * 100)}% bien`) : el('p', {}, 'Aún no has hecho retos.'),
          r.repasar.length ? [el('p', { className: 'a' }, 'Para repasar'), el('div', { className: 'chips' }, ...r.repasar.map(f => el('span', { className: 'chip' }, el('b', {}, rotulo(f)), el('i', { className: 'rom' }, Math.round((f.a / f.v) * 100) + '%'))))] : null)));
    caja.scrollTop = y;
  }

  function empezar(total) {
    ses = { total, i: 0, hechas: [], reto: null, fase: 'pregunta', t0: 0, ms: 0, tRevela: 0 };
    siguiente();
  }
  function siguiente() {
    if (ses.i >= ses.total) return resultado();
    const r = crearReto(pool, pref, Math.random, ses.reto && ses.reto.item, est);
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
    ses.hechas.push({ item: r.item, rotulo: rotulo(r), bien: cuenta, ms: ses.ms });
    siguiente();
  }
  function pintarReto() {
    const r = ses.reto, f = ses.fase, ultimo = ses.i >= ses.total;
    const boton = (texto, id, fn, primario) => el('button', { type: 'button', id, className: primario ? 'primario' : '', onclick: fn }, texto);
    const revelado = f === 'pregunta' ? null : el('div', { className: 'parte', id: 'pg-revela', 'aria-live': 'polite' },
      el('h3', {}, 'En ' + r.destino.replace(/m$/, ' menor').replace(/^([A-G][#b]?)$/, '$1 mayor')), el('p', { className: 'rt-prog', id: 'pg-acordes' }, r.acordes),
      el('p', { className: 'a' }, `Es «${r.titulo}»${r.artista ? ' — ' + r.artista : ''} · ${r.parte}`),
      r.destino !== r.tono ? el('p', { className: 'a' }, `En el tono de la canción (${r.tono}): ${r.original}`) : null);
    const botones = f === 'pregunta' ? [boton('Ya la toqué', 'pg-toque', () => revelar('toque'), true), boton('No me sale (ver)', 'pg-ver', () => revelar('visto'))]
      : f === 'toque' ? [el('p', { className: 'a', id: 'pg-tiempo' }, 'Tardaste ' + seg(ses.ms) + '. ¿La tocaste bien?'), boton('Sí, bien', 'pg-bien', () => responder(true), true), boton('Fallé', 'pg-fallo', () => responder(false))]
        : [boton(ultimo ? 'Ver resultado' : 'Siguiente', 'pg-sig', () => responder(false), true)];
    poner(
      barra(atrasBtn('← Salir', 'Salir (Esc)'), `${ses.i} / ${ses.total}`),
      el('div', { className: 'ccuerpo pr-sesion', 'data-prog': '1' },
        el('p', { className: 'rt-acorde', id: 'pg-tono' }, r.destino), el('p', { className: 'rt-pos' }, r.destino.endsWith('m') ? 'tono menor' : 'tono mayor'),
        el('p', { className: 'rt-prog', id: 'pg-formula' }, r.formula),
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
      el('div', { className: 'ccuerpo pr-sesion', 'data-prog': '1' },
        el('h2', { id: 'pg-resultado', tabIndex: -1 }, `${a.length} de ${total} bien · ${Math.round((a.length / total) * 100)}%`),
        a.length ? el('p', { className: 'a' }, 'Tiempo medio de las que tocaste bien: ' + seg(medio)) : null,
        fallos.length ? el('div', { className: 'parte' }, el('h3', {}, 'Para repasar'), el('div', { className: 'chips' }, ...fallos.map(x => chip(x, 'fallada')))) : el('p', {}, 'Sin fallos.'),
        lentos.length > 1 ? el('div', { className: 'parte' }, el('h3', {}, 'Las más lentas'), el('div', { className: 'chips' }, ...lentos.map(x => chip(x, seg(x.ms))))) : null,
        el('p', {}, el('button', { type: 'button', className: 'primario', id: 'pg-repetir', onclick: () => empezar(total) }, 'Repetir'), ' ', el('button', { type: 'button', id: 'pg-opciones', onclick: () => menu() }, 'Cambiar opciones'))));
    const t = document.getElementById('pg-resultado'); if (t) t.focus({ preventScroll: true });
  }

  // Atajos de teclado (PC/tablet): V = ver la respuesta, F = fallé. Enter ya funciona en el botón que tiene el foco.
  document.addEventListener('keydown', e => {
    if (!caja || caja.hidden || vista !== 'sesion' || !ses || !caja.querySelector('[data-prog]')) return;
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
    if (!['azar', 'original'].includes(pref.tono)) pref.tono = 'azar';
    pref.repasar = typeof pref.repasar === 'boolean' ? pref.repasar : PREF0.repasar;
    est = limpiar(leer(EST));
    const app = raiz.RepertorioApp;
    pool = app && app.data && app.compases && app.romano ? progresiones(app.data.canciones, app) : [];
    menu(); caja.focus({ preventScroll: true });
  };
  api.atras = () => {
    if (vista === 'sesion' || vista === 'resultado') { menu(); return true; }
    return false;
  };
})(typeof window !== 'undefined' ? window : globalThis);
