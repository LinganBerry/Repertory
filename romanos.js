// Números romanos y compases, en un solo lugar (los usan la pantalla de canción, Practicar y el análisis de progresiones).
// Sin pantalla: se puede probar en Node (test/romanos-prueba.mjs).
(function (raiz) {
  'use strict';
  // --- números romanos ---
  // Se calculan por NOMBRE de nota, no solo por semitonos: así F en G es ♭VII y nunca ♯VI.
  //  1) el grado sale de la distancia de letras entre el tono y la raíz (G → F = séptimo grado);
  //  2) la alteración (♭/♯) sale de comparar la raíz con ese grado en la escala del tono;
  //  3) mayúscula/minúscula y sufijo salen de la calidad del acorde.
  // Tono mayor: escala mayor. Tono menor: escala menor natural (III, VI y VII salen sin alteración).
  const LETRAS = 'CDEFGAB', PC_LETRA = [0, 2, 4, 5, 7, 9, 11];
  const ESC_MAYOR = [0, 2, 4, 5, 7, 9, 11], ESC_MENOR = [0, 2, 3, 5, 7, 8, 10];
  const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  const nota = s => {
    const m = /^([A-G])([#♯b♭]*)/.exec(s || '');
    return m && { letra: LETRAS.indexOf(m[1]), alt: [...m[2]].reduce((a, x) => a + (x === '#' || x === '♯' ? 1 : -1), 0), largo: m[0].length };
  };
  const clase = n => (PC_LETRA[n.letra] + n.alt + 120) % 12;
  function grado(n, tono) {
    const d = (n.letra - tono.nota.letra + 7) % 7;
    const esperado = (clase(tono.nota) + (tono.menor ? ESC_MENOR : ESC_MAYOR)[d]) % 12;
    const dif = ((clase(n) - esperado + 18) % 12) - 6;
    return { d, alt: dif > 0 ? '♯'.repeat(dif) : '♭'.repeat(-dif) };
  }
  function romano(acorde, tonoTexto) {
    const n0 = nota(tonoTexto);
    const tono = n0 && { nota: n0, menor: tonoTexto.slice(n0.largo).startsWith('m') };
    const barra = /^(.*?)\/([A-G][#♯b♭]*)$/.exec(acorde || '');
    const base = barra ? barra[1] : (acorde || ''), bajo = barra && nota(barra[2]);
    const raiz = nota(base);
    if (!tono || !raiz) return '';
    const { d, alt } = grado(raiz, tono);
    const q = base.slice(raiz.largo);
    let menor = false, suf = q, m;
    if ((m = /^(dim|o|°)/.exec(q))) { menor = true; suf = '°' + q.slice(m[0].length); }
    else if ((m = /^(m7b5|m7♭5|min7b5|ø)/.exec(q))) { menor = true; suf = m[0] === 'ø' ? 'ø' + q.slice(1) : 'ø7' + q.slice(m[0].length); }
    else if ((m = /^(min|m|-)(?!aj)/.exec(q))) { menor = true; suf = q.slice(m[0].length); }
    else if ((m = /^(aug|\+)/.exec(q))) suf = '+' + q.slice(m[0].length);
    const num = menor ? ROMANOS[d].toLowerCase() : ROMANOS[d];
    let r = alt + num + suf;
    if (bajo) { const b = grado(bajo, tono); r += '/' + b.alt + (b.d + 1); }  // bajo = grado de la escala (D/F# en G → V/7)
    return r;
  }
  // --- Sistema Nashville: el grado como NÚMERO (1 a 7), con ♭ o ♯ delante y el sufijo del acorde tal como está escrito ---
  // Siempre se cuenta en la escala MAYOR de la tónica (también en tono menor: en Am, Am = 1m, C = ♭3, Dm = 4m, E = 5), por nombre de nota.
  // La séptima de un dominante va en superíndice para no confundirla con otro número: B7 en G = 3⁷, D9 en G = 5⁹.
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const alto = s => s.replace(/^\d+/, d => [...d].map(x => SUP[Number(x)]).join(''));
  function nashville(acorde, tonoTexto) {
    const n0 = nota(tonoTexto);
    const tono = n0 && { nota: n0, menor: false };
    const barra = /^(.*?)\/([A-G][#♯b♭]*)$/.exec(acorde || '');
    const base = barra ? barra[1] : (acorde || ''), bajo = barra && nota(barra[2]);
    const raiz = nota(base);
    if (!tono || !raiz) return '';
    const { d, alt } = grado(raiz, tono);
    const suf = alto(base.slice(raiz.largo).replace(/^(min(?!aj)|-)/, 'm'));
    let r = alt + (d + 1) + suf;
    if (bajo) { const b = grado(bajo, tono); r += '/' + b.alt + (b.d + 1); }
    return r;
  }
  // Separadores de acorde: espacio o guion pegado a otro acorde (F#-G-A). Un guion seguido de número (A-7) es "menor", no separador.
  const compases = prog => prog.split('|').map(g => g.trim().split(/\s+/).flatMap(t => t.split(/-(?=[A-G])/)).filter(t => t && t !== '-')).filter(g => g.length);

  raiz.Romanos = { romano, nashville, compases, nota, grado, clase, LETRAS, PC_LETRA, ESC_MAYOR, ESC_MENOR };
})(typeof window !== 'undefined' ? window : globalThis);
