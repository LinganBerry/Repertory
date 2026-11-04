// Hoja de acordes: convierte la letra con acordes entre corchetes ("[Am]Cuando salga el [F]sol") en líneas listas
// para dibujar. Lógica pura, sin DOM. Se carga en la página y en las pruebas (test/).
(function (raiz) {
  'use strict';
  // Un nombre de acorde: raíz, calidad (m, maj7, sus4, add9, 7, dim, aug, +, ø, Δ…) y bajo opcional (D/F#). También "N.C.".
  const ACORDE = /^(?:[A-G][#b\u266F\u266D]?(?:m|min|maj|M|dim|aug|sus|add|\d|[+\u00B0\u00F8\u0394\-()#b\u266F\u266D,])*(?:\/[A-G][#b\u266F\u266D]?)?|N\.?C\.?)$/;
  const esAcorde = t => typeof t === 'string' && t.length > 0 && t.length <= 24 && ACORDE.test(t.trim());

  const CORCHETE = /\[([^\[\]\n]{1,24})\]/g;

  // Una línea -> segmentos { ac, tx }: el acorde va justo encima del texto que sigue.
  function segmentos(linea) {
    const segs = [];
    let ult = 0, m, hay = false;
    CORCHETE.lastIndex = 0;
    let actual = { ac: '', tx: '' };
    while ((m = CORCHETE.exec(linea)) !== null) {
      const dentro = m[1].trim();
      if (!dentro) continue;                       // "[]" o "[ ]" se muestra tal cual, como texto
      actual.tx += linea.slice(ult, m.index);
      if (actual.ac || actual.tx) segs.push(actual);
      actual = { ac: dentro, tx: '' };
      ult = m.index + m[0].length; hay = true;
    }
    actual.tx += linea.slice(ult);
    if (actual.ac || actual.tx || !segs.length) segs.push(actual);
    return { segs, conAc: hay };
  }

  /** texto -> [{ t:'v' } | { t:'s', x } | { t:'l', segs, conAc }]  (v = línea vacía, s = título de sección, l = línea) */
  function interpretar(texto) {
    const lineas = String(texto || '').replace(/\r\n?/g, '\n').split('\n');
    const salida = [];
    for (let linea of lineas) {
      linea = linea.replace(/\s+$/, '');
      if (!linea.trim()) { if (salida.length && salida[salida.length - 1].t !== 'v') salida.push({ t: 'v' }); continue; }
      const sec = /^\s*\[([^\[\]\n]{1,40})\]\s*:?\s*$/.exec(linea);
      if (sec && !esAcorde(sec[1].trim())) { salida.push({ t: 's', x: sec[1].trim() }); continue; }
      const { segs, conAc } = segmentos(linea);
      salida.push({ t: 'l', segs, conAc });
    }
    while (salida.length && salida[salida.length - 1].t === 'v') salida.pop();
    return salida;
  }

  /** Acordes distintos, en orden de aparición. */
  function acordes(texto) {
    const vistos = [];
    for (const l of interpretar(texto)) if (l.t === 'l') for (const s of l.segs) if (s.ac && esAcorde(s.ac) && !vistos.includes(s.ac)) vistos.push(s.ac);
    return vistos;
  }

  raiz.Hoja = { esAcorde, interpretar, acordes };
})(typeof window !== 'undefined' ? window : globalThis);
