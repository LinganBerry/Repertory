// Simulador de PIANO DE IGLESIA para afinar el motor de Escuchar (no es parte de npm test).
// Dos manos (bajo + octava a la izquierda, tríada o más a la derecha), PEDAL (las notas del acorde anterior siguen sonando 2 a 5 s),
// armónicos que el modelo inventa y parpadeos. Mide si el panel muestra el acorde tocado 0,9 s después de cada golpe.
//   node test/simulador-iglesia.mjs [ruta-de-escucha.js] [progresiones] [semilla] [v|d]
//   (v = muestra ejemplos de fallos; d = muestra los avisos paso a paso de la primera progresión con fallos)
import { readFileSync } from 'node:fs';
const ruta = process.argv[2] || '/home/claude/Repertory/escucha/escucha.js', N = Number(process.argv[3]) || 300, SEM = Number(process.argv[4]) || 99, MODO = process.argv[5] || '';
const g = {}; new Function('globalThis', 'window', readFileSync(ruta, 'utf8'))(g, undefined);
const { Seguidor, nombrarLibre } = g.EscuchaNucleo;
let semilla = SEM; const rnd = () => (semilla = (semilla * 1664525 + 1013904223) >>> 0) / 4294967296;
const DT = 1 / 86;
const GRADOS = [[0,[0,4,7]], [5,[0,4,7]], [7,[0,4,7]], [9,[0,3,7]], [2,[0,3,7]], [4,[0,3,7]]];
function acorde(tonica) {
  const [gr, f] = GRADOS[Math.floor(rnd() * GRADOS.length)], raiz = (tonica + gr) % 12;
  const bajo = 36 + ((raiz - 36 % 12 + 12) % 12) - (rnd() < .3 ? 0 : 0);           // raíz en la octava 2 (36..47)
  const bajoMidi = 36 + (((raiz % 12) + 12) % 12);
  const inv = Math.floor(rnd() * 3), orden = [...f.slice(inv), ...f.slice(0, inv).map(n => n + 12)];
  const baseRH = 60 + (rnd() < .3 ? 12 : 0), grave = baseRH + ((raiz + orden[0]) % 12);
  const rh = orden.map(n => grave + (n - orden[0]));
  const notas = [bajoMidi]; if (rnd() < .7) notas.push(bajoMidi + 12); notas.push(...rh); if (rnd() < .3) notas.push(rh[0] + 12);
  return { notas, esperado: nombrarLibre(notas).nombre };
}
let total = 0, bien = 0, pegado = 0, otro = 0, nada = 0; const ejemplos = [];
for (let p = 0; p < N; p++) {
  const tonica = Math.floor(rnd() * 12), cs = []; let t = .5, prev = null;
  for (let k = 0; k < 6; k++) {
    const c = acorde(tonica); if (prev && c.esperado === prev.esperado) { k--; continue; }
    const dura = 1.5 + rnd() * 1.5, sost = 2 + rnd() * 3;      // pedal: cada nota sigue sonando 2 a 5 s
    cs.push({ ...c, ini: t, ons: c.notas.map((m, i) => t + (i < 2 && m < 50 ? 0 : rnd() * .09)), fin: t + dura, sost,
      arm: c.notas.filter(m => m < 50).map(m => ({ m: m + (rnd() < .5 ? 12 : 19), a: t + .05 + rnd() * .2, b: t + .5 + rnd() * 1.5, pr: .55 + rnd() * .25 })).filter(() => rnd() < .6),
      fant: Array.from({ length: Math.floor(rnd() * 3) }, () => ({ m: 72 + Math.floor(rnd() * 20), a: t + rnd() * .05, b: t + .04 + rnd() * .08 })),
      hueco: c.notas.map(() => rnd() < .25 ? { a: t + .3 + rnd() * .8, n: 1 + Math.floor(rnd() * 3) } : null) });
    prev = c; t += dura;
  }
  const seg = new Seguidor(); let panel = null; const evs = []; if (MODO === 'd') { const r0 = seg._respaldo.bind(seg); seg._respaldo = (t, a) => { const o = r0(t, a); if (o.length) evs.push(`${t.toFixed(2)}s   (respaldo) ${o[0].nombre} [${o[0].notas}]`); return o; }; const ab = seg._abrirOSumar.bind(seg); seg._abrirOSumar = (t, n, a) => { const g0 = seg.grupo; ab(t, n, a); evs.push(`${t.toFixed(2)}s   abrirOSumar nuevas=[${n}] ${seg.grupo !== g0 ? 'GRUPO NUEVO' : 'mismo'} g=[${[...seg.grupo.notas.keys()]}]`); }; }
  const marcas = cs.map(c => c.ini + .9), resultados = []; let idx = 0;
  for (let tt = 0; tt < t + 1.5; tt += DT) {
    const act = [];
    cs.forEach((c, ci) => {
      c.notas.forEach((m, i) => {
        const vida = c.sost + (c.fin - c.ini);   // desde el golpe
        const dt = tt - c.ons[i]; if (dt < 0) return;
        const pr = dt < .25 ? .78 + dt * .7 : Math.max(.2, .95 - .75 * ((dt - .25) / vida));
        if (pr < .36) return; const h = c.hueco[i]; if (h && tt >= h.a && tt < h.a + h.n * DT) return;
        act.push({ midi: m, prob: Math.min(.97, pr), ini: c.ons[i] });
      });
      for (const a of c.arm) if (tt >= a.a && tt < a.b) act.push({ midi: a.m, prob: a.pr, ini: a.a });
      for (const f of c.fant) if (tt >= f.a && tt < f.b) act.push({ midi: f.m, prob: .7, ini: f.a });
    });
    const mapa = new Map(); for (const a of act) { const q = mapa.get(a.midi); if (!q || a.ini > q.ini) mapa.set(a.midi, a); }
    const lista = [...mapa.values()].sort((a, b) => a.midi - b.midi).map(a => ({ midi: a.midi, prob: a.prob }));
    const probs = new Float32Array(88); for (const a of lista) probs[a.midi - 21] = a.prob;
    for (const e of seg.alimentar({ t: tt, notas: lista, probs })) { panel = e.nombre; evs.push(`${tt.toFixed(2)}s ${e.nombre}`); }
    while (idx < cs.length && tt >= marcas[idx]) { resultados.push(panel); idx++; }
  }
  if (MODO === 'd' && !globalThis.__m && resultados.some((r, i) => r !== cs[i].esperado)) { globalThis.__m = true; cs.forEach((c, i) => console.log(`  acorde ${i+1} ${c.esperado} [${c.notas}] ini=${c.ini.toFixed(2)} sost=${c.sost.toFixed(1)} -> panel ${resultados[i]}`)); console.log(evs.map(e => '  ev ' + e).join('\n')); }
  cs.forEach((c, i) => { total++; const got = resultados[i];
    if (got === c.esperado) bien++; else { if (got == null) nada++; else if (i > 0 && got === cs[i - 1].esperado) pegado++; else otro++;
      if (ejemplos.length < 6) ejemplos.push(`acorde ${i + 1}: tocó ${c.esperado} [${c.notas}], panel ${got} (anterior ${i ? cs[i - 1].esperado : '-'})`); } });
}
const pc = x => (100 * x / total).toFixed(1) + '%';
console.log(`${ruta.split('/').pop().padEnd(22)} ${total} acordes | bien ${pc(bien)} | PEGADO ${pc(pegado)} | otro nombre ${pc(otro)} | sin nada ${pc(nada)}`);
for (const e of ejemplos.slice(0, MODO === 'v' ? 6 : 3)) console.log('   ', e);
