// Modo editor: solo se carga al abrir la página con ?editar al final del link.
// Los cambios se guardan como borrador en ESTE navegador. Para publicarlos hay que
// descargar canciones.js y reemplazar el archivo en GitHub.
(() => {
  'use strict';

  const app = window.RepertorioApp;
  const { el, norm } = app;
  const $ = id => document.getElementById(id);
  const CAMPOS = ['titulo', 'artista', 'tono', 'ritmo', 'nota'];
  const TONOS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
    .flatMap(t => [t, t + 'm']);
  let editando = -1;

  const lista = () => app.data.canciones;
  // input.list es de solo lectura en el DOM: el vínculo con el datalist se hace por atributo.
  const conLista = (input, id) => { input.setAttribute('list', id); return input; };
  const campo = (k, etiqueta, extra) => el('label', {}, etiqueta + ': ', extra || el('input', { id: 'f-' + k, size: 16 }));

  function guardarBorrador() {
    try { localStorage.setItem(app.DRAFT, JSON.stringify(app.data)); } catch (e) { /* almacenamiento bloqueado */ }
    $('estado').textContent = 'Cambios guardados en este navegador. Falta descargar canciones.js y subirlo para que los vea la gente.';
    app.render();
  }

  function limpiarForm() {
    CAMPOS.forEach(k => { $('f-' + k).value = ''; });
    editando = -1;
    $('btn-guardar').textContent = 'Agregar';
    $('btn-cancelar').hidden = true;
  }

  function guardarCancion(e) {
    e.preventDefault();
    const c = Object.fromEntries(CAMPOS.map(k => [k, $('f-' + k).value.trim()]));
    if (!c.titulo) { $('f-titulo').focus(); return; }
    const repetida = lista().some((x, i) => i !== editando && norm(x.titulo) === norm(c.titulo) && norm(x.artista) === norm(c.artista));
    if (repetida && !confirm('Ya existe una canción igual. ¿Agregarla de todos modos?')) return;
    if (editando >= 0) lista()[editando] = c; else lista().push(c);
    limpiarForm();
    guardarBorrador();
  }

  function editar(i) {
    CAMPOS.forEach(k => { $('f-' + k).value = lista()[i][k] || ''; });
    editando = i;
    $('btn-guardar').textContent = 'Guardar cambios';
    $('btn-cancelar').hidden = false;
    $('f-titulo').focus();
  }

  function borrar(i) {
    if (!confirm(`¿Borrar "${lista()[i].titulo}"?`)) return;
    lista().splice(i, 1);
    limpiarForm();
    guardarBorrador();
  }

  // Cada línea: Título ; Artista ; Tono ; Ritmo   (también acepta tabulador o " - ")
  function agregarVarias() {
    const nuevas = $('masivo').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [titulo, artista, tono, ritmo] = l.split(/\s*[;\t]\s*|\s+-\s+/).map(s => s.trim());
      return { titulo, artista: artista || '', tono: tono || '', ritmo: ritmo || '', nota: '' };
    });
    if (!nuevas.length) return;
    lista().push(...nuevas);
    $('masivo').value = '';
    guardarBorrador();
    $('estado').textContent = `${nuevas.length} canciones agregadas. ` + $('estado').textContent;
  }

  function serializar() {
    const d = app.data;
    d.actualizado = new Date().toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });
    const cab = ['nombre', 'intro', 'whatsapp', 'actualizado'].map(k => `  ${k}: ${JSON.stringify(d[k] || '')},`);
    return '// Repertorio. Se edita desde el link con ?editar o pidiéndole los cambios a Claude.\n'
      + 'window.REPERTORIO = {\n' + cab.join('\n') + '\n  canciones: [\n'
      + d.canciones.map(c => '    ' + JSON.stringify(Object.fromEntries(CAMPOS.map(k => [k, c[k] || ''])))).join(',\n')
      + '\n  ]\n};\n';
  }

  function descargar() {
    const url = URL.createObjectURL(new Blob([serializar()], { type: 'text/javascript' }));
    el('a', { href: url, download: 'canciones.js' }).click();
    URL.revokeObjectURL(url);
    guardarBorrador();
  }

  async function copiar() {
    try { await navigator.clipboard.writeText(serializar()); $('estado').textContent = 'Copiado. Pégalo en canciones.js en GitHub.'; }
    catch (e) { $('estado').textContent = 'No se pudo copiar. Usa "Descargar canciones.js".'; }
  }

  function descartar() {
    if (!confirm('¿Descartar todos tus cambios y volver a la versión publicada?')) return;
    try { localStorage.removeItem(app.DRAFT); } catch (e) { /* nada */ }
    location.reload();
  }

  function vaciar() {
    if (!confirm('¿Borrar TODAS las canciones de la lista?')) return;
    app.data.canciones = [];
    limpiarForm();
    guardarBorrador();
  }

  function datosPagina(k, etiqueta, size) {
    return el('label', {}, etiqueta + ': ', el('input', {
      size, value: app.data[k] || '',
      oninput: e => { app.data[k] = e.target.value; guardarBorrador(); }
    }), ' ');
  }

  function montar() {
    $('editor').replaceChildren(el('div', { className: 'editor' },
      el('p', {}, el('b', {}, 'Modo editor. '), 'Solo tú ves esto; la gente que abra el link normal no puede cambiar nada.'),
      el('form', { onsubmit: guardarCancion },
        el('fieldset', {}, el('legend', {}, 'Agregar o editar una canción'),
          campo('titulo', 'Canción'), campo('artista', 'Artista'),
          campo('tono', 'Tono', conLista(el('input', { id: 'f-tono', size: 5 }), 'tonos')),
          campo('ritmo', 'Ritmo', el('select', { id: 'f-ritmo' }, ...['', 'Lento', 'Medio', 'Rápido'].map(v => el('option', { value: v }, v)))),
          campo('nota', 'Nota (opcional, ej: capo 2)'),
          el('datalist', { id: 'tonos' }, ...TONOS.map(t => el('option', { value: t }))),
          el('button', { id: 'btn-guardar', type: 'submit' }, 'Agregar'), ' ',
          el('button', { id: 'btn-cancelar', type: 'button', hidden: true, onclick: limpiarForm }, 'Cancelar'))),
      el('details', {}, el('summary', {}, 'Agregar varias de una vez'),
        el('p', {}, 'Una canción por línea: ', el('code', {}, 'Título ; Artista ; Tono ; Ritmo')),
        el('textarea', { id: 'masivo', rows: 5, cols: 50, placeholder: 'Océanos ; Hillsong ; D ; Lento' }),
        el('br'), el('button', { type: 'button', onclick: agregarVarias }, 'Agregar todas')),
      el('details', {}, el('summary', {}, 'Nombre, texto y WhatsApp de la página'),
        el('p', {}, datosPagina('nombre', 'Nombre', 30), datosPagina('intro', 'Texto', 40), datosPagina('whatsapp', 'WhatsApp (ej: 18095551234)', 14))),
      el('p', {},
        el('button', { type: 'button', onclick: descargar }, 'Descargar canciones.js'), ' ',
        el('button', { type: 'button', onclick: copiar }, 'Copiar texto'), ' ',
        el('button', { type: 'button', onclick: descartar }, 'Descartar mis cambios'), ' ',
        el('button', { type: 'button', onclick: vaciar }, 'Vaciar lista')),
      el('p', { id: 'estado' }, ''),
      el('p', {}, 'Para publicar: en GitHub abre canciones.js, pulsa el lápiz, reemplaza todo con el texto nuevo y pulsa Commit. Vercel actualiza solo en un minuto.')));
  }

  app.acciones = i => el('td', {},
    el('button', { type: 'button', onclick: () => editar(i) }, 'Editar'), ' ',
    el('button', { type: 'button', onclick: () => borrar(i) }, 'Borrar'));

  montar();
  app.render();
})();
