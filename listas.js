// Listas del culto: armas una lista de canciones en orden y la recorres con Anterior / Siguiente.
// Se guardan en este dispositivo (localStorage). Cada canción se busca por su id: si una ya no está en el
// repertorio, la lista la marca pero NO la borra (por si los datos aún no han cargado).
(() => {
  'use strict';
  const app = window.RepertorioApp;
  if (!app) return;
  const { el } = app;
  const $ = id => document.getElementById(id);
  const CLAVE = 'repertorio-listas';

  let listas = [];
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE));
    if (Array.isArray(v)) listas = v.filter(l => l && typeof l.id === 'string' && typeof l.nombre === 'string' && Array.isArray(l.ids))
      .map(l => ({ id: l.id, nombre: l.nombre.slice(0, 60), ids: [...new Set(l.ids.filter(x => typeof x === 'string'))] }));
  } catch (e) { /* nada */ }
  const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(listas)); } catch (e) { /* nada */ } };
  const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clave = c => c.id || (c.titulo + '|' + (c.artista || ''));
  const buscarCancion = k => app.data.canciones.find(c => clave(c) === k);
  const cuenta = l => { const n = l.ids.filter(buscarCancion).length; return n + (n === 1 ? ' canción' : ' canciones'); };

  const cont = $('listas');
  let vista = 'canciones', pantalla = 'indice', abierta = null, editando = false, yIndice = 0;
  const ys = { canciones: 0, listas: 0 };
  const lista = () => listas.find(l => l.id === abierta);
  const irY = y => { if (window.scrollY !== y) window.scrollTo(0, y); };
  const entra = () => { cont.classList.remove('entra'); void cont.offsetWidth; cont.classList.add('entra'); };

  // --- lista de listas ---
  function indice() {
    const campo = el('input', { type: 'text', maxLength: 60, placeholder: 'Nueva lista (ej. Culto del domingo)', 'aria-label': 'Nombre de la nueva lista', autocomplete: 'off', enterKeyHint: 'done' });
    const crear = () => {
      const nombre = campo.value.trim();
      if (!nombre) { campo.focus(); return; }
      const l = { id: nuevoId(), nombre, ids: [] };
      listas.unshift(l); guardar(); abrir(l.id, true);
    };
    campo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); crear(); } });
    return [
      el('h2', { className: 'l-titulo' }, 'Listas del culto'),
      el('div', { className: 'l-nueva' }, campo, el('button', { type: 'button', className: 'primario', onclick: crear }, 'Crear')),
      ...(listas.length
        ? listas.map(l => el('div', { className: 'fila l-fila' },
          el('button', { type: 'button', className: 'abrir', onclick: () => abrir(l.id) }, el('span', { className: 't' }, l.nombre), el('span', { className: 'a' }, cuenta(l)))))
        : [el('p', { className: 'vacio' }, 'Aún no tienes listas. Crea una para el próximo culto.')])
    ];
  }

  // --- una lista ---
  function detalle(l) {
    const items = l.ids.map(k => ({ k, c: buscarCancion(k) }));
    const orden = items.map(x => x.c).filter(Boolean);
    const abrirDesde = (c, b) => app.abrirCancion(c, b, orden);
    const mover = (i, d) => {
      const j = i + d;
      if (j < 0 || j >= l.ids.length) return;
      [l.ids[i], l.ids[j]] = [l.ids[j], l.ids[i]]; guardar();
      pintar(`[data-mov="${j}:${d}"]:not(:disabled), [data-mov="${j}:${-d}"]:not(:disabled)`);
    };
    const quitar = i => { l.ids.splice(i, 1); guardar(); pintar(); };
    const renombrar = () => {
      const n = window.prompt('Nuevo nombre de la lista', l.nombre);
      if (n && n.trim()) { l.nombre = n.trim().slice(0, 60); guardar(); pintar(); }
    };
    const borrar = () => {
      if (!window.confirm('¿Borrar la lista "' + l.nombre + '"? Las canciones no se borran.')) return;
      listas = listas.filter(x => x !== l); guardar(); history.back();
    };
    const fila = ({ c }, i) => el('div', { className: 'fila l-fila' },
      c ? el('button', { type: 'button', className: 'abrir', onclick: e => abrirDesde(c, e.currentTarget) },
        el('span', { className: 't' }, (i + 1) + '. ' + c.titulo), c.artista && el('span', { className: 'a' }, c.artista))
        : el('span', { className: 'abrir l-falta' }, el('span', { className: 'a' }, 'Esta canción ya no está en el repertorio')),
      c && app.pastilla(c.tono),
      editando && el('div', { className: 'fila-acciones' },
        el('button', { type: 'button', 'aria-label': 'Subir', 'data-mov': i + ':-1', disabled: i === 0, onclick: () => mover(i, -1) }, '▲'),
        el('button', { type: 'button', 'aria-label': 'Bajar', 'data-mov': i + ':1', disabled: i === l.ids.length - 1, onclick: () => mover(i, 1) }, '▼'),
        el('button', { type: 'button', className: 'peligro', 'aria-label': 'Quitar de la lista', onclick: () => quitar(i) }, '✕')));
    return [
      el('div', { className: 'l-barra' },
        el('button', { type: 'button', onclick: () => history.back() }, '← Listas'),
        el('h2', { className: 'l-titulo' }, l.nombre),
        el('button', { type: 'button', onclick: () => { editando = !editando; pintar(); } }, editando ? 'Listo' : 'Editar')),
      el('p', { className: 'a' }, cuenta(l)),
      el('p', {}, el('button', { type: 'button', className: 'primario', id: 'l-empezar', disabled: !orden.length, onclick: e => abrirDesde(orden[0], e.currentTarget) }, '▶ Empezar')),
      ...(items.length ? items.map(fila) : [el('p', { className: 'vacio' }, 'La lista está vacía.' + (editando ? '' : ' Toca Editar para agregar canciones.'))]),
      editando && el('div', { className: 'l-edicion' },
        el('button', { type: 'button', className: 'primario', id: 'l-agregar', onclick: () => { pantalla = 'agregar'; pintar(); entra(); irY(0); } }, '＋ Agregar canciones'),
        el('button', { type: 'button', onclick: renombrar }, 'Renombrar'),
        el('button', { type: 'button', className: 'peligro', onclick: borrar }, 'Borrar lista'))
    ];
  }

  // --- agregar canciones a la lista ---
  function agregar(l) {
    const en = new Set(l.ids);
    const campo = el('input', { type: 'search', placeholder: 'Buscar canción o artista', 'aria-label': 'Buscar canción para agregar', autocomplete: 'off', enterKeyHint: 'search' });
    const total = el('p', { className: 'a', 'aria-live': 'polite' }, l.ids.length + ' en la lista');
    const resultados = el('div', {});
    const pintarResultados = () => {
      const res = app.buscar(campo.value).slice(0, 60);
      resultados.replaceChildren(...(res.length ? res.map(c => {
        const sub = el('span', { className: 'a' }, en.has(clave(c)) ? '✓ En la lista' : c.artista || '');
        return el('div', { className: 'fila l-fila' },
          el('button', {
            type: 'button', className: 'abrir', disabled: en.has(clave(c)),
            onclick: e => {
              if (en.has(clave(c))) return;
              l.ids.push(clave(c)); en.add(clave(c)); guardar();
              e.currentTarget.disabled = true; sub.textContent = '✓ En la lista'; total.textContent = l.ids.length + ' en la lista';
            }
          }, el('span', { className: 't' }, c.titulo), sub),
          app.pastilla(c.tono));
      }) : [el('p', { className: 'vacio' }, app.data.canciones.length ? 'Ninguna canción coincide.' : 'Aún no hay canciones en el repertorio.')]));
    };
    campo.addEventListener('input', pintarResultados);
    pintarResultados();
    return [
      el('div', { className: 'l-barra' },
        el('h2', { className: 'l-titulo' }, 'Agregar a ' + l.nombre),
        el('button', { type: 'button', className: 'primario', id: 'l-listo', onclick: () => { pantalla = 'detalle'; pintar(); entra(); } }, 'Listo')),
      campo, total, resultados
    ];
  }

  function pintar(enfocar) {
    const l = lista();
    if (pantalla !== 'indice' && !l) { pantalla = 'indice'; abierta = null; editando = false; }
    cont.replaceChildren(...(pantalla === 'indice' ? indice() : pantalla === 'agregar' ? agregar(l) : detalle(l)).filter(Boolean));
    if (enfocar) { const n = cont.querySelector(enfocar); if (n) n.focus({ preventScroll: true }); }
  }

  function abrir(id, nueva) {
    yIndice = window.scrollY;
    abierta = id; pantalla = 'detalle'; editando = !!nueva;
    history.pushState({ lista: true }, '');
    pintar(); entra(); irY(0);
  }

  // Atrás (gesto del teléfono, Esc o "← Listas"): de una lista vuelves a la lista de listas, donde estabas.
  // Si lo que se cierra es una canción abierta desde la lista, la lista queda como estaba.
  addEventListener('popstate', e => {
    if (e.state && (e.state.lista || e.state.cancion)) return;
    if (pantalla === 'indice') return;
    pantalla = 'indice'; abierta = null; editando = false;
    pintar();
    if (vista === 'listas') irY(yIndice);
  });

  // --- barra de abajo: Canciones / Listas (Teoría y Practicar se abren encima, con su propio "Volver") ---
  function cambiarVista(v) {
    if (v === vista) return;
    ys[vista] = window.scrollY;
    if (v === 'canciones' && pantalla !== 'indice') { ys.listas = yIndice; history.back(); }
    vista = v;
    $('app').dataset.vista = v;
    for (const [id, nombre] of [['nav-canciones', 'canciones'], ['nav-listas', 'listas']]) {
      if (nombre === v) $(id).setAttribute('aria-current', 'page'); else $(id).removeAttribute('aria-current');
    }
    if (v === 'listas') { pintar(); entra(); }
    irY(ys[v]);
  }
  $('nav-canciones').addEventListener('click', () => cambiarVista('canciones'));
  $('nav-listas').addEventListener('click', () => cambiarVista('listas'));
  $('app').dataset.vista = 'canciones';

  // Cuando llegan o cambian las canciones, la vista de Listas se actualiza (sin pisar lo que estés escribiendo).
  document.addEventListener('repertorio-render', () => {
    if (vista !== 'listas') return;          // se dibuja al abrir la pestaña Listas
    const a = document.activeElement;
    if (a && a.tagName === 'INPUT' && cont.contains(a)) return;
    pintar();
  });
})();
