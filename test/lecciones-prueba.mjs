// Pruebas de lecciones.js: cubren todos los temas, se dibujan y sus datos coinciden con la lógica de notacion.js. Ejecutar: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['notacion.js', 'lecciones.js']) vm.runInContext(await readFile(new URL('../' + f, import.meta.url), 'utf8'), ctx);
const N = ctx.Notacion, L = ctx.Lecciones;
const texto = id => L.LECCIONES.find(l => l.id === id).puntos.join('\n');

test('cada tema de Practicar tiene su lección y cada lección apunta a temas que existen', () => {
  for (const id of Object.keys(N.TEMAS)) assert.ok(L.dePorTema(id), 'sin lección: ' + id);
  for (const l of L.LECCIONES) for (const t of l.temas) assert.ok(N.TEMAS[t], `${l.id} apunta a un tema inexistente: ${t}`);
  assert.equal(new Set(L.LECCIONES.map(l => l.id)).size, L.LECCIONES.length, 'ids únicos');
  assert.equal(L.dePorTema('no-existe'), null);
});

test('lecciones: cortas, completas, sin marcadores de posición y con dibujos que se generan', () => {
  for (const l of L.LECCIONES) {
    assert.ok(l.titulo && l.puntos.length >= 3 && l.puntos.length <= 6, l.id + ': de 3 a 6 puntos');
    for (const p of l.puntos) assert.ok(p.length > 20 && p.length < 400 && !/\[|\]|TODO|completar/i.test(p), `${l.id}: punto raro: ${p}`);
    assert.ok(l.visuales.length >= 1);
    for (const v of l.visuales) {
      const svg = v.tipo === 'pentagrama' ? N.svgPentagrama(v.clave, N.nota(...v.nota)) : v.tipo === 'armadura' ? N.svgArmadura(v.clave, v.f) : v.tipo === 'teclado' ? N.svgTeclado({ marcar: v.marcar }) : null;
      assert.ok(svg && svg.startsWith('<svg'), `${l.id}: visual ${v.tipo}`);
    }
  }
});

test('lo que dicen las lecciones coincide con la lógica (nada escrito de memoria sin comprobar)', () => {
  // intervalos: nombre y semitonos
  const esperado = N.INTERVALOS.map(i => `${i.nombre.toLowerCase()} ${i.n}`).join(' · ');
  assert.ok(texto('intervalos').toLowerCase().includes(esperado), 'lista de intervalos distinta de INTERVALOS');
  // acordes: pasos de cada uno
  const pasos = id => N.ACORDES.find(a => a.id === id).pasos.join('-');
  for (const [id, nombre] of [['mayor', 'Mayor'], ['menor', 'menor'], ['dim', 'disminuido'], ['aum', 'aumentado'], ['maj7', 'mayor 7ª'], ['dom7', 'dominante 7ª'], ['m7', 'menor 7ª']])
    assert.ok(texto('acordes').includes(`${nombre} ${pasos(id)}`), 'acorde ' + id);
  assert.ok(texto('acordes').includes('semidisminuido ' + pasos('m7b5')));
  // escala de ejemplo
  const lec = L.LECCIONES.find(l => l.id === 'escalas'), e = lec.ejemplo;
  assert.equal([1, 2, 3, 4, 5, 6, 7].map(g => N.bonito(N.gradoDeEscala(e.f, e.modo, g))).join(' '), e.texto);
  assert.ok(texto('escalas').includes(e.texto));
  // armaduras: los ejemplos del texto
  assert.equal(N.letrasAlt(2), 'F♯ C♯'); assert.equal(N.nombreTon(2, 'M'), 'D');
  assert.equal(N.letrasAlt(-3), 'B♭ E♭ A♭'); assert.equal(N.nombreTon(-3, 'M'), 'Eb'); assert.equal(N.nombreTon(-1, 'M'), 'F');
  assert.equal(N.nombreTon(0, 'M'), 'C'); assert.equal(N.nombreTon(0, 'm'), 'Am');
  // regla "tónica = un semitono sobre el último sostenido" y "penúltimo bemol", para todas las armaduras de 2 a 6
  const pc = x => (N.PC[x.l] + x.a + 12) % 12;
  for (let f = 2; f <= 6; f++) { const ultimo = N.nota(['F', 'C', 'G', 'D', 'A', 'E', 'B'][f - 1], 1, 4); assert.equal((pc(N.tonica(f, 'M')) - pc(ultimo) + 12) % 12, 1, 'sostenidos ' + f); }
  for (let f = 2; f <= 6; f++) { const pen = N.nota(['B', 'E', 'A', 'D', 'G', 'C', 'F'][f - 2], -1, 4); assert.equal(pc(N.tonica(-f, 'M')), pc(pen), 'bemoles ' + f); }
  // relativa menor 3 semitonos abajo
  for (let f = -6; f <= 6; f++) assert.equal((pc(N.tonica(f, 'M')) - pc(N.tonica(f, 'm')) + 12) % 12, 3);
  // claves: líneas y espacios
  const letras = (clave, pos) => pos.map(p => N.notaEnPos(clave, p).l).join(' ');
  assert.ok(texto('sol').includes('E G B D F') && letras('sol', [0, 2, 4, 6, 8]) === 'E G B D F');
  assert.ok(texto('sol').includes('F A C E') && letras('sol', [1, 3, 5, 7]) === 'F A C E');
  assert.ok(texto('fa').includes('G B D F A') && letras('fa', [0, 2, 4, 6, 8]) === 'G B D F A');
  assert.ok(texto('fa').includes('A C E G') && letras('fa', [1, 3, 5, 7]) === 'A C E G');
  assert.equal(N.posicion('sol', N.nota('G', 0, 4)), 2, 'sol en la 2ª línea'); assert.equal(N.posicion('fa', N.nota('F', 0, 3)), 6, 'fa en la 4ª línea');
  assert.equal(N.posicion('sol', N.nota('C', 0, 4)), -2, 'C central: 1ª línea adicional abajo en sol'); assert.equal(N.posicion('fa', N.nota('C', 0, 4)), 10, 'C central: 1ª línea adicional arriba en fa');
  // teclado: C4 = 60 y F4 = 65 son las marcadas
  assert.deepEqual([...L.LECCIONES.find(l => l.id === 'teclado').visuales[0].marcar], [60, 65]);
});
