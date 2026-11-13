// Pruebas de lectura.js (lectura a primera vista: lógica pura). Ejecutar: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['../notacion.js', '../lectura.js']) vm.runInContext(await readFile(new URL(f, import.meta.url), 'utf8'), ctx);
const J = x => JSON.parse(JSON.stringify(x));
const L = ctx.Lectura, N = ctx.Notacion;
const semilla = s => () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };

test('frases: 4 notas, dentro del rango de la clave, sin alteraciones y nunca todas iguales', () => {
  const az = semilla(3), claves = new Set();
  for (const clave of ['sol', 'fa', 'ambas']) for (const movimiento of ['grados', 'saltos']) for (let i = 0; i < 300; i++) {
    const f = J(L.crearFrase({ clave, movimiento }, az));
    claves.add(f.clave);
    if (clave !== 'ambas') assert.equal(f.clave, clave);
    const [lo, hi] = L.RANGO[f.clave];
    assert.equal(f.notas.length, 4); assert.equal(f.nombres.length, 4); assert.equal(f.midis.length, 4);
    assert.ok(f.pos.every(p => p >= lo && p <= hi), `${clave} ${movimiento}: ${f.pos}`);
    assert.ok(f.notas.every(n => n.a === 0), 'solo notas naturales');
    assert.ok(new Set(f.pos).size >= 3, 'al menos 3 notas distintas, no un vaivén de dos');
    f.pos.forEach((p, k) => assert.equal(N.posicion(f.clave, f.notas[k]), p));
    for (let k = 1; k < 4; k++) {
      const d = Math.abs(f.pos[k] - f.pos[k - 1]);
      assert.ok(d <= (movimiento === 'saltos' ? 3 : 1), `${movimiento}: salto de ${d}`);
    }
  }
  assert.deepEqual([...claves].sort(), ['fa', 'sol'], 'con "las dos" salen sol y fa');
});

test('por grados casi no hay saltos y con saltos sí hay terceras o más', () => {
  const az = semilla(9);
  const saltos = (mov) => { let n = 0; for (let i = 0; i < 200; i++) { const f = L.crearFrase({ clave: 'sol', movimiento: mov }, az); for (let k = 1; k < 4; k++) if (Math.abs(f.pos[k] - f.pos[k - 1]) >= 2) n++; } return n; };
  assert.equal(saltos('grados'), 0);
  assert.ok(saltos('saltos') > 100);
});

test('los nombres y los midis de la frase son los de sus notas (Do4 = 60, clave de sol: de Do4 a Sol5)', () => {
  const f = J(L.crearFrase({ clave: 'sol', movimiento: 'grados' }, () => 0.5));
  f.notas.forEach((n, i) => { assert.equal(f.nombres[i], n.l + n.o); assert.equal(f.midis[i], N.midi(n)); assert.ok(f.midis[i] >= 60 && f.midis[i] <= 79); });
  const g = J(L.crearFrase({ clave: 'fa', movimiento: 'grados' }, () => 0.5));
  assert.ok(g.midis.every(m => m >= 45 && m <= 60), 'fa: de La2 a Do4');
});

test('svgFrase: una cabeza por nota, de izquierda a derecha, con sus líneas adicionales y dentro del dibujo', () => {
  const n = (l, o) => N.nota(l, 0, o), cuenta = (s, g) => s.split(g).length - 1;
  const s = N.svgFrase('sol', [n('C', 4), n('D', 4), n('E', 4), n('A', 5)]);
  assert.equal(cuenta(s, '\uE0A2'), 4); assert.ok(s.includes('\uE050') && s.includes('frase de 4 notas'));
  assert.equal(cuenta(s, '<line ') - 5, 2, 'Do4 (1 línea abajo) y La5 (1 línea arriba)');
  const xs = [...s.matchAll(/<text x="([\d.]+)"[^>]*>\uE0A2</g)].map(m => Number(m[1]));
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b)); assert.equal(new Set(xs).size, 4);
  for (let i = 0; i < 300; i++) for (const clave of ['sol', 'fa']) {
    const f = L.crearFrase({ clave, movimiento: 'saltos' }, Math.random), svg = N.svgFrase(f.clave, f.notas);
    for (const m of svg.matchAll(/ y="(-?[\d.]+)"/g)) assert.ok(Number(m[1]) > 10 && Number(m[1]) < 150);
    for (const x of [...svg.matchAll(/<text x="([\d.]+)"[^>]*>\uE0A2</g)].map(m => Number(m[1]))) assert.ok(x > 60 && x < 245);
  }
});
