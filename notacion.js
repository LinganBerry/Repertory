// Lógica pura de Practicar (sin DOM): notas, claves, niveles, generador de preguntas, dibujo del pentagrama y del
// teclado (como texto SVG) y cálculo de estadísticas. Se carga en la página y también en las pruebas (test/).
// Fuente musical: "Atril Notas", subconjunto de Bravura (SIL OFL 1.1, Steinberg). Ver vendor/OFL-Bravura.txt.
(function (raiz) {
  'use strict';
  const LETRAS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const ALT = { '-1': 'b', '0': '', '1': '#' };
  const BONITO = { '-1': '♭', '0': '', '1': '♯' };

  // --- notas ---
  const nota = (l, a, o) => ({ l, a, o });
  const indice = n => n.o * 7 + LETRAS.indexOf(n.l);                    // posición diatónica absoluta
  const deIndice = (d, a = 0) => nota(LETRAS[((d % 7) + 7) % 7], a, Math.floor(d / 7));
  const midi = n => 12 * (n.o + 1) + PC[n.l] + n.a;
  const nombre = (n, conOctava = true) => n.l + ALT[n.a] + (conOctava ? n.o : '');
  const bonito = n => n.l + BONITO[n.a];
  const NOMBRES_PC = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'];
  const NATURALES_PC = [0, 2, 4, 5, 7, 9, 11], NEGRAS_PC = [1, 3, 6, 8, 10];
  const esNegra = pc => NEGRAS_PC.includes(((pc % 12) + 12) % 12);

  // --- claves: base = nota de la línea inferior; linea = posición (0 = línea inferior) donde "se apoya" el símbolo ---
  const CLAVES = {
    sol: { nombre: 'Clave de sol', base: indice(nota('E', 0, 4)), glifo: '\uE050', linea: 2 },
    fa: { nombre: 'Clave de fa', base: indice(nota('G', 0, 2)), glifo: '\uE062', linea: 6 },
    alto: { nombre: 'Clave de do (alto)', base: indice(nota('F', 0, 3)), glifo: '\uE05C', linea: 4 },
    tenor: { nombre: 'Clave de do (tenor)', base: indice(nota('D', 0, 3)), glifo: '\uE05C', linea: 6 }
  };
  const posicion = (clave, n) => indice(n) - CLAVES[clave].base;
  const notaEnPos = (clave, pos, a = 0) => deIndice(CLAVES[clave].base + pos, a);

  // --- temas y niveles ---
  const rango = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const NIVELES_PENTAGRAMA = [
    { id: 1, nombre: 'Líneas', pos: [0, 2, 4, 6, 8], alt: false },
    { id: 2, nombre: 'Espacios', pos: [1, 3, 5, 7], alt: false },
    { id: 3, nombre: 'Pentagrama completo', pos: rango(0, 8), alt: false },
    { id: 4, nombre: 'Líneas adicionales', pos: [...rango(-4, -1), ...rango(9, 12)], alt: false },
    { id: 5, nombre: 'Con alteraciones', pos: rango(-4, 12), alt: true }
  ];
  const NIVELES_TECLADO = [
    { id: 1, nombre: 'C D E', pcs: [0, 2, 4] },
    { id: 2, nombre: 'F G A B', pcs: [5, 7, 9, 11] },
    { id: 3, nombre: 'Las 7 naturales', pcs: NATURALES_PC },
    { id: 4, nombre: 'Teclas negras', pcs: NEGRAS_PC },
    { id: 5, nombre: 'Las 12 notas', pcs: rango(0, 11) }
  ];
  const TEMAS = {
    sol: { grupo: 'Pentagrama', nombre: 'Clave de sol', tipo: 'pentagrama', niveles: NIVELES_PENTAGRAMA },
    fa: { grupo: 'Pentagrama', nombre: 'Clave de fa', tipo: 'pentagrama', niveles: NIVELES_PENTAGRAMA },
    alto: { grupo: 'Pentagrama', nombre: 'Clave de do (alto)', tipo: 'pentagrama', niveles: NIVELES_PENTAGRAMA },
    tenor: { grupo: 'Pentagrama', nombre: 'Clave de do (tenor)', tipo: 'pentagrama', niveles: NIVELES_PENTAGRAMA },
    teclado: { grupo: 'Teclado', nombre: 'Nombrar la tecla marcada', tipo: 'teclado', niveles: NIVELES_TECLADO },
    tecla: { grupo: 'Teclado', nombre: 'Tocar la tecla de la nota', tipo: 'tecla', niveles: NIVELES_TECLADO }
  };

  // --- estadísticas (a partir de las sesiones guardadas) ---
  // sesión: { id, t: tema, l: nivel, f: 'AAAA-MM-DD', n, a, ms, q: [[item, 1|0, ms], ...] }
  function estadisticas(sesiones) {
    const items = {}, temas = {};
    for (const s of sesiones || []) {
      const t = temas[s.t + ':' + s.l] || (temas[s.t + ':' + s.l] = { sesiones: 0, n: 0, a: 0, ms: 0, ultimas: [] });
      t.sesiones++; t.n += s.n; t.a += s.a; t.ms += s.ms; t.ultimas.push(s.n ? s.a / s.n : 0);
      for (const [item, ok, ms] of s.q || []) {
        const i = items[item] || (items[item] = { v: 0, a: 0, ms: 0 });
        i.v++; i.a += ok ? 1 : 0; i.ms += ms || 0;
      }
    }
    return { items, temas };
  }
  // Precisión reciente de un tema+nivel: media de sus últimas 3 sesiones (o null si no hay).
  function precision(est, tema, nivel) {
    const t = est.temas[tema + ':' + nivel];
    if (!t || !t.ultimas.length) return null;
    const u = t.ultimas.slice(-3);
    return u.reduce((x, y) => x + y, 0) / u.length;
  }
  // Racha de días seguidos con práctica, terminando hoy o ayer. 'hoy' = 'AAAA-MM-DD'.
  function racha(sesiones, hoy) {
    const dias = new Set((sesiones || []).map(s => s.f));
    const ant = f => { const d = new Date(f + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
    let dia = dias.has(hoy) ? hoy : ant(hoy), n = 0;
    while (dias.has(dia)) { n++; dia = ant(dia); }
    return n;
  }

  // --- preguntas ---
  // Peso de cada ejercicio: lo que fallas o no has visto sale más. rng = () => número en [0,1).
  const peso = (est, item) => { const i = est && est.items[item]; return i && i.v ? 1 + 4 * (1 - i.a / i.v) : 2; };
  function elegir(cands, est, rng, evitar) {
    const lista = cands.length > 1 ? cands.filter(c => c.item !== evitar) : cands;
    const total = lista.reduce((s, c) => s + peso(est, c.item), 0);
    let r = rng() * total;
    for (const c of lista) { r -= peso(est, c.item); if (r <= 0) return c; }
    return lista[lista.length - 1];
  }
  function candidatos(tema, nivel) {
    const T = TEMAS[tema];
    if (!T) throw new Error('Tema desconocido: ' + tema);
    const N = T.niveles.find(n => n.id === nivel);
    if (!N) throw new Error('Nivel desconocido: ' + nivel);
    if (T.tipo === 'pentagrama') {
      const out = [];
      for (const pos of N.pos) {
        const alts = N.alt ? [-1, 0, 1] : [0];
        for (const a of alts) { const n = notaEnPos(tema, pos, a); out.push({ item: tema + ':' + nombre(n), nota: n, pos }); }
      }
      return out;
    }
    // teclado: dos octavas C4–B5; la tecla pedida puede estar en cualquiera
    const out = [];
    for (const pc of N.pcs) for (const o of [4, 5]) out.push({ item: (tema === 'tecla' ? 'tecla:' : 'tec:') + NOMBRES_PC[pc], pc, midi: 12 * (o + 1) + pc });
    return out;
  }
  // Un nivel con alteraciones: ~70 % de las notas llevan alteración (no todas los candidatos pesan igual).
  function crearPregunta(tema, nivel, est, rng, evitar) {
    const T = TEMAS[tema];
    let cands = candidatos(tema, nivel);
    if (T.tipo === 'pentagrama' && T.niveles.find(n => n.id === nivel).alt) {
      cands = cands.map(c => ({ ...c })); // 1 de cada 3 candidatos es natural: se reparte 33 % / 67 %
    }
    const c = elegir(cands, est, rng, evitar);
    if (T.tipo === 'pentagrama') return { tema, nivel, tipo: 'pentagrama', item: c.item, clave: tema, nota: c.nota, respuesta: { l: c.nota.l, a: c.nota.a }, etiqueta: nombre(c.nota, false) };
    if (T.tipo === 'teclado') return { tema, nivel, tipo: 'teclado', item: c.item, midi: c.midi, respuesta: { pc: c.pc }, etiqueta: NOMBRES_PC[c.pc] };
    return { tema, nivel, tipo: 'tecla', item: c.item, respuesta: { pc: c.pc }, etiqueta: NOMBRES_PC[c.pc] };
  }
  function comprobar(preg, resp) {
    if (preg.tipo === 'pentagrama') return resp.l === preg.respuesta.l && (resp.a || 0) === preg.respuesta.a;
    return ((resp.pc % 12) + 12) % 12 === preg.respuesta.pc;
  }
  // Botones de respuesta que corresponden a (tema, nivel).
  function botones(tema, nivel) {
    const T = TEMAS[tema], N = T.niveles.find(n => n.id === nivel);
    if (T.tipo === 'pentagrama') return { tipo: 'letras', letras: LETRAS.slice(), alteraciones: !!N.alt };
    if (T.tipo === 'tecla') return { tipo: 'ninguno' };
    const pcs = N.pcs.every(p => !esNegra(p)) ? NATURALES_PC : N.pcs.every(esNegra) ? NEGRAS_PC : rango(0, 11);
    return { tipo: 'pcs', pcs: pcs.map(p => ({ pc: p, texto: NOMBRES_PC[p] })) };
  }

  // --- dibujo (texto SVG; los colores salen de currentColor y de las clases de estilos.css) ---
  const S = 12, MITAD = S / 2, YB = 100;                  // espacio entre líneas, y de la línea inferior
  const fuente = 'font-family="Atril Notas, Bravura, Noto Music, serif"';
  const yPos = pos => YB - pos * MITAD;
  function svgPentagrama(clave, n) {
    const C = CLAVES[clave], pos = posicion(clave, n), X = 150, partes = [];
    for (const p of [0, 2, 4, 6, 8]) partes.push(`<line x1="8" y1="${yPos(p)}" x2="252" y2="${yPos(p)}" stroke="currentColor" stroke-width="1.2"/>`);
    partes.push(`<text x="16" y="${yPos(C.linea)}" font-size="${S * 4}" ${fuente} fill="currentColor" aria-hidden="true">${C.glifo}</text>`);
    const extra = [];
    if (pos <= -2) for (let p = -2; p >= (pos % 2 === 0 ? pos : pos + 1); p -= 2) extra.push(p);
    if (pos >= 10) for (let p = 10; p <= (pos % 2 === 0 ? pos : pos - 1); p += 2) extra.push(p);
    for (const p of extra) partes.push(`<line x1="${X - 16}" y1="${yPos(p)}" x2="${X + 16}" y2="${yPos(p)}" stroke="currentColor" stroke-width="1.2"/>`);
    if (n.a) partes.push(`<text x="${X - 26}" y="${yPos(pos)}" font-size="${S * 4}" ${fuente} fill="currentColor" text-anchor="middle" aria-hidden="true">${n.a > 0 ? '\uE262' : '\uE260'}</text>`);
    partes.push(`<text x="${X}" y="${yPos(pos)}" font-size="${S * 4}" ${fuente} fill="currentColor" text-anchor="middle" aria-hidden="true">\uE0A2</text>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" class="pentagrama" viewBox="0 0 260 150" role="img" aria-label="${C.nombre}: una nota en el pentagrama">${partes.join('')}</svg>`;
  }
  // Teclado de 2 octavas (C4–B5). opciones: { marcar: [midi], interactivo, clases: { midi: 'pk-ok' | 'pk-mal' } }
  function svgTeclado(op = {}) {
    const W = 22, H = 100, NW = 13, NH = 62, blancas = [], negras = [];
    const marcar = new Set(op.marcar || []), clases = op.clases || {};
    const attrs = (m, nom) => `data-midi="${m}"` + (op.interactivo ? ` tabindex="0" role="button" aria-label="${nom}"` : '');
    const cl = (m, base) => base + (marcar.has(m) ? ' pk-on' : '') + (clases[m] ? ' ' + clases[m] : '');
    const bl = [0, 2, 4, 5, 7, 9, 11], ng = [[1, 0], [3, 1], [6, 3], [8, 4], [10, 5]];
    for (let o = 0; o < 2; o++) {
      const base = 12 * (4 + o + 1);
      bl.forEach((pc, i) => blancas.push(`<rect x="${(o * 7 + i) * W}" y="0" width="${W}" height="${H}" class="${cl(base + pc, 'pk-b')}" ${attrs(base + pc, NOMBRES_PC[pc])}/>`));
      ng.forEach(([pc, izq]) => negras.push(`<rect x="${(o * 7 + izq + 1) * W - NW / 2}" y="0" width="${NW}" height="${NH}" class="${cl(base + pc, 'pk-n')}" ${attrs(base + pc, NOMBRES_PC[pc])}/>`));
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" class="pteclado" viewBox="0 0 ${14 * W} ${H + 2}" role="${op.interactivo ? 'group' : 'img'}" aria-label="${op.interactivo ? 'Teclado de piano' : 'Teclado de piano con una tecla marcada'}">${blancas.join('')}${negras.join('')}</svg>`;
  }

  const api = { LETRAS, PC, CLAVES, TEMAS, NIVELES_PENTAGRAMA, NIVELES_TECLADO, NOMBRES_PC, nota, indice, deIndice, midi, nombre, bonito, esNegra,
    posicion, notaEnPos, estadisticas, precision, racha, peso, candidatos, crearPregunta, comprobar, botones, svgPentagrama, svgTeclado };
  raiz.Notacion = api;
})(typeof window !== 'undefined' ? window : globalThis);
