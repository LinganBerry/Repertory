// Escuchar tu piano: detecta por el micrófono qué acorde tocas y lo marca en la canción abierta.
// Motor: PitchPlease (escucha/pitchplease/), modelo de piano de ~0,5 MB que responde en fotogramas de ~12 ms, en vivo.
// Este archivo tiene dos partes: el NÚCLEO (nombrar acordes y seguir lo que tocas; no toca el DOM, se prueba en Node)
// y el PANEL (botones, micrófono y marcado de los acordes de la canción).
(function () {
  'use strict';
  const raiz = typeof window !== 'undefined' ? window : globalThis;

  // ===================== NÚCLEO =====================
  const SOSTENIDOS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const BEMOLES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const nombrePc = (pc, bemoles) => (bemoles ? BEMOLES : SOSTENIDOS)[((pc % 12) + 12) % 12];
  const nombreNota = m => SOSTENIDOS[m % 12] + (Math.floor(m / 12) - 1);

  // Tipos de acorde: notas = [semitonos desde la raíz, peso]; esencial = los que no pueden faltar; rareza = cuánto cuesta preferirlo.
  const TIPOS = [
    { sufijo: '', notas: [[0, 3], [4, 3], [7, 1.5]], esencial: [4], rareza: 0 },
    { sufijo: 'm', notas: [[0, 3], [3, 3], [7, 1.5]], esencial: [3], rareza: 0 },
    { sufijo: '7', notas: [[0, 3], [4, 3], [7, 1.2], [10, 2.5]], esencial: [4, 10], rareza: .4 },
    { sufijo: 'maj7', notas: [[0, 3], [4, 3], [7, 1.2], [11, 2.5]], esencial: [4, 11], rareza: .4 },
    { sufijo: 'm7', notas: [[0, 3], [3, 3], [7, 1.2], [10, 2.5]], esencial: [3, 10], rareza: .4 },
    { sufijo: 'sus4', notas: [[0, 3], [5, 3], [7, 1.5]], esencial: [5], rareza: .3 },
    { sufijo: 'sus2', notas: [[0, 3], [2, 3], [7, 1.5]], esencial: [2], rareza: .3 },
    { sufijo: 'add9', notas: [[0, 3], [4, 3], [7, 1.2], [2, 2.5]], esencial: [4, 2], rareza: .5 },
    { sufijo: 'm(add9)', notas: [[0, 3], [3, 3], [7, 1.2], [2, 2.5]], esencial: [3, 2], rareza: .9 },
    // Las sextas llevan la quinta como esencial: sin ella, Mi♭–Sol–Do es Cm/E♭ (tríada menor invertida) y no "Mi♭6" (hallazgo 1).
    { sufijo: '6', notas: [[0, 3], [4, 3], [7, 1.2], [9, 2.5]], esencial: [4, 7, 9], rareza: .7 },
    { sufijo: 'm6', notas: [[0, 3], [3, 3], [7, 1.2], [9, 2.5]], esencial: [3, 7, 9], rareza: .9 },
    { sufijo: 'dim', notas: [[0, 3], [3, 3], [6, 3]], esencial: [3, 6], rareza: .6 },
    { sufijo: 'm7b5', notas: [[0, 3], [3, 3], [6, 3], [10, 2.5]], esencial: [3, 6, 10], rareza: .8 },
    { sufijo: 'aug', notas: [[0, 3], [4, 3], [8, 3]], esencial: [4, 8], rareza: .9 },
    { sufijo: 'dim7', notas: [[0, 3], [3, 3], [6, 3], [9, 2.5]], esencial: [3, 6, 9], rareza: .8 },
    { sufijo: 'mMaj7', notas: [[0, 3], [3, 3], [7, 1.2], [11, 2.5]], esencial: [3, 11], rareza: .9 },
    { sufijo: '9', notas: [[0, 3], [4, 3], [7, 1], [10, 2.2], [2, 2]], esencial: [4, 10, 2], rareza: .9 },
    { sufijo: 'maj9', notas: [[0, 3], [4, 3], [7, 1], [11, 2.2], [2, 2]], esencial: [4, 11, 2], rareza: 1 },
    { sufijo: 'm9', notas: [[0, 3], [3, 3], [7, 1], [10, 2.2], [2, 2]], esencial: [3, 10, 2], rareza: 1 },
    { sufijo: '5', notas: [[0, 3], [7, 3]], esencial: [7], rareza: .5 },
    // Tensiones nuevas (11, 13 y alteradas): cuestan más para que solo ganen cuando se oyen claras.
    { sufijo: '7sus4', notas: [[0, 3], [5, 3], [7, 1.2], [10, 2.5]], esencial: [5, 10, 7], rareza: .7 },
    { sufijo: '69', notas: [[0, 3], [4, 3], [7, 1.2], [9, 2.2], [2, 2]], esencial: [4, 9, 2], rareza: 1 },
    { sufijo: '7b9', notas: [[0, 3], [4, 3], [7, 1], [10, 2.2], [1, 2.2]], esencial: [4, 10, 1], rareza: 1.1 },
    { sufijo: '7#9', notas: [[0, 3], [4, 3], [7, 1], [10, 2.2], [3, 2.2]], esencial: [4, 10, 3], rareza: 1.1 },
    { sufijo: '7#11', notas: [[0, 3], [4, 3], [7, 1], [10, 2.2], [6, 2.2]], esencial: [4, 10, 6], rareza: 1.1 },
    { sufijo: '7b13', notas: [[0, 3], [4, 3], [7, 1], [10, 2.2], [8, 2.2]], esencial: [4, 10, 8], rareza: 1.2 },
    { sufijo: '13', notas: [[0, 3], [4, 3], [7, 1], [10, 2.2], [9, 2]], esencial: [4, 10, 9], rareza: 1 },
    { sufijo: 'maj7#11', notas: [[0, 3], [4, 3], [7, 1], [11, 2.2], [6, 2.2]], esencial: [4, 11, 6], rareza: 1.1 },
    { sufijo: 'm11', notas: [[0, 3], [3, 3], [7, 1], [10, 2.2], [5, 2]], esencial: [3, 10, 5], rareza: 1.1 },
  ];

  // Nombra un conjunto de notas MIDI sin saber qué canción es (nombre libre).
  function nombrarLibre(midis, { bemoles = false } = {}) {
    const notas = [...new Set(midis)].sort((a, b) => a - b);
    if (!notas.length) return null;
    const bajo = notas[0] % 12, pcs = new Set(notas.map(n => n % 12));
    if (pcs.size === 1) return { nombre: nombrePc(bajo, bemoles), raiz: bajo, sufijo: '', bajo, notas, puntaje: 0, clase: 'nota' };
    let mejor = null;
    for (const raiz of pcs) for (const t of TIPOS) {
      const tonos = new Set(t.notas.map(([u]) => (raiz + u) % 12));
      let p = -t.rareza;
      for (const [u, peso] of t.notas) p += pcs.has((raiz + u) % 12) ? peso : t.esencial.includes(u) ? -4.5 : -.9 * peso;
      for (const pc of pcs) if (!tonos.has(pc)) p -= 2.6;
      if (raiz === bajo) p += 2.2; else if (tonos.has(bajo)) p += .4;
      if (!mejor || p > mejor.puntaje) mejor = { raiz, sufijo: t.sufijo, puntaje: p, tonos };
    }
    if (!mejor || mejor.puntaje < 2.5) {
      return { nombre: [...pcs].map(n => nombrePc(n, bemoles)).join(' '), raiz: bajo, sufijo: '?', bajo, notas, puntaje: mejor ? mejor.puntaje : 0, clase: 'desconocido' };
    }
    let nombre = nombrePc(mejor.raiz, bemoles) + mejor.sufijo;
    if (bajo !== mejor.raiz && mejor.tonos.has(bajo)) nombre += '/' + nombrePc(bajo, bemoles);
    return { nombre, raiz: mejor.raiz, sufijo: mejor.sufijo, bajo, notas, puntaje: mejor.puntaje, clase: 'acorde' };
  }

  // Cómo se escribe cada tipo en las canciones (para leer los acordes de la hoja y de los chips).
  const BASE_TRIADAS = { M: [0, 4, 7], m: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8] };
  const SUFIJOS = {
    '': [0, 4, 7], m: [0, 3, 7], min: [0, 3, 7], '-': [0, 3, 7], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], M7: [0, 4, 7, 11], '\u0394': [0, 4, 7, 11], '\u03947': [0, 4, 7, 11], maj: [0, 4, 7],
    m7: [0, 3, 7, 10], min7: [0, 3, 7, 10], '-7': [0, 3, 7, 10], mmaj7: [0, 3, 7, 11], mMaj7: [0, 3, 7, 11], mM7: [0, 3, 7, 11], 'm(maj7)': [0, 3, 7, 11],
    sus4: [0, 5, 7], sus: [0, 5, 7], sus2: [0, 2, 7], add9: [0, 4, 7, 2], add2: [0, 4, 7, 2], 2: [0, 4, 7, 2], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9], 69: [0, 4, 7, 9, 2],
    dim: [0, 3, 6], o: [0, 3, 6], '\xB0': [0, 3, 6], dim7: [0, 3, 6, 9], o7: [0, 3, 6, 9], '\xB07': [0, 3, 6, 9], m7b5: [0, 3, 6, 10], '\u00F8': [0, 3, 6, 10], '\u00F87': [0, 3, 6, 10],
    aug: [0, 4, 8], '+': [0, 4, 8], 5: [0, 7], 9: [0, 4, 7, 10, 2], m9: [0, 3, 7, 10, 2], maj9: [0, 4, 7, 11, 2], '7sus4': [0, 5, 7, 10], madd9: [0, 3, 7, 2],
    '7b9': [0, 4, 7, 10, 1], '7#9': [0, 4, 7, 10, 3], '7#11': [0, 4, 7, 10, 6], '7b13': [0, 4, 7, 10, 8], 13: [0, 4, 7, 10, 9], 'maj7#11': [0, 4, 7, 11, 6], m11: [0, 3, 7, 10, 5],
  };
  const LETRAS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const alteracion = s => [...(s || '')].reduce((n, c) => n + (c === '#' || c === '\u266F' ? 1 : -1), 0);

  // "Am7/G" -> { nombre, pcs: clases de nota que lo forman, bajo }. Si no lo entiende, null.
  function leerAcorde(texto) {
    const m = /^([A-G])([#b\u266F\u266D]*)([^/]*)(?:\/([A-G])([#b\u266F\u266D]*))?$/.exec(String(texto).trim());
    if (!m) return null;
    const pc = (l, a) => ((LETRAS[l] + alteracion(a)) % 12 + 12) % 12;
    const raiz = pc(m[1], m[2]);
    const suf = m[3].replace(/[()\u266D]/g, c => (c === '\u266D' ? 'b' : '')).replace(/\u266F/g, '#');
    let forma = SUFIJOS[suf];
    if (!forma) {
      const menor = /^(m|min|-)(?!aj)/.test(suf);
      forma = /^(dim|o|\u00B0)/.test(suf) ? BASE_TRIADAS.dim : menor ? BASE_TRIADAS.m : /^aug|^\+/.test(suf) ? BASE_TRIADAS.aug : BASE_TRIADAS.M;
    }
    const bajo = m[4] ? pc(m[4], m[5]) : raiz;
    const pcs = [...new Set([...forma.map(n => (raiz + n) % 12), ...(m[4] ? [bajo] : [])])];
    return { nombre: String(texto).trim(), pcs, bajo };
  }

  // Entre los acordes de la canción, el que mejor encaja con lo que suena (ev[pc] = qué tan seguro se oye cada nota).
  function elegirDeLista(ev, notas, candidatos, umbral) {
    const bajo = notas.length ? notas[0] % 12 : -1;
    let mejor = null, segundo = -9;
    for (const c of candidatos) {
      const set = new Set(c.pcs);
      let p = 0;
      for (let u = 0; u < 12; u++) p += set.has(u) ? ev[u] : -1.3 * ev[u];
      for (const u of set) if (ev[u] < .15) p -= .5;
      if (bajo === (c.bajo == null ? c.pcs[0] : c.bajo)) p += .8;
      if (!mejor || p > mejor.p) { segundo = mejor ? mejor.p : -9; mejor = { c, p }; } else if (p > segundo) segundo = p;
    }
    return mejor && mejor.p >= umbral ? { nombre: mejor.c.nombre, puntaje: mejor.p, margen: mejor.p - segundo } : null;
  }

  // Sigue lo que tocas, fotograma a fotograma (~86 por segundo), y avisa en cuanto hay un acorde.
  // Idea: cada golpe nuevo abre un "grupo" con las notas que ENTRAN (no las que siguen sonando por el pedal) y se nombra ese grupo.
  class Seguidor {
    constructor(op = {}) {
      Object.assign(this, {
        candidatos: null, bemoles: false, umbralLista: 1.2,
        minMidi: 28, maxMidi: 96,        // rango del piano que se atiende (fuera de eso suelen ser armónicos)
        confirmar: 2,                    // fotogramas seguidos para dar por buena una nota (descarta chispazos)
        estabilidad: 3,                  // fotogramas sin cambios en el grupo antes de nombrarlo
        subida: .35,                     // cuánto debe subir una nota para contar como golpe nuevo aunque ya sonara
        graveMax: 50,                    // de aquí hacia abajo una nota es "bajo" (re 3); las notas de un arpegio suelen quedar más arriba
        duracionArpegio: 3.2, revision: .3, esperaDos: .5, fin: .5, huecoNuevo: .45,
      }, op);
      this.reiniciar();
    }
    reiniciar() {
      this.racha = new Map(); this.anillo = []; this.ultimoOnset = new Map();
      this.grupo = null; this.vacioDesde = null; this.nombre = null;
    }
    // trama = { t: segundos, notas: [{ midi, prob }], probs?: Float32Array(88) de A0 a C8 }
    alimentar(trama) {
      const t = trama.t, act = new Map();
      for (const n of trama.notas) if (n.midi >= this.minMidi && n.midi <= this.maxMidi) act.set(n.midi, n.prob == null ? 1 : n.prob);
      const probs = trama.probs || null;
      const reciente = k => { let m = 1; for (const a of this.anillo) if (a[k] < m) m = a[k]; return this.anillo.length ? m : 0; };

      for (const m of act.keys()) this.racha.set(m, (this.racha.get(m) || 0) + 1);
      for (const m of [...this.racha.keys()]) if (!act.has(m)) this.racha.delete(m);

      const nuevas = [];
      for (const [m, r] of this.racha) {
        if (r === this.confirmar) { nuevas.push(m); this.ultimoOnset.set(m, t); continue; }
        // nota que ya sonaba y vuelve a golpearse (pedal): la delata una subida de probabilidad
        if (r > this.confirmar && probs && probs[m - 21] - reciente(m - 21) >= this.subida && t - (this.ultimoOnset.get(m) || -9) > .15) { nuevas.push(m); this.ultimoOnset.set(m, t); }
      }
      if (probs) { this.anillo.push(Float32Array.from(probs)); if (this.anillo.length > 6) this.anillo.shift(); }

      if (act.size) this.vacioDesde = null; else if (this.vacioDesde === null) this.vacioDesde = t;
      if (this.grupo && this.vacioDesde !== null && t - this.vacioDesde > this.fin) this.grupo = null;

      if (nuevas.length) this._abrirOSumar(t, nuevas, act);
      return this._evaluar(t, act);
    }
    _abrirOSumar(t, nuevas, act) {
      let g = this.grupo;
      const bajoNuevo = nuevas.some(m => m <= this.graveMax && (!g || m % 12 !== g.bajoPc));
      const nuevo = !g
        || t - g.inicio > this.duracionArpegio
        || (t - g.inicio > .08 && (nuevas.length >= 3 || bajoNuevo))
        || (t - g.ultimo > this.huecoNuevo && nuevas.length >= 2)
        || t - g.ultimo > 1.2;
      // Un golpe de bloque se corrige solo durante un instante; después, notas sueltas encima (melodía) no lo cambian.
      if (!nuevo && g.bloque >= 3 && t - g.inicio > this.revision) return;
      if (nuevo) g = this.grupo = { inicio: t, ultimo: t, notas: new Map(), bajoPc: null, bloque: 0, sinCambio: 0, nombre: null, emitido: false, pendiente: true };
      for (const m of nuevas) g.notas.set(m, act.get(m));
      if (t - g.inicio <= .1) g.bloque += nuevas.length;   // notas que entraron juntas con el golpe inicial
      g.ultimo = t; g.sinCambio = 0; g.pendiente = true;
      const baja = [...g.notas.keys()].sort((a, b) => a - b)[0];
      g.bajoPc = baja <= this.graveMax ? baja % 12 : g.bajoPc;
    }
    _evaluar(t, act) {
      const g = this.grupo, salida = [];
      if (!g) return salida;
      if (++g.sinCambio < this.estabilidad || !g.pendiente) return salida;
      // Una melodía suelta no es un acorde: hace falta un bajo (arpegio) o un golpe de 3 o más notas a la vez.
      if (g.bajoPc === null && g.bloque < 3) return salida;
      g.pendiente = false;
      const propias = [...g.notas.keys()].sort((a, b) => a - b);
      const secundarias = [...act.keys()].filter(m => !g.notas.has(m) && (this.racha.get(m) || 0) >= this.confirmar);
      let notas = propias;
      const pcsPropios = new Set(propias.map(m => m % 12)).size;
      // Con 2 clases de nota nuevas se completan con las que siguen sonando (pedal); con 1 sola, no: sería adivinar.
      if (pcsPropios === 2 && secundarias.length) notas = [...new Set([...propias, ...secundarias])].sort((a, b) => a - b);
      const nPcs = new Set(notas.map(m => m % 12)).size;
      if (nPcs < 3 && !(nPcs === 2 && t - g.inicio >= this.esperaDos)) { if (nPcs === 2) g.pendiente = true; return salida; }
      const libre = nombrarLibre(notas, { bemoles: this.bemoles });
      let r = libre;
      if (this.candidatos && this.candidatos.length) {
        const ev = new Array(12).fill(0);
        for (const m of secundarias) ev[m % 12] = Math.max(ev[m % 12], .5 * (act.get(m) || 0));
        for (const [m, p] of g.notas) ev[m % 12] = Math.max(ev[m % 12], p || 0, .7);
        const c = elegirDeLista(ev, notas, this.candidatos, this.umbralLista);
        if (c) r = { ...libre, nombre: c.nombre, clase: 'lista', libre: libre.nombre };
      }
      if (r.nombre === g.nombre) return salida;
      g.nombre = r.nombre;
      if (r.nombre === this.nombre) { g.emitido = true; return salida; }   // mismo acorde que ya se muestra
      this.nombre = r.nombre;
      salida.push({ tipo: g.emitido ? 'revision' : 'golpe', t, inicio: g.inicio, notas, ...r });
      g.emitido = true;
      return salida;
    }
  }

  const Nucleo = { TIPOS, nombrarLibre, leerAcorde, elegirDeLista, Seguidor, nombreNota };
  raiz.EscuchaNucleo = Nucleo;
  if (typeof document === 'undefined') return;

  // ===================== PANEL =====================
  const rutaMotor = () => raiz.ESCUCHA_RUTA || '/escucha/pitchplease/pitchplease.js';   // ESCUCHA_RUTA solo la usan las pruebas
  const el = (tag, props = {}, ...hijos) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'className') n.className = v;
      else if (k.startsWith('on')) n[k] = v;
      else if (v !== false && v != null) n.setAttribute(k, v);
    }
    for (const h of hijos) if (h !== false && h != null) n.append(h);
    return n;
  };
  const MENSAJES = {
    'mic-denied': 'Permiso de micr\xF3fono denegado. Act\xEDvalo en los ajustes del navegador.',
    'mic-not-found': 'No se encontr\xF3 ning\xFAn micr\xF3fono.',
    'mic-busy': 'Otra app est\xE1 usando el micr\xF3fono. \xC1rrala y reintenta.',
    'mic-ended': 'Se cort\xF3 el micr\xF3fono. Reintenta.',
    'insecure-context': 'El micr\xF3fono solo funciona en una p\xE1gina https.',
    'no-microphone-api': 'Este navegador no puede usar el micr\xF3fono.',
    'worklet-unsupported': 'Este navegador no puede procesar el audio en vivo.',
    'model-load-failed': 'No se pudo cargar el motor. Con internet, reintenta.',
    'worklet-load-failed': 'No se pudo cargar el motor. Con internet, reintenta.',
    'kernel-load-failed': 'No se pudo cargar el motor. Con internet, reintenta.',
  };

  let panel = null, caja = null, detector = null, seguidor = null, sesion = 0, vigilante = 0, avisoSilencio = 0, ultimasNotas = '', modeloActual = 'piano';

  const listaDeLaCancion = () => [...new Set([...caja.querySelectorAll('.chip b, .hoja .ac')].map(e => e.textContent.trim()))].map(leerAcorde).filter(Boolean);
  function marcar(nombre) {
    caja.querySelectorAll('.chip').forEach(c => c.classList.toggle('oye', !!nombre && c.firstChild && c.firstChild.textContent.trim() === nombre));
  }
  function pintar(estado, datos = {}) {
    panel.replaceChildren();
    const cerrar = el('button', { type: 'button', className: 'es-x', 'aria-label': 'Cerrar', onclick: () => detener(true) }, '\u2715');
    if (estado === 'listo') {
      panel.append(el('p', { className: 'es-txt' }, 'Pon el micr\xF3fono cerca del piano o de la bocina.'), el('div', { className: 'es-fila' }, el('button', { type: 'button', onclick: empezar }, 'Empezar a escuchar'), cerrar));
    } else if (estado === 'cargando') {
      panel.append(el('p', { className: 'es-txt', id: 'es-txt' }, 'Preparando el micr\xF3fono\u2026'), el('div', { className: 'es-fila' }, cerrar));
    } else if (estado === 'escuchando') {
      panel.append(el('div', { className: 'es-acorde', id: 'es-acorde', 'aria-live': 'polite' }, '\u2014'), el('div', { className: 'es-notas', id: 'es-notas' }, 'Toca algo\u2026'),
        el('div', { className: 'es-fila' }, el('button', { type: 'button', onclick: () => detener(false) }, 'Parar'), cerrar));
    } else {
      panel.append(el('p', { className: 'es-txt' }, datos.msg || 'Algo fall\xF3.'), el('div', { className: 'es-fila' }, el('button', { type: 'button', onclick: empezar }, 'Reintentar'), cerrar));
    }
  }
  const mensajeDe = e => (e && MENSAJES[e.code]) || (e && e.message) || 'No se pudo iniciar el micr\xF3fono.';

  function alTrama(notas, trama) {
    if (!seguidor || !panel) return;
    const ordenadas = notas.map(n => ({ midi: n.midi, prob: n.prob })).sort((a, b) => a.midi - b.midi);
    const txt = ordenadas.length ? ordenadas.map(n => nombreNota(n.midi)).join('  ') : '\u2026';
    const lin = panel.querySelector('#es-notas');
    if (lin && txt !== ultimasNotas) { ultimasNotas = txt; lin.firstChild ? (lin.firstChild.nodeValue = txt) : lin.append(txt); }
    if (ordenadas.length) { clearTimeout(avisoSilencio); avisoSilencio = 0; }
    for (const ev of seguidor.alimentar({ t: trama.time, notas: ordenadas, probs: trama.probs })) {
      const ac = panel.querySelector('#es-acorde');
      if (ac) ac.textContent = ev.nombre;
      if (lin && ev.clase === 'lista' && ev.libre && ev.libre !== ev.nombre) { ultimasNotas = txt + '  (suena como ' + ev.libre + ')'; lin.textContent = ultimasNotas; }
      marcar(ev.clase === 'lista' ? ev.nombre : '');
    }
  }

  async function empezar() {
    detener(false, true);
    const mia = ++sesion;
    pintar('cargando');
    seguidor = new Seguidor({ candidatos: (() => { const l = listaDeLaCancion(); return l.length ? l : null; })() });
    try {
      const { create } = await import(rutaMotor());
      if (mia !== sesion) return;
      modeloActual = 'piano';
      let ultimoError = null;
      detector = create({
        model: 'piano',
        onNotes: (notas, trama) => { if (mia === sesion) alTrama(notas, trama); },
        onError: e => { ultimoError = e; if (mia === sesion) { pintar('error', { msg: mensajeDe(e) }); limpiar(); } },
      });
      const ok = await detector.start();
      if (mia !== sesion) { try { detector.stop(); } catch (e) { /* ya parado */ } return; }
      if (!ok) { pintar('error', { msg: mensajeDe(ultimoError) }); limpiar(); return; }
      pintar('escuchando');
      // Si el teléfono no da abasto con el modelo de piano, pasa al ligero (50 ms, casi igual de preciso).
      let apretado = 0;
      vigilante = setInterval(() => {
        try {
          const carga = detector && detector.stats && detector.stats.cpuLoad;
          apretado = carga > .8 ? apretado + 1 : 0;
          if (apretado >= 3 && modeloActual === 'piano') { modeloActual = 'fast'; detector.setModel('fast'); apretado = 0; }
        } catch (e) { /* sin estadística: se queda como está */ }
      }, 1000);
      // Si el sonido no arranca solo (el navegador lo deja en pausa hasta un toque), se avisa.
      avisoSilencio = setTimeout(() => {
        const lin = panel && panel.querySelector('#es-notas');
        if (lin && lin.textContent === 'Toca algo\u2026') lin.textContent = 'Si no responde, toca la pantalla una vez.';
      }, 2500);
    } catch (e) {
      if (mia !== sesion) return;
      pintar('error', { msg: mensajeDe(e) });
      limpiar();
    }
  }

  function limpiar() {
    clearInterval(vigilante); vigilante = 0; clearTimeout(avisoSilencio); avisoSilencio = 0; ultimasNotas = '';
    if (detector) { try { detector.stop(); } catch (e) { /* ya parado */ } detector = null; }
    seguidor = null;
    if (caja) marcar('');
  }
  // cerrarTodo = quitar el panel; si no, vuelve a "Empezar a escuchar". silencioso = sin repintar (lo usa empezar()).
  function detener(cerrarTodo, silencioso) {
    sesion++;
    limpiar();
    if (cerrarTodo) { if (panel) { panel.remove(); panel = null; } caja = null; return; }
    if (!silencioso && panel) pintar('listo');
  }
  function alternar(contenedor) {
    if (panel) { detener(true); return; }
    caja = contenedor;
    panel = el('div', { className: 'escucha', role: 'region', 'aria-label': 'Escuchar tu piano' });
    document.body.append(panel);
    empezar();
  }

  raiz.Escucha = { alternar, parar: () => { if (panel || detector) detener(true); } };
})();
