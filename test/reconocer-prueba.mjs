// Pruebas de reconocer.js (reconocer acordes con inversiones: lógica pura). Ejecutar: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['../retos.js', '../reconocer.js']) vm.runInContext(await readFile(new URL(f, import.meta.url), 'utf8'), ctx);
const J = x => JSON.parse(JSON.stringify(x));
const { Retos: R0, Reconocer: Rc0 } = ctx;
const R = R0, Rc = Rc0;
const semilla = s => () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

test('las 12 raíces cubren cada tono una sola vez y las teclas negras llevan los dos nombres', () => {
  const rs = J(Rc.RAICES_PC);
  assert.deepEqual(rs.map(x => x[0]), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(rs.filter(x => x[1].length > 1).map(x => x[0]), [1, 3, 6, 8, 10]);
  assert.ok(rs.filter(x => x[1].length > 1).every(x => /^[A-G]♯\/[A-G]♭$/.test(x[1])));
});

test('las notas escritas coinciden con las del reto (mismas teclas) en las dos claves, para las 72 combinaciones', () => {
  for (const cal of ['M', 'm']) for (const raiz of R.RAICES[cal]) for (const inv of [0, 1, 2]) {
    const op = { calidad: cal, inversiones: true };
    for (const clave of ['sol', 'fa']) {
      const r = J({ ...R.posicion(R.acorde(raiz, cal), inv), raiz, calidad: cal, inv });
      const escritas = J(Rc.notasPentagrama({ notas: r.notas, midis: r.midis }, clave));
      const baja = clave === 'fa' ? 12 : 0;
      escritas.forEach((e, i) => {
        assert.equal(12 * (e.o + 1) + PC[e.l] + e.a, r.midis[i] - baja, `${raiz}${cal} inv ${inv} ${clave} nota ${i}`);
        assert.equal(e.l, r.notas[i][0]);
      });
      for (let i = 1; i < 3; i++) assert.ok(12 * (escritas[i].o + 1) + PC[escritas[i].l] + escritas[i].a > 12 * (escritas[i - 1].o + 1) + PC[escritas[i - 1].l] + escritas[i - 1].a, 'de grave a agudo');
    }
  }
});

test('comprobar: la raíz vale con cualquier nombre del mismo tono y la calidad se juzga aparte', () => {
  const dbM = J(R.crearReto({ calidad: 'M', inversiones: true }, () => 0.09));          // Db mayor (segunda raíz de la lista)
  assert.equal(dbM.raiz, 'Db');
  assert.deepEqual(J(Rc.comprobar(dbM, 1, 'M')), { raizBien: true, calidadBien: true, bien: true });
  assert.deepEqual(J(Rc.comprobar(dbM, 1, 'm')), { raizBien: true, calidadBien: false, bien: false });
  assert.deepEqual(J(Rc.comprobar(dbM, 2, 'M')), { raizBien: false, calidadBien: true, bien: false });
  const csm = J(R.crearReto({ calidad: 'm', inversiones: false }, () => 0.09));          // C# menor: se acepta como Db
  assert.equal(csm.raiz, 'C#'); assert.equal(Rc.comprobar(csm, 1, 'm').bien, true);
});

test('pista: solo si fallas, una sola, y la que corresponde a lo que falló', () => {
  const fund = { inv: 0 }, inv1 = { inv: 1 }, inv2 = { inv: 2 };
  assert.equal(Rc.pista(inv1, { bien: true, raizBien: true, calidadBien: true }), '');
  assert.match(Rc.pista(fund, { bien: false, raizBien: false, calidadBien: true }), /nota de abajo/);
  for (const r of [inv1, inv2]) assert.match(Rc.pista(r, { bien: false, raizBien: false, calidadBien: false }), /cuarta.*arriba/);
  assert.match(Rc.pista(inv1, { bien: false, raizBien: true, calidadBien: false }), /terceras? desde la raíz|tercera mayor abajo/);
  assert.ok(Rc.pista(inv2, { bien: false, raizBien: false, calidadBien: true }).length < 110, 'corta');
});

test('crearPregunta respeta las opciones: calidad, inversiones y clave; con "las dos" salen sol y fa', () => {
  const az = semilla(7);
  let previo = null, claves = new Set(), invs = new Set();
  for (let i = 0; i < 300; i++) {
    const q = J(Rc.crearPregunta({ calidad: 'm', inversiones: true, clave: 'ambas' }, az, previo));
    assert.equal(q.calidad, 'm'); assert.ok(['sol', 'fa'].includes(q.clave)); assert.equal(q.escritas.length, 3);
    assert.notEqual(q.item, previo, 'no repite el mismo acorde seguido'); previo = q.item; claves.add(q.clave); invs.add(q.inv);
  }
  assert.deepEqual([...claves].sort(), ['fa', 'sol']); assert.deepEqual([...invs].sort(), [0, 1, 2]);
  for (let i = 0; i < 60; i++) {
    const q = J(Rc.crearPregunta({ calidad: 'M', inversiones: false, clave: 'sol' }, az));
    assert.equal(q.calidad, 'M'); assert.equal(q.inv, 0); assert.equal(q.clave, 'sol');
  }
  assert.equal(J(Rc.crearPregunta({ clave: 'fa' }, az)).clave, 'fa');
});

test('el repaso saca más seguido los acordes que fallas', () => {
  let est = R.vacias();
  for (let i = 0; i < 5; i++) R.registrar(est, 'Eb|m|1', false, 0);
  const az = semilla(3); let n = 0, total = 400;
  for (let i = 0; i < total; i++) if (Rc.crearPregunta({ calidad: 'ambos', inversiones: true, clave: 'sol', repasar: true }, az, null, est).item === 'Eb|m|1') n++;
  assert.ok(n > total * 0.3, 'sale mucho más que 1 de 72: ' + n);
  n = 0; for (let i = 0; i < total; i++) if (Rc.crearPregunta({ calidad: 'ambos', inversiones: true, clave: 'sol', repasar: false }, az, null, est).item === 'Eb|m|1') n++;
  assert.ok(n < total * 0.06, 'sin repaso sale pocas veces: ' + n);
});
