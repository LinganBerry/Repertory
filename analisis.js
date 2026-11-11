// Análisis de las progresiones de tus canciones (sin pantalla: se prueba en Node, test/analisis-prueba.mjs):
//  - relacionadas(): qué otras canciones comparten la misma progresión (en números romanos, sin importar el tono)
// Usa romanos.js (el mismo cálculo de números romanos que ves en la canción).
(function (raiz) {
  'use strict';
  const R = raiz.Romanos;
  const clase = R.clase;
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

  raiz.Analisis = { ficha, fichasDeParte, firmaDe, periodo, minRot, relacion, relacionadas };
})(typeof window !== 'undefined' ? window : globalThis);
