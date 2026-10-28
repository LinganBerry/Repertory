// Pruebas de notacion.js (lógica pura de Practicar). Ejecutar: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, stat } from 'node:fs/promises';
import { limpiarSesion } from '../lib/progreso.js';

const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(await readFile(new URL('../notacion.js', import.meta.url), 'utf8'), ctx);
const N = ctx.Notacion;
// Generador pseudoaleatorio con semilla (para que las pruebas sean repetibles).
const semilla = s => () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
const n = (l, a, o) => N.nota(l, a, o);

test('midi y nombres', () => {
  assert.equal(N.midi(n('C', 0, 4)), 60); assert.equal(N.midi(n('A', 0, 4)), 69); assert.equal(N.midi(n('B', -1, 3)), 58);
  assert.equal(N.midi(n('F', 1, 5)), 78); assert.equal(N.nombre(n('F', 1, 5)), 'F#5'); assert.equal(N.bonito(n('B', -1, 3)), 'B♭');
});

test('posiciones en las claves de sol y fa (0 = línea inferior)', () => {
  assert.equal(N.posicion('sol', n('E', 0, 4)), 0);  assert.equal(N.posicion('sol', n('C', 0, 4)), -2); assert.equal(N.posicion('sol', n('F', 0, 5)), 8);
  assert.equal(N.posicion('fa', n('G', 0, 2)), 0);   assert.equal(N.posicion('fa', n('F', 0, 3)), 6);   assert.equal(N.posicion('fa', n('C', 0, 4)), 10);
  assert.deepEqual(Object.keys(N.CLAVES), ['sol', 'fa'], 'solo las claves del piano');
  assert.deepEqual(Object.keys(N.TEMAS).filter(t => N.TEMAS[t].tipo === 'pentagrama'), ['sol', 'fa']);
  for (const c of Object.keys(N.CLAVES)) for (let p = -8; p <= 16; p++) assert.equal(N.posicion(c, N.notaEnPos(c, p)), p, `${c} ${p}`);
});

test('niveles: cada candidato cae donde dice el nivel y no hay dobles alteraciones', () => {
  for (const [id, T] of Object.entries(N.TEMAS)) for (const nv of T.niveles) {
    const c = N.candidatos(id, nv.id);
    assert.ok(c.length >= (T.tipo === 'oido' ? 2 : 3), `${id} nivel ${nv.id} tiene pocas opciones`);
    if (T.tipo === 'oido') for (const x of c) assert.ok(nv.ids.includes(x.id));
    else if (['armadura', 'cuantas', 'escala'].includes(T.tipo)) for (const x of c) assert.ok(Math.abs(x.f) <= nv.max, `${id}/${nv.id}: ${x.item}`);
    else if (T.tipo === 'pentagrama') for (const x of c) {
      assert.ok(nv.pos.includes(N.posicion(id, x.nota)), `${id}/${nv.id}: ${N.nombre(x.nota)}`);
      assert.ok(Math.abs(x.nota.a) <= 1);
      if (!nv.alt) assert.equal(x.nota.a, 0, 'sin alteraciones en niveles 1 a 4');
    } else for (const x of c) assert.ok(nv.pcs.includes(x.pc));
  }
  assert.ok(N.candidatos('sol', 5).some(x => x.nota.a === 1) && N.candidatos('sol', 5).some(x => x.nota.a === -1));
});

test('preguntas: 300 por tema y nivel, siempre válidas, con respuesta correcta que comprueba y sin repetir seguida', () => {
  const rng = semilla(7);
  for (const [id, T] of Object.entries(N.TEMAS)) for (const nv of T.niveles) {
    let previa = null;
    for (let i = 0; i < 300; i++) {
      const p = N.crearPregunta(id, nv.id, { items: {} }, rng, previa);
      assert.notEqual(p.item, previa, `${id}/${nv.id} repitió ${p.item}`); previa = p.item;
      if (p.tipo === 'pentagrama') {
        assert.ok(N.comprobar(p, { l: p.nota.l, a: p.nota.a }));
        assert.ok(!N.comprobar(p, { l: N.LETRAS[(N.LETRAS.indexOf(p.nota.l) + 1) % 7], a: p.nota.a }), 'otra letra es incorrecta');
        if (p.nota.a) assert.ok(!N.comprobar(p, { l: p.nota.l, a: 0 }), 'sin la alteración es incorrecto');
      } else if (p.tipo === 'escala') {
        assert.ok(N.comprobar(p, { l: p.respuesta.l, a: p.respuesta.a })); assert.ok(!N.comprobar(p, { l: p.respuesta.l, a: p.respuesta.a + 1 }), 'otra alteración es incorrecta');
        assert.ok(!N.comprobar(p, { l: N.LETRAS[(N.LETRAS.indexOf(p.respuesta.l) + 1) % 7], a: p.respuesta.a }));
      } else if (p.tipo === 'armadura' || p.tipo === 'cuantas') {
        assert.ok(N.comprobar(p, { id: p.respuesta.id })); assert.ok(!N.comprobar(p, { id: String(p.f + 1) }));
        assert.ok(N.botones(id, nv.id).opciones.some(o => o.id === p.respuesta.id), 'la respuesta correcta está entre los botones');
      } else if (p.tipo === 'oido') {
        assert.ok(N.comprobar(p, { id: p.respuesta.id })); assert.ok(!N.comprobar(p, { id: 'otro' }));
      } else {
        assert.ok(N.comprobar(p, { pc: p.respuesta.pc })); assert.ok(N.comprobar(p, { pc: p.respuesta.pc + 12 }), 'cualquier octava vale');
        assert.ok(!N.comprobar(p, { pc: p.respuesta.pc + 1 }));
        if (p.tipo === 'teclado') assert.equal(p.midi % 12, p.respuesta.pc);
      }
    }
  }
});

test('lo que fallas sale más que lo que dominas (pesos)', () => {
  const rng = semilla(11), cands = N.candidatos('sol', 1);
  const [mal, bien] = [cands[0].item, cands[1].item];
  const est = { items: { [mal]: { v: 10, a: 0, ms: 0 }, [bien]: { v: 10, a: 10, ms: 0 } } };
  for (const c of cands.slice(2)) est.items[c.item] = { v: 10, a: 10, ms: 0 };
  const cuenta = {};
  for (let i = 0; i < 4000; i++) { const p = N.crearPregunta('sol', 1, est, rng, null); cuenta[p.item] = (cuenta[p.item] || 0) + 1; }
  assert.ok(cuenta[mal] > 3 * cuenta[bien], `mal=${cuenta[mal]} bien=${cuenta[bien]}`);
  assert.equal(N.peso(est, 'sol:no-visto'), 2); assert.equal(N.peso(est, mal), 5); assert.equal(N.peso(est, bien), 1);
});

test('botones de respuesta según tema y nivel', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(N.botones('sol', 3))), { tipo: 'letras', letras: ['C', 'D', 'E', 'F', 'G', 'A', 'B'], alteraciones: false });
  assert.equal(N.botones('sol', 5).alteraciones, true);
  assert.equal(N.botones('tecla', 2).tipo, 'ninguno');
  assert.equal(N.botones('teclado', 3).pcs.length, 7); assert.equal(N.botones('teclado', 4).pcs.length, 5); assert.equal(N.botones('teclado', 5).pcs.length, 12);
  assert.deepEqual(JSON.parse(JSON.stringify(N.botones('teclado', 4).pcs.map(x => x.texto))), ['C#/Db', 'D#/Eb', 'F#/Gb', 'G#/Ab', 'A#/Bb']);
});

test('estadísticas, precisión y racha', () => {
  const s = (id, f, a, extra = {}) => ({ id, t: 'sol', l: 1, f, n: 4, a, ms: 8000, q: [['sol:E4', 1, 1000], ['sol:G4', a > 2 ? 1 : 0, 1500], ['sol:E4', 1, 1000], ['sol:B4', a > 3 ? 1 : 0, 2000]], ...extra });
  const lista = [s('a1', '2026-10-24', 2), s('a2', '2026-10-26', 3), s('a3', '2026-10-27', 4)];
  const est = N.estadisticas(lista);
  assert.deepEqual({ ...est.items['sol:E4'] }, { v: 6, a: 6, ms: 6000 });
  assert.equal(est.items['sol:G4'].v, 3); assert.equal(est.items['sol:G4'].a, 2);
  assert.ok(Math.abs(N.precision(est, 'sol', 1) - (0.5 + 0.75 + 1) / 3) < 1e-9);
  assert.equal(N.precision(est, 'fa', 1), null);
  assert.equal(N.racha(lista, '2026-10-27'), 2, '26 y 27 seguidos; el 24 no cuenta por el hueco del 25');
  assert.equal(N.racha(lista, '2026-10-28'), 2, 'si hoy aún no practicaste, la racha cuenta hasta ayer');
  assert.equal(N.racha(lista, '2026-10-29'), 0);
  assert.equal(N.racha([], '2026-10-27'), 0);
});

test('pentagrama SVG: 5 líneas + las líneas adicionales que toquen, clave (sol o fa) y alteración', () => {
  const lineas = svg => (svg.match(/<line /g) || []).length;
  for (const [pos, extra] of [[0, 0], [8, 0], [-1, 0], [-2, 1], [-3, 1], [-4, 2], [9, 0], [10, 1], [11, 1], [12, 2]]) {
    assert.equal(lineas(N.svgPentagrama('sol', N.notaEnPos('sol', pos))), 5 + extra, 'posición ' + pos);
  }
  for (const [c, glifo] of [['sol', '\uE050'], ['fa', '\uE062']]) assert.ok(N.svgPentagrama(c, N.notaEnPos(c, 3)).includes(glifo));
  assert.ok(N.svgPentagrama('sol', n('F', 1, 4)).includes('\uE262')); assert.ok(N.svgPentagrama('sol', n('B', -1, 4)).includes('\uE260'));
  assert.ok(!/\uE262|\uE260/.test(N.svgPentagrama('sol', n('F', 0, 4))));
  assert.ok(!N.svgPentagrama('sol', n('F', 0, 4)).includes('style='), 'sin estilos en línea (la CSP los bloquea)');
});

test('teclado SVG: 24 teclas, una marcada, interactivo con teclado', () => {
  const s = N.svgTeclado({ marcar: [66] });
  assert.equal((s.match(/<rect /g) || []).length, 24); assert.equal((s.match(/pk-on/g) || []).length, 1);
  assert.ok(!s.includes('tabindex'));
  const i = N.svgTeclado({ interactivo: true });
  assert.equal((i.match(/tabindex="0"/g) || []).length, 24); assert.ok(i.includes('aria-label="C#/Db"'));
  assert.equal((N.svgTeclado({ clases: { 60: 'pk-ok', 61: 'pk-mal' } }).match(/pk-ok|pk-mal/g) || []).length, 2);
});

test('la fuente musical está incluida, es pequeña y trae su licencia', async () => {
  assert.ok((await stat(new URL('../vendor/atril-notas.woff2', import.meta.url))).size < 20_000);
  assert.match(await readFile(new URL('../vendor/OFL-Bravura.txt', import.meta.url), 'utf8'), /SIL OPEN FONT LICENSE/i);
});

const SEMITONOS = { '2m': 1, '2M': 2, '3m': 3, '3M': 4, '4J': 5, TT: 6, '5J': 7, '6m': 8, '6M': 9, '7m': 10, '7M': 11, '8J': 12 };
const ACORDES_PASOS = { mayor: [0, 4, 7], menor: [0, 3, 7], dim: [0, 3, 6], aum: [0, 4, 8], maj7: [0, 4, 7, 11], dom7: [0, 4, 7, 10], m7: [0, 3, 7, 10], m7b5: [0, 3, 6, 10] };

test('oído: intervalos suben, bajan o suenan juntos con los semitonos correctos y dentro del rango del piano', () => {
  const rng = semilla(5);
  for (const [tema, modo] of [['int-asc', 'asc'], ['int-desc', 'desc'], ['int-arm', 'arm']]) for (const nv of N.TEMAS[tema].niveles) {
    const vistos = new Set();
    for (let i = 0; i < 400; i++) {
      const p = N.crearPregunta(tema, nv.id, { items: {} }, rng, null), n = SEMITONOS[p.respuesta.id];
      vistos.add(p.respuesta.id);
      assert.ok(nv.ids.includes(p.respuesta.id));
      if (modo === 'arm') { assert.equal(p.pasos.length, 1); assert.equal(p.pasos[0].midis[1] - p.pasos[0].midis[0], n); }
      else {
        assert.equal(p.pasos.length, 2); assert.ok(p.pasos[1].en > p.pasos[0].en, 'la segunda nota llega después');
        assert.equal(p.pasos[1].midis[0] - p.pasos[0].midis[0], modo === 'asc' ? n : -n);
      }
      for (const m of p.notas) assert.ok(m >= 36 && m <= 96, 'fuera del rango cómodo: ' + m);
      assert.equal(p.item.split(':')[0], { asc: 'ia', desc: 'id', arm: 'ih' }[modo]);
    }
    assert.equal(vistos.size, nv.ids.length, `${tema}/${nv.id}: salen todos los intervalos del nivel`);
  }
});

test('oído: acordes con las notas correctas', () => {
  const rng = semilla(9);
  for (const nv of N.TEMAS.acordes.niveles) {
    const vistos = new Set();
    for (let i = 0; i < 300; i++) {
      const p = N.crearPregunta('acordes', nv.id, { items: {} }, rng, null);
      vistos.add(p.respuesta.id);
      assert.equal(p.pasos.length, 1);
      assert.deepEqual(JSON.parse(JSON.stringify(p.pasos[0].midis.map(m => m - p.pasos[0].midis[0]))), ACORDES_PASOS[p.respuesta.id]);
      assert.ok(p.item.startsWith('ac:'));
    }
    assert.equal(vistos.size, nv.ids.length);
  }
  assert.equal(N.TEMAS.acordes.niveles[3].ids.length, 8);
});

test('oído: botones de respuesta y nombres de notas', () => {
  const b = N.botones('int-asc', 1); assert.equal(b.tipo, 'opciones'); assert.deepEqual(JSON.parse(JSON.stringify(b.opciones.map(o => o.texto))), ['3m', '3M', '5J', '8J']);
  assert.equal(N.botones('int-asc', 4).opciones.length, 12);
  const a = N.botones('acordes', 3); assert.deepEqual(JSON.parse(JSON.stringify(a.opciones.map(o => o.texto))), ['Mayor 7ª', 'Dominante 7ª', 'Menor 7ª', 'Semidisminuido']);
  assert.equal(N.nombreMidi(60), 'C4'); assert.equal(N.nombreMidi(61), 'C#4'); assert.equal(N.nombreMidi(69), 'A4'); assert.equal(N.nombreMidi(48), 'C3');
});

// --- Bloque 3: armaduras y escalas escritas ---
const TABLA_MAYORES = { '-6': 'Gb', '-5': 'Db', '-4': 'Ab', '-3': 'Eb', '-2': 'Bb', '-1': 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#' };
const TABLA_MENORES = { '-6': 'Ebm', '-5': 'Bbm', '-4': 'Fm', '-3': 'Cm', '-2': 'Gm', '-1': 'Dm', 0: 'Am', 1: 'Em', 2: 'Bm', 3: 'F#m', 4: 'C#m', 5: 'G#m', 6: 'D#m' };

test('armaduras: la tónica mayor y la menor relativa de cada armadura (tabla escrita a mano)', () => {
  for (const f of Object.keys(TABLA_MAYORES)) {
    assert.equal(N.nombreTon(Number(f), 'M'), TABLA_MAYORES[f], 'mayor ' + f);
    assert.equal(N.nombreTon(Number(f), 'm'), TABLA_MENORES[f], 'menor ' + f);
  }
  assert.equal(N.nombreTon(-2, 'M', true), 'B♭'); assert.equal(N.nombreLargo(6, 'm'), 'D♯ menor');
  assert.equal(N.textoAlt(0), '0'); assert.equal(N.textoAlt(3), '3♯'); assert.equal(N.textoAlt(-2), '2♭');
  assert.equal(N.letrasAlt(3), 'F♯ C♯ G♯'); assert.equal(N.letrasAlt(-2), 'B♭ E♭'); assert.equal(N.letrasAlt(0), 'sin alteraciones');
});

test('escalas: cada escala mayor y menor natural tiene los semitonos correctos y siete letras distintas', () => {
  const pc = x => (N.PC[x.l] + x.a + 12) % 12;
  for (let f = -6; f <= 6; f++) for (const [modo, patron] of [['M', [2, 2, 1, 2, 2, 2, 1]], ['m', [2, 1, 2, 2, 1, 2, 2]]]) {
    const esc = [1, 2, 3, 4, 5, 6, 7, 8].map(g => N.gradoDeEscala(f, modo, g)), t = N.tonica(f, modo);
    assert.deepEqual(esc.map(x => x.l).slice(0, 7).sort(), [...N.LETRAS].sort(), `letras ${f}${modo}`);
    assert.deepEqual({ l: esc[0].l, a: esc[0].a }, { l: t.l, a: t.a });
    assert.deepEqual(esc.slice(1).map((x, i) => (pc(x) - pc(esc[i]) + 12) % 12), patron, `semitonos ${modo} ${f}`);
    for (const x of esc) assert.ok(Math.abs(x.a) <= 1, 'sin dobles alteraciones');
  }
  assert.equal(N.nombre(N.gradoDeEscala(6, 'M', 7), false), 'E#'); assert.equal(N.nombre(N.gradoDeEscala(-6, 'M', 4), false), 'Cb');
});

test('niveles de armadura: botones en el orden de la línea de quintas y preguntas con sus datos', () => {
  const b = (t, nv) => JSON.parse(JSON.stringify(N.botones(t, nv)));
  assert.deepEqual(b('arm-sol', 1).opciones.map(o => o.texto), ['B♭', 'F', 'C', 'G', 'D']);
  assert.equal(b('arm-sol', 3).opciones.length, 13); assert.equal(b('arm-fa', 4).opciones.length, 9);
  assert.deepEqual(b('arm-fa', 5).opciones.map(o => o.texto).slice(0, 3), ['E♭m', 'B♭m', 'Fm']);
  assert.deepEqual(b('arm-num', 2).opciones.map(o => o.texto), ['4♭', '3♭', '2♭', '1♭', '0', '1♯', '2♯', '3♯', '4♯']);
  assert.deepEqual(b('escala', 1), { tipo: 'letras', letras: ['C', 'D', 'E', 'F', 'G', 'A', 'B'], alteraciones: true });
  const p = N.crearPregunta('escala', 3, { items: {} }, semilla(3), null);
  assert.match(p.pedido, /^¿Qué nota es el [2-7]º grado de .+ mayor\?$/); assert.match(p.detalle, /^\(.+\)$/);
  assert.match(N.crearPregunta('arm-num', 4, { items: {} }, semilla(4), null).pedido, /menor\?$/);
  assert.match(N.crearPregunta('escala', 5, { items: {} }, semilla(4), null).pedido, /menor natural\?$/);
});

test('armadura SVG: 5 líneas, clave, tantos signos como alteraciones, todos dentro del pentagrama y sin chocar', () => {
  for (const clave of ['sol', 'fa']) for (let f = -6; f <= 6; f++) {
    const svg = N.svgArmadura(clave, f);
    assert.equal((svg.match(/<line /g) || []).length, 5); assert.ok(svg.includes(N.CLAVES[clave].glifo));
    assert.equal((svg.match(/\uE262/g) || []).length, f > 0 ? f : 0); assert.equal((svg.match(/\uE260/g) || []).length, f < 0 ? -f : 0);
    const xs = [...svg.matchAll(/<text x="(\d+)"[^>]*>[\uE260\uE262]/g)].map(m => Number(m[1]));
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= 12, 'signos separados');
    assert.ok(!svg.includes('style='), 'sin estilos en línea');
  }
  for (const clave of ['sol', 'fa']) for (const k of ['s', 'b']) for (const pos of N.POS_ARMADURA[clave][k]) assert.ok(pos >= 0 && pos <= 9, `${clave} ${k} ${pos}`);
  // las posiciones salen de las notas reales: sostenidos F C G D A E y bemoles B E A D G C, en la octava que cae dentro del pentagrama
  const dentro = (clave, letras, pos) => letras.forEach((l, i) => assert.equal(((pos[i] + N.CLAVES[clave].base) % 7 + 7) % 7, N.LETRAS.indexOf(l), `${clave} ${l}`));
  for (const clave of ['sol', 'fa']) { dentro(clave, ['F', 'C', 'G', 'D', 'A', 'E'], N.POS_ARMADURA[clave].s); dentro(clave, ['B', 'E', 'A', 'D', 'G', 'C'], N.POS_ARMADURA[clave].b); }
  assert.throws(() => N.svgArmadura('sol', 7)); assert.throws(() => N.svgArmadura('do', 1));
});

test('rótulos y servidor: los ejercicios nuevos se muestran bien y el servidor acepta sus sesiones', () => {
  assert.equal(N.rotulo('as:Bb'), 'Armadura B♭'); assert.equal(N.rotulo('af:F#m'), 'Armadura F♯m'); assert.equal(N.rotulo('an:Eb'), 'Alteraciones de E♭');
  assert.equal(N.rotulo('eg:Bb.6'), 'B♭ · grado 6'); assert.equal(N.rotulo('sol:E4'), 'E4'); assert.equal(N.rotulo('ia:3m'), '3m');
  const rng = semilla(9);
  for (const tema of ['arm-sol', 'arm-fa', 'arm-num', 'escala']) for (const nv of N.TEMAS[tema].niveles) {
    const q = Array.from({ length: 40 }, () => [N.crearPregunta(tema, nv.id, { items: {} }, rng, null).item, 1, 900]);
    assert.ok(limpiarSesion({ id: 'abcdef123456', t: tema, l: nv.id, f: '2026-10-28', n: 40, a: 40, ms: 36000, q }), `${tema}/${nv.id}: el servidor rechazaría la sesión`);
  }
});

// --- Bloque 5: sesión diaria y resumen ---
test('sesión diaria: reparte entre temas, prefiere lo débil y lo olvidado, y nunca repite el tema anterior', () => {
  const rng = semilla(21), temas = Object.keys(N.TEMAS), nivelDe = () => 1;
  // todo dominado y practicado hoy, salvo "fa" (débil) y "tecla" (hace 6 días)
  const sesiones = temas.map(t => ({ id: 'x' + t, t, l: 1, f: t === 'tecla' ? '2026-10-22' : '2026-10-28', n: 10, a: t === 'fa' ? 3 : 10, ms: 1, q: [] }));
  const est = N.estadisticas(sesiones), cuenta = {};
  let previo = null;
  for (let i = 0; i < 6000; i++) {
    const r = N.elegirTemaDiario(est, sesiones, '2026-10-28', nivelDe, rng, previo);
    assert.notEqual(r.tema, previo); assert.ok(N.TEMAS[r.tema].niveles.some(n => n.id === r.nivel));
    previo = r.tema; cuenta[r.tema] = (cuenta[r.tema] || 0) + 1;
  }
  assert.equal(Object.keys(cuenta).length, temas.length, 'salen todos los temas');
  const normal = cuenta.sol;
  assert.ok(cuenta.fa > 2.5 * normal, `débil: fa=${cuenta.fa} sol=${normal}`);
  assert.ok(cuenta.tecla > 1.4 * normal, `olvidado: tecla=${cuenta.tecla} sol=${normal}`);
  // un tema sin historial pesa más que uno dominado; un nivel inexistente cae al 1
  const sin = N.estadisticas([]), c2 = {}; for (let i = 0; i < 3000; i++) { const r = N.elegirTemaDiario(est, sesiones.filter(s => s.t !== 'acordes'), '2026-10-28', () => 99, rng, null); c2[r.tema] = (c2[r.tema] || 0) + 1; assert.equal(r.nivel, 1); }
  assert.ok(c2.acordes > c2.sol);
  assert.ok(N.elegirTemaDiario(sin, [], '2026-10-28', nivelDe, rng, null).tema);
});

test('resumen de 7 días, puntos débiles y más lentos', () => {
  const s = (id, f, n, a) => ({ id, t: 'sol', l: 1, f, n, a, ms: 1000 * n, q: [] });
  const sem = N.resumenSemana([s('a1', '2026-10-28', 10, 8), s('a2', '2026-10-28', 5, 5), s('a3', '2026-10-22', 4, 1), s('a4', '2026-10-21', 9, 9)], '2026-10-28');
  assert.equal(sem.length, 7); assert.equal(sem[0].f, '2026-10-22'); assert.equal(sem[6].f, '2026-10-28');
  assert.deepEqual({ ...sem[6] }, { f: '2026-10-28', n: 15, a: 13 }); assert.deepEqual({ ...sem[0] }, { f: '2026-10-22', n: 4, a: 1 }); assert.equal(sem[3].n, 0, 'el 21 queda fuera');
  assert.equal(N.resumenSemana([], '2026-03-01')[0].f, '2026-02-23', 'cruza el fin de mes');
  const est = { items: { 'sol:E4': { v: 10, a: 5, ms: 20000 }, 'as:Bb': { v: 4, a: 1, ms: 4000 }, 'sol:G4': { v: 20, a: 19, ms: 90000 }, 'eg:D.6': { v: 2, a: 0, ms: 1000 }, 'fa:C3': { v: 5, a: 4, ms: 5000 } } };
  const d = N.debiles(est);
  assert.deepEqual([...d.map(x => x.item)], ['as:Bb', 'sol:E4'], 'solo ≥3 intentos y <80 %, el peor primero');
  assert.equal(d[0].rotulo, 'Armadura B♭'); assert.equal(d[0].acierto, 0.25);
  assert.deepEqual([...N.lentos(est, 2).map(x => x.item)], ['sol:G4', 'sol:E4']); assert.equal(N.lentos(est, 2)[0].seg, 4.5);
  assert.equal(N.debiles({ items: {} }).length, 0); assert.equal(N.lentos({ items: {} }).length, 0);
});
