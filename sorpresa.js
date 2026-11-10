// Canción sorpresa: sale una canción de tu repertorio al azar (título y tono). La tocas de memoria y luego miras los acordes.
// No se repite ninguna hasta que hayan salido todas. No usa sonido ni internet, y no guarda nada.
// La lógica (elegir) no usa el DOM y se prueba en test/. La pantalla se abre desde Practicar.
(function (raiz) {
  'use strict';
  const clave = c => (typeof c.id === 'string' && c.id) ? c.id : (c.titulo || '') + '|' + (c.artista || '');
  const valida = c => c && typeof c.titulo === 'string' && c.titulo.trim() !== '';

  // usadas: claves de las canciones que ya salieron en esta vuelta (la última es la más reciente).
  // Devuelve null si no hay canciones; si no, { cancion, usadas, vuelta, quedan }.
  // vuelta = true cuando ya habían salido todas y empieza una vuelta nueva (la última no se repite de seguido).
  function elegir(canciones, usadas, azar = Math.random) {
    const todas = (Array.isArray(canciones) ? canciones : []).filter(valida);
    if (!todas.length) return null;
    const existen = new Set(todas.map(clave));
    let previas = (Array.isArray(usadas) ? usadas : []).filter(k => existen.has(k));
    let faltan = todas.filter(c => !previas.includes(clave(c)));
    let vuelta = false;
    if (!faltan.length) {
      vuelta = true;
      const ultima = previas[previas.length - 1];
      faltan = todas.length > 1 ? todas.filter(c => clave(c) !== ultima) : todas;
      previas = [];
    }
    const c = faltan[Math.min(faltan.length - 1, Math.floor(azar() * faltan.length))];
    const nuevas = [...previas, clave(c)];
    return { cancion: c, usadas: nuevas, vuelta, quedan: todas.length - nuevas.length };
  }

  const api = { elegir, clave };
  raiz.Sorpresa = api;
  if (typeof document === 'undefined') return;

  // --- pantalla (dentro de la capa de Practicar) ---
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) k === 'rol' ? n.setAttribute('role', v) : k.includes('-') ? n.setAttribute(k, v) : (n[k] = v);
    n.append(...kids.flat().filter(k => k != null && k !== false));
    return n;
  };
  let caja = null, volverFn = null, vista = 'menu', usadas = [], actual = null, revelada = false, vuelta = false, quedan = 0;
  const barra = (izq, centro) => el('div', { className: 'cbarra' }, izq, el('span', { className: 'ctitulo' }, centro));
  const poner = (...hijos) => { caja.replaceChildren(...hijos); caja.scrollTop = 0; };
  const canciones = () => { const A = raiz.RepertorioApp; return A && A.data && Array.isArray(A.data.canciones) ? A.data.canciones.filter(valida) : []; };

  function menu() {
    vista = 'menu'; actual = null;
    const n = canciones().length;
    poner(
      barra(el('button', { type: 'button', title: 'Volver a Practicar', onclick: () => { vista = 'fuera'; volverFn(); } }, '← Practicar'), 'Canción sorpresa'),
      el('div', { className: 'ccuerpo', 'data-sorpresa': '1' },
        el('p', {}, 'Te sale una canción de tu repertorio al azar. Tócala de memoria y luego mira los acordes. No se repite ninguna hasta que salgan todas. No usa sonido ni internet.'),
        el('p', { className: 'a', id: 'so-cuenta' }, n ? n + (n === 1 ? ' canción en tu repertorio' : ' canciones en tu repertorio') : 'Aún no tienes canciones. Agrégalas con internet y vuelve aquí.'),
        el('div', { className: 'rt-botones' },
          el('button', { type: 'button', className: 'primario', id: 'so-ir', disabled: !n, onclick: () => otra() }, '🎲 Sorpréndeme'))));
    const b = caja.querySelector('#so-ir'); if (b && !b.disabled) b.focus({ preventScroll: true });
  }

  function otra() {
    const r = elegir(canciones(), usadas);
    if (!r) return menu();
    usadas = r.usadas; actual = r.cancion; revelada = false; vuelta = r.vuelta; quedan = r.quedan;
    vista = 'cancion';
    pintar();
  }

  function abrirActual() {
    const A = raiz.RepertorioApp;
    if (A && actual) A.abrirCancion(actual, document.getElementById('so-abrir'));
  }

  function pintar() {
    const c = actual;
    const partes = Array.isArray(c.partes) ? c.partes.filter(p => p && p.prog) : [];
    const respuesta = !revelada ? null : el('div', { id: 'so-acordes', 'aria-live': 'polite' },
      ...(partes.length ? partes.map(p => el('div', { className: 'parte' },
        el('h3', {}, (p.nombre || 'Parte') + (p.tono ? ' (' + p.tono + ')' : '')),
        el('p', { className: 'rt-prog' }, p.prog)))
        : [el('p', { className: 'a' }, 'Esta canción aún no tiene acordes guardados.')]),
      c.nota ? el('p', { className: 'a' }, c.nota) : null,
      el('button', { type: 'button', id: 'so-abrir', className: 'abrir-cancion', onclick: abrirActual }, 'Abrir «' + c.titulo + '»'));
    poner(
      barra(el('button', { type: 'button', title: 'Salir (Esc)', onclick: () => history.back() }, '← Salir'),
        quedan ? 'Faltan ' + quedan : 'Última de la vuelta'),
      el('div', { className: 'ccuerpo pr-sesion', 'data-sorpresa': '1' },
        vuelta ? el('p', { className: 'a', id: 'so-vuelta' }, 'Ya salieron todas: empieza una vuelta nueva.') : null,
        el('h2', { id: 'so-titulo' }, c.titulo),
        c.artista ? el('p', { className: 'a' }, c.artista) : null,
        el('p', { className: 'rt-acorde', id: 'so-tono' }, c.tono || '—'),
        el('p', { className: 'rt-pos' }, 'tono de la canción'),
        el('div', { className: 'rt-botones' },
          !revelada ? el('button', { type: 'button', className: 'primario', id: 'so-ver', onclick: () => { revelada = true; pintar(); } }, 'Ver acordes') : null,
          el('button', { type: 'button', className: revelada ? 'primario' : '', id: 'so-otra', onclick: () => otra() }, 'Otra canción')),
        respuesta));
    const primero = caja.querySelector('.rt-botones button'); if (primero) primero.focus({ preventScroll: true });
  }

  // Practicar llama a abrir() al entrar y a atras() cuando se usa Atrás: desde una canción vuelve al menú (devuelve true);
  // desde el menú devuelve false y Practicar vuelve a su propio menú.
  api.abrir = (cajaPracticar, volver) => {
    caja = cajaPracticar; volverFn = volver; usadas = []; actual = null;
    menu(); caja.focus({ preventScroll: true });
  };
  api.atras = () => {
    if (vista === 'cancion') { menu(); return true; }
    return false;
  };
})(typeof window !== 'undefined' ? window : globalThis);
