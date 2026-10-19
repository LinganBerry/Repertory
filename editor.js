// Modo editor. Dos modos:
//  - ADMINISTRADOR (?editar, se abre tocando 5 veces el título): edita sus canciones y las de cualquier usuario.
//    Entra con ADMIN_PASSWORD; sus canciones se guardan en /api/canciones y las de otros en /api/comunidad.
//  - USUARIO (?cuenta, botón de la cabecera): crea su cuenta o entra con usuario y contraseña; solo edita sus propias
//    canciones, que se guardan en /api/comunidad. Nunca toca las del administrador.
// El servidor decide quién puede qué (pases firmados); esta pantalla solo muestra los botones que corresponden.
(() => {
  'use strict';

  const app = window.RepertorioApp;
  const { el, norm } = app;
  const $ = id => document.getElementById(id);
  const CAMPOS = ['titulo', 'artista', 'tono', 'nota', 'enlace'];
  const TONOS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
    .flatMap(t => [t, t + 'm']);
  const lista = () => app.data.canciones;

  // Sesión: el servidor cambia la contraseña por un pase que vence a los 30 días. La contraseña NO se guarda.
  const ADMIN = new URLSearchParams(location.search).has('editar');
  const SESION = ADMIN ? 'repertorio-sesion' : 'repertorio-sesion-usuario';
  const leerSesion = () => { try { return sessionStorage.getItem(SESION) || localStorage.getItem(SESION) || ''; } catch (e) { return ''; } };
  const olvidarSesion = () => { try { sessionStorage.removeItem(SESION); localStorage.removeItem(SESION); } catch (e) { /* nada */ } };
  const guardarSesion = (v, fija) => { olvidarSesion(); try { (fija ? localStorage : sessionStorage).setItem(SESION, v); } catch (e) { /* nada */ } };
  // Versiones anteriores guardaban la contraseña en el teléfono: se borra.
  try { sessionStorage.removeItem('repertorio-clave'); localStorage.removeItem('repertorio-clave'); } catch (e) { /* nada */ }
  let token = leerSesion(), pendiente = false;
  if (!ADMIN && !token.startsWith('u1.')) token = '';
  // Nombre del usuario: va dentro del pase (u1.<usuario>.<vence>.<firma>).
  const yo = () => (!ADMIN && token ? token.split('.')[1] || '' : '');
  // Canciones con cambios sin guardar, por autor ('' = las del administrador).
  const sucios = new Set();
  const puede = c => Boolean(c) && (ADMIN || (yo() !== '' && c.autor === yo()));

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
      canciones: d.canciones.filter(c => !c.autor).map(limpia)
    };
  };

  const estado = (texto, tipo = '') => {
    $('estado').textContent = texto;
    $('estado').className = 'estado ' + tipo;
    $('b-reintentar').hidden = tipo !== 'mal';
  };

  // Envía al servidor solo lo que cambió, por autor. Si falla, queda "Reintentar" en la barra.
  async function enviar(autor) {
    const propio = autor === '';   // canciones del administrador
    const d = propio ? paquete() : null;
    const url = propio ? '/api/canciones' : '/api/comunidad';
    const body = propio ? { token, data: d } : { token, autor, data: { canciones: lista().filter(c => c.autor === autor).map(limpia) } };
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { r, j, d, esperaLinks: (propio ? d.canciones : body.data.canciones).filter(c => c.enlace).length };
  }
  async function guardar() {
    if (!token) { pendiente = true; abrirLogin(); return false; }
    estado('Guardando…');
    try {
      for (const autor of [...sucios]) {
        const { r, j, d, esperaLinks } = await enviar(autor);
        if (r.status === 401) { pendiente = true; token = ''; olvidarSesion(); estado('No se guardó: sesión vencida o no válida.', 'mal'); abrirLogin(ADMIN ? 'Entra de nuevo con tu contraseña.' : 'Tu sesión venció. Entra de nuevo.'); return false; }
        if (!r.ok) { pendiente = true; estado('No se guardó: ' + (j.error || 'error ' + r.status), 'mal'); return false; }
        sucios.delete(autor);
        if (d) app.data.actualizado = d.actualizado;
        // Si el servidor es una versión vieja, descarta los links sin avisar: aquí se detecta.
        if (esperaLinks && j.enlaces !== esperaLinks) { estado('Guardado, pero el servidor NO guardó los links: sube la versión nueva de la carpeta api/ a GitHub.', 'alerta'); return true; }
      }
      pendiente = false;
      estado('Guardado ✓');
      try { navigator.vibrate && navigator.vibrate([10, 25, 15]); } catch (e) { /* nada */ }
      return true;
    } catch (e) {
      pendiente = true;
      estado('Sin conexión con el servidor.', 'mal');
      return false;
    }
  }
  const cambio = (autor = '') => { sucios.add(autor); app.render(); return guardar(); };

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
    if (!ADMIN) return abrirLoginUsuario(aviso);
    const msg = el('p', { className: 'aviso-e' }, aviso || '');
    const pass = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña' });
    const fija = el('input', { type: 'checkbox' });
    const boton = el('button', { type: 'button', className: 'primario' }, 'Entrar');
    const entrar = async () => {
      if (!pass.value) { pass.focus(); return; }
      boton.disabled = true;
      msg.textContent = 'Entrando…';
      try {
        const r = await fetch('/api/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave: pass.value }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.token) { msg.textContent = j.error || 'No se pudo entrar (error ' + r.status + ').'; boton.disabled = false; return; }
        token = j.token;
        guardarSesion(token, fija.checked);
        cerrarCapa();
        estado('Listo');
        if (pendiente) guardar();
      } catch (err) {
        msg.textContent = 'Sin conexión con el servidor.';
        boton.disabled = false;
      }
    };
    boton.onclick = entrar;
    abrirCapa('Entrar al editor', [
      el('label', { className: 'campo' }, el('span', {}, 'Contraseña'), pass),
      el('label', { className: 'campo' }, fija, ' Recordar en este teléfono (30 días)'),
      msg
    ], [el('button', { type: 'button', onclick: salir }, 'Solo mirar'), sp(), boton], false);
    pass.addEventListener('keydown', ev => { if (ev.key === 'Enter') entrar(); });
    pass.focus();
  }

  // Entrada de usuarios: iniciar sesión o crear cuenta (mismo formulario).
  function abrirLoginUsuario(aviso) {
    let nueva = false;
    const msg = el('p', { className: 'aviso-e' }, aviso || '');
    const usuario = el('input', { autocomplete: 'username', autocapitalize: 'none', spellcheck: false, maxLength: 20, placeholder: 'Ej: maria_07' });
    const pass = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña' });
    const codigo = el('input', { autocomplete: 'off', placeholder: 'Solo si te dieron uno' });
    const campoCodigo = el('label', { className: 'campo' }, el('span', {}, 'Código de invitación (opcional)'), codigo);
    const ayuda = el('p', { className: 'pista-ayuda' });
    const fija = el('input', { type: 'checkbox' });
    const boton = el('button', { type: 'button', className: 'primario' }, 'Entrar');
    const cambiar = el('button', { type: 'button' }, 'Crear cuenta nueva');
    const pinta = () => {
      boton.textContent = nueva ? 'Crear cuenta' : 'Entrar';
      cambiar.textContent = nueva ? 'Ya tengo cuenta' : 'Crear cuenta nueva';
      campoCodigo.hidden = !nueva;
      pass.autocomplete = nueva ? 'new-password' : 'current-password';
      ayuda.textContent = nueva
        ? 'Usuario: 3 a 20 caracteres (letras minúsculas sin tildes, números y _). Contraseña: mínimo 8. Tus canciones aparecen junto a las demás con tu nombre y solo tú puedes editarlas.'
        : 'Entra para agregar y editar tus canciones. Si no tienes cuenta, créala: es gratis.';
    };
    cambiar.onclick = () => { nueva = !nueva; msg.textContent = ''; pinta(); };
    const entrar = async () => {
      if (!usuario.value.trim()) { usuario.focus(); return; }
      if (!pass.value) { pass.focus(); return; }
      boton.disabled = true;
      msg.textContent = nueva ? 'Creando cuenta…' : 'Entrando…';
      try {
        const r = await fetch('/api/cuenta', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion: nueva ? 'registrar' : 'entrar', usuario: usuario.value.trim(), clave: pass.value, codigo: codigo.value.trim() }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.token) { msg.textContent = j.error || 'No se pudo entrar (error ' + r.status + ').'; boton.disabled = false; return; }
        token = j.token;
        guardarSesion(token, fija.checked);
        cerrarCapa();
        rotular();
        estado('Listo');
        app.render();
        if (pendiente) guardar();
      } catch (err) {
        msg.textContent = 'Sin conexión con el servidor.';
        boton.disabled = false;
      }
    };
    boton.onclick = entrar;
    abrirCapa('Mis canciones', [
      el('label', { className: 'campo' }, el('span', {}, 'Usuario'), usuario),
      el('label', { className: 'campo' }, el('span', {}, 'Contraseña'), pass),
      campoCodigo,
      el('label', { className: 'campo' }, fija, ' Recordar en este teléfono (30 días)'),
      ayuda, msg
    ], [el('button', { type: 'button', onclick: salir }, 'Solo mirar'), cambiar, sp(), boton], false);
    pinta();
    pass.addEventListener('keydown', ev => { if (ev.key === 'Enter') entrar(); });
    usuario.focus();
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
    if (i >= 0 && !puede(c)) return;
    const dueno = i >= 0 ? (c.autor || '') : (ADMIN ? '' : yo());   // de quién es esta canción ('' = del administrador)
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
      if (dueno) n.autor = dueno;
      // Solo cuenta como repetida una igual del mismo dueño: cada quien puede tener su propia versión de una canción.
      const repetida = lista().some((x, j) => j !== i && (x.autor || '') === dueno && norm(x.titulo) === norm(n.titulo) && norm(x.artista) === norm(n.artista));
      if (repetida && !confirm('Ya existe una canción igual. ¿Guardarla de todos modos?')) return;
      if (i >= 0) lista()[i] = n; else lista().push(n);
      cerrarCapa();
      cambio(dueno);
    };
    const borrar = () => {
      if (!confirm(`¿Borrar "${c.titulo}"?`)) return;
      lista().splice(i, 1);
      cerrarCapa();
      cambio(dueno);
    };
    abrirCapa(i >= 0 ? 'Editar canción' + (ADMIN && c.autor ? ' de ' + c.autor : '') : 'Nueva canción', [
      campo('Canción', f('titulo')),
      campo('Artista', f('artista')),
      campo('Tono', tono),
      campo('Nota (opcional, ej: capo 2)', f('nota')),
      campo('Link de referencia (opcional)', f('enlace', { type: 'url', placeholder: 'https://…' })),
      campo('Partes y acordes (opcional)', partes),
      el('p', { className: 'pista-ayuda' }, 'Una parte por línea: Nombre (tono): acordes // pista. El (tono) solo si la parte modula. Marca el compás con |. La pista es una línea corta: no pegues la letra de la canción (derechos de autor).'),
      el('ul', { id: 'avisos' }),
      el('p', { id: 'f-msg', className: 'aviso-e' })
    ], [i >= 0 && el('button', { type: 'button', className: 'peligro', onclick: borrar }, 'Borrar'), sp(), el('button', { type: 'button', className: 'primario', onclick: guardarForm }, 'Guardar')]);
    mostrarRevision();
    if (i < 0) $('f-titulo').focus();
  }

  function descargarCopia() {
    const copia = ADMIN ? paquete() : { version: 1, canciones: lista().filter(c => c.autor === yo()).map(limpia) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(copia, null, 2)], { type: 'application/json' }));
    el('a', { href: url, download: ADMIN ? 'repertorio-copia.json' : 'mis-canciones.json' }).click();
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
    aplicar(d, msg, 'del archivo');
  }

  // Reemplaza la lista actual (con confirmación). Sirve para importar una copia o recuperar la versión anterior.
  function aplicar(d, msg, origen) {
    if (!confirm(`Esto reemplaza tus ${lista().filter(c => !c.autor).length} canciones actuales por las ${d.canciones.length} ${origen}. Las de los usuarios no se tocan. ¿Continuar?`)) return;
    app.data.nombre = d.nombre || app.data.nombre;
    app.data.intro = typeof d.intro === 'string' ? d.intro : app.data.intro;
    const ajenas = lista().filter(c => c.autor);
    app.data.canciones = [...d.canciones.filter(c => c && typeof c === 'object' && !c.autor).map(c => {
      const x = limpia(c);
      x.partes = Array.isArray(c.partes) ? c.partes : [];
      return x;
    }), ...ajenas];
    cerrarCapa();
    cambio('');
  }

  // Deshacer el último guardado: el servidor guarda el estado anterior en cada cambio.
  async function recuperarPrevio(msg) {
    let d;
    try {
      const r = await fetch('/api/canciones?previo=1', { cache: 'no-store' });
      if (!r.ok) throw new Error('sin copia');
      d = await r.json();
    } catch (err) { msg.textContent = 'No hay una versión anterior guardada.'; return; }
    if (!d || !Array.isArray(d.canciones) || !d.canciones.length) { msg.textContent = 'La versión anterior está vacía.'; return; }
    aplicar(d, msg, 'de la versión anterior');
  }

  function cerrarSesion() {
    olvidarSesion();
    salir();
  }

  // Borrar la propia cuenta y todas las canciones del usuario (pide la contraseña).
  async function borrarCuenta(msg) {
    if (!confirm('Se borrará tu cuenta y todas tus canciones. No se puede deshacer. ¿Continuar?')) return;
    const clave = prompt('Escribe tu contraseña para confirmar:');
    if (!clave) return;
    try {
      const r = await fetch('/api/cuenta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'borrar', token, clave }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { msg.textContent = j.error || 'No se pudo borrar (error ' + r.status + ').'; return; }
      cerrarSesion();
    } catch (e) { msg.textContent = 'Sin conexión con el servidor.'; }
  }

  function abrirAjustesUsuario() {
    const msg = el('p', { className: 'aviso-e' });
    abrirCapa('Ajustes', [
      el('div', { className: 'grupo' }, el('h3', {}, 'Mis canciones'),
        el('p', {}, el('button', { type: 'button', onclick: descargarCopia }, 'Descargar copia'))),
      el('div', { className: 'grupo' }, el('h3', {}, 'Sesión'),
        el('p', { className: 'pista-ayuda' }, 'Sesión iniciada como ' + yo() + '. Volver a la página no cierra tu sesión.'),
        el('p', {}, el('button', { type: 'button', onclick: salir }, 'Volver a la página'), ' ',
          el('button', { type: 'button', onclick: cerrarSesion }, 'Cerrar sesión'))),
      el('div', { className: 'grupo' }, el('h3', {}, 'Cuenta'),
        el('p', {}, el('button', { type: 'button', className: 'peligro', onclick: () => borrarCuenta(msg) }, 'Borrar mi cuenta y mis canciones'))),
      msg
    ]);
  }

  function abrirAjustes() {
    if (!ADMIN) return abrirAjustesUsuario();
    const msg = el('p', { className: 'aviso-e' });
    const archivo = el('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: ev => leerCopia(ev, msg) });
    const dato = (k, etiqueta) => el('label', { className: 'campo' }, el('span', {}, etiqueta),
      el('input', { value: app.data[k] || '', onchange: ev => { app.data[k] = ev.target.value.trim(); cambio(''); } }));
    abrirCapa('Ajustes', [
      el('div', { className: 'grupo' }, el('h3', {}, 'Página'), dato('nombre', 'Nombre'), dato('intro', 'Texto de presentación')),
      el('div', { className: 'grupo' }, el('h3', {}, 'Copia de seguridad'),
        el('p', {}, el('button', { type: 'button', onclick: descargarCopia }, 'Descargar copia'), ' ',
          el('button', { type: 'button', onclick: () => archivo.click() }, 'Importar copia'), ' ',
          el('button', { type: 'button', onclick: () => recuperarPrevio(msg) }, 'Deshacer último guardado'), archivo)),
      el('div', { className: 'grupo' }, el('h3', {}, 'Sesión'),
        el('p', { className: 'pista-ayuda' }, 'Volver a la página: sales del editor y sigues con tu sesión. Cerrar sesión: la próxima vez te pedirá la contraseña.'),
        el('p', {}, el('button', { type: 'button', onclick: salir }, 'Volver a la página'), ' ',
          el('button', { type: 'button', onclick: cerrarSesion }, 'Cerrar sesión'))),
      msg
    ]);
  }

  const rotular = () => { const b = $('e-titulo'); if (b) b.textContent = ADMIN ? 'Editor' : 'Mis canciones' + (yo() ? ' · ' + yo() : ''); };
  $('editor').replaceChildren(el('div', { className: 'ebarra' },
    el('b', { id: 'e-titulo' }, ADMIN ? 'Editor' : 'Mis canciones'),
    el('span', { id: 'estado', className: 'estado', 'aria-live': 'polite' }, 'Listo'),
    el('button', { id: 'b-reintentar', type: 'button', hidden: true, onclick: guardar }, 'Reintentar'),
    el('button', { type: 'button', onclick: abrirAjustes }, 'Ajustes'),
    el('button', { type: 'button', className: 'primario', onclick: () => abrirForm(-1) }, '+ Nueva')));

  // El botón "Editar" solo sale en las canciones que esta persona puede editar (el servidor lo vuelve a comprobar).
  app.acciones = i => puede(lista()[i]) ? el('div', { className: 'acciones' }, el('button', { type: 'button', onclick: () => abrirForm(i) }, 'Editar')) : null;

  rotular();
  app.render();
  if (!token) abrirLogin();
})();
