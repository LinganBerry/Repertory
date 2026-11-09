// Análisis de las progresiones de tus canciones (sin pantalla: se prueba en Node, test/analisis-prueba.mjs):
//  - relacionadas(): qué otras canciones comparten la misma progresión (en números romanos, sin importar el tono)
//  - tip(): un tip de teoría aplicada a ESA canción (qué progresión es, acordes prestados, dominantes secundarios, modulación...)
// Usa romanos.js (el mismo cálculo de números romanos que ves en la canción). Nada se inventa: cada tip sale de una regla de teoría
// que se comprueba con los acordes reales de la canción; si ninguna aplica, da un dato seguro de la tonalidad.
(function (raiz) {
  'use strict';
  const R = raiz.Romanos;
  const LETRAS = R.LETRAS, PC = R.PC_LETRA, clase = R.clase;
  const esc = s => String(s == null ? '' : s);

  // ---------- fichas: grado + calidad de cada acorde (sin extensiones ni bajo) ----------
  function ficha(acorde, tono) {
    const r = R.romano(acorde, tono);
    if (!r) return null;
    const base = r.split('/')[0];
    const m = /^([♭♯]*)([ivIV]+)(°|ø|\+)?/.exec(base);
    if (!m) return null;
    const cal = m[3] === 'ø' ? '°' : (m[3] || '');
    return { f: m[1] + m[2] + cal, romano: r, acorde, extension: base.slice(m[0].length), bajo: r.includes('/') };
  }
  function fichasDeParte(parte, tonoCancion) {
    const tono = (parte && parte.tono) || tonoCancion;
    if (!parte || !parte.prog || !tono) return [];
    const out = [];
    for (const a of R.compases(parte.prog).flat()) { const f = ficha(a, tono); if (f) out.push(f); }
    return out;
  }
  const colapsar = fs => fs.filter((x, i) => i === 0 || x.f !== fs[i - 1].f);
  // Si la secuencia es un bloque que se repite (G D Em C G D Em C), se queda con el bloque.
  function periodo(arr) {
    const n = arr.length;
    for (let p = 1; p <= n / 2; p++) if (n % p === 0 && arr.every((x, i) => x === arr[i % p])) return arr.slice(0, p);
    return arr;
  }
  const firmaDe = fs => periodo(colapsar(fs).map(x => x.f));
  function minRot(arr) {
    let mejor = null;
    for (let i = 0; i < arr.length; i++) { const k = arr.slice(i).concat(arr.slice(0, i)).join('\u0001'); if (mejor === null || k < mejor) mejor = k; }
    return mejor;
  }
  const iguales = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  // 'igual' = misma secuencia; 'ciclo' = mismo ciclo empezando en otro acorde (solo ciclos de 4 a 8 acordes). Hace falta tener al menos 3 acordes distintos de recorrido.
  function relacion(a, b) {
    if (a.length < 3 || b.length < 3 || new Set(a).size < 2 || new Set(b).size < 2) return null;
    if (iguales(a, b)) return 'igual';
    if (a.length === b.length && a.length >= 4 && a.length <= 8 && minRot(a) === minRot(b)) return 'ciclo';
    return null;
  }

  // ---------- canciones con la misma progresión ----------
  const cache = new WeakMap();
  function partesFirmadas(c) {
    if (!c || typeof c !== 'object') return [];
    let v = cache.get(c);
    if (!v) {
      v = [];
      (Array.isArray(c.partes) ? c.partes : []).forEach((p, k) => {
        const fs = fichasDeParte(p, c.tono), firma = firmaDe(fs);
        if (firma.length >= 3) v.push({ nombre: (p.nombre || 'Parte ' + (k + 1)), firma, acordes: periodo(colapsar(fs).map(x => x.acorde)) });
      });
      cache.set(c, v);
    }
    return v;
  }
  function relacionadas(actual, canciones) {
    const mias = partesFirmadas(actual), out = [];
    if (!mias.length) return out;
    for (const c of Array.isArray(canciones) ? canciones : []) {
      if (!c || c === actual || c.borrada) continue;
      const hechas = new Map();
      for (const q of partesFirmadas(c)) for (const p of mias) {
        const tipo = relacion(p.firma, q.firma);
        if (!tipo) continue;
        const k = p.nombre + '\u0001' + q.nombre, previa = hechas.get(k);
        if (!previa || (previa.tipo === 'ciclo' && tipo === 'igual')) hechas.set(k, { tipo, mia: p.nombre, suya: q.nombre, romanos: q.firma.join(' '), acordes: q.acordes.join(' ') });
      }
      if (hechas.size) {
        const coincidencias = [...hechas.values()];
        out.push({ c, coincidencias, tipo: coincidencias.some(m => m.tipo === 'igual') ? 'igual' : 'ciclo' });
      }
    }
    return out.sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'igual' ? -1 : 1) || b.coincidencias.length - a.coincidencias.length || esc(a.c.titulo).localeCompare(esc(b.c.titulo), 'es'));
  }

  // ---------- notas, escalas y armaduras (por nombre de nota, como los números romanos) ----------
  const marca = d => (d > 0 ? '♯'.repeat(d) : d < 0 ? '♭'.repeat(-d) : '');
  const nombreNota = (letraIx, pc) => LETRAS[letraIx % 7] + marca(((pc - PC[letraIx % 7] + 18) % 12) - 6);
  function leerTono(texto) {
    const n = R.nota(texto);
    return n ? { n, menor: esc(texto).slice(n.largo).startsWith('m'), nombre: nombreNota(n.letra, clase(n)) + (esc(texto).slice(n.largo).startsWith('m') ? 'm' : '') } : null;
  }
  function escala(tono) {
    const t = leerTono(tono);
    if (!t) return null;
    const pasos = t.menor ? R.ESC_MENOR : R.ESC_MAYOR;
    return pasos.map((p, k) => nombreNota(t.n.letra + k, (clase(t.n) + p) % 12));
  }
  const BASE_QUINTAS = [0, 2, 4, -1, 1, 3, 5];   // C D E F G A B: cuántos sostenidos lleva su escala mayor
  function armadura(tono) {
    const t = leerTono(tono);
    if (!t) return null;
    const f = BASE_QUINTAS[t.n.letra] + 7 * t.n.alt - (t.menor ? 3 : 0);
    if (Math.abs(f) > 7) return null;   // tonalidad teórica (p. ej. D♭ menor): en la práctica se escribe como su equivalente
    const orden = f >= 0 ? ['F', 'C', 'G', 'D', 'A', 'E', 'B'].map(x => x + '♯') : ['B', 'E', 'A', 'D', 'G', 'C', 'F'].map(x => x + '♭');
    return { n: Math.abs(f), tipo: f >= 0 ? 'sostenidos' : 'bemoles', notas: orden.slice(0, Math.abs(f)) };
  }
  const texto = x => esc(x).replace(/#/g, '♯').replace(/(?<=[A-G])b(?![a-z])/g, '♭');   // para mostrar: C# → C♯ (sin tocar "Bb" mal: solo b después de una letra)

  // ---------- tip de teoría ----------
  // Progresiones conocidas. 'ciclo': la parte es ese ciclo empezando donde sea; 'tramo': aparece seguido dentro de la parte.
  const MAYOR = [
    { t: 'ciclo', f: ['I', 'V', 'vi', 'IV'], titulo: 'Los cuatro acordes del pop',
      texto: 'I–V–vi–IV es la progresión más usada del pop: tónica (I), dominante (V), relativo menor (vi) y subdominante (IV). Empezar por el vi (vi–IV–I–V) es el mismo ciclo: solo cambia el punto de partida y el ánimo.' },
    { t: 'ciclo', f: ['I', 'vi', 'IV', 'V'], titulo: 'La progresión de los años 50',
      texto: 'I–vi–IV–V es la progresión del «doo-wop» de los años 50: baja al relativo menor (vi), pasa por el subdominante (IV) y llega al dominante (V), que pide volver al I.' },
    { t: 'tramo', f: ['ii', 'V', 'I'], titulo: 'ii–V–I, la cadencia del jazz',
      texto: 'El ii prepara al V y el V tira con fuerza hacia el I: los tres bajos descienden de quinta en quinta, y por eso suena tan natural. Es la cadencia más usada del jazz y aparece en casi todo.' },
    { t: 'tramo', f: ['I', '♭VII', 'IV'], titulo: 'El ♭VII del rock',
      texto: 'El ♭VII no está en la escala mayor: es la séptima bajada medio tono, un acorde «prestado» del mixolidio. Da el sonido abierto del rock y el folk, y suele volver al IV o al I.' },
    { t: 'tramo', comun: true, f: ['I', 'IV', 'V'], titulo: 'Los tres acordes base',
      texto: 'I–IV–V son tónica, subdominante y dominante: reposo (I), movimiento (IV) y tensión (V). Con esos tres acordes se sostienen el blues, el folk y buena parte del rock.' },
    { t: 'tramo', comun: true, f: ['IV', 'I'], titulo: 'La cadencia plagal («amén»)',
      texto: 'IV–I es la cadencia plagal, la del «amén» de los himnos: no tiene la urgencia del V–I, pero cierra con calma y suavidad.' },
    { t: 'tramo', comun: true, f: ['V', 'I'], titulo: 'La cadencia auténtica',
      texto: 'V–I es la cadencia auténtica: el V (dominante) tiene la tensión y el I la resuelve. Es el «punto final» más claro de la música tonal.' }
  ];
  const MENOR = [
    { t: 'ciclo', f: ['i', 'VI', 'III', 'VII'], titulo: 'La del pop, vista desde el relativo menor',
      texto: 'i–VI–III–VII son los mismos acordes que I–V–vi–IV, vistos desde el relativo menor (vi–IV–I–V): es el ciclo de cuatro acordes del pop con sonido más oscuro.' },
    { t: 'tramo', f: ['i', 'VII', 'VI', 'V'], titulo: 'La cadencia andaluza',
      texto: 'i–VII–VI–V baja por grados conjuntos hasta un V mayor. Es la cadencia andaluza del flamenco: el V mayor sobre una tonalidad menor da una tensión muy fuerte que pide volver al i.' },
    { t: 'tramo', f: ['i', 'iv', 'V'], titulo: 'i–iv–V en menor',
      texto: 'Tónica menor, subdominante menor y dominante MAYOR. Ese V mayor sale de la menor armónica (se sube la 7ª): así el V tira con fuerza hacia el i.' },
    { t: 'tramo', f: ['i', 'iv', 'v'], titulo: 'i–iv–v, el menor «natural»',
      texto: 'Con v menor en vez de V mayor todo queda dentro de la escala menor natural: suena más suave y menos conclusivo que con el dominante mayor.' }
  ];
  const tramo = (seq, pat) => { for (let i = 0; i + pat.length <= seq.length; i++) if (pat.every((x, k) => seq[i + k] === x)) return i; return -1; };

  // comun = false: las progresiones características (pop, jazz, andaluza...). comun = true: las cadencias que aparecen en casi todo (I–IV–V, IV–I, V–I).
  function patron(cancion, comun) {
    const partes = Array.isArray(cancion.partes) ? cancion.partes : [];
    const orden = partes.map((p, k) => ({ p, k })).sort((a, b) => (/coro/i.test(b.p.nombre || '') ? 1 : 0) - (/coro/i.test(a.p.nombre || '') ? 1 : 0) || a.k - b.k);
    const analizadas = orden.map(({ p, k }) => {
      const fs = fichasDeParte(p, cancion.tono), col = colapsar(fs);
      const tono = leerTono((p && p.tono) || cancion.tono);
      return { p, k, fs, col, ciclo: periodo(col.map(x => x.f)), menor: !!(tono && tono.menor) };
    }).filter(a => a.col.length >= 2);
    for (const largos of [true, false]) {
      // primero los patrones de 3 o más acordes, luego las cadencias de 2
      for (const a of analizadas) {
        const lista = a.menor ? MENOR : MAYOR;
        for (const pat of lista) {
          if ((pat.f.length >= 3) !== largos || !!pat.comun !== comun) continue;
          if (pat.t === 'ciclo') {
            if (a.ciclo.length === pat.f.length && minRot(a.ciclo) === minRot(pat.f)) return { pat, a, desde: 0, rotado: !iguales(a.ciclo, pat.f) };
          } else {
            const i = tramo(a.col.map(x => x.f), pat.f);
            if (i >= 0) return { pat, a, desde: i, rotado: false };
          }
        }
      }
    }
    return null;
  }
  const ejemploDe = (a, desde, largo) => {
    const s = a.col.slice(desde, desde + largo);
    return { parte: (a.p.nombre || 'Parte ' + (a.k + 1)), acordes: s.map(x => texto(x.acorde)).join(' – '), romanos: s.map(x => x.romano.split('/')[0]).join(' – ') };
  };

  // Modulación: partes con distinta tonalidad.
  function modulacion(c) {
    const tonos = [];
    for (const p of (Array.isArray(c.partes) ? c.partes : [])) {
      if (!p || !p.prog) continue;
      const t = leerTono(p.tono || c.tono);
      if (t && (!tonos.length || tonos[tonos.length - 1].t.nombre !== t.nombre)) tonos.push({ t, p });
    }
    if (tonos.length < 2) return null;
    const a = tonos[0].t, b = tonos[1].t, d = (clase(b.n) - clase(a.n) + 12) % 12;
    let txt;
    if (a.menor !== b.menor && d === 0) txt = `pasa de ${texto(a.nombre)} a su tonalidad paralela, ${texto(b.nombre)}: la misma tónica, pero con el color del ${b.menor ? 'menor' : 'mayor'}.`;
    else if (a.menor !== b.menor && ((a.menor && d === 3) || (!a.menor && d === 9))) txt = `pasa de ${texto(a.nombre)} a su relativo, ${texto(b.nombre)}: las dos tonalidades comparten armadura y las mismas notas, solo cambia cuál suena como «casa».`;
    else if (d === 1 || d === 2) txt = `sube ${d === 1 ? 'medio tono' : 'un tono'}, de ${texto(a.nombre)} a ${texto(b.nombre)}: el cambio de tono hacia arriba da un empujón de energía, muy usado en la última vuelta del coro.`;
    else txt = `cambia de tonalidad, de ${texto(a.nombre)} a ${texto(b.nombre)}. Cada tonalidad tiene sus propios grados: por eso los números romanos de esa parte se cuentan desde su nueva tónica.`;
    return { titulo: 'La canción modula', texto: 'La parte «' + (tonos[1].p.nombre || 'siguiente') + '» ' + txt, ejemplo: null };
  }

  // Acordes prestados en tonalidad mayor.
  const PRESTADOS = {
    '♭VII': 'El ♭VII no está en la escala mayor: es la séptima bajada medio tono (viene del mixolidio, y también del menor). Es típico del rock y del folk.',
    '♭VI': 'El ♭VI es un acorde «prestado» de la tonalidad menor del mismo nombre: aparece de golpe y da un toque épico o dramático.',
    '♭III': 'El ♭III es un acorde «prestado» de la tonalidad menor del mismo nombre: abre un color más oscuro sin salir de la tonalidad.',
    'iv': 'El iv menor es un acorde «prestado» de la tonalidad menor del mismo nombre: pone un toque melancólico justo antes de volver al I.'
  };
  function prestado(c) {
    for (const p of (Array.isArray(c.partes) ? c.partes : [])) {
      const t = leerTono((p && p.tono) || c.tono);
      if (!t || t.menor) continue;
      const fs = fichasDeParte(p, c.tono);
      for (let i = 0; i < fs.length; i++) if (PRESTADOS[fs[i].f]) {
        const a = { p, k: 0, col: colapsar(fs) }, j = a.col.findIndex(x => x.f === fs[i].f);
        return { titulo: 'Un acorde prestado: ' + fs[i].f, texto: `${texto(fs[i].acorde)} (${fs[i].f}) en ${texto(t.nombre)}. ` + PRESTADOS[fs[i].f], ejemplo: ejemploDe({ ...a, p }, Math.max(0, j - 1), 3) };
      }
    }
    return null;
  }

  // Dominante secundario: un acorde mayor (o con 7) que está una quinta por encima del siguiente y no es el V de la tonalidad.
  function secundario(c) {
    for (const p of (Array.isArray(c.partes) ? c.partes : [])) {
      const t = leerTono((p && p.tono) || c.tono);
      if (!t || t.menor) continue;
      const fs = colapsar(fichasDeParte(p, c.tono));
      for (let i = 0; i + 1 < fs.length; i++) {
        const x = fs[i], y = fs[i + 1], nx = R.nota(x.acorde), ny = R.nota(y.acorde);
        if (!nx || !ny || !/^[IV]/.test(x.f) || x.f === 'V' || x.f === 'I' && !/^7/.test(x.extension)) continue;
        if (!/^[♭♯]?[ivIV]+$/.test(y.f) || /[♭♯]/.test(y.f)) continue;                     // el destino es un grado de la escala
        if ((clase(nx) - clase(ny) + 12) % 12 !== 7) continue;                              // x está una quinta por encima de y
        const natural = /^(II|III|VI)$/.test(x.f) || /^7/.test(x.extension);
        if (!natural) continue;
        const sensible = nombreNota(nx.letra + 2, (clase(nx) + 4) % 12);
        return { titulo: 'Un dominante secundario',
          texto: `${texto(x.acorde)} (${x.f}) es el V de ${texto(y.acorde)} (${y.f}): la «V/${y.f}». Tira hacia ${texto(y.acorde)} como el V tira hacia el I, y por eso trae una nota que no es de la tonalidad: ${texto(sensible)}.`,
          ejemplo: { parte: p.nombre || 'Parte', acordes: texto(x.acorde) + ' – ' + texto(y.acorde), romanos: x.romano + ' – ' + y.romano } };
      }
    }
    return null;
  }

  // Acordes con bajo (barra): inversión o bajo ajeno al acorde.
  function conBajo(c) {
    for (const p of (Array.isArray(c.partes) ? c.partes : [])) {
      const t = leerTono((p && p.tono) || c.tono);
      for (const a of R.compases(p && p.prog || '').flat()) {
        const m = /^(.*?)\/([A-G][#♯b♭]*)$/.exec(a), raiz = m && R.nota(m[1]), bajo = m && R.nota(m[2]);
        if (!raiz || !bajo || !t) continue;
        const menor = /^(min|m|-)(?!aj)|^dim|^o|^°/.test(m[1].slice(raiz.largo));
        const i = (clase(bajo) - clase(raiz) + 12) % 12;
        const rol = i === 0 ? null : i === (menor ? 3 : 4) ? 'la 3ª' : i === 7 ? 'la 5ª' : null;
        if (!rol) return { titulo: 'Un acorde con bajo distinto', texto: `${texto(a)} lleva ${texto(m[2])} en el bajo, una nota que no es del acorde (un «slash chord»): cambia el color sin cambiar el acorde de arriba, y deja que el bajo se mueva por su cuenta.`, ejemplo: null };
        return { titulo: 'Una inversión',
          texto: `${texto(a)} es ${texto(m[1])} con ${rol} en el bajo (${i === 7 ? 'segunda' : 'primera'} inversión): el acorde es el mismo, pero el bajo cambia. Sirve para que el bajo camine por grados conjuntos en vez de saltar.`, ejemplo: null };
      }
    }
    return null;
  }

  // Colores de acorde (sus, add9, maj7, 7).
  function color(c) {
    const exts = new Map();
    for (const p of (Array.isArray(c.partes) ? c.partes : [])) for (const f of fichasDeParte(p, c.tono)) {
      const e = f.extension;
      for (const [k, re] of [['sus', /^sus/], ['add9', /^add9|^\(add9\)/], ['maj7', /^maj7/], ['7', /^7/]]) if (re.test(e) && !exts.has(k)) exts.set(k, f);
    }
    const tex = {
      sus: ['Un acorde suspendido (sus)', 'el sus cambia la 3ª por la 2ª o la 4ª: el acorde queda «en el aire», sin ser mayor ni menor, y pide resolver.'],
      add9: ['Un acorde con add9', 'el add9 suma la 9ª (la misma nota que la 2ª) sin añadir la 7ª: da brillo y amplitud sin tensión.'],
      maj7: ['Un acorde maj7', 'el maj7 suma la 7ª mayor, a un semitono de la tónica: suena suave, abierto y «soñador», sin pedir resolver.'],
      '7': ['Un acorde con séptima', 'la 7ª menor sobre un acorde mayor lo vuelve dominante: crea tensión y empuja hacia el acorde una quinta más abajo.']
    };
    for (const k of ['sus', 'add9', 'maj7', '7']) if (exts.has(k)) { const f = exts.get(k); return { titulo: tex[k][0], texto: `${texto(f.acorde)} (${f.romano.split('/')[0]}): ` + tex[k][1], ejemplo: null }; }
    return null;
  }

  // Dato seguro de la tonalidad (siempre que haya tono).
  function tonalidad(c) {
    const t = leerTono(c.tono), e = escala(c.tono), a = armadura(c.tono);
    if (!t || !e) return null;
    const suf = t.menor ? ['m', 'dim', '', 'm', 'm', '', ''] : ['', 'm', 'm', '', '', 'm', 'dim'];
    const acordes = e.map((n, k) => texto(n + suf[k])).join('  ');
    const rel = t.menor ? e[2] : e[5] + 'm';
    const arm = !a ? 'es una tonalidad poco común (en la práctica se escribe con su equivalente)' : a.n === 0 ? 'no lleva sostenidos ni bemoles' : `lleva ${a.n} ${a.n === 1 ? a.tipo.replace('sostenidos', 'sostenido').replace('bemoles', 'bemol') : a.tipo} (${a.notas.join(' ')})`;
    return { titulo: 'Tu tonalidad: ' + texto(t.nombre),
      texto: `${texto(t.nombre)} ${arm}. Su relativo ${t.menor ? 'mayor' : 'menor'} es ${texto(rel)} (misma armadura). Los acordes naturales de la tonalidad: ${acordes}.`, ejemplo: null };
  }

  function tip(cancion) {
    if (!cancion || typeof cancion !== 'object') return null;
    const hay = (Array.isArray(cancion.partes) ? cancion.partes : []).some(p => p && p.prog);
    if (!hay) return null;
    const hacer = pa => {
      const largo = pa.pat.t === 'ciclo' ? pa.a.ciclo.length : pa.pat.f.length;
      const ej = ejemploDe(pa.a, pa.pat.t === 'ciclo' ? 0 : pa.desde, largo);
      const nota = pa.rotado ? ' En esta canción la parte empieza por otro acorde del ciclo.' : '';
      return { clave: 'patron', titulo: pa.pat.titulo, texto: pa.pat.texto + nota, ejemplo: ej };
    };
    // De lo más específico de ESTA canción a lo más general.
    const pa = patron(cancion, false);
    if (pa) return hacer(pa);
    for (const f of [modulacion, prestado, secundario]) { const r = f(cancion); if (r) return { clave: f.name, ...r }; }
    const pc = patron(cancion, true);
    if (pc) return hacer(pc);
    for (const f of [conBajo, color, tonalidad]) { const r = f(cancion); if (r) return { clave: f.name, ...r }; }
    return null;
  }

  raiz.Analisis = { ficha, fichasDeParte, firmaDe, periodo, minRot, relacion, relacionadas, escala, armadura, leerTono, tip };
})(typeof window !== 'undefined' ? window : globalThis);
