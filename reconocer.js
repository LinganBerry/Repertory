// Reconocer acordes: sale un acorde marcado en el piano (y/o escrito en el pentagrama), a veces con inversión, y dices cuál es: la raíz y si es mayor o menor.
// Es lo contrario de los Retos de acordes (ahí te dan el nombre y lo tocas). Usa los acordes y las estadísticas de retos.js.
// La lógica (qué se dibuja, cómo se comprueba, la pista) no usa el DOM y se prueba en test/. La pantalla se abre desde Practicar.
(function (raiz) {
  'use strict';
  const R = raiz.Retos;
  if (!R) return;

  // Las 12 raíces posibles por tono (pc = 0..11). Las teclas negras llevan los dos nombres, para no tener que adivinar cuál usa la página.
  const RAICES_PC = [[0, 'C'], [1, 'C♯/D♭'], [2, 'D'], [3, 'D♯/E♭'], [4, 'E'], [5, 'F'], [6, 'F♯/G♭'], [7, 'G'], [8, 'G♯/A♭'], [9, 'A'], [10, 'A♯/B♭'], [11, 'B']];
  const bonito = n => n.replace('#', '♯').replace('b', '♭');
  const hablado = t => t.replace('♯', ' sostenido').replace('♭', ' bemol').replace('/', ' o ');
  const nombreLargo = r => bonito(r.raiz) + (r.calidad === 'm' ? ' menor' : ' mayor');

  // "Db" + midi -> { l: 'D', a: -1, o: 4 }. En clave de fa el acorde se escribe una octava más abajo, para que quede dentro del pentagrama.
  function notasPentagrama(reto, clave) {
    const baja = clave === 'fa' ? 12 : 0;
    return reto.notas.map((nombre, i) => {
      const alts = nombre.slice(1), a = (alts.match(/#/g) || []).length - (alts.match(/b/g) || []).length;
      return { l: nombre[0], a, o: Math.floor((reto.midis[i] - baja - a) / 12) - 1 };
    });
  }
  // Una pregunta: un reto de Retos (misma elección de acorde, inversión y repaso de fallos) más la clave en que se escribe.
  function crearPregunta(op = {}, azar = Math.random, previo = null, est = null) {
    const r = R.crearReto({ calidad: op.calidad, inversiones: op.inversiones, repasar: op.repasar }, azar, previo, est);
    const clave = op.clave === 'ambas' || !op.clave ? (azar() < 0.5 ? 'sol' : 'fa') : op.clave;
    return { ...r, clave, escritas: notasPentagrama(r, clave) };
  }
  // pc: tono elegido (0..11, cualquier nombre del mismo tono vale: Db y C♯ son la misma tecla); calidad: 'M' o 'm'.
  function comprobar(reto, pc, calidad) {
    const raizBien = pc === R.acorde(reto.raiz, reto.calidad).tonos[0].pc, calidadBien = calidad === reto.calidad;
    return { raizBien, calidadBien, bien: raizBien && calidadBien };
  }
  // Una sola pista, la que corresponde a lo que falló. Solo se muestra cuando fallas.
  function pista(reto, res) {
    if (res.bien) return '';
    if (!res.raizBien) return reto.inv === 0
      ? 'Aquí no hay cuarta: son terceras apiladas y la raíz es la nota de abajo.'
      : 'Busca la cuarta entre dos notas seguidas: la raíz es la nota de arriba de esa cuarta.';
    return 'Ordénalo en terceras desde la raíz: tercera mayor abajo es mayor; tercera menor abajo es menor.';
  }

  const api = { RAICES_PC, notasPentagrama, crearPregunta, comprobar, pista, nombreLargo };
  raiz.Reconocer = api;
  if (typeof document === 'undefined') return;

  // --- pantalla (dentro de la capa de Practicar) ---
  const N = raiz.Notacion;
  if (!N || !N.svgAcorde) return;
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) k === 'rol' ? n.setAttribute('role', v) : k.includes('-') ? n.setAttribute(k, v) : (n[k] = v);
    n.append(...kids.flat().filter(k => k != null && k !== false));
    return n;
  };
  const nodoSvg = texto => document.importNode(new DOMParser().parseFromString(texto, 'image/svg+xml').documentElement, true);
  const PREF = 'repertorio-reconocer-pref', EST = 'repertorio-reconocer-v1';
  const { leer, guardar } = window.RepertorioLocal;
  const seg = ms => (ms / 1000).toFixed(1) + ' s';

  const PREF0 = { calidad: 'ambos', inversiones: true, vista: 'piano', clave: 'ambas', repasar: true };
  let caja = null, volverFn = null, vista = 'menu', ses = null, pref = { ...PREF0 }, est = R.vacias();
  const barra = (izq, centro) => el('div', { className: 'cbarra' }, izq, el('span', { className: 'ctitulo' }, centro));
  const atrasBtn = (texto, titulo = 'Salir') => el('button', { type: 'button', title: titulo, onclick: () => history.back() }, texto);
  const poner = (...hijos) => { caja.replaceChildren(...hijos); caja.scrollTop = 0; };

  function menu(conservar) {
    vista = 'menu'; ses = null;
    const y = conservar ? caja.scrollTop : 0, r = R.resumen(est);
    const opcion = (campo, valor, texto) => el('button', {
      type: 'button', 'data-op': campo + ':' + valor, 'aria-pressed': String(pref[campo] === valor),
      onclick: () => { pref[campo] = valor; guardar(PREF, pref); menu(true); const b = caja.querySelector(`[data-op="${campo}:${valor}"]`); if (b) b.focus({ preventScroll: true }); }
    }, texto);
    poner(
      barra(el('button', { type: 'button', title: 'Volver a Practicar', onclick: () => { vista = 'fuera'; volverFn(); } }, '← Practicar'), 'Reconocer acordes'),
      el('div', { className: 'ccuerpo', 'data-reconocer': '1' },
        el('p', {}, 'Sale un acorde marcado en el piano. Di cuál es: su raíz y si es mayor o menor. Con inversiones cuesta más ver la raíz. No usa sonido ni internet.'),
        el('div', { className: 'parte' }, el('h3', {}, 'Acordes'),
          el('div', { className: 'tg', rol: 'group', 'aria-label': 'Acordes' }, opcion('calidad', 'M', 'Mayores'), opcion('calidad', 'm', 'Menores'), opcion('calidad', 'ambos', 'Ambos'))),
        el('div', { className: 'parte' }, el('h3', {}, 'Posición'),
          el('div', { className: 'tg', rol: 'group', 'aria-label': 'Posición' }, opcion('inversiones', false, 'Fundamental'), opcion('inversiones', true, 'Con inversiones'))),
        el('div', { className: 'parte' }, el('h3', {}, 'Verlo en'),
          el('div', { className: 'tg', rol: 'group', 'aria-label': 'Verlo en' }, opcion('vista', 'piano', 'Piano'), opcion('vista', 'pent', 'Pentagrama'), opcion('vista', 'ambos', 'Los dos'))),
        pref.vista === 'piano' ? null : el('div', { className: 'parte' }, el('h3', {}, 'Clave'),
          el('div', { className: 'tg', rol: 'group', 'aria-label': 'Clave' }, opcion('clave', 'sol', 'Sol'), opcion('clave', 'fa', 'Fa'), opcion('clave', 'ambas', 'Las dos'))),
        el('div', { className: 'parte' }, el('h3', {}, 'Repasar lo que fallo'),
          el('div', { className: 'tg', rol: 'group', 'aria-label': 'Repasar lo que fallo' }, opcion('repasar', true, 'Sí'), opcion('repasar', false, 'No'))),
        el('p', {}, el('button', { type: 'button', className: 'primario', id: 'rc-empezar-10', onclick: () => empezar(10) }, 'Empezar · 10'), ' ',
          el('button', { type: 'button', id: 'rc-empezar-20', onclick: () => empezar(20) }, 'Empezar · 20')),
        el('div', { className: 'parte', id: 'rc-progreso' }, el('h3', {}, 'Tu progreso'),
          r.v ? el('p', {}, `${r.v} acordes · ${Math.round((r.a / r.v) * 100)}% bien`) : el('p', {}, 'Aún no has hecho este ejercicio.'),
          r.repasar.length ? [el('p', { className: 'a' }, 'Para repasar'), el('div', { className: 'chips' }, ...r.repasar.map(f => el('span', { className: 'chip' }, el('b', {}, f.nombre), el('i', { className: 'rom' }, f.corta + ' · ' + Math.round((f.a / f.v) * 100) + '%'))))] : null)));
    caja.scrollTop = y;
  }

  function empezar(total) {
    ses = { total, i: 0, hechas: [], reto: null, fase: 'pregunta', t0: 0, ms: 0, tRevela: 0, pc: null, cal: null, res: null };
    siguiente();
  }
  function siguiente() {
    if (ses.i >= ses.total) return resultado();
    ses.reto = crearPregunta(pref, Math.random, ses.reto && ses.reto.item, est);
    ses.i++; ses.fase = 'pregunta'; ses.pc = null; ses.cal = null; ses.res = null; ses.t0 = performance.now(); vista = 'sesion';
    pintar();
  }
  function revisar() {
    if (!ses || ses.fase !== 'pregunta' || ses.pc == null || !ses.cal) return;
    ses.ms = Math.min(120000, Math.max(0, Math.round(performance.now() - ses.t0)));
    ses.res = comprobar(ses.reto, ses.pc, ses.cal);
    R.registrar(est, ses.reto.item, ses.res.bien, ses.ms); guardar(EST, est);
    ses.hechas.push({ item: ses.reto.item, nombre: ses.reto.nombre, corta: ses.reto.corta, bien: ses.res.bien, ms: ses.ms });
    ses.fase = 'revisado'; ses.tRevela = performance.now();
    pintar();
  }
  const enGuardia = () => performance.now() - ses.tRevela < R.CFG.guardia;     // evita que un doble toque salte la respuesta sin verla
  function avanzar() { if (!ses || ses.fase !== 'revisado' || enGuardia()) return; siguiente(); }

  function pintar() {
    const r = ses.reto, rev = ses.fase === 'revisado', ultimo = ses.i >= ses.total;
    // En el piano se ve siempre que se eligió (y al revelar, aunque solo se haya visto el pentagrama, para poder tocarlo)
    const verPiano = pref.vista !== 'pent' || rev, verPent = pref.vista !== 'piano';
    const visual = [verPent ? el('div', { className: 'pr-visual rc-pent' }, nodoSvg(N.svgAcorde(r.clave, r.escritas))) : null,
      verPiano ? el('div', { className: 'pr-visual' }, nodoSvg(N.svgTeclado({ marcar: r.midis }))) : null];
    let cuerpo;
    if (!rev) {
      const raices = el('div', { className: 'rc-raices', rol: 'group', 'aria-label': 'Raíz del acorde' }, ...RAICES_PC.map(([pc, t]) =>
        el('button', { type: 'button', className: t.length > 1 ? 'rc-negra' : '', 'data-pc': String(pc), 'aria-label': hablado(t), 'aria-pressed': 'false', onclick: () => elegir('pc', pc) }, t)));
      const cals = el('div', { className: 'rc-cal', rol: 'group', 'aria-label': 'Calidad' },
        el('button', { type: 'button', 'data-cal': 'M', 'aria-pressed': 'false', onclick: () => elegir('cal', 'M') }, 'Mayor'),
        el('button', { type: 'button', 'data-cal': 'm', 'aria-pressed': 'false', onclick: () => elegir('cal', 'm') }, 'Menor'));
      cuerpo = [el('p', { className: 'a rc-q' }, '¿Qué acorde es?'), raices, cals,
        el('div', { className: 'rt-botones' }, el('button', { type: 'button', className: 'primario', id: 'rc-comprobar', disabled: true, onclick: revisar }, 'Comprobar'),
          el('p', { className: 'a', id: 'rc-ayuda' }, 'Elige la raíz y si es mayor o menor.'))];
    } else {
      const ok = ses.res.bien, tip = pista(r, ses.res);
      const dijo = (RAICES_PC.find(x => x[0] === ses.pc) || ['', ''])[1] + (ses.cal === 'm' ? ' menor' : ' mayor');
      cuerpo = [el('div', { className: 'parte rc-res', id: 'rc-res', 'aria-live': 'polite' },
        el('p', { className: 'rc-veredicto ' + (ok ? 'bien' : 'mal'), id: 'rc-veredicto' }, ok ? 'Bien' : 'No era ese'),
        el('p', { className: 'rc-era', id: 'rc-era' }, 'Era ' + nombreLargo(r) + ' · ' + r.posicion.toLowerCase()),
        ok ? el('p', { className: 'a' }, 'Tardaste ' + seg(ses.ms) + '.') : el('p', { className: 'a', id: 'rc-dijo' }, 'Dijiste ' + dijo + '.'),
        el('p', { className: 'rt-notas' }, r.notas.map(bonito).join(' – ')),
        tip ? el('p', { className: 'rc-pista', id: 'rc-pista' }, tip) : null),
        el('div', { className: 'rt-botones' }, el('button', { type: 'button', className: 'primario', id: 'rc-sig', onclick: avanzar }, ultimo ? 'Ver resultado' : 'Siguiente'))];
    }
    poner(barra(atrasBtn('← Salir', 'Salir (Esc)'), `${ses.i} / ${ses.total}`),
      el('div', { className: 'ccuerpo pr-sesion', 'data-reconocer': '1' }, ...visual, ...cuerpo));
    const primero = caja.querySelector(rev ? '#rc-sig' : '.rc-raices button'); if (primero) primero.focus({ preventScroll: true });
  }
  // Marca la raíz o la calidad elegida sin volver a dibujar la pantalla (así no se pierde el foco ni el lugar del dedo).
  function elegir(campo, valor) {
    if (!ses || ses.fase !== 'pregunta') return;
    ses[campo] = valor;
    for (const b of caja.querySelectorAll('[data-pc]')) b.setAttribute('aria-pressed', String(Number(b.dataset.pc) === ses.pc));
    for (const b of caja.querySelectorAll('[data-cal]')) b.setAttribute('aria-pressed', String(b.dataset.cal === ses.cal));
    const listo = ses.pc != null && !!ses.cal, boton = document.getElementById('rc-comprobar'), ayuda = document.getElementById('rc-ayuda');
    if (boton) boton.disabled = !listo;
    if (ayuda) ayuda.hidden = listo;
  }
  function resultado() {
    vista = 'resultado';
    const h = ses.hechas, a = h.filter(x => x.bien), total = ses.total, fallos = h.filter(x => !x.bien);
    const medio = a.length ? a.reduce((s, x) => s + x.ms, 0) / a.length : 0;
    const chip = x => el('span', { className: 'chip' }, el('b', {}, x.nombre), el('i', { className: 'rom' }, x.corta));
    poner(
      barra(atrasBtn('← Salir', 'Salir (Esc)'), 'Resultado'),
      el('div', { className: 'ccuerpo pr-sesion', 'data-reconocer': '1' },
        el('h2', { id: 'rc-resultado', tabIndex: -1 }, `${a.length} de ${total} bien · ${Math.round((a.length / total) * 100)}%`),
        a.length ? el('p', { className: 'a' }, 'Tiempo medio de los que acertaste: ' + seg(medio)) : null,
        fallos.length ? el('div', { className: 'parte' }, el('h3', {}, 'Para repasar'), el('div', { className: 'chips' }, ...fallos.map(chip))) : el('p', {}, 'Sin fallos.'),
        el('p', {}, el('button', { type: 'button', className: 'primario', id: 'rc-repetir', onclick: () => empezar(total) }, 'Repetir'), ' ', el('button', { type: 'button', id: 'rc-opciones', onclick: () => menu() }, 'Cambiar opciones'))));
    const t = document.getElementById('rc-resultado'); if (t) t.focus({ preventScroll: true });
  }

  // Practicar llama a abrir() al entrar y a atras() cuando se usa Atrás: dentro de un acorde o del resultado vuelve al menú
  // (devuelve true); desde el menú devuelve false y Practicar vuelve a su propio menú.
  api.abrir = (cajaPracticar, volver) => {
    caja = cajaPracticar; volverFn = volver; ses = null;
    const g = leer(PREF) || {};
    pref = { ...PREF0, ...(typeof g === 'object' ? g : {}) };
    if (!['M', 'm', 'ambos'].includes(pref.calidad)) pref.calidad = 'ambos';
    if (!['sol', 'fa', 'ambas'].includes(pref.clave)) pref.clave = 'ambas';
    if (!['piano', 'pent', 'ambos'].includes(pref.vista)) pref.vista = 'piano';
    for (const k of ['inversiones', 'repasar']) pref[k] = typeof pref[k] === 'boolean' ? pref[k] : PREF0[k];
    est = R.limpiar(leer(EST));
    menu(); caja.focus({ preventScroll: true });
  };
  api.atras = () => {
    if (vista === 'sesion' || vista === 'resultado') { menu(); return true; }
    return false;
  };
})(typeof window !== 'undefined' ? window : globalThis);
