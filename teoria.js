// Pantalla "Teoría": escalas, modos y diccionario de acordes.
// La teoría la calcula la librería Tonal (https://github.com/tonaljs/tonal, licencia MIT),
// incluida tal cual en vendor/tonal.min.js. Aquí solo se dibuja. Nada de esto toca el servidor.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const SVG = 'http://www.w3.org/2000/svg';
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) k.includes('-') ? n.setAttribute(k, v) : (n[k] = v);
    n.append(...kids.flat().filter(k => k != null && k !== false));
    return n;
  };
  const sv = (tag, attrs = {}, ...kids) => {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    n.append(...kids);
    return n;
  };

  const TONICAS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const MODOS = [['ionian', 'Jónico', 'mayor'], ['dorian', 'Dórico'], ['phrygian', 'Frigio'], ['lydian', 'Lidio'],
    ['mixolydian', 'Mixolidio'], ['aeolian', 'Eólico', 'menor natural'], ['locrian', 'Locrio']];
  const NOMBRES_MODO = new Set([...MODOS.map(m => m[0]), 'major', 'minor']);
  const TIPOS = [['', 'Mayor'], ['m', 'Menor'], ['dim', 'Disminuido'], ['aug', 'Aumentado'], ['sus2', 'Sus2'], ['sus4', 'Sus4'],
    ['maj7', 'Mayor 7'], ['7', 'Dominante 7'], ['m7', 'Menor 7'], ['m7b5', 'Semidisminuido'], ['dim7', 'Disminuido 7'], ['mMaj7', 'Menor con 7ª mayor'],
    ['6', 'Sexta'], ['m6', 'Menor 6'], ['add9', 'Add9'], ['9', 'Novena'], ['maj9', 'Mayor 9'], ['m9', 'Menor 9']];
  const ROM = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  const CALIDAD = { P: 'justa', M: 'mayor', m: 'menor', d: 'disminuida', A: 'aumentada', dd: 'doble disminuida', AA: 'doble aumentada' };

  const est = { tab: 'escalas', tonica: 'C', modo: 'ionian', otra: '', tipo: 'maj7' };
  let T = null, cargando = null;
  const caja = el('div', { id: 'teoria', hidden: true });
  document.body.append(caja);
  const VOLUMEN_PIANO = -2; // dB; medido: un acorde de 6 notas llega a 0.82 de 1.0 sin esto, así que queda margen
  let notas_en_cola = [];

  // --- intervalos → grados (♭3, ♯4…) respecto a la escala mayor ---
  const partir = code => { const m = /^(\d+)([PMmdA]+)$/.exec(code); return m && { n: Number(m[1]), q: m[2] }; };
  function alteracion({ n, q }) {
    const s = ((n - 1) % 7) + 1, justo = s === 1 || s === 4 || s === 5;
    if (justo) return q === 'P' ? 0 : q[0] === 'd' ? -q.length : q.length;
    return q === 'M' ? 0 : q === 'm' ? -1 : q[0] === 'd' ? -(q.length + 1) : q.length;
  }
  const signo = a => (a < 0 ? '♭'.repeat(-a) : '♯'.repeat(a));
  const grado = code => { const p = partir(code); return p ? signo(alteracion(p)) + p.n : code; };
  function nombreIntervalo(code) {
    const p = partir(code);
    if (!p) return code;
    if (p.n === 1 && p.q === 'P') return 'fundamental';
    if (p.n === 8 && p.q === 'P') return 'octava';
    return p.n + 'ª ' + (CALIDAD[p.q] || p.q);
  }
  const limpiarSimbolo = s => s.replace('Maj7', 'maj7');

  // --- teclado de 2 octavas: se marcan las notas (con su nombre bien escrito, F# o Gb) ---
  function teclado(notas, raiz) {
    const W = 24, H = 96, NEG = 58, BW = 15;
    const por = new Map();
    notas.forEach(n => { const c = T.Note.chroma(n); if (!por.has(c)) por.set(c, n); });
    const cRaiz = T.Note.chroma(raiz);
    const clase = (c, base) => base + (por.has(c) ? ' on' : '') + (c === cRaiz ? ' raiz' : '');
    const blancas = [0, 2, 4, 5, 7, 9, 11], negras = [[1, 0], [3, 1], [6, 3], [8, 4], [10, 5]];
    const svg = sv('svg', { viewBox: `0 0 ${W * 14} ${H}`, class: 'teclado', role: 'img', 'aria-label': 'Teclado con las notas ' + notas.join(' ') });
    const etiquetas = [];
    for (let o = 0; o < 2; o++) {
      blancas.forEach((c, i) => {
        const x = (o * 7 + i) * W;
        svg.append(sv('rect', { x, y: 0, width: W, height: H, class: clase(c, 'tk-b'), 'data-midi': 60 + o * 12 + c }));
        if (por.has(c)) etiquetas.push(sv('text', { x: x + W / 2, y: H - 8, class: 'tk-t' }, por.get(c)));
      });
    }
    for (let o = 0; o < 2; o++) {
      negras.forEach(([c, izq]) => {
        const x = (o * 7 + izq + 1) * W - BW / 2;
        svg.append(sv('rect', { x, y: 0, width: BW, height: NEG, class: clase(c, 'tk-n'), 'data-midi': 60 + o * 12 + c }));
        if (por.has(c)) etiquetas.push(sv('text', { x: x + BW / 2, y: NEG - 8, class: 'tk-t' }, por.get(c)));
      });
    }
    svg.append(...etiquetas);
    svg.addEventListener('pointerdown', e => { const m = Number(e.target.getAttribute && e.target.getAttribute('data-midi')); if (m) { e.preventDefault(); tocarTecla(m); } });
    return svg;
  }

  // --- sonido: Tone.js (https://github.com/Tonejs/Tone.js, MIT) + piano de cola Salamander Grand de Alexander Holm (CC BY 3.0),
  // muestras en vendor/piano/ (de https://github.com/Tonejs/audio). Si el piano no carga, suena un sintetizador simple. ---
  const PIANO = { A0: 'A0.mp3', C8: 'C8.mp3' };
  for (let o = 1; o <= 7; o++) Object.assign(PIANO, { ['C' + o]: `C${o}.mp3`, ['D#' + o]: `Ds${o}.mp3`, ['F#' + o]: `Fs${o}.mp3`, ['A' + o]: `A${o}.mp3` });
  let piano = null, pianoListo = false, pianoFallo = false, respaldo = null;
  const estadoPiano = () => (pianoListo ? 'Toca las teclas para oírlas.' : pianoFallo ? 'No se pudo cargar el piano: suena un sintetizador simple.' : 'Cargando piano…');
  const avisar = () => document.querySelectorAll('.estado-piano').forEach(n => { n.textContent = estadoPiano(); });
  function crearPiano() {
    if (piano || !window.Tone) return;
    piano = new Tone.Sampler({ urls: PIANO, baseUrl: '/vendor/piano/', release: 1,
      onload: () => { pianoListo = true; avisar(); }, onerror: () => { pianoFallo = true; avisar(); } });
    piano.volume.value = VOLUMEN_PIANO;
    // Un poco de sala para que no suene seco; si falla, el piano suena directo.
    try { piano.connect(new Tone.Reverb({ decay: 2.2, wet: 0.18 }).toDestination()); } catch (e) { piano.toDestination(); }
  }
  function instrumento() {
    if (pianoListo) return piano;
    if (!respaldo) {
      respaldo = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.25, sustain: 0.25, release: 0.9 } }).toDestination();
      respaldo.volume.value = -14;
    }
    return respaldo;
  }
  // Notas con octava, siempre hacia arriba desde la tónica (octava 4). Una escala termina en la octava de la tónica.
  function alturas(notas, cerrar) {
    const out = [];
    for (const n of notas) {
      let m = T.Note.midi(n + '4');
      if (m == null) continue;
      while (out.length && m <= out[out.length - 1]) m += 12;
      out.push(m);
    }
    if (cerrar && out.length) out.push(out[0] + 12);
    return out;
  }
  function parar() {
    notas_en_cola.forEach(clearTimeout);
    notas_en_cola = [];
    if (piano && pianoListo) piano.releaseAll();
    if (respaldo) respaldo.releaseAll();
  }
  // Ilumina un momento la tecla (si el sonido sale de las 2 octavas dibujadas, usa la misma nota en ellas).
  function pulsar(m, ms) {
    const k = 60 + (((m - 60) % 24) + 24) % 24;
    document.querySelectorAll(`#teoria .teclado [data-midi="${k}"]`).forEach(r => { r.classList.add('pulsa'); setTimeout(() => r.classList.remove('pulsa'), ms); });
  }
  // Tocar una tecla del teclado dibujado: suena con el piano y se ilumina al instante.
  function tocarTecla(m) {
    pulsar(m, 280);
    if (!window.Tone) { cargarTone().then(crearPiano).catch(() => {}); return; }
    Tone.start().then(() => instrumento().triggerAttackRelease(Tone.Frequency(m, 'midi').toFrequency(), 1.8, undefined, 0.8));
  }
  function escuchar(midis, junto) {
    if (!window.Tone) { cargarTone().then(crearPiano).catch(() => {}); return; } // aún cargando: se precarga al abrir Teoría
    Tone.start().then(() => {
      parar();
      const inst = instrumento(), f = m => Tone.Frequency(m, 'midi').toFrequency();
      if (junto) { inst.triggerAttackRelease(midis.map(f), 2.2, undefined, 0.8); midis.forEach(m => pulsar(m, 700)); }
      else midis.forEach((m, i) => notas_en_cola.push(setTimeout(() => { inst.triggerAttackRelease(f(m), 0.6, undefined, 0.8); pulsar(m, 380); }, i * 420)));
    });
  }
  const sonar = (etiqueta, midis, junto) => el('button', { type: 'button', onclick: () => escuchar(midis, junto) }, etiqueta);

  // --- piezas de interfaz ---
  const grupo = (opciones, activo, alElegir) =>
    el('div', { className: 'tg' }, ...opciones.map(([v, texto]) =>
      el('button', { type: 'button', 'aria-pressed': String(v === activo), onclick: () => alElegir(v) }, texto)));
  function selector(etiqueta, opciones, valor, alElegir) {
    const s = el('select', { 'aria-label': etiqueta, onchange: e => alElegir(e.target.value) },
      ...opciones.map(([v, t]) => el('option', { value: v }, t)));
    s.value = valor;
    return s;
  }
  const fichas = (notas, grados) => el('div', { className: 'chips' },
    ...notas.map((n, i) => el('span', { className: 'chip' }, el('b', {}, n), el('i', { className: 'rom' }, grados[i]))));
  const nota = txt => el('p', { className: 'a' }, txt);

  // --- Escalas y modos ---
  function escalas() {
    const { Scale, ScaleType, Mode, Chord } = T;
    const nombre = est.otra || est.modo;
    const sc = Scale.get(`${est.tonica} ${nombre}`);
    const modoES = MODOS.find(m => m[0] === est.modo);
    const titulo = est.otra ? `${est.tonica} ${est.otra}` : `${est.tonica} ${modoES[1].toLowerCase()}`;
    const controles = [
      el('p', { className: 'a' }, 'Tónica'),
      grupo(TONICAS.map(t => [t, t]), est.tonica, v => { est.tonica = v; dibujar(); }),
      el('p', { className: 'a' }, 'Modo'),
      grupo(MODOS.map(m => [m[0], m[1]]), est.otra ? '' : est.modo, v => { est.modo = v; est.otra = ''; dibujar(); }),
      el('p', { className: 'a' }, 'Otras escalas (nombre en inglés, tal como las trae la librería)'),
      selector('Otras escalas',
        [['', '— elegir —'], ...ScaleType.all().filter(s => !NOMBRES_MODO.has(s.name)).map(s => [s.name, s.name])],
        est.otra, v => { est.otra = v; dibujar(); })
    ];
    if (sc.empty) return { controles, detalles: [el('p', { className: 'vacio' }, 'No se pudo calcular esa escala.')] };
    const grados = sc.intervals.map(grado), detalles = [];
    if (!est.otra && modoES[2]) detalles.push(nota('Es la escala ' + modoES[2] + '.'));
    detalles.push(fichas(sc.notes, grados), nota('Fórmula: ' + grados.join(' ')));
    if (sc.intervals.length === 7) {
      const dif = grados.filter(g => /^[♭♯]/.test(g));
      detalles.push(nota(dif.length ? 'Diferencia con la mayor: ' + dif.join(' · ') : 'Es igual a la escala mayor.'));
    }
    if (!est.otra) {
      const tri = Mode.triads(est.modo, est.tonica).map(limpiarSimbolo);
      const sep = Mode.seventhChords(est.modo, est.tonica).map(limpiarSimbolo);
      const rom = tri.map((s, i) => {
        const q = Chord.get(s).quality, base = ROM[i], p = partir(sc.intervals[i]);
        const menor = q === 'Minor' || q === 'Diminished';
        return (p ? signo(alteracion(p)) : '') + (menor ? base.toLowerCase() : base) + (q === 'Diminished' ? '°' : q === 'Augmented' ? '+' : '');
      });
      detalles.push(el('div', { className: 'parte' }, el('h3', {}, 'Tríadas del modo'), fichas(tri, rom)));
      detalles.push(el('div', { className: 'parte' }, el('h3', {}, 'Séptimas del modo'), fichas(sep, rom)));
      detalles.push(nota('Números romanos respecto a la escala mayor de la misma tónica (♭ y ♯ indican grados alterados).'));
    }
    return { titulo, notas: sc.notes, raiz: sc.notes[0], botones: [sonar('▶ Escala', alturas(sc.notes, true), false)], controles, detalles };
  }

  // --- Diccionario de acordes ---
  const simbolo = ct => (ct.aliases.includes('') ? '' : ct.aliases[0]);
  function acordes() {
    const { Chord, ChordType } = T;
    const todos = ChordType.all().filter(c => c.aliases.length)
      .map(c => ({ alias: simbolo(c), c })).sort((a, b) => a.alias.length - b.alias.length || a.alias.localeCompare(b.alias));
    const ch = Chord.getChord(est.tipo, est.tonica);
    const curado = TIPOS.find(t => t[0] === est.tipo);
    const controles = [
      el('p', { className: 'a' }, 'Tónica'),
      grupo(TONICAS.map(t => [t, t]), est.tonica, v => { est.tonica = v; dibujar(); }),
      el('p', { className: 'a' }, 'Tipo'),
      grupo(TIPOS.map(t => [t[0], t[1]]), est.tipo, v => { est.tipo = v; dibujar(); }),
      el('p', { className: 'a' }, `Más acordes (${todos.length} tipos de la librería)`),
      selector('Más acordes', todos.map(({ alias, c }) => [alias, est.tonica + alias + (c.name ? ' — ' + c.name : '')]), est.tipo, v => { est.tipo = v; dibujar(); })
    ];
    if (ch.empty) return { controles, detalles: [el('p', { className: 'vacio' }, 'No se pudo calcular ese acorde.')] };
    const sim = est.tonica + est.tipo, grados = ch.intervals.map(grado), detalles = [];
    detalles.push(nota(curado ? curado[1] : (ch.name || ch.aliases.join(' · '))));
    const otros = ch.aliases.filter(a => a !== est.tipo).map(a => est.tonica + a);
    if (otros.length) detalles.push(nota('También se escribe: ' + otros.slice(0, 6).join(', ')));
    detalles.push(fichas(ch.notes, grados), nota('Fórmula: ' + grados.join(' ') + ' (' + ch.intervals.map(nombreIntervalo).join(', ') + ')'));
    const alt = alturas(ch.notes, false);
    if (ch.notes.length <= 4) {
      const nombres = ['Posición fundamental', '1ª inversión', '2ª inversión', '3ª inversión'];
      ch.notes.forEach((_, i) => detalles.push(el('div', { className: 'parte' }, el('h3', {}, nombres[i]),
        el('div', { className: 'chips' }, ...ch.notes.slice(i).concat(ch.notes.slice(0, i)).map(n => el('span', { className: 'chip' }, el('b', {}, n)))))));
    }
    return { titulo: sim, notas: ch.notes, raiz: ch.notes[0], botones: [sonar('▶ Acorde', alt, true), sonar('▶ Arpegio', alt, false)], controles, detalles };
  }

  // --- pantalla ---
  async function dibujar() {
    parar();
    const y = caja.scrollTop;
    const barra = el('div', { className: 'cbarra' },
      el('button', { type: 'button', onclick: () => history.back() }, '← Volver'),
      el('span', { className: 'ctitulo' }, 'Teoría'));
    let panel = null, cuerpo;
    try {
      await cargarTonal();
      const r = est.tab === 'escalas' ? escalas() : acordes();
      // Arriba (fijo): título, botones de sonido y teclado. Abajo: lo que eliges y los detalles.
      if (r.notas) panel = el('div', { className: 'tpanel' },
        el('div', { className: 'tfila' }, el('h2', {}, r.titulo), ...r.botones, el('button', { type: 'button', 'aria-label': 'Parar', onclick: parar }, '■')),
        teclado(r.notas, r.raiz),
        el('p', { className: 'a estado-piano' }, estadoPiano()));
      cuerpo = [
        grupo([['escalas', 'Escalas y modos'], ['acordes', 'Acordes']], est.tab, v => { est.tab = v; dibujar(); }),
        ...r.controles, ...r.detalles,
        el('p', { className: 'a' }, 'Cálculo: librería Tonal ', el('a', { href: 'https://github.com/tonaljs/tonal', target: '_blank', rel: 'noopener noreferrer' }, 'github.com/tonaljs/tonal'), ' (MIT) y Tone.js ', el('a', { href: 'https://github.com/Tonejs/Tone.js', target: '_blank', rel: 'noopener noreferrer' }, 'github.com/Tonejs/Tone.js'), ' (MIT) para el sonido. Piano: Salamander Grand Piano de Alexander Holm, ', el('a', { href: 'https://creativecommons.org/licenses/by/3.0/', target: '_blank', rel: 'noopener noreferrer' }, 'CC BY 3.0'), '.')
      ];
    } catch (e) {
      cuerpo = [el('p', { className: 'vacio' }, 'No se pudo cargar la teoría. Abre la página con internet una vez y vuelve a intentar.')];
    }
    caja.replaceChildren(...[barra, panel, el('div', { className: 'ccuerpo' }, ...cuerpo)].filter(Boolean));
    if (panel) panel.style.top = barra.offsetHeight + 'px';
    caja.scrollTop = y;
  }
  function cargarTonal() {
    if (window.Tonal) { T = window.Tonal; return Promise.resolve(T); }
    return cargando || (cargando = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = '/vendor/tonal.min.js';
      s.onload = () => { T = window.Tonal; ok(T); };
      s.onerror = () => { cargando = null; no(new Error('sin librería')); };
      document.head.append(s);
    }));
  }
  let cargandoTone = null;
  function cargarTone() {
    if (window.Tone) return Promise.resolve();
    return cargandoTone || (cargandoTone = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = '/vendor/Tone.js';
      // Tone usaría un worker interno por blob:, que tu política de seguridad bloquea; se le pide el reloj normal.
      s.onload = () => { try { Tone.getContext().clockSource = 'timeout'; } catch (e) { /* sigue igual */ } ok(); };
      s.onerror = () => { cargandoTone = null; no(new Error('sin sonido')); };
      document.head.append(s);
    }));
  }
  function abrir() {
    history.pushState({ teoria: true }, '');
    caja.hidden = false;
    document.body.classList.add('fija');
    caja.scrollTop = 0;
    cargarTone().then(crearPiano).catch(() => {}); // se baja ahora para que el primer toque ya pueda sonar
    dibujar();
  }
  function cerrar() {
    parar();
    caja.hidden = true;
    document.body.classList.remove('fija');
  }
  window.addEventListener('popstate', () => { if (!caja.hidden) cerrar(); });
  $('teoria-btn').addEventListener('click', abrir);
})();
