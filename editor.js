// Modo editor (solo para ti). Se abre tocando 5 veces el título, o con /?editar.
// Entras con tu contraseña: el servidor la comprueba (con límite de intentos) y te da un pase que vence a los 30 días.
// Cada cambio se envía al servidor canción por canción: agregar, editar, mandar a la papelera, restaurar o importar.
// Este archivo no puede borrar nada de forma definitiva: el servidor tampoco.
(() => {
  'use strict';

  const app = window.RepertorioApp;
  const { el, norm } = app;
  const $ = id => document.getElementById(id);
  const CAMPOS = ['titulo', 'artista', 'tono', 'nota', 'enlace'];
  const TONOS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
    .flatMap(t => [t, t + 'm']);
  // Mismos límites que lib/limpiar.js (el servidor corta lo que pase de aquí; test/probar.mjs comprueba que coinciden).
  const LIM = { titulo: 200, artista: 200, nota: 300, enlace: 300, partes: 30, nombre: 60, prog: 500, pista: 200 };
  const lista = () => app.data.canciones;
  const nuevoId = () => {
    try { return crypto.randomUUID().replace(/-/g, '').slice(0, 16); } catch (e) { /* navegador viejo */ }
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  };

  // Sesión: el servidor cambia la contraseña por un pase que vence a los 30 días. La contraseña NO se guarda.
  const SESION = 'repertorio-sesion-v3';
  const leerSesion = () => { try { return sessionStorage.getItem(SESION) || localStorage.getItem(SESION) || ''; } catch (e) { return ''; } };
  const olvidarSesion = () => { try { sessionStorage.removeItem(SESION); localStorage.removeItem(SESION); } catch (e) { /* nada */ } };
  const guardarSesion = (v, fija) => { olvidarSesion(); try { (fija ? localStorage : sessionStorage).setItem(SESION, v); } catch (e) { /* nada */ } };
  let token = leerSesion();

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
    if (texto.split('\n').filter(l => l.trim()).length > LIM.partes) errores.push('Máximo ' + LIM.partes + ' partes por canción.');
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
      if (prog.length > LIM.prog) errores.push(donde + 'los acordes pasan de ' + LIM.prog + ' caracteres (' + prog.length + '); divídelos en dos partes.');
      if (i >= 0 && cuerpo.slice(0, i).trim().length > LIM.nombre) avisos.push(donde + 'el nombre de la parte pasa de ' + LIM.nombre + ' caracteres; se recortará.');
      if (prog.split('|').some(g => !g.trim())) avisos.push(donde + 'hay un compás vacío (un | de más, al inicio, al final o repetido).');
      const raros = prog.split(/[\s|]+/).flatMap(t => t.split(/-(?=[A-G])/)).filter(t => t && t !== '-' && t !== 'N.C.').filter(t => {
        const r = /^[A-G][#♯b♭]*/.exec(t);
        return !r || !ACORDE.test(t.slice(r[0].length));
      });
      if (raros.length) avisos.push(donde + 'acorde no reconocido: ' + [...new Set(raros)].join(', ') + '.');
      if (resto.join('//').trim().length > LIM.pista) avisos.push(donde + 'la pista pasa de ' + LIM.pista + ' caracteres; se recortará al guardar.');
    });
    return { errores, avisos };
  }
  const limpia = c => ({ ...Object.fromEntries(CAMPOS.map(k => [k, c[k] || ''])), partes: c.partes || [] });

  const estado = (texto, tipo = '') => {
    $('estado').textContent = texto;
    $('estado').className = 'estado ' + tipo;
  };

  // --- comunicación con el servidor ---
  // Si no hay pase (o venció), pide la contraseña (encima de lo que tengas abierto) y repite la acción solo.
  async function llamar(body) {
    for (let intento = 0; intento < 2; intento++) {
      if (!token && !(await pedirLogin(intento ? 'Tu sesión venció. Entra de nuevo.' : '', Boolean(abierta)))) break;
      let r, j;
      try {
        r = await fetch('/api/canciones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, token }) });
        j = await r.json().catch(() => ({}));
      } catch (e) { return { ok: false, status: 0, j: { error: 'Sin conexión con el servidor.' } }; }
      if (r.status === 401) { token = ''; olvidarSesion(); continue; }
      return { ok: r.ok, status: r.status, j };
    }
    return { ok: false, status: 401, j: { error: 'No se pudo entrar.' } };
  }
  const exito = () => {
    estado('Guardado ✓');
    try { navigator.vibrate && navigator.vibrate([10, 25, 15]); } catch (e) { /* nada */ }
  };
  const recargar = async () => {
    const r = await fetch('/api/canciones', { cache: 'no-store' });
    if (r.ok) app.data = await r.json();
  };

  // --- pantallas completas (formulario, ajustes, entrada) ---
  let abierta = null, ultimoBoton = null;
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button'); if (b) ultimoBoton = b; }, true);
  function abrirCapa(titulo, cuerpo, pie, cerrable = true, apilada = false) {
    if (!apilada) cerrarCapa();
    const previo = ultimoBoton && ultimoBoton.isConnected ? ultimoBoton : document.activeElement;
    const capa = el('div', { className: 'capa', tabIndex: -1, 'aria-modal': 'true', 'aria-label': titulo, rol: 'dialog',
      onkeydown: ev => { if (ev.key === 'Escape' && cerrable) { ev.stopPropagation(); apilada ? capa.remove() : cerrarCapa(); } } },
      el('div', { className: 'capa-t' }, el('span', {}, titulo), cerrable && el('button', { type: 'button', onclick: () => apilada ? capa.remove() : cerrarCapa() }, 'Cerrar')),
      el('div', { className: 'capa-c' }, ...cuerpo),
      pie && el('div', { className: 'capa-p' }, ...pie));
    document.body.append(capa);
    document.body.classList.add('fija');
    if (!apilada) { abierta = capa; abierta.previo = previo; }
    else capa.previo = previo;
    capa.focus({ preventScroll: true });
    return capa;
  }
  function cerrarCapa() {
    if (!abierta) return;
    const previo = abierta.previo;
    abierta.remove();
    abierta = null;
    if ($('cancion').hidden) document.body.classList.remove('fija');
    const destino = previo && previo.isConnected && previo !== document.body ? previo : $('editor').querySelector('button');
    if (destino) destino.focus({ preventScroll: true });
  }
  const salir = () => { location.href = location.pathname; };
  const sp = () => el('span', { className: 'sp' });

  // Pide la contraseña. Devuelve una promesa: true cuando entraste.
  let esperandoLogin = null;
  function pedirLogin(aviso, apilada = false) {
    if (esperandoLogin) return esperandoLogin;
    esperandoLogin = new Promise(resolver => {
      const msg = el('p', { className: 'aviso-e' }, aviso || '');
      const pass = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña' });
      const fija = el('input', { type: 'checkbox' });
      const boton = el('button', { type: 'button', className: 'primario' }, 'Entrar');
      let capa;
      const entrar = async () => {
        if (!pass.value) { pass.focus(); return; }
        boton.disabled = true;
        msg.textContent = 'Entrando…';
        try {
          const r = await fetch('/api/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave: pass.value }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j.token) { msg.textContent = j.error || 'No se pudo entrar (error ' + r.status + ').'; boton.disabled = false; pass.select(); return; }
          token = j.token;
          guardarSesion(token, fija.checked);
          if (apilada) capa.remove(); else cerrarCapa();
          estado('Listo');
          resolver(true);
        } catch (err) {
          msg.textContent = 'Sin conexión con el servidor.';
          boton.disabled = false;
        }
      };
      boton.onclick = entrar;
      capa = abrirCapa('Entrar al editor', [
        el('label', { className: 'campo' }, el('span', {}, 'Contraseña'), pass),
        el('label', { className: 'campo' }, fija, ' Recordar en este teléfono (30 días)'),
        msg
      ], [el('button', { type: 'button', onclick: salir }, 'Solo mirar'), sp(), boton], false, apilada);
      pass.addEventListener('keydown', ev => { if (ev.key === 'Enter') entrar(); });
      pass.focus();
    }).finally(() => { esperandoLogin = null; });
    return esperandoLogin;
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
    const id = c.id || nuevoId();   // un id fijo por canción: si reintentas guardar, nunca se duplica
    const campo = (etiqueta, ctl) => el('label', { className: 'campo' }, el('span', {}, etiqueta), ctl);
    const f = (k, props = {}) => el('input', { id: 'f-' + k, value: c[k] || '', maxLength: LIM[k], ...props });
    const tono = el('select', { id: 'f-tono' }, el('option', { value: '' }, 'Elige el tono'), ...TONOS.map(t => el('option', { value: t }, t)));
    tono.value = c.tono || '';
    const partes = el('textarea', {
      id: 'f-partes', rows: 8, value: partesATexto(c.partes), oninput: mostrarRevision, 'aria-describedby': 'avisos',
      placeholder: 'Intro: G D | Em C\nVerso: G D | Em C // una línea que te ubique\nCoro (D): D G | Bm A'
    });
    const botonGuardar = el('button', { type: 'button', className: 'primario' }, 'Guardar');
    const guardarForm = async () => {
      const v = k => $('f-' + k).value.trim();
      const n = { titulo: v('titulo'), artista: v('artista'), tono: v('tono'), nota: v('nota'), enlace: v('enlace'), partes: textoAPartes($('f-partes').value) };
      const mal = !n.titulo ? ['f-titulo', 'Escribe el nombre de la canción.']
        : !n.tono ? ['f-tono', 'Elige el tono.']
        : n.enlace && !/^https?:\/\/\S+$/i.test(n.enlace) ? ['f-enlace', 'El link debe empezar con http:// o https://']
        : mostrarRevision().length ? ['f-partes', 'Corrige los errores marcados en las partes.'] : null;
      if (mal) { $('f-msg').textContent = mal[1]; $(mal[0]).focus(); return; }
      const repetida = lista().some(x => x.id !== c.id && norm(x.titulo) === norm(n.titulo) && norm(x.artista) === norm(n.artista));
      if (repetida && !confirm('Ya existe una canción igual. ¿Guardarla de todos modos?')) return;
      botonGuardar.disabled = true;
      $('f-msg').textContent = 'Guardando…';
      estado('Guardando…');
      const { ok, j } = await llamar({ accion: 'guardar', cancion: { id, ...n } });
      if (!ok) {
        botonGuardar.disabled = false;
        $('f-msg').textContent = 'No se guardó: ' + (j.error || 'error del servidor') + ' Tu texto sigue aquí; intenta de nuevo.';
        estado('No se guardó', 'mal');
        return;
      }
      const k = lista().findIndex(x => x.id === j.cancion.id);
      if (k >= 0) lista()[k] = j.cancion; else lista().push(j.cancion);
      cerrarCapa();
      app.render();
      exito();
    };
    botonGuardar.onclick = guardarForm;
    const borrar = async () => {
      if (!confirm(`¿Mandar "${c.titulo}" a la papelera? La puedes restaurar desde Ajustes.`)) return;
      const { ok, j } = await llamar({ accion: 'borrar', id: c.id });
      if (!ok) { $('f-msg').textContent = 'No se pudo: ' + (j.error || 'error del servidor'); return; }
      const k = lista().findIndex(x => x.id === c.id);
      if (k >= 0) lista().splice(k, 1);
      cerrarCapa();
      app.render();
      exito();
    };
    abrirCapa(i >= 0 ? 'Editar canción' : 'Nueva canción', [
      campo('Canción', f('titulo')),
      campo('Artista', f('artista')),
      campo('Tono', tono),
      campo('Nota (opcional, ej: capo 2)', f('nota')),
      campo('Link de referencia (opcional)', f('enlace', { type: 'url', placeholder: 'https://…' })),
      campo('Partes y acordes (opcional)', partes),
      el('p', { className: 'pista-ayuda' }, 'Una parte por línea: Nombre (tono): acordes // pista. El (tono) solo si la parte modula. Marca el compás con |. La pista es una línea corta: no pegues la letra de la canción (derechos de autor).'),
      el('ul', { id: 'avisos' }),
      el('p', { id: 'f-msg', className: 'aviso-e' })
    ], [i >= 0 && c.id && el('button', { type: 'button', className: 'peligro', onclick: borrar }, 'Papelera'), sp(), botonGuardar]);
    mostrarRevision();
    if (i < 0) $('f-titulo').focus();
  }

  function descargarCopia() {
    const d = app.data;
    const copia = { version: 2, nombre: d.nombre || '', intro: d.intro || '', canciones: lista().map(c => ({ id: c.id, ...limpia(c) })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(copia, null, 2)], { type: 'application/json' }));
    el('a', { href: url, download: 'repertorio-copia.json' }).click();
    URL.revokeObjectURL(url);
  }

  // Importar una copia (.json de "Descargar copia", de la versión nueva o de la vieja). Solo SUMA y ACTUALIZA: nunca quita canciones.
  async function leerCopia(ev, msg) {
    const archivo = ev.target.files[0];
    ev.target.value = '';
    if (!archivo) return;
    let d;
    try { d = JSON.parse(await archivo.text()); } catch (err) { msg.textContent = 'El archivo no es una copia válida.'; return; }
    if (!d || !Array.isArray(d.canciones) || !d.canciones.length) { msg.textContent = 'El archivo no trae canciones. No se importó nada.'; return; }
    msg.textContent = 'Revisando la copia…';
    const base = { accion: 'importar', canciones: d.canciones, nombre: d.nombre, intro: d.intro };
    const sim = await llamar({ ...base, simular: true });
    if (!sim.ok) { msg.textContent = 'No se pudo revisar: ' + (sim.j.error || 'error del servidor'); return; }
    const r = sim.j;
    if (!r.nuevas && !r.actualizadas) { msg.textContent = `No hay nada que importar: ${r.iguales} ya estaban iguales` + (r.omitidas ? `, ${r.omitidas} sin título o tono válido.` : '.'); return; }
    if (!confirm(`La copia trae ${d.canciones.length} canciones.\n\nSe agregarán ${r.nuevas} nuevas y se actualizarán ${r.actualizadas}. ${r.iguales} ya están iguales.` + (r.omitidas ? ` ${r.omitidas} se omiten (sin título o tono válido).` : '') + '\n\nNo se borra ninguna canción. ¿Continuar?')) { msg.textContent = ''; return; }
    msg.textContent = 'Importando…';
    const real = await llamar(base);
    if (!real.ok) { msg.textContent = 'No se importó: ' + (real.j.error || 'error del servidor'); return; }
    await recargar();
    cerrarCapa();
    exito();
  }

  async function abrirPapelera() {
    const { ok, j } = await llamar({ accion: 'papelera' });
    const msg = el('p', { className: 'aviso-e' });
    const filas = el('div', {});
    const pintar = canciones => filas.replaceChildren(...(canciones.length ? canciones.map(c => el('p', {},
      el('b', {}, c.titulo), c.artista ? ' · ' + c.artista + ' ' : ' ',
      el('button', { type: 'button', onclick: async () => {
        const r = await llamar({ accion: 'restaurar', id: c.id });
        if (!r.ok) { msg.textContent = 'No se pudo restaurar: ' + (r.j.error || 'error del servidor'); return; }
        lista().push(r.j.cancion);
        app.render();
        pintar(canciones.filter(x => x.id !== c.id));
        exito();
      } }, 'Restaurar'))) : [el('p', { className: 'pista-ayuda' }, 'La papelera está vacía.')]));
    pintar(ok ? j.canciones : []);
    if (!ok) msg.textContent = 'No se pudo leer la papelera: ' + (j.error || 'error del servidor');
    abrirCapa('Papelera', [el('p', { className: 'pista-ayuda' }, 'Las canciones que mandas a la papelera siguen guardadas en el servidor. Aquí las restauras.'), filas, msg]);
  }

  function cerrarSesion() {
    olvidarSesion();
    salir();
  }

  function abrirAjustes() {
    const msg = el('p', { className: 'aviso-e' });
    const archivo = el('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: ev => leerCopia(ev, msg) });
    const dato = (k, etiqueta) => el('label', { className: 'campo' }, el('span', {}, etiqueta),
      el('input', { value: app.data[k] || '', onchange: async ev => {
        const antes = app.data[k] || '';
        app.data[k] = ev.target.value.trim();
        const { ok, j } = await llamar({ accion: 'ajustes', nombre: app.data.nombre || '', intro: app.data.intro || '' });
        if (!ok) { app.data[k] = antes; ev.target.value = antes; msg.textContent = 'No se guardó: ' + (j.error || 'error del servidor'); return; }
        msg.textContent = '';
        app.render();
        exito();
      } }));
    abrirCapa('Ajustes', [
      el('div', { className: 'grupo' }, el('h3', {}, 'Página'), dato('nombre', 'Nombre'), dato('intro', 'Texto de presentación')),
      el('div', { className: 'grupo' }, el('h3', {}, 'Copia de seguridad'),
        el('p', {}, el('button', { type: 'button', onclick: descargarCopia }, 'Descargar copia'), ' ',
          el('button', { type: 'button', onclick: () => archivo.click() }, 'Importar copia'), archivo),
        el('p', { className: 'pista-ayuda' }, 'Importar suma y actualiza canciones; nunca quita ninguna.')),
      el('div', { className: 'grupo' }, el('h3', {}, 'Papelera'),
        el('p', {}, el('button', { type: 'button', onclick: abrirPapelera }, 'Ver papelera'))),
      el('div', { className: 'grupo' }, el('h3', {}, 'Sesión'),
        el('p', { className: 'pista-ayuda' }, 'Volver a la página: sales del editor y sigues con tu sesión. Cerrar sesión: la próxima vez te pedirá la contraseña.'),
        el('p', {}, el('button', { type: 'button', onclick: salir }, 'Volver a la página'), ' ',
          el('button', { type: 'button', onclick: cerrarSesion }, 'Cerrar sesión'))),
      msg
    ]);
  }

  $('editor').replaceChildren(el('div', { className: 'ebarra' },
    el('b', { id: 'e-titulo' }, 'Editor'),
    el('span', { id: 'estado', className: 'estado', 'aria-live': 'polite' }, 'Listo'),
    el('button', { type: 'button', onclick: abrirAjustes }, 'Ajustes'),
    el('button', { type: 'button', className: 'primario', onclick: () => abrirForm(-1) }, '+ Nueva')));

  app.acciones = i => el('div', { className: 'fila-acciones' }, el('button', { type: 'button', onclick: () => abrirForm(i) }, 'Editar'));

  app.render();
  if (!token) pedirLogin('');
})();
