// Pruebas de progresiones.js (retos de progresiones: lógica pura). Ejecutar: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(await readFile(new URL('../progresiones.js', import.meta.url), 'utf8'), ctx);
const J = x => JSON.parse(JSON.stringify(x));
const P = ctx.Progresiones;
const semilla = s => () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
// Versiones sencillas de las funciones de app.js (la página real usa las suyas): solo lo necesario para estas pruebas.
const compases = prog => prog.split('|').map(g => g.trim().split(/\s+/).filter(Boolean)).filter(g => g.length);
const romano = (a, tono) => `r(${a}@${tono})`;
const deps = { compases, romano };

test('transponer: conserva el grado y escribe las notas con letras correctas', () => {
  const casos = [
    ['C', 'C', 'Eb', 'Eb'], ['G', 'C', 'Eb', 'Bb'], ['Am', 'C', 'Eb', 'Cm'], ['F', 'C', 'Eb', 'Ab'],
    ['Bb', 'C', 'Eb', 'Db'],            // ♭VII sigue siendo ♭VII
    ['G', 'G', 'F#', 'F#'], ['D', 'G', 'F#', 'C#'], ['Em', 'G', 'F#', 'D#m'], ['C', 'G', 'F#', 'B'],
    ['Em7/B', 'G', 'Eb', 'Cm7/G'],      // sufijo y bajo se conservan
    ['Dsus4', 'G', 'A', 'Esus4'], ['Cadd9', 'G', 'Db', 'Gbadd9'.replace('Gb', 'Gb')],
    ['Am', 'Am', 'Em', 'Em'], ['C', 'Am', 'Em', 'G'], ['G', 'Am', 'F#m', 'E'], ['Dm', 'Am', 'C#m', 'F#m']
  ];
  for (const [ac, de, a, esperado] of casos) assert.equal(P.transponer(ac, de, a), esperado, `${ac} de ${de} a ${a}`);
});

test('transponer: cada acorde sube exactamente los semitonos entre los dos tonos; nunca escribe ## ni bb', () => {
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const pc = n => (PC[n[0]] + [...n.slice(1)].reduce((x, c) => x + (c === '#' ? 1 : -1), 0) + 12) % 12;
  const raiz = a => /^[A-G][#b]?/.exec(a)[0];
  const prog = ['C', 'G/B', 'Am7', 'F', 'Dm', 'E7', 'Bb', 'Eb', 'Ab', 'Dsus4', 'Cadd9'];
  for (const destino of [...P.TONOS.M, ...P.TONOS.m]) {
    const salto = (pc(destino.replace(/m$/, '')) - 0 + 12) % 12;       // de C mayor a ese tono (menor: misma tónica, escala menor natural: ver más abajo)
    if (destino.endsWith('m')) continue;
    const ida = prog.map(a => P.transponer(a, 'C', destino));
    ida.forEach((a, i) => {
      assert.ok(a, destino);
      assert.ok(!/##|[A-G]bb/.test(a), `${destino}: ${a}`);
      assert.equal(pc(raiz(a)), (pc(raiz(prog[i])) + salto) % 12, `${prog[i]} → ${a} en ${destino}`);
      if (prog[i].includes('/')) assert.equal(pc(a.split('/')[1]), (pc(prog[i].split('/')[1]) + salto) % 12, 'el bajo también sube igual');
      assert.equal(a.slice(raiz(a).length).split('/')[0], prog[i].slice(raiz(prog[i]).length).split('/')[0], 'el sufijo no cambia');
    });
  }
  assert.equal(P.transponer('???', 'C', 'D'), null);
  assert.equal(P.transponer('C', 'x', 'D'), null);
});

test('transponer: tono menor a tono menor usa la escala menor natural (III, VI, VII sin alteración)', () => {
  // Am: Am G F E7  ->  Em: Em D C B7
  assert.deepEqual(['Am', 'G', 'F', 'E7'].map(a => P.transponer(a, 'Am', 'Em')), ['Em', 'D', 'C', 'B7']);
  assert.deepEqual(['Am', 'G', 'F', 'E7'].map(a => P.transponer(a, 'Am', 'Ebm')), ['Ebm', 'Db', 'Cb', 'Bb7']);
});

test('los tonos al azar son 12 por calidad y la calidad se reconoce', () => {
  assert.equal(P.TONOS.M.length, 12); assert.equal(P.TONOS.m.length, 12);
  assert.equal(P.calidadDe('G'), 'M'); assert.equal(P.calidadDe('F#m'), 'm'); assert.equal(P.calidadDe('Bbm'), 'm'); assert.equal(P.calidadDe(''), null);
});

const canciones = [
  { id: 'cancion-uno', titulo: 'Uno', artista: 'A', tono: 'G', partes: [{ nombre: 'Coro', prog: 'G D | Em C' }, { nombre: 'Puente', prog: 'Am7 D7 | G' }, { nombre: 'Vacía', prog: '' }] },
  { id: 'cancion-dos', titulo: 'Dos', artista: 'B', tono: 'Am', partes: [{ nombre: 'Verso', prog: 'Am G | F E7' }, { nombre: 'Rara', prog: 'N.C. | Am' }, { nombre: 'Un solo acorde', prog: 'Am' }] },
  { id: 'cancion-tres', titulo: 'Tres', tono: 'C', borrada: true, partes: [{ nombre: 'Coro', prog: 'C G' }] },
  { id: 'cancion-cuatro', titulo: 'Cuatro', tono: 'D', partes: [{ nombre: 'Modula', tono: 'Em', prog: 'Em D | C B7' }] },
  { titulo: 'Sin id', artista: 'Z', tono: 'E', partes: [{ nombre: 'Coro', prog: 'E B | C#m A' }] }
];

test('progresiones: salen de las partes con acordes; se saltan borradas, vacías, de un acorde y con símbolos raros', () => {
  const pool = J(P.progresiones(canciones, deps));
  assert.deepEqual(pool.map(x => x.item.split('|')[0] + ' ' + x.parte), ['cancion-uno Coro', 'cancion-uno Puente', 'cancion-dos Verso', 'cancion-cuatro Modula', pool[4].item.split('|')[0] + ' Coro']);
  assert.ok(pool[4].item.startsWith('x'), 'una canción sin id recibe una clave estable');
  assert.deepEqual(J(P.progresiones(canciones, deps)).map(x => x.item), pool.map(x => x.item), 'las claves son estables');
  assert.equal(pool[3].tono, 'Em', 'una parte con su propio tono usa ese tono');
  assert.equal(pool[0].cal, 'M'); assert.equal(pool[2].cal, 'm');
  assert.equal(pool[0].original, 'G D | Em C');
  assert.deepEqual(J(P.progresiones(null, deps)), []);
});

test('crearReto: respeta la calidad, el tono y nunca repite la progresión anterior', () => {
  const pool = P.progresiones(canciones, deps), azar = semilla(7);
  for (const cal of ['M', 'm']) for (let i = 0; i < 60; i++) {
    const r = J(P.crearReto(pool, { calidad: cal, tono: 'azar' }, azar));
    assert.equal(r.cal, cal);
    assert.ok(P.TONOS[cal].includes(r.destino), r.destino);
    assert.equal(r.acordes.split(' | ').length, r.grupos.length, 'mismos compases');
  }
  let previo = null;
  for (let i = 0; i < 80; i++) { const r = P.crearReto(pool, { calidad: 'ambos', tono: 'azar' }, azar, previo); assert.notEqual(r.item, previo); previo = r.item; }
  const orig = J(P.crearReto(pool, { calidad: 'M', tono: 'original' }, azar));
  assert.equal(orig.destino, orig.tono); assert.equal(orig.acordes, orig.original, 'en su tono original no cambia nada');
  assert.equal(P.crearReto([], { calidad: 'ambos' }, azar), null);
  assert.equal(P.crearReto(pool.filter(x => x.cal === 'M'), { calidad: 'm' }, azar), null, 'sin progresiones de esa calidad');
  const una = pool.slice(0, 1);
  assert.equal(P.crearReto(una, { calidad: 'ambos' }, azar, una[0].item).item, una[0].item, 'con una sola progresión no se queda colgado');
});

test('crearReto: la progresión transpuesta cae en el tono pedido y conserva los números romanos', () => {
  const pool = P.progresiones(canciones, { compases, romano: (a, t) => P.transponer(a, t, 'C') });   // aquí "romano" = el acorde llevado a C: equivale a los grados
  for (let i = 0; i < 50; i++) {
    const r = P.crearReto(pool, { calidad: 'ambos', tono: 'azar' }, semilla(i + 1));
    const aC = (g, t) => g.split(' | ').map(x => x.split(' ').map(a => P.transponer(a, t, P.calidadDe(t) === 'm' ? 'Am' : 'C')).join(' ')).join(' | ');
    assert.equal(aC(r.acordes, r.destino), aC(r.original, r.tono), r.item + ' → ' + r.destino);
  }
});

test('repasar: con lo fallado activado, sale más seguido; sin activarlo, no influye', () => {
  const pool = P.progresiones(canciones, deps), falla = pool[1].item;
  const est = P.vacias(); for (let i = 0; i < 5; i++) P.registrar(est, falla, false, 0);
  const cuenta = op => { const azar = semilla(3); let n = 0, prev = null; for (let i = 0; i < 400; i++) { const r = P.crearReto(pool, op, azar, null, est); if (r.item === falla) n++; } return n; };
  const con = cuenta({ calidad: 'ambos', tono: 'azar', repasar: true }), sin = cuenta({ calidad: 'ambos', tono: 'azar', repasar: false });
  assert.ok(con > sin * 1.6, `con repaso ${con} vs sin ${sin}`);
});

test('estadísticas: registrar, limpiar datos alterados y resumir solo lo que sigue existiendo', () => {
  const pool = P.progresiones(canciones, deps), a = pool[0].item, b = pool[2].item;
  const est = P.vacias();
  P.registrar(est, a, true, 4000); P.registrar(est, a, true, 2000); P.registrar(est, b, false, 0); P.registrar(est, b, false, 0); P.registrar(est, b, true, 3000);
  P.registrar(est, 'cancion-borrada|0', false, 0);
  const r = J(P.resumen(est, pool));
  assert.equal(r.v, 5); assert.equal(r.a, 3);
  assert.deepEqual(r.repasar.map(x => x.item), [b], 'solo lo que fallas y todavía existe');
  assert.equal(est.items[a].mejor, 2000);
  const sucio = J(P.limpiar({ items: { [a]: { v: 3, a: 9, ms: -5, mejor: 'x' }, 'raro': { v: 1, a: 1 }, '../x|1': { v: 1, a: 1 }, [b]: null } }));
  assert.deepEqual(Object.keys(sucio.items), [a]);
  assert.deepEqual(sucio.items[a], { v: 3, a: 3, ms: 0, mejor: 0 }, 'aciertos nunca pasan de las veces; negativos y textos se limpian');
  assert.deepEqual(J(P.limpiar(null)), { items: {} }); assert.deepEqual(J(P.limpiar('hola')), { items: {} });
});
