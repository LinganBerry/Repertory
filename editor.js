// Modo editor: se abre con ?editar al final del link, o tocando 5 veces el título de la página.
// Cada cambio se guarda en el servidor (/api/canciones) y lo ve todo el mundo.
// El servidor exige la contraseña ADMIN_PASSWORD; sin ella nadie puede modificar nada.
(() => {
  'use strict';

  const app = window.RepertorioApp;
  const { el, norm } = app;
  const $ = id => document.getElementById(id);
  const CAMPOS = ['titulo', 'artista', 'tono', 'nota', 'enlace'];
  const TONOS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
    .flatMap(t => [t, t + 'm']);
  const CLAVE = 'repertorio-clave', FLAG = 'repertorio-editor';
  const lista = () => app.data.canciones;

  // Contraseña: vive en memoria; si lo pides, queda recordada en este teléfono.
  const leerClave = () => { try { return sessionStorage.getItem(CLAVE) || localStorage.getItem(CLAVE) || ''; } catch (e) { return ''; } };
  const olvidarClave = () => { try { sessionStorage.removeItem(CLAVE); localStorage.removeItem(CLAVE); } catch (e) { /* nada */ } };
  const recordarClave = (v, fija) => { olvidarClave(); try { (fija ? localStorage : sessionStorage).setItem(CLAVE, v); } catch (e) { /* nada */ } };
  let clave = leerClave(), pendiente = false;

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
  const limpia = c => ({ ...Object.fromEntries(CAMPOS.map(k => [k, c[k] || ''])), partes: c.partes || [] });
  const paquete = () => {
    const d = app.data;
    return {
      version: 1, nombre: d.nombre || '', intro: d.intro || '',
      actualizado: new Date().toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' }),
      canciones: d.canciones.map(limpia)
    };
  };

  const estado = (texto, tipo = '') => {
    $('estado').textContent = texto;
    $('estado').className = 'estado ' + tipo;
    $('b-reintentar').hidden = tipo !== 'mal';
  };

  // Envía TODO el repertorio al servidor. Si falla, queda "Reintentar" en la barra.
  async function guardar() {
    if (!clave) { pendiente = true; abrirLogin(); return false; }
    estado('Guardando…');
    const d = paquete();
    try {
      const r = await fetch('/api/canciones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave, data: d }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) { pendiente = true; clave = ''; olvidarClave(); estado('No se guardó: contraseña incorrecta.', 'mal'); abrirLogin('Contraseña incorrecta.'); return false; }
      if (!r.ok) { pendiente = true; estado('No se guardó: ' + (j.error || 'error ' + r.status), 'mal'); return false; }
      pendiente = false;
      app.data.actualizado = d.actualizado;
      estado('Guardado ✓');
      try { navigator.vibrate && navigator.vibrate([10, 25, 15]); } catch (e) { /* nada */ }
      return true;
    } catch (e) {
      pendiente = true;
      estado('Sin conexión con el servidor.', 'mal');
      return false;
    }
  }
  const cambio = () => { app.render(); return guardar(); };

  // --- pantallas completas (formulario, ajustes, entrada) ---
  let abierta = null;
  function abrirCapa(titulo, cuerpo, pie, cerrable = true) {
    cerrarCapa();
    abierta = el('div', { className: 'capa' },
      el('div', { className: 'capa-t' }, el('span', {}, titulo), cerrable && el('button', { type: 'button', onclick: cerrarCapa }, 'Cerrar')),
      el('div', { className: 'capa-c' }, ...cuerpo),
      pie && el('div', { className: 'capa-p' }, ...pie));
    document.body.append(abierta);
    document.body.classList.add('fija');
    return abierta;
  }
  function cerrarCapa() {
    if (!abierta) return;
    abierta.remove();
    abierta = null;
    if ($('cancion').hidden) document.body.classList.remove('fija');
  }
  const salir = () => { location.href = location.pathname; };
  const sp = () => el('span', { className: 'sp' });

  function abrirLogin(aviso) {
    const msg = el('p', { className: 'aviso-e' }, aviso || '');
    const pass = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña' });
    const fija = el('input', { type: 'checkbox' });
    const entrar = () => {
      if (!pass.value) { pass.focus(); return; }
      clave = pass.value;
      recordarClave(clave, fija.checked);
      cerrarCapa();
      estado('Listo');
      if (pendiente) guardar();
    };
    abrirCapa('Entrar al editor', [
      el('label', { className: 'campo' }, el('span', {}, 'Contraseña'), pass),
      el('label', { className: 'campo' }, fija, ' Recordar en este teléfono'),
      msg
    ], [el('button', { type: 'button', onclick: salir }, 'Solo mirar'), sp(), el('button', { type: 'button', className: 'primario', onclick: entrar }, 'Entrar')], false);
    pass.addEventListener('keydown', ev => { if (ev.key === 'Enter') entrar(); });
    pass.focus();
  }

  function mostrarRevision() {
    const { errores, avisos } = revisar($('f-partes').value);
    $('avisos').replaceChildren(
      ...errores.map(t => el('li', { className: 'aviso-e' }, 'Error: ' + t)),
      ...avisos.map(t => el('li', { className: 'aviso-a' }, 'Aviso: ' + t)));
    return errores;
  }

  function abrirForm(i) {
    const c = i >= 0 ? lista()[i] : { titulo: '', artista: '', tono: '', nota: '', enlace: '', partes: [] };
    const campo = (etiqueta, ctl) => el('label', { className: 'campo' }, el('span', {}, etiqueta), ctl);
    const f = (k, props = {}) => el('input', { id: 'f-' + k, value: c[k] || '', ...props });
    const tono = el('select', { id: 'f-tono' }, el('option', { value: '' }, 'Elige el tono'), ...TONOS.map(t => el('option', { value: t }, t)));
    tono.value = c.tono || '';
    const partes = el('textarea', {
      id: 'f-partes', rows: 8, value: partesATexto(c.partes), oninput: mostrarRevision,
      placeholder: 'Intro: G D | Em C\nVerso: G D | Em C // una línea que te ubique\nCoro (D): D G | Bm A'
    });
    const guardarForm = () => {
      const v = k => $('f-' + k).value.trim();
      const n = { titulo: v('titulo'), artista: v('artista'), tono: v('tono'), nota: v('nota'), enlace: v('enlace'), partes: textoAPartes($('f-partes').value) };
      const mal = !n.titulo ? ['f-titulo', 'Escribe el nombre de la canción.']
        : !n.tono ? ['f-tono', 'Elige el tono.']
        : n.enlace && !/^https?:\/\/\S+$/i.test(n.enlace) ? ['f-enlace', 'El link debe empezar con http:// o https://']
        : mostrarRevision().length ? ['f-partes', 'Corrige los errores marcados en las partes.'] : null;
      if (mal) { $('f-msg').textContent = mal[1]; $(mal[0]).focus(); return; }
      const repetida = lista().some((x, j) => j !== i && norm(x.titulo) === norm(n.titulo) && norm(x.artista) === norm(n.artista));
      if (repetida && !confirm('Ya existe una canción igual. ¿Guardarla de todos modos?')) return;
      if (i >= 0) lista()[i] = n; else lista().push(n);
      cerrarCapa();
      cambio();
    };
    const borrar = () => {
      if (!confirm(`¿Borrar "${c.titulo}"?`)) return;
      lista().splice(i, 1);
      cerrarCapa();
      cambio();
    };
    abrirCapa(i >= 0 ? 'Editar canción' : 'Nueva canción', [
      campo('Canción', f('titulo')),
      campo('Artista', f('artista')),
      campo('Tono', tono),
      campo('Nota (opcional, ej: capo 2)', f('nota')),
      campo('Link de referencia (opcional)', f('enlace', { type: 'url', placeholder: 'https://…' })),
      campo('Partes y acordes (opcional)', partes),
      el('p', { className: 'pista-ayuda' }, 'Una parte por línea: Nombre (tono): acordes // pista. El (tono) solo si la parte modula. Marca el compás con |. La pista es una línea corta, no la letra.'),
      el('ul', { id: 'avisos' }),
      el('p', { id: 'f-msg', className: 'aviso-e' })
    ], [i >= 0 && el('button', { type: 'button', className: 'peligro', onclick: borrar }, 'Borrar'), sp(), el('button', { type: 'button', className: 'primario', onclick: guardarForm }, 'Guardar')]);
    mostrarRevision();
    if (i < 0) $('f-titulo').focus();
  }

  // Cada línea: Título ; Artista ; Tono   (también acepta tabulador o " - ")
  function agregarVarias(caja, msg) {
    const nuevas = caja.value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [titulo, artista, tono] = l.split(/\s*[;\t]\s*|\s+-\s+/).map(s => s.trim());
      return { titulo, artista: artista || '', tono: tono || '', nota: '', enlace: '', partes: [] };
    });
    if (!nuevas.length) return;
    const malas = nuevas.filter(n => !TONOS.includes(n.tono));
    if (malas.length) { msg.textContent = 'Falta el tono o es inválido en: ' + malas.map(n => n.titulo).join(', ') + '. No se agregó nada.'; return; }
    lista().push(...nuevas);
    cerrarCapa();
    cambio();
  }

  function descargarCopia() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(paquete(), null, 2)], { type: 'application/json' }));
    el('a', { href: url, download: 'repertorio-copia.json' }).click();
    URL.revokeObjectURL(url);
  }

  // Importar una copia (.json bajado con "Descargar copia"). Reemplaza la lista actual.
  async function leerCopia(ev, msg) {
    const archivo = ev.target.files[0];
    ev.target.value = '';
    if (!archivo) return;
    let d;
    try { d = JSON.parse(await archivo.text()); } catch (err) { msg.textContent = 'El archivo no es una copia válida.'; return; }
    if (!d || !Array.isArray(d.canciones) || !d.canciones.length) { msg.textContent = 'El archivo no trae canciones. No se importó nada.'; return; }
    if (!confirm(`Esto reemplaza las ${lista().length} canciones actuales por las ${d.canciones.length} del archivo. ¿Continuar?`)) return;
    app.data.nombre = d.nombre || app.data.nombre;
    app.data.intro = typeof d.intro === 'string' ? d.intro : app.data.intro;
    app.data.canciones = d.canciones.filter(c => c && typeof c === 'object').map(c => {
      const x = limpia(c);
      x.partes = Array.isArray(c.partes) ? c.partes : [];
      return x;
    });
    cerrarCapa();
    cambio();
  }

  function cerrarSesion() {
    olvidarClave();
    try { localStorage.removeItem(FLAG); } catch (e) { /* nada */ }
    salir();
  }

  function abrirAjustes() {
    const msg = el('p', { className: 'aviso-e' });
    const masivo = el('textarea', { rows: 5, placeholder: 'Océanos ; Hillsong ; D' });
    const archivo = el('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: ev => leerCopia(ev, msg) });
    const dato = (k, etiqueta) => el('label', { className: 'campo' }, el('span', {}, etiqueta),
      el('input', { value: app.data[k] || '', onchange: ev => { app.data[k] = ev.target.value.trim(); cambio(); } }));
    abrirCapa('Ajustes', [
      el('div', { className: 'grupo' }, el('h3', {}, 'Página'), dato('nombre', 'Nombre'), dato('intro', 'Texto de presentación')),
      el('div', { className: 'grupo' }, el('h3', {}, 'Agregar varias de una vez'),
        el('p', { className: 'pista-ayuda' }, 'Una canción por línea: Título ; Artista ; Tono'), masivo,
        el('p', {}, el('button', { type: 'button', onclick: () => agregarVarias(masivo, msg) }, 'Agregar todas'))),
      el('div', { className: 'grupo' }, el('h3', {}, 'Copia de seguridad'),
        el('p', {}, el('button', { type: 'button', onclick: descargarCopia }, 'Descargar copia'), ' ',
          el('button', { type: 'button', onclick: () => archivo.click() }, 'Importar copia'), archivo)),
      el('div', { className: 'grupo' }, el('h3', {}, 'Sesión'),
        el('p', {}, el('button', { type: 'button', onclick: salir }, 'Salir del editor'), ' ',
          el('button', { type: 'button', onclick: cerrarSesion }, 'Cerrar sesión'))),
      msg
    ]);
  }

  $('editor').replaceChildren(el('div', { className: 'ebarra' },
    el('b', {}, 'Editor'),
    el('span', { id: 'estado', className: 'estado', 'aria-live': 'polite' }, 'Listo'),
    el('button', { id: 'b-reintentar', type: 'button', hidden: true, onclick: guardar }, 'Reintentar'),
    el('button', { type: 'button', className: 'primario', onclick: () => abrirForm(-1) }, '+ Nueva'),
    el('button', { type: 'button', onclick: abrirAjustes }, 'Ajustes')));

  app.acciones = i => el('div', { className: 'acciones' }, el('button', { type: 'button', onclick: () => abrirForm(i) }, 'Editar'));

  app.render();
  if (!clave) abrirLogin();
})();
