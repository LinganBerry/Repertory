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

  // --- claves (solo sol y fa: las del piano); base = nota de la línea inferior; linea = posición (0 = línea inferior) donde "se apoya" el símbolo ---
  const CLAVES = {
    sol: { nombre: 'Clave de sol', base: indice(nota('E', 0, 4)), glifo: '\uE050', linea: 2 },
    fa: { nombre: 'Clave de fa', base: indice(nota('G', 0, 2)), glifo: '\uE062', linea: 6 }
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
  // --- oído: intervalos y acordes (semitonos desde la nota más grave) ---
  const INTERVALOS = [
    { id: '2m', n: 1, nombre: '2ª menor' }, { id: '2M', n: 2, nombre: '2ª mayor' }, { id: '3m', n: 3, nombre: '3ª menor' }, { id: '3M', n: 4, nombre: '3ª mayor' },
    { id: '4J', n: 5, nombre: '4ª justa' }, { id: 'TT', n: 6, nombre: 'Tritono' }, { id: '5J', n: 7, nombre: '5ª justa' }, { id: '6m', n: 8, nombre: '6ª menor' },
    { id: '6M', n: 9, nombre: '6ª mayor' }, { id: '7m', n: 10, nombre: '7ª menor' }, { id: '7M', n: 11, nombre: '7ª mayor' }, { id: '8J', n: 12, nombre: 'Octava' }
  ];
  const ACORDES = [
    { id: 'mayor', nombre: 'Mayor', pasos: [0, 4, 7] }, { id: 'menor', nombre: 'Menor', pasos: [0, 3, 7] },
    { id: 'dim', nombre: 'Disminuido', pasos: [0, 3, 6] }, { id: 'aum', nombre: 'Aumentado', pasos: [0, 4, 8] },
    { id: 'maj7', nombre: 'Mayor 7ª', pasos: [0, 4, 7, 11] }, { id: 'dom7', nombre: 'Dominante 7ª', pasos: [0, 4, 7, 10] },
    { id: 'm7', nombre: 'Menor 7ª', pasos: [0, 3, 7, 10] }, { id: 'm7b5', nombre: 'Semidisminuido', pasos: [0, 3, 6, 10] }
  ];
  const NIVELES_INTERVALOS = [
    { id: 1, nombre: '3m 3M 5J 8J', ids: ['3m', '3M', '5J', '8J'] },
    { id: 2, nombre: '+ 2m 2M 4J', ids: ['2m', '2M', '3m', '3M', '4J', '5J', '8J'] },
    { id: 3, nombre: '+ 6m 6M 7m 7M', ids: ['2m', '2M', '3m', '3M', '4J', '5J', '6m', '6M', '7m', '7M', '8J'] },
    { id: 4, nombre: 'Todos (con tritono)', ids: INTERVALOS.map(i => i.id) }
  ];
  const NIVELES_ACORDES = [
    { id: 1, nombre: 'Mayor y menor', ids: ['mayor', 'menor'] },
    { id: 2, nombre: '+ disminuido y aumentado', ids: ['mayor', 'menor', 'dim', 'aum'] },
    { id: 3, nombre: 'Séptimas', ids: ['maj7', 'dom7', 'm7', 'm7b5'] },
    { id: 4, nombre: 'Todos', ids: ACORDES.map(a => a.id) }
  ];
  // --- armaduras y escalas escritas ---
  // La armadura se cuenta en quintas: f > 0 son sostenidos y f < 0 bemoles (0 = C mayor / A menor). En la "línea de quintas"
  // F C G D A E B, la tónica mayor está en la posición f y la menor relativa 3 quintas más arriba. Se llega hasta 6 alteraciones:
  // la 7ª (C♯ / C♭) casi no se usa y su posición en clave de fa no está verificada.
  const QUINTAS = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  const ORDEN_SOST = QUINTAS, ORDEN_BEM = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
  const tonica = (f, modo) => { const p = f + (modo === 'm' ? 3 : 0); return nota(QUINTAS[(((p + 1) % 7) + 7) % 7], Math.floor((p + 1) / 7), 0); };
  const nombreTon = (f, modo, lindo) => { const t = tonica(f, modo); return (lindo ? bonito(t) : t.l + ALT[t.a]) + (modo === 'm' ? 'm' : ''); };
  const nombreLargo = (f, modo) => bonito(tonica(f, modo)) + (modo === 'm' ? ' menor' : ' mayor');
  const altEnArmadura = (f, letra) => (f > 0 && ORDEN_SOST.slice(0, f).includes(letra) ? 1 : f < 0 && ORDEN_BEM.slice(0, -f).includes(letra) ? -1 : 0);
  const gradoDeEscala = (f, modo, grado) => { const l = LETRAS[(LETRAS.indexOf(tonica(f, modo).l) + grado - 1) % 7]; return nota(l, altEnArmadura(f, l), 0); };
  const textoAlt = f => (f === 0 ? '0' : Math.abs(f) + (f > 0 ? '♯' : '♭'));
  const letrasAlt = f => (f === 0 ? 'sin alteraciones' : (f > 0 ? ORDEN_SOST.slice(0, f) : ORDEN_BEM.slice(0, -f)).map(l => l + (f > 0 ? '♯' : '♭')).join(' '));
  const NIVELES_TONALIDAD = [
    { id: 1, nombre: 'Mayores hasta 2', modo: 'M', max: 2 },
    { id: 2, nombre: 'Mayores hasta 4', modo: 'M', max: 4 },
    { id: 3, nombre: 'Mayores hasta 6', modo: 'M', max: 6 },
    { id: 4, nombre: 'Menores hasta 4', modo: 'm', max: 4 },
    { id: 5, nombre: 'Menores hasta 6', modo: 'm', max: 6 }
  ];
  const GRADOS = [2, 3, 4, 5, 6, 7];
  // Posición (0 = línea inferior) de cada sostenido / bemol en la armadura, en el orden en que se escriben.
  const POS_ARMADURA = {
    sol: { s: [8, 5, 9, 6, 3, 7], b: [4, 7, 3, 6, 2, 5] },
    fa: { s: [6, 3, 7, 4, 1, 5], b: [2, 5, 1, 4, 0, 3] }
  };
  // Cómo se muestra un ejercicio en "Para repasar" y en los fallos.
  function rotulo(item) {
    const i = item.indexOf(':');
    if (i < 0) return item;
    const pre = item.slice(0, i), r = item.slice(i + 1), bello = x => x.replace(/^([A-G])#/, '$1♯').replace(/^([A-G])b/, '$1♭');
    if (pre === 'as' || pre === 'af') return 'Armadura ' + bello(r);
    if (pre === 'an') return 'Alteraciones de ' + bello(r);
    if (pre === 'eg') { const [t, g] = r.split('.'); return bello(t) + ' · grado ' + g; }
    return r;
  }

  const SOST = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const nombreMidi = m => SOST[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

  const TEMAS = {
    sol: { grupo: 'Pentagrama', nombre: 'Clave de sol', tipo: 'pentagrama', niveles: NIVELES_PENTAGRAMA },
    fa: { grupo: 'Pentagrama', nombre: 'Clave de fa', tipo: 'pentagrama', niveles: NIVELES_PENTAGRAMA },
    teclado: { grupo: 'Teclado', nombre: 'Nombrar la tecla marcada', tipo: 'teclado', niveles: NIVELES_TECLADO },
    tecla: { grupo: 'Teclado', nombre: 'Tocar la tecla de la nota', tipo: 'tecla', niveles: NIVELES_TECLADO },
    'int-asc': { grupo: 'Oído', nombre: 'Intervalos que suben', tipo: 'oido', modo: 'asc', prefijo: 'ia', niveles: NIVELES_INTERVALOS, datos: INTERVALOS },
    'int-desc': { grupo: 'Oído', nombre: 'Intervalos que bajan', tipo: 'oido', modo: 'desc', prefijo: 'id', niveles: NIVELES_INTERVALOS, datos: INTERVALOS },
    'int-arm': { grupo: 'Oído', nombre: 'Intervalos a la vez', tipo: 'oido', modo: 'arm', prefijo: 'ih', niveles: NIVELES_INTERVALOS, datos: INTERVALOS },
    acordes: { grupo: 'Oído', nombre: 'Acordes', tipo: 'oido', modo: 'acorde', prefijo: 'ac', niveles: NIVELES_ACORDES, datos: ACORDES },
    'arm-sol': { grupo: 'Armaduras y escalas', nombre: 'Armadura → tonalidad (clave de sol)', tipo: 'armadura', clave: 'sol', prefijo: 'as', niveles: NIVELES_TONALIDAD },
    'arm-fa': { grupo: 'Armaduras y escalas', nombre: 'Armadura → tonalidad (clave de fa)', tipo: 'armadura', clave: 'fa', prefijo: 'af', niveles: NIVELES_TONALIDAD },
    'arm-num': { grupo: 'Armaduras y escalas', nombre: 'Tonalidad → alteraciones', tipo: 'cuantas', prefijo: 'an', niveles: NIVELES_TONALIDAD },
    escala: { grupo: 'Armaduras y escalas', nombre: 'Nota de una escala', tipo: 'escala', prefijo: 'eg', niveles: NIVELES_TONALIDAD }
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

  // --- sesión diaria y resumen ---
  const diasEntre = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
  const sumarDias = (f, d) => { const x = new Date(f + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
  // Elige el tema (y su nivel) de la siguiente pregunta de la sesión diaria: pesa más lo que dominas menos y lo que hace más días que
  // no practicas; lo que nunca has hecho también pesa. nivelDe(tema) = nivel elegido por la persona. Nunca repite el tema anterior.
  function elegirTemaDiario(est, sesiones, hoy, nivelDe, rng, evitar) {
    const ultimo = {};
    for (const s of sesiones || []) if (!ultimo[s.t] || s.f > ultimo[s.t]) ultimo[s.t] = s.f;
    const todos = Object.keys(TEMAS).map(tema => {
      const pedido = nivelDe(tema), nivel = TEMAS[tema].niveles.some(n => n.id === pedido) ? pedido : 1;
      const p = precision(est, tema, nivel), dias = ultimo[tema] ? Math.max(0, diasEntre(ultimo[tema], hoy)) : null;
      return { tema, nivel, peso: (p == null ? 2.5 : 1 + 4 * (1 - p)) + (dias == null ? 1 : Math.min(dias, 7) * 0.15) };
    });
    const lista = todos.length > 1 ? todos.filter(c => c.tema !== evitar) : todos;
    let r = rng() * lista.reduce((s, c) => s + c.peso, 0);
    for (const c of lista) { r -= c.peso; if (r <= 0) return { tema: c.tema, nivel: c.nivel }; }
    const u = lista[lista.length - 1]; return { tema: u.tema, nivel: u.nivel };
  }
  // Los últimos 7 días (el último es hoy): preguntas y aciertos de cada uno.
  function resumenSemana(sesiones, hoy) {
    return rango(0, 6).map(i => { const f = sumarDias(hoy, i - 6); let n = 0, a = 0; for (const s of sesiones || []) if (s.f === f) { n += s.n; a += s.a; } return { f, n, a }; });
  }
  // Puntos débiles: ejercicios con 3 o más intentos y menos de 80 % de aciertos, los peores primero.
  function debiles(est, max = 8) {
    return Object.entries(est.items).filter(([, i]) => i.v >= 3 && i.a / i.v < 0.8).sort((x, y) => x[1].a / x[1].v - y[1].a / y[1].v || y[1].v - x[1].v).slice(0, max)
      .map(([item, i]) => ({ item, rotulo: rotulo(item), acierto: i.a / i.v, intentos: i.v }));
  }
  // Los más lentos: ejercicios con 3 o más intentos, por tiempo medio de respuesta.
  function lentos(est, max = 5) {
    return Object.entries(est.items).filter(([, i]) => i.v >= 3 && i.ms > 0).sort((x, y) => y[1].ms / y[1].v - x[1].ms / x[1].v).slice(0, max)
      .map(([item, i]) => ({ item, rotulo: rotulo(item), seg: Math.round(i.ms / i.v / 100) / 10, intentos: i.v }));
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
    if (T.tipo === 'oido') return N.ids.map(id => ({ item: T.prefijo + ':' + id, id, dato: T.datos.find(d => d.id === id) }));
    if (T.tipo === 'armadura' || T.tipo === 'cuantas') return rango(-N.max, N.max).map(f => ({ item: T.prefijo + ':' + nombreTon(f, N.modo), f }));
    if (T.tipo === 'escala') return rango(-N.max, N.max).flatMap(f => GRADOS.map(g => ({ item: T.prefijo + ':' + nombreTon(f, N.modo) + '.' + g, f, g })));
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
    if (T.tipo === 'armadura' || T.tipo === 'cuantas' || T.tipo === 'escala') {
      const NV = T.niveles.find(n => n.id === nivel), modo = NV.modo, f = c.f, largo = nombreLargo(f, modo);
      if (T.tipo === 'armadura') return { tema, nivel, tipo: 'armadura', item: c.item, clave: T.clave, f, pedido: modo === 'M' ? '¿Qué tonalidad mayor es?' : '¿Qué tonalidad menor es?', respuesta: { id: String(f) }, etiqueta: nombreTon(f, modo, true), detalle: '(' + textoAlt(f) + (f ? ': ' + letrasAlt(f) : '') + ')' };
      if (T.tipo === 'cuantas') return { tema, nivel, tipo: 'cuantas', item: c.item, f, pedido: '¿Cuántas alteraciones lleva ' + largo + '?', respuesta: { id: String(f) }, etiqueta: textoAlt(f), detalle: '(' + letrasAlt(f) + ')', contexto: nombreTon(f, modo, true) };
      const g = gradoDeEscala(f, modo, c.g), escala = [1, 2, 3, 4, 5, 6, 7].map(x => bonito(gradoDeEscala(f, modo, x))).join(' ');
      return { tema, nivel, tipo: 'escala', item: c.item, f, grado: c.g, pedido: '¿Qué nota es el ' + c.g + 'º grado de ' + largo + (modo === 'm' ? ' natural' : '') + '?', respuesta: { l: g.l, a: g.a }, etiqueta: bonito(g), detalle: '(' + escala + ')', contexto: nombreTon(f, modo, true) + ' · ' + c.g + 'º' };
    }
    if (T.tipo === 'oido') {
      const d = c.dato, n = d.n;
      const r = T.modo === 'asc' || T.modo === 'arm' ? 48 + Math.floor(rng() * 25) : T.modo === 'desc' ? 60 + Math.floor(rng() * 25) : 48 + Math.floor(rng() * 20);
      let pasos, notas;
      if (T.modo === 'asc') { pasos = [{ midis: [r], en: 0, dur: 1.3 }, { midis: [r + n], en: 950, dur: 1.6 }]; notas = [r, r + n]; }
      else if (T.modo === 'desc') { pasos = [{ midis: [r], en: 0, dur: 1.3 }, { midis: [r - n], en: 950, dur: 1.6 }]; notas = [r, r - n]; }
      else if (T.modo === 'arm') { pasos = [{ midis: [r, r + n], en: 0, dur: 2.2 }]; notas = [r, r + n]; }
      else { notas = d.pasos.map(x => r + x); pasos = [{ midis: notas, en: 0, dur: 2.2 }]; }
      return { tema, nivel, tipo: 'oido', item: c.item, pasos, notas, respuesta: { id: c.id }, etiqueta: d.nombre, corto: c.id };
    }
    if (T.tipo === 'pentagrama') return { tema, nivel, tipo: 'pentagrama', item: c.item, clave: tema, nota: c.nota, respuesta: { l: c.nota.l, a: c.nota.a }, etiqueta: nombre(c.nota, false) };
    if (T.tipo === 'teclado') return { tema, nivel, tipo: 'teclado', item: c.item, midi: c.midi, respuesta: { pc: c.pc }, etiqueta: NOMBRES_PC[c.pc] };
    return { tema, nivel, tipo: 'tecla', item: c.item, respuesta: { pc: c.pc }, etiqueta: NOMBRES_PC[c.pc] };
  }
  function comprobar(preg, resp) {
    if (preg.tipo === 'oido') return resp.id === preg.respuesta.id;
    if (preg.tipo === 'armadura' || preg.tipo === 'cuantas') return resp.id === preg.respuesta.id;
    if (preg.tipo === 'pentagrama' || preg.tipo === 'escala') return resp.l === preg.respuesta.l && (resp.a || 0) === preg.respuesta.a;
    return ((resp.pc % 12) + 12) % 12 === preg.respuesta.pc;
  }
  // Botones de respuesta que corresponden a (tema, nivel).
  function botones(tema, nivel) {
    const T = TEMAS[tema], N = T.niveles.find(n => n.id === nivel);
    if (T.tipo === 'oido') return { tipo: 'opciones', opciones: N.ids.map(id => { const d = T.datos.find(x => x.id === id); return { id, texto: T.modo === 'acorde' ? d.nombre : id, titulo: d.nombre }; }) };
    if (T.tipo === 'armadura' || T.tipo === 'cuantas') return { tipo: 'opciones', opciones: rango(-N.max, N.max).map(f => (T.tipo === 'armadura' ? { id: String(f), texto: nombreTon(f, N.modo, true), titulo: nombreLargo(f, N.modo) } : { id: String(f), texto: textoAlt(f), titulo: letrasAlt(f) })) };
    if (T.tipo === 'escala') return { tipo: 'letras', letras: LETRAS.slice(), alteraciones: true };
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
  // Pentagrama con clave y armadura (sin nota). f > 0 sostenidos, f < 0 bemoles, hasta 6.
  function svgArmadura(clave, f) {
    const C = CLAVES[clave], P = POS_ARMADURA[clave][f > 0 ? 's' : 'b'], partes = [];
    if (!Number.isInteger(f) || Math.abs(f) > P.length) throw new Error('Armadura no admitida: ' + f);
    for (const p of [0, 2, 4, 6, 8]) partes.push(`<line x1="8" y1="${yPos(p)}" x2="252" y2="${yPos(p)}" stroke="currentColor" stroke-width="1.2"/>`);
    partes.push(`<text x="16" y="${yPos(C.linea)}" font-size="${S * 4}" ${fuente} fill="currentColor" aria-hidden="true">${C.glifo}</text>`);
    const glifo = f > 0 ? '\uE262' : '\uE260', paso = f > 0 ? 14 : 12;
    for (let i = 0; i < Math.abs(f); i++) partes.push(`<text x="${62 + i * paso}" y="${yPos(P[i])}" font-size="${S * 4}" ${fuente} fill="currentColor" aria-hidden="true">${glifo}</text>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" class="pentagrama" viewBox="0 0 260 150" role="img" aria-label="${C.nombre}: una armadura">${partes.join('')}</svg>`;
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
    elegirTemaDiario, resumenSemana, debiles, lentos, posicion, notaEnPos, nombreMidi, INTERVALOS, ACORDES, NIVELES_TONALIDAD, POS_ARMADURA, tonica, nombreTon, nombreLargo, altEnArmadura, gradoDeEscala, textoAlt, letrasAlt, rotulo, svgArmadura, estadisticas, precision, racha, peso, candidatos, crearPregunta, comprobar, botones, svgPentagrama, svgTeclado };
  raiz.Notacion = api;
})(typeof window !== 'undefined' ? window : globalThis);
