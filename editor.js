// Modo editor: solo se carga al abrir la página con ?editar al final del link.
// Cada cambio se guarda en el servidor (/api/canciones) y lo ven todos al instante.
// El servidor exige la contraseña ADMIN_PASSWORD; sin ella nadie puede modificar nada.
(() => {
  'use strict';

  const app = window.RepertorioApp;
  const { el, norm } = app;
  const $ = id => document.getElementById(id);
  const CAMPOS = ['titulo', 'artista', 'tono', 'nota'];
  const TONOS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
    .flatMap(t => [t, t + 'm']);
  const CLAVE = 'repertorio-clave'; // se recuerda solo mientras la pestaña siga abierta
  let editando = -1;

  const lista = () => app.data.canciones;
  const estado = texto => { $('estado').textContent = texto; };
  const leerClave = () => { try { return sessionStorage.getItem(CLAVE) || ''; } catch (e) { return ''; } };
  const recordarClave = v => { try { sessionStorage.setItem(CLAVE, v); } catch (e) { /* nada */ } };

  const campo = (k, etiqueta, extra) => el('label', {}, etiqueta + ': ', extra || el('input', { id: 'f-' + k, size: 16 }));

  // Partes: una por línea, "Nombre (tono): acordes // pista". Tono y pista son opcionales; | marca el compás.
  const partesATexto = ps => (ps || []).map(p => (p.nombre ? p.nombre + (p.tono ? ' (' + p.tono + ')' : '') + ': ' : '') + p.prog + (p.pista ? ' // ' + p.pista : '')).join('\n');
  const textoAPartes = t => t.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [cuerpo, ...resto] = l.split('//');
    const i = cuerpo.indexOf(':');
    let nombre = i < 0 ? '' : cuerpo.slice(0, i).trim();
    const prog = (i < 0 ? cuerpo : cuerpo.slice(i + 1)).trim();
    const m = /\s*\(([A-G][#b]?m?)\)$/.exec(nombre);
    if (m) nombre = nombre.slice(0, m.index).trim();
    return { nombre, tono: m ? m[1] : '', prog, pista: resto.join('//').trim() };
  });
  // Revisión en vivo de las partes. Los errores bloquean el guardado; los avisos solo informan.
  const ACORDE = /^(?:maj|min|dim|aug|sus|add|alt|M|m|o|ø|°|\+|-|\d|[#♯b♭]|[(),]|\/[A-G][#♯b♭]*|\/)*$/;
  function revisar(texto) {
    const errores = [], avisos = [];
    texto.split('\n').forEach((linea, n) => {
      const l = linea.trim();
      if (!l) return;
      const donde = 'Línea ' + (n + 1) + ': ';
      const [cuerpo, ...resto] = l.split('//');
      const i = cuerpo.indexOf(':');
      if (i < 0) avisos.push(donde + 'falta ":" después del nombre; la parte quedará sin nombre.');
      const m = /\(([^)]*)\)\s*$/.exec(i < 0 ? '' : cuerpo.slice(0, i));
      if (m && !TONOS.includes(m[1].trim())) errores.push(donde + 'el tono "' + m[1] + '" no es válido (ej: C, F#m, Bb).');
      const prog = (i < 0 ? cuerpo : cuerpo.slice(i + 1)).trim();
      if (!prog) { errores.push(donde + 'no hay acordes.'); return; }
      if (prog.split('|').some(g => !g.trim())) avisos.push(donde + 'hay un compás vacío (un | de más, al inicio, al final o repetido).');
      const raros = prog.split(/[\s|]+/).flatMap(t => t.split(/-(?=[A-G])/)).filter(t => t && t !== '-' && t !== 'N.C.').filter(t => {
        const r = /^[A-G][#♯b♭]*/.exec(t);
        return !r || !ACORDE.test(t.slice(r[0].length));
      });
      if (raros.length) avisos.push(donde + 'acorde no reconocido: ' + [...new Set(raros)].join(', ') + '.');
      if (resto.join('//').trim().length > 200) avisos.push(donde + 'la pista pasa de 200 caracteres; se recortará al guardar.');
    });
    return { errores, avisos };
  }
  function mostrarRevision() {
    const { errores, avisos } = revisar($('f-partes').value);
    $('avisos').replaceChildren(
      ...errores.map(t => el('li', { className: 'aviso-e' }, 'Error: ' + t)),
      ...avisos.map(t => el('li', { className: 'aviso-a' }, 'Aviso: ' + t)));
    return errores;
  }

  const limpia = c => ({ ...Object.fromEntries(CAMPOS.map(k => [k, c[k] || ''])), partes: c.partes || [] });
  const paquete = () => {
    const d = app.data;
    return {
      version: 1, nombre: d.nombre || '', intro: d.intro || '',
      actualizado: new Date().toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' }),
      canciones: d.canciones.map(limpia)
    };
  };

  // Envía TODO el repertorio al servidor. Si falla, el siguiente cambio vuelve a intentarlo.
  async function guardar() {
    const clave = $('clave').value.trim() || leerClave();
    if (!clave) { estado('Escribe tu contraseña arriba para poder guardar.'); $('clave').focus(); return false; }
    estado('Guardando…');
    try {
      const r = await fetch('/api/canciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave, data: paquete() })
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) { recordarClave(''); estado('Contraseña incorrecta. No se guardó.'); return false; }
      if (!r.ok) { estado('No se guardó: ' + (j.error || 'error ' + r.status)); return false; }
      recordarClave(clave);
      app.data.actualizado = paquete().actualizado;
      estado('Guardado. Ya lo ve todo el mundo.');
      return true;
    } catch (e) {
      estado('No se guardó: sin conexión con el servidor. Prueba de nuevo.');
      return false;
    }
  }
  const cambio = () => { app.render(); return guardar(); };

  function limpiarForm() {
    CAMPOS.forEach(k => { $('f-' + k).value = ''; });
    $('f-partes').value = '';
    mostrarRevision();
    editando = -1;
    $('btn-guardar').textContent = 'Agregar';
    $('btn-cancelar').hidden = true;
  }

  function guardarCancion(e) {
    e.preventDefault();
    const c = { ...Object.fromEntries(CAMPOS.map(k => [k, $('f-' + k).value.trim()])), partes: textoAPartes($('f-partes').value) };
    if (!c.titulo) { $('f-titulo').focus(); return; }
    if (!c.tono) { estado('Elige el tono de la canción.'); $('f-tono').focus(); return; }
    if (mostrarRevision().length) { estado('Corrige los errores marcados en las partes antes de guardar.'); $('f-partes').focus(); return; }
    const repetida = lista().some((x, i) => i !== editando && norm(x.titulo) === norm(c.titulo) && norm(x.artista) === norm(c.artista));
    if (repetida && !confirm('Ya existe una canción igual. ¿Agregarla de todos modos?')) return;
    if (editando >= 0) lista()[editando] = c; else lista().push(c);
    limpiarForm();
    cambio();
  }

  function editar(i) {
    CAMPOS.forEach(k => { $('f-' + k).value = lista()[i][k] || ''; });
    $('f-partes').value = partesATexto(lista()[i].partes);
    mostrarRevision();
    editando = i;
    $('btn-guardar').textContent = 'Guardar cambios';
    $('btn-cancelar').hidden = false;
    $('f-titulo').focus();
  }

  function borrar(i) {
    if (!confirm(`¿Borrar "${lista()[i].titulo}"?`)) return;
    lista().splice(i, 1);
    limpiarForm();
    cambio();
  }

  // Cada línea: Título ; Artista ; Tono   (también acepta tabulador o " - ")
  function agregarVarias() {
    const nuevas = $('masivo').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [titulo, artista, tono] = l.split(/\s*[;\t]\s*|\s+-\s+/).map(s => s.trim());
      return { titulo, artista: artista || '', tono: tono || '', nota: '', partes: [] };
    });
    if (!nuevas.length) return;
    const malas = nuevas.filter(n => !TONOS.includes(n.tono));
    if (malas.length) { estado('Falta el tono o es inválido en: ' + malas.map(n => n.titulo).join(', ') + '. No se agregó nada.'); return; }
    lista().push(...nuevas);
    $('masivo').value = '';
    cambio();
  }

  function descargarCopia() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(paquete(), null, 2)], { type: 'application/json' }));
    el('a', { href: url, download: 'repertorio-copia.json' }).click();
    URL.revokeObjectURL(url);
  }

  function vaciar() {
    if (!confirm('¿Borrar TODAS las canciones de la lista?')) return;
    app.data.canciones = [];
    limpiarForm();
    cambio();
  }

  // Nombre, texto y WhatsApp: se guardan al salir de cada casilla.
  function datosPagina(k, etiqueta, size) {
    return el('label', {}, etiqueta + ': ', el('input', {
      size, value: app.data[k] || '',
      onchange: e => { app.data[k] = e.target.value.trim(); cambio(); }
    }), ' ');
  }

  function montar() {
    $('editor').replaceChildren(el('div', { className: 'editor' },
      el('p', {}, el('b', {}, 'Modo editor. '), 'Cada cambio se guarda al instante y lo ve todo el mundo. Solo funciona con tu contraseña.'),
      el('p', {}, el('label', {}, 'Contraseña: ', el('input', { id: 'clave', type: 'password', size: 22, value: leerClave(), autocomplete: 'current-password' }))),
      el('form', { onsubmit: guardarCancion },
        el('fieldset', {}, el('legend', {}, 'Agregar o editar una canción'),
          campo('titulo', 'Canción'), campo('artista', 'Artista'),
          campo('tono', 'Tono (obligatorio)', el('select', { id: 'f-tono', required: true }, el('option', { value: '' }, 'Elige'), ...TONOS.map(t => el('option', { value: t }, t)))),
          campo('nota', 'Nota (opcional, ej: capo 2)'),
          el('p', {}, el('label', {}, 'Partes y acordes (opcional): ', el('br'),
            el('textarea', { id: 'f-partes', rows: 6, cols: 44, oninput: mostrarRevision, placeholder: 'Intro: G D | Em C\nVerso: G D | Em C // una línea que te ubique\nCoro (D): D G | Bm A' })),
            el('br'), el('small', {}, 'Una parte por línea: Nombre (tono): acordes // pista. El (tono) y la pista son opcionales (el tono solo si la parte modula). Marca el compás con |. Pista: una línea corta, no la letra completa.')),
          el('ul', { id: 'avisos', 'aria-live': 'polite' }),
          el('button', { id: 'btn-guardar', type: 'submit' }, 'Agregar'), ' ',
          el('button', { id: 'btn-cancelar', type: 'button', hidden: true, onclick: limpiarForm }, 'Cancelar'))),
      el('details', {}, el('summary', {}, 'Agregar varias de una vez'),
        el('p', {}, 'Una canción por línea: ', el('code', {}, 'Título ; Artista ; Tono')),
        el('textarea', { id: 'masivo', rows: 5, cols: 50, placeholder: 'Océanos ; Hillsong ; D' }),
        el('br'), el('button', { type: 'button', onclick: agregarVarias }, 'Agregar todas')),
      el('details', {}, el('summary', {}, 'Nombre y texto de la página'),
        el('p', {}, datosPagina('nombre', 'Nombre', 30), datosPagina('intro', 'Texto', 40))),
      el('p', {},
        el('button', { type: 'button', onclick: guardar }, 'Guardar ahora'), ' ',
        el('button', { type: 'button', onclick: descargarCopia }, 'Descargar copia de seguridad'), ' ',
        el('button', { type: 'button', onclick: vaciar }, 'Vaciar lista')),
      el('p', { id: 'estado', 'aria-live': 'polite' }, '')));
  }

  app.acciones = i => el('div', { className: 'acciones' },
    el('button', { type: 'button', onclick: () => editar(i) }, 'Editar'), ' ',
    el('button', { type: 'button', onclick: () => borrar(i) }, 'Borrar'));

  montar();
  app.render();
})();
