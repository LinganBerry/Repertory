// Pruebas del núcleo del motor de escucha (escucha/escucha.js): nombrar acordes, leer los de la canción y seguir lo que se toca.
// No usan micrófono ni modelo: se simulan las notas. Ejecutar: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import '../escucha/escucha.js';

const { nombrarLibre, leerAcorde, elegirDeLista, Seguidor } = globalThis.EscuchaNucleo;
const NOMBRES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BASES = [36, 48, 60, 72];   // la nota más grave arranca en Do2, Do3, Do4 o Do5 (+ 0 a 11 semitonos)
const nom = pc => NOMBRES[pc];

// Triada en una posición: 0 = fundamental, 1 = primera inversión, 2 = segunda. La nota más grave queda en `grave`.
function triada(raiz, tercera, pos, base) {
  const f = [0, tercera, 7];
  const orden = pos === 0 ? f : pos === 1 ? [f[1], f[2], f[0] + 12] : [f[2], f[0] + 12, f[1] + 12];
  const grave = base + ((raiz + orden[0]) % 12);
  return orden.map(n => grave + (n - orden[0]));
}

function todas(tercera, pos, esperado) {
  const fallos = [];
  for (const base of BASES) for (let r = 0; r < 12; r++) {
    const notas = triada(r, tercera, pos, base), r1 = nombrarLibre(notas);
    const quiero = esperado(r, notas);
    if (r1.nombre !== quiero) fallos.push(`${notas.join('-')} → ${r1.nombre} (esperado ${quiero})`);
  }
  return fallos;
}

test('nombrarLibre: tríadas mayores en posición fundamental, 12 raíces × 4 octavas', () => {
  assert.deepEqual(todas(4, 0, r => nom(r)), []);
});
test('nombrarLibre: tríadas menores en posición fundamental, 12 raíces × 4 octavas', () => {
  assert.deepEqual(todas(3, 0, r => nom(r) + 'm'), []);
});
test('nombrarLibre: mayores en primera inversión llevan el bajo (C/E)', () => {
  assert.deepEqual(todas(4, 1, (r, n) => nom(r) + '/' + nom(n[0] % 12)), []);
});
test('nombrarLibre: mayores y menores en segunda inversión llevan el bajo (C/G, Cm/G)', () => {
  assert.deepEqual(todas(4, 2, (r, n) => nom(r) + '/' + nom(n[0] % 12)), []);
  assert.deepEqual(todas(3, 2, (r, n) => nom(r) + 'm/' + nom(n[0] % 12)), []);
});
// Hallazgo 1 de la auditoría (arreglado en el paso 3): Do–Mib–Sol con Mib abajo salía "D#6" en vez de "Cm/D#".
test('nombrarLibre: menores en primera inversión llevan el bajo (Cm/D#), en las 4 octavas', () => {
  assert.deepEqual(todas(3, 1, (r, n) => nom(r) + 'm/' + nom(n[0] % 12)), []);
});
test('nombrarLibre: Cm/Mib con bemoles, y las sextas no se pierden', () => {
  assert.equal(nombrarLibre([51, 55, 60], { bemoles: true }).nombre, 'Cm/Eb');
  assert.equal(nombrarLibre([48, 52, 55, 57]).nombre, 'C6', 'Do–Mi–Sol–La completo sigue siendo C6');
  assert.equal(nombrarLibre([48, 51, 55, 57]).nombre, 'Am7b5/C', 'Cm6 tiene las mismas notas que Am7b5/C; el motor elige la segunda (igual que antes del arreglo)');
  assert.equal(nombrarLibre([48, 52, 57]).nombre, 'Am/C', 'Do–Mi–La (sin quinta) es La menor invertida');
});

test('nombrarLibre: séptimas y extensiones en posición fundamental', () => {
  const caso = (sufijo, ...semis) => { const n = semis.map(s => 48 + s); return nombrarLibre(n).nombre === 'C' + sufijo; };
  assert.ok(caso('7', 0, 4, 7, 10), 'C7');
  assert.ok(caso('maj7', 0, 4, 7, 11), 'Cmaj7');
  assert.ok(caso('m7', 0, 3, 7, 10), 'Cm7');
  assert.ok(caso('dim', 0, 3, 6), 'Cdim');
  assert.ok(caso('aug', 0, 4, 8), 'Caug');
  assert.ok(caso('sus4', 0, 5, 7), 'Csus4');
  assert.ok(caso('sus2', 0, 2, 7), 'Csus2');
});

test('nombrarLibre: una nota o la misma nota en octavas es "nota", no acorde', () => {
  assert.equal(nombrarLibre([60]).clase, 'nota');
  assert.equal(nombrarLibre([48, 60, 72]).clase, 'nota');
  assert.equal(nombrarLibre([]), null);
});

test('nombrarLibre: usa bemoles si se pide, y el orden de las notas no importa', () => {
  assert.equal(nombrarLibre([58, 62, 65], { bemoles: true }).nombre, 'Bb');
  assert.equal(nombrarLibre([58, 62, 65]).nombre, 'A#');
  assert.equal(nombrarLibre([67, 60, 64]).nombre, 'C');
});

// Hallazgo nuevo: un racimo cromático (Do a Fa, 6 notas seguidas) sale como "C#maj9/C" en vez de "desconocido".
test('nombrarLibre: un racimo de notas sin sentido no se inventa un acorde', { todo: 'hallazgo nuevo: umbral de "desconocido"' }, () => {
  const r = nombrarLibre([60, 61, 62, 63, 64, 65]);
  assert.equal(r.clase, 'desconocido');
});

test('leerAcorde: entiende los acordes escritos en las canciones', () => {
  const pcs = t => [...leerAcorde(t).pcs].sort((a, b) => a - b);
  assert.deepEqual(pcs('C'), [0, 4, 7]);
  assert.deepEqual(pcs('Am'), [0, 4, 9]);
  assert.deepEqual(pcs('Bb'), [2, 5, 10]);
  assert.deepEqual(pcs('F#m7'), [1, 4, 6, 9]);
  assert.deepEqual(pcs('Cmaj7'), [0, 4, 7, 11]);
  assert.deepEqual(pcs('B\u266D'), [2, 5, 10]);
  assert.equal(leerAcorde('D/F#').bajo, 6);
  assert.equal(leerAcorde('Am7/G').bajo, 7);
  assert.equal(leerAcorde('Am').bajo, 9);
});
// Nota: leerAcorde es permisivo ("Coro" lo lee como Cdim). Las palabras las descarta antes Hoja.esAcorde (hoja.js).
test('leerAcorde: lo que no empieza como acorde da null', () => {
  for (const t of ['Verso 1', 'H', '', 'x', 'Intro']) assert.equal(leerAcorde(t), null, t);
});

test('elegirDeLista: con la lista de la canción gana el acorde que suena, incluso invertido', () => {
  const lista = ['C', 'Cm', 'G', 'Am'].map(leerAcorde);
  const ev = pcs => { const e = new Array(12).fill(0); for (const p of pcs) e[p] = .9; return e; };
  assert.equal(elegirDeLista(ev([0, 4, 7]), [48, 52, 55], lista, 1.2).nombre, 'C');
  assert.equal(elegirDeLista(ev([9, 0, 4]), [45, 48, 52], lista, 1.2).nombre, 'Am');
  // primera inversión de Cm (Mib abajo): con la lista sí se acierta
  assert.equal(elegirDeLista(ev([3, 7, 0]), [51, 55, 60], lista, 1.2).nombre, 'Cm');
  assert.equal(elegirDeLista(ev([1, 6, 10]), [49, 54, 58], lista, 1.2), null, 'nada de la lista suena: no inventa');
});

// ---- Seguidor: se le dan fotogramas de ~11,6 ms como los que entrega el modelo ----
const DT = 1 / 86;
function tocar(seg, golpes, { hasta = 1.5 } = {}) {
  // golpes: [{ en: segundos, notas: [midi], dura: segundos }]
  const salidas = [];
  for (let t = 0; t <= hasta; t += DT) {
    const notas = [];
    for (const g of golpes) if (t >= g.en && t < g.en + g.dura) for (const m of g.notas) notas.push({ midi: m, prob: .9 });
    salidas.push(...seg.alimentar({ t, notas }));
  }
  return salidas;
}
const nombres = ev => ev.map(e => e.nombre);

test('Seguidor: un golpe de acorde da un solo aviso con el nombre correcto, en 5 octavas', () => {
  for (const base of [36, 48, 60, 72, 84]) {
    const ev = tocar(new Seguidor(), [{ en: .1, notas: [base, base + 4, base + 7], dura: .8 }]);
    assert.deepEqual(nombres(ev), ['C'], 'Do mayor desde la nota ' + base);
  }
});
test('Seguidor: la primera inversión de un acorde menor se nombra con su bajo, en 4 octavas', () => {
  for (const base of [36, 48, 60, 72]) {
    const ev = tocar(new Seguidor(), [{ en: .1, notas: [base + 3, base + 7, base + 12], dura: .8 }]);
    assert.deepEqual(nombres(ev), ['Cm/D#'], 'Do menor con Mib abajo, desde la nota ' + (base + 3));
  }
});
// Hallazgo 3: con grabaciones reales (Do mayor en 5 octavas) el motor detecta bien las notas, pero el Seguidor no avisaba el acorde
// en 2 de 10 casos. Estas pruebas repiten esos tiempos (en segundos desde el golpe) con las notas que entregó el modelo.
test('Seguidor: un chispazo del ataque (armónico suelto) no tapa el golpe real que llega 0,2 s después', () => {
  const ev = tocar(new Seguidor(), [
    { en: .0, notas: [71], dura: .09 },                    // Si4: chispazo del ataque, se apaga enseguida
    { en: .2, notas: [64, 67], dura: .9 },                 // Mi4 y Sol4 (el golpe de verdad)
    { en: .21, notas: [60, 72], dura: .9 },                // Do4 y Do5
  ], { hasta: 1.6 });
  assert.deepEqual(nombres(ev), ['C']);
});
test('Seguidor: el bajo que tarda en confirmarse (0,14 s) sigue siendo el mismo golpe', () => {
  const ev = tocar(new Seguidor(), [
    { en: .03, notas: [55], dura: .9 },                    // Sol3
    { en: .05, notas: [52], dura: .9 },                    // Mi3
    { en: .17, notas: [48], dura: .9 },                    // Do3 (el bajo llega tarde)
  ], { hasta: 1.6 });
  assert.deepEqual(nombres(ev), ['C']);
});
test('Seguidor: en la octava grave, los chispazos del ataque no se cuelan en el nombre (nada de C6 ni F#dim/C)', () => {
  const ev = tocar(new Seguidor(), [
    { en: .0, notas: [66, 69], dura: .07 },                // Fa#4 y La4: chispazos
    { en: .06, notas: [43], dura: 1 }, { en: .1, notas: [36], dura: 1 }, { en: .13, notas: [40], dura: 1 },   // Sol2, Do2, Mi2
  ], { hasta: 1.6 });
  assert.equal(nombres(ev).at(-1), 'C');
  assert.ok(!nombres(ev).some(n => /dim|6/.test(n)), 'avisos: ' + nombres(ev).join(' > '));
});
test('Seguidor: pasar al siguiente acorde cambia el nombre aunque el bajo tarde un poco', () => {
  const ev = tocar(new Seguidor(), [
    { en: .1, notas: [48, 52, 55], dura: .5 },             // C
    { en: 1.0, notas: [62, 59], dura: .6 }, { en: 1.15, notas: [43], dura: .6 },   // G con el bajo 0,15 s tarde
  ], { hasta: 2.4 });
  assert.deepEqual(nombres(ev), ['C', 'G']);
});

// Respaldo: si un golpe de 3 o más notas no recibe nombre por la lógica de grupos, se nombra lo que suena estable.
test('Seguidor: un acorde que se toca "rodando" (notas separadas 0,18 s, sin bajo) igual recibe su nombre', () => {
  const ev = tocar(new Seguidor(), [
    { en: .0, notas: [60], dura: 1.4 }, { en: .18, notas: [64], dura: 1.2 }, { en: .36, notas: [67], dura: 1 },
  ], { hasta: 2.2 });
  assert.deepEqual(nombres(ev), ['C']);
});
test('Seguidor: el respaldo no cambia el acorde por una melodía encima ni porque se apague una nota', () => {
  const melodia = tocar(new Seguidor(), [{ en: .1, notas: [48, 52, 55], dura: 2.4 }, { en: 1.2, notas: [69], dura: .9 }], { hasta: 3 });
  assert.deepEqual(nombres(melodia), ['C'], 'melodía encima del acorde');
  const se_apaga = tocar(new Seguidor(), [{ en: .1, notas: [48], dura: 1 }, { en: .1, notas: [52, 55, 60], dura: 2 }], { hasta: 3 });
  assert.deepEqual(nombres(se_apaga), ['C'], 'el bajo se apaga y el acorde sigue siendo C (no C/E)');
});

// Progresiones (acorde tras acorde): el panel no se queda pegado al anterior aunque este siga sonando un poco (pedal) o comparta notas.
test('Seguidor: Do a La menor con el Do aún sonando 0,3 s (pedal): cambia a Am', () => {
  const ev = tocar(new Seguidor(), [
    { en: .1, notas: [48, 52, 55], dura: 1.3 },            // C (se apaga 0,3 s después de que entre el siguiente)
    { en: 1.0, notas: [45, 57, 60, 64], dura: 1.2 },       // Am: el bajo La2 y La3–Do4–Mi4
  ], { hasta: 2.6 });
  assert.equal(nombres(ev).at(-1), 'Am', nombres(ev).join(' > '));
});
test('Seguidor: Do♯m a Fa♯m, notas entrando una a una mientras el acorde anterior se apaga', () => {
  const ev = tocar(new Seguidor(), [
    { en: .1, notas: [49, 52, 56], dura: 1.5 },            // C#m (suena hasta 1.6)
    { en: 1.5, notas: [66], dura: .09 },                   // chispazo del ataque
    { en: 1.55, notas: [57], dura: 1 }, { en: 1.6, notas: [61], dura: 1 }, { en: 1.68, notas: [54], dura: 1 },   // F#m
  ], { hasta: 3 });
  assert.equal(nombres(ev).at(-1), 'F#m', nombres(ev).join(' > '));
});
test('Seguidor: un chispazo grave del ataque (Re5 sobre Sol♯m) se corrige solo: queda G#m, no G#dim/D', () => {
  const ev = tocar(new Seguidor(), [
    { en: .1, notas: [74], dura: .1 },                     // chispazo
    { en: .14, notas: [87, 80, 83], dura: 1.2 },
  ], { hasta: 2 });
  assert.equal(nombres(ev).at(-1), 'G#m', nombres(ev).join(' > '));
});
test('Seguidor: una nota compartida entre dos acordes no impide el cambio (Fa♯m a La)', () => {
  const ev = tocar(new Seguidor(), [
    { en: .1, notas: [54, 57, 61], dura: 1.2 },            // F#m
    { en: 1.0, notas: [57, 61, 64], dura: 1.4 },           // A: comparte La y Do♯, entra Mi; el Fa♯ se apaga
  ], { hasta: 2.8 });
  assert.equal(nombres(ev).at(-1), 'A', nombres(ev).join(' > '));
});

test('Seguidor: cada golpe nuevo avisa; repetir el mismo acorde no repite el aviso', () => {
  const ev = tocar(new Seguidor(), [
    { en: .1, notas: [48, 52, 55], dura: .5 },
    { en: .9, notas: [43, 47, 50], dura: .5 },   // G
    { en: 1.7, notas: [43, 47, 50], dura: .5 },  // G otra vez
  ], { hasta: 2.5 });
  assert.deepEqual(nombres(ev), ['C', 'G']);
});
test('Seguidor: un arpegio con bajo se nombra al sumarse las notas', () => {
  const ev = tocar(new Seguidor(), [
    { en: .1, notas: [45], dura: .9 }, { en: .3, notas: [52], dura: .7 }, { en: .5, notas: [60], dura: .5 }, { en: .7, notas: [64], dura: .3 },
  ], { hasta: 1.8 });
  assert.ok(nombres(ev).includes('Am'), nombres(ev).join(','));
});
test('Seguidor: una melodía suelta sin bajo no es un acorde', () => {
  const ev = tocar(new Seguidor(), [
    { en: .1, notas: [67], dura: .3 }, { en: .5, notas: [69], dura: .3 }, { en: .9, notas: [71], dura: .3 },
  ], { hasta: 1.8 });
  assert.deepEqual(ev, []);
});
test('Seguidor: ignora notas fuera del rango que atiende (minMidi 28, maxMidi 96)', () => {
  assert.deepEqual(tocar(new Seguidor(), [{ en: .1, notas: [100, 104, 107], dura: .5 }]), []);
  // Do1 queda fuera: solo quedan Mi1 y Sol1, y se nombra Em (límite conocido, hallazgo 3)
  assert.deepEqual(nombres(tocar(new Seguidor(), [{ en: .1, notas: [24, 28, 31], dura: .8 }])), ['Em']);
});
test('Seguidor: con la lista de la canción el aviso es de clase "lista"', () => {
  const lista = ['C', 'G', 'Am', 'F'].map(leerAcorde);
  const ev = tocar(new Seguidor({ candidatos: lista }), [{ en: .1, notas: [48, 52, 55], dura: .6 }]);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].nombre, 'C');
  assert.equal(ev[0].clase, 'lista');
});
test('Seguidor.reiniciar: olvida el acorde mostrado y vuelve a avisar', () => {
  const seg = new Seguidor();
  assert.deepEqual(nombres(tocar(seg, [{ en: .1, notas: [48, 52, 55], dura: .5 }])), ['C']);
  seg.reiniciar();
  assert.deepEqual(nombres(tocar(seg, [{ en: .1, notas: [48, 52, 55], dura: .5 }])), ['C']);
});
