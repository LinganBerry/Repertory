// Simulador de PROGRESIONES para afinar el motor de Escuchar (no es parte de npm test).
// Toca acorde tras acorde con los problemas reales: el anterior sigue sonando un poco (pedal), el bajo tarda en confirmarse,
// chispazos del ataque, notas que parpadean y teclas que se vuelven a tocar. Mide, al final de cada acorde, si lo que muestra
// el panel es el acorde que se tocó, si se quedó PEGADO al anterior, si puso otro nombre o si no puso nada.
//   node test/simulador-progresiones.mjs [ruta-de-escucha.js] [progresiones] [semilla] [v|d]
//   (v = muestra ejemplos de fallos; d = muestra los avisos paso a paso de la primera progresión con fallos)
import { readFileSync } from 'node:fs';
const ruta = process.argv[2] || new URL('../escucha/escucha.js', import.meta.url).pathname, N = Number(process.argv[3]) || 400, SEM = Number(process.argv[4]) || 4242, MODO = process.argv[5] || '';
const g = {}; new Function('globalThis', 'window', readFileSync(ruta, 'utf8'))(g, undefined);
const { Seguidor, nombrarLibre } = g.EscuchaNucleo;
let semilla = SEM; const rnd = () => (semilla = (semilla * 1664525 + 1013904223) >>> 0) / 4294967296;
const DT = 1 / 86;
const GRADOS = [[0, [0,4,7]], [5, [0,4,7]], [7, [0,4,7]], [9, [0,3,7]], [2, [0,3,7]], [4, [0,3,7]]];
function acorde(tonica, oct) {
  const [gr, f] = GRADOS[Math.floor(rnd() * GRADOS.length)]; const inv = rnd() < .6 ? 0 : Math.floor(rnd() * 3);
  const raiz = (tonica + gr) % 12;
  const orden = [...f.slice(inv), ...f.slice(0, inv).map(n => n + 12)];
  const grave = oct + ((raiz + orden[0]) % 12);
  const notas = orden.map(n => grave + (n - orden[0]));
  return { notas, esperado: nombrarLibre(notas).nombre };
}
let total = 0, bien = 0, pegado = 0, otro = 0, nada = 0; const ejemplos = [];
for (let p = 0; p < N; p++) {
  const tonica = Math.floor(rnd() * 12), oct = [36, 48, 60, 72][Math.floor(rnd() * 4)];
  const cs = []; let t = 0.4; let prev = null;
  for (let k = 0; k < 6; k++) {
    let c = acorde(tonica, oct + (rnd() < .3 ? 12 : 0)); if (prev && c.esperado === prev.esperado) { k--; continue; }
    const dura = .9 + rnd() * .8, solape = -.08 + rnd() * .5;   // lo anterior se apaga entre 0,08 s antes y 0,42 s después del siguiente golpe
    cs.push({ ...c, ini: t, ons: c.notas.map((m, i) => t + (i === 0 ? rnd() * .2 : rnd() * .1)), fin: t + dura, solape,
      fant: Array.from({ length: Math.floor(rnd() * 3) }, () => ({ m: 60 + Math.floor(rnd() * 30), a: t + rnd() * .05, b: t + .04 + rnd() * .08 })),
      hueco: c.notas.map(() => rnd() < .3 ? { a: t + .3 + rnd() * .5, n: 1 + Math.floor(rnd() * 3) } : null) });
    prev = c; t += dura;
  }
  const seg = new Seguidor(); let panel = null; const evs = []; if (MODO === 'd') { const o = seg._abrirOSumar.bind(seg); seg._abrirOSumar = (t, n, a) => { const a0 = seg.grupo; o(t, n, a); evs.push(`${t.toFixed(2)}s   abrirOSumar nuevas=[${n}] ${seg.grupo !== a0 ? 'GRUPO NUEVO' : 'mismo grupo'} notas=[${[...seg.grupo.notas.keys()]}]`); }; } const marcas = cs.map(c => c.ini + Math.min(.85, (c.fin - c.ini) - .05));
  const resultados = []; let idx = 0;
  for (let tt = 0; tt < t + 1; tt += DT) {
    const act = [];
    cs.forEach((c, ci) => {
      const apaga = (ci + 1 < cs.length ? c.fin + c.solape : c.fin + .6);
      c.notas.forEach((m, i) => { if (tt >= c.ons[i] && tt < apaga) { const h = c.hueco[i]; if (!(h && tt >= h.a && tt < h.a + h.n * DT)) act.push({ midi: m, prob: Math.max(.5, .9 - .27 * (tt - c.ons[i])), ini: c.ons[i] }); } });
      for (const f of c.fant) if (tt >= f.a && tt < f.b) act.push({ midi: f.m, prob: .7, ini: f.a });
    });
    // si una misma nota suena en dos acordes a la vez, manda el golpe más reciente (la tecla se vuelve a tocar)
    const mapa = new Map(); for (const a of act) { const p = mapa.get(a.midi); if (!p || a.ini > p.ini) mapa.set(a.midi, a); }
    const lista = [...mapa.values()].sort((a, b) => a.midi - b.midi).map(a => ({ midi: a.midi, prob: a.prob }));
    const probs = new Float32Array(88); for (const a of lista) if (a.midi >= 21 && a.midi < 109) probs[a.midi - 21] = a.prob;
    for (const e of seg.alimentar({ t: tt, notas: lista, probs })) { panel = e.nombre; evs.push(`${tt.toFixed(2)}s ${e.nombre} [${e.notas.join(',')}]`); }
    while (idx < cs.length && tt >= marcas[idx]) { resultados.push(panel); idx++; }
  }
  if (MODO === 'd' && (globalThis.__saltar = (globalThis.__saltar ?? Number(process.env.SALTAR || 0))) >= 0 && !globalThis.__mostrado && (globalThis.__cuenta = (globalThis.__cuenta || 0) + 1) > globalThis.__saltar && resultados.some((r, i) => r !== cs[i].esperado)) { globalThis.__mostrado = true; console.log('--- progresión con fallos'); cs.forEach((c, i) => console.log(`  acorde ${i+1} ${c.esperado} notas=[${c.notas}] ini=${c.ini.toFixed(2)} fin=${c.fin.toFixed(2)} solape=${c.solape.toFixed(2)} ons=[${c.ons.map(o=>o.toFixed(2))}] -> panel ${resultados[i]}`)); console.log(evs.map(e=>'  ev '+e).join('\n')); }
  cs.forEach((c, i) => {
    total++; const got = resultados[i];
    if (got === c.esperado) bien++;
    else {
      if (got == null) nada++; else if (i > 0 && got === cs[i - 1].esperado) pegado++; else otro++;
      if (ejemplos.length < 6) ejemplos.push(`acorde ${i + 1}: tocó ${c.esperado}, panel ${got} (anterior ${i ? cs[i - 1].esperado : '-'}, solape ${c.solape.toFixed(2)}s)`);
    }
  });
}
const pc = x => (100 * x / total).toFixed(1) + '%';
console.log(`${ruta.split('/').pop().padEnd(22)} ${total} acordes | bien ${pc(bien)} | PEGADO al anterior ${pc(pegado)} | otro nombre ${pc(otro)} | sin nada ${pc(nada)}`);
for (const e of ejemplos.slice(0, MODO === 'v' ? 6 : 3)) console.log('   ', e);
