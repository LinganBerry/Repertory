// Lectura a primera vista: sale una frase corta de 4 notas en el pentagrama; la lees, la tocas en tu piano y luego miras cuáles eran.
// Sin sonido, sin puntos y sin estadísticas: es solo para leer. La lógica (crearFrase) no usa el DOM y se prueba en test/.
(function (raiz) {
  'use strict';
  const N = raiz.Notacion;
  if (!N || !N.svgFrase) return;

  // Posiciones permitidas en el pentagrama (0 = primera línea). Sol: Do4 a Sol5. Fa: La2 a Do4, la mano izquierda de siempre.
  const RANGO = { sol: [-2, 9], fa: [1, 10] };
  // "grados": casi siempre de una nota a la vecina (la base de leer). "saltos": terceras, cuartas y repeticiones.
  const PASOS = { grados: [-1, -1, 1, 1, 0], saltos: [-3, -2, -1, 1, 2, 3] };

  function crearFrase(op = {}, azar = Math.random, largo = 4) {
    const clave = op.clave === 'sol' || op.clave === 'fa' ? op.clave : (azar() < 0.5 ? 'sol' : 'fa');
    const [lo, hi] = RANGO[clave], pasos = PASOS[op.movimiento === 'saltos' ? 'saltos' : 'grados'];
    let pos = [];
    for (let intento = 0; intento < 50 && new Set(pos).size < 3; intento++) {
      pos = [lo + 2 + Math.floor(azar() * (hi - lo - 3))];   // empieza lejos de los bordes; la frase debe tener al menos 3 notas distintas
      while (pos.length < largo) {
        const ult = pos[pos.length - 1], d = pasos[Math.floor(azar() * pasos.length)];
        pos.push(ult + d < lo || ult + d > hi ? ult - d : ult + d);        // si se sale del pentagrama, rebota hacia el otro lado
      }
    }
    const notas = pos.map(p => N.deIndice(N.CLAVES[clave].base + p, 0));
    return { clave, pos, notas, nombres: notas.map(n => N.nombre(n)), midis: notas.map(n => N.midi(n)) };
  }
  const api = { RANGO, crearFrase };
  raiz.Lectura = api;
  if (typeof document === 'undefined') return;

  // --- pantalla (dentro de la capa de Practicar) ---
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) k === 'rol' ? n.setAttribute('role', v) : k.includes('-') ? n.setAttribute(k, v) : (n[k] = v);
    n.append(...kids.flat().filter(k => k != null && k !== false));
    return n;
  };
  const nodoSvg = texto => document.importNode(new DOMParser().parseFromString(texto, 'image/svg+xml').documentElement, true);
  const PREF = 'repertorio-lectura-pref', { leer, guardar } = window.RepertorioLocal;
  const PREF0 = { clave: 'ambas', movimiento: 'grados' };
  let caja = null, volverFn = null, vista = 'menu', pref = { ...PREF0 }, frase = null, n = 0, revelada = false;
  const barra = (izq, centro) => el('div', { className: 'cbarra' }, izq, el('span', { className: 'ctitulo' }, centro));
  const poner = (...hijos) => { caja.replaceChildren(...hijos); caja.scrollTop = 0; };

  function menu(conservar) {
    vista = 'menu'; frase = null;
    const y = conservar ? caja.scrollTop : 0;
    const opcion = (campo, valor, texto) => el('button', {
      type: 'button', 'data-op': campo + ':' + valor, 'aria-pressed': String(pref[campo] === valor),
      onclick: () => { pref[campo] = valor; guardar(PREF, pref); menu(true); const b = caja.querySelector(`[data-op="${campo}:${valor}"]`); if (b) b.focus({ preventScroll: true }); }
    }, texto);
    poner(
      barra(el('button', { type: 'button', title: 'Volver a Practicar', onclick: () => { vista = 'fuera'; volverFn(); } }, '← Practicar'), 'Lectura a primera vista'),
      el('div', { className: 'ccuerpo', 'data-lectura': '1' },
        el('p', {}, 'Sale una frase corta. Léela sin parar y tócala en tu piano; después mira cuáles eran. No suena ni cuenta puntos: es solo para leer.'),
        el('div', { className: 'parte' }, el('h3', {}, 'Clave'),
          el('div', { className: 'tg', rol: 'group', 'aria-label': 'Clave' }, opcion('clave', 'sol', 'Sol'), opcion('clave', 'fa', 'Fa'), opcion('clave', 'ambas', 'Las dos'))),
        el('div', { className: 'parte' }, el('h3', {}, 'Movimiento'),
          el('div', { className: 'tg', rol: 'group', 'aria-label': 'Movimiento' }, opcion('movimiento', 'grados', 'Por grados'), opcion('movimiento', 'saltos', 'Con saltos'))),
        el('p', {}, el('button', { type: 'button', className: 'primario', id: 'lc-empezar', onclick: siguiente }, 'Empezar'))));
    caja.scrollTop = y;
  }
  function siguiente() { frase = crearFrase(pref); n++; revelada = false; vista = 'frase'; pintar(); }
  function pintar() {
    const todasEnPiano = frase.midis.every(m => m >= 60 && m <= 83);      // el teclado dibujado va de Do4 a Si5
    const cuerpo = [el('div', { className: 'pr-visual rc-pent' }, nodoSvg(N.svgFrase(frase.clave, frase.notas)))];
    if (revelada) {
      cuerpo.push(el('p', { className: 'rt-notas', id: 'lc-notas' }, frase.nombres.join(' – ')));
      if (todasEnPiano) cuerpo.push(el('div', { className: 'pr-visual' }, nodoSvg(N.svgTeclado({ marcar: frase.midis }))));
    } else cuerpo.push(el('p', { className: 'a' }, 'Léela y tócala en tu piano.'));
    cuerpo.push(el('div', { className: 'rt-botones' }, el('button', { type: 'button', className: 'primario', id: 'lc-boton', onclick: () => { if (revelada) siguiente(); else { revelada = true; pintar(); } } }, revelada ? 'Otra frase' : 'Ver cuáles son')));
    poner(barra(el('button', { type: 'button', title: 'Salir (Esc)', onclick: () => history.back() }, '← Salir'), `Frase ${n}`), el('div', { className: 'ccuerpo pr-sesion', 'data-lectura': '1' }, ...cuerpo));
    const b = document.getElementById('lc-boton'); if (b) b.focus({ preventScroll: true });
  }

  api.abrir = (cajaPracticar, volver) => {
    caja = cajaPracticar; volverFn = volver; n = 0;
    const g = leer(PREF) || {};
    pref = { ...PREF0, ...(typeof g === 'object' ? g : {}) };
    if (!['sol', 'fa', 'ambas'].includes(pref.clave)) pref.clave = 'ambas';
    if (!['grados', 'saltos'].includes(pref.movimiento)) pref.movimiento = 'grados';
    menu(); caja.focus({ preventScroll: true });
  };
  api.atras = () => { if (vista === 'frase') { menu(); return true; } return false; };
})(typeof window !== 'undefined' ? window : globalThis);
