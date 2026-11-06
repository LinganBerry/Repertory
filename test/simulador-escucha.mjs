// Simulador para afinar el motor de Escuchar (no es parte de npm test).
// Genera golpes de acorde con el ruido que se vio en grabaciones reales (el bajo tarda en confirmarse, chispazos del ataque,
// notas que parpadean) y mide qué porcentaje el Seguidor nombra bien, mal o no avisa.
//   node test/simulador-escucha.mjs [ruta-de-escucha.js] [golpes] [semilla]
// Sirve para comparar dos versiones de escucha/escucha.js con los mismos golpes antes de cambiar nada.
import { readFileSync } from 'node:fs';
const ruta = process.argv[2] || new URL('../escucha/escucha.js', import.meta.url).pathname;
const GOLPES = Number(process.argv[3]) || 1500, SEMILLA = Number(process.argv[4]) || 12345;
const g = {}; new Function('globalThis', 'window', readFileSync(ruta, 'utf8'))(g, undefined);
const { Seguidor, nombrarLibre } = g.EscuchaNucleo;
let semilla = SEMILLA; const rnd = () => (semilla = (semilla * 1664525 + 1013904223) >>> 0) / 4294967296;
const FORMAS = { '': [0,4,7], m: [0,3,7], '7': [0,4,7,10], m7: [0,3,7,10], maj7: [0,4,7,11], sus4: [0,5,7], dim: [0,3,6], add9: [0,4,7,14] };
const DT = 1 / 86;
function golpe(inv) {
  const tipos = Object.keys(FORMAS), tipo = tipos[Math.floor(rnd() * tipos.length)], f = FORMAS[tipo];
  const raiz = Math.floor(rnd() * 12), oct = [36, 48, 60, 72][Math.floor(rnd() * 4)];
  const orden = [...f.slice(inv % f.length), ...f.slice(0, inv % f.length).map(n => n + 12)];
  const grave = oct + ((raiz + orden[0]) % 12);
  const notas = orden.map(n => grave + (n - orden[0])).filter(m => m >= 30 && m <= 95);
  return { notas, esperado: nombrarLibre(notas).nombre };
}
function simular(Clase, n) {
  let bien = 0, mal = 0, nada = 0; const fallos = [];
  for (let i = 0; i < n; i++) {
    const { notas, esperado } = golpe(Math.floor(rnd() * 3));
    // aparición de cada nota: el bajo tarda más; el resto se reparte en los primeros 0,12 s
    const t0 = 0.3, ons = notas.map((m, k) => t0 + (k === 0 ? rnd() * .22 : rnd() * .12));
    const dura = 0.9 + rnd() * 0.8;
    const fantasmas = []; const nf = Math.floor(rnd() * 3);
    for (let k = 0; k < nf; k++) fantasmas.push({ m: 60 + Math.floor(rnd() * 30), a: t0 + rnd() * .05, b: t0 + .04 + rnd() * .08 });
    const huecos = notas.map(() => rnd() < .35 ? { a: t0 + .3 + rnd() * .6, n: 1 + Math.floor(rnd() * 3) } : null);
    const seg = new Clase(); const av = [];
    for (let t = 0; t < t0 + dura + 1.2; t += DT) {
      const act = [];
      notas.forEach((m, k) => { if (t >= ons[k] && t < ons[k] + dura) { const h = huecos[k]; if (!(h && t >= h.a && t < h.a + h.n * DT)) act.push({ midi: m, prob: .8 }); } });
      for (const f of fantasmas) if (t >= f.a && t < f.b) act.push({ midi: f.m, prob: .7 });
      act.sort((a, b) => a.midi - b.midi);
      for (const e of seg.alimentar({ t, notas: act })) av.push(e.nombre);
    }
    const ultimo = av.at(-1);
    if (!av.length) { nada++; if (fallos.length < 4) fallos.push(`${esperado}: (sin aviso)`); }
    else if (ultimo === esperado) bien++; else { mal++; if (fallos.length < 4) fallos.push(`${esperado}: ${av.join(' > ')}`); }
  }
  return { bien, mal, nada, fallos };
}
const N = GOLPES; semilla = SEMILLA;
const r = simular(Seguidor, N);
console.log(`${ruta.split('/').pop().padEnd(22)} bien ${(100 * r.bien / N).toFixed(1)}% | mal ${(100 * r.mal / N).toFixed(1)}% | sin aviso ${(100 * r.nada / N).toFixed(1)}%`);
for (const f of r.fallos) console.log('   ej:', f);
