(() => {
  'use strict';

  const PARAMS = new URLSearchParams(location.search);
  const EDITOR = PARAMS.has('editar');   // ?editar = modo editor (pide tu contraseña)
  const NOTAS = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

  // Nombre por defecto de la página (si en Ajustes → Página no hay otro). Debe coincidir con <title> de index.html.
  const NOMBRE = 'Acordes y Tonos';
  const $ = id => document.getElementById(id);
  const clone = o => JSON.parse(JSON.stringify(o));
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) k === 'rol' ? n.setAttribute('role', v) : k.includes('-') ? n.setAttribute(k, v) : (n[k] = v);
    n.append(...kids.flat().filter(k => k != null && k !== false));
    return n;
  };

  // Mientras hay una capa abierta (canción, Teoría, editor) el fondo no recibe foco ni toques.
  // Además recuerda hasta dónde habías bajado en la lista y vuelve ahí al cerrar la capa (no al inicio).
  let yFondo = 0, habiaCapa = false;
  const sincronizarFondo = () => {
    const f = $('app'), hay = document.body.classList.contains('fija');
    if (f) f.inert = hay;
    if (hay && !habiaCapa) yFondo = window.scrollY;
    if (!hay && habiaCapa && window.scrollY !== yFondo) window.scrollTo(0, yFondo);
    habiaCapa = hay;
  };
  new MutationObserver(sincronizarFondo).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // --- tema (Papel / Escenario): arranca según el modo del teléfono y se recuerda ---
  const TEMA = 'repertorio-tema';
  const guardado = () => { try { return localStorage.getItem(TEMA); } catch (e) { return null; } };
  // Muestra a dónde vas: luna (→ Escenario, oscuro) o sol (→ Papel, claro).
  const icono = trazos => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: 22, height: 22, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, v);
    trazos.forEach(d => { const p = document.createElementNS('http://www.w3.org/2000/svg', d.startsWith('c') ? 'circle' : 'path'); if (d.startsWith('c')) { p.setAttribute('cx', 12); p.setAttribute('cy', 12); p.setAttribute('r', 4); } else p.setAttribute('d', d); s.append(p); });
    return s;
  };
  const LUNA = ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'];
  const SOL = ['c', 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'];
  function aplicarTema(t) {
    document.documentElement.dataset.tema = t;
    const b = $('tema'), aEscenario = t === 'papel', texto = aEscenario ? 'Cambiar a modo Escenario (oscuro)' : 'Cambiar a modo Papel (claro)';
    b.replaceChildren(icono(aEscenario ? LUNA : SOL));
    b.setAttribute('aria-label', texto);
    b.title = texto;
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = t === 'papel' ? '#faf6ee' : '#1c1c1e';
  }
  aplicarTema(guardado() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'escenario' : 'papel'));
  $('tema').addEventListener('click', () => {
    const t = document.documentElement.dataset.tema === 'papel' ? 'escenario' : 'papel';
    try { localStorage.setItem(TEMA, t); } catch (e) { /* nada */ }
    aplicarTema(t);
  });

  // --- búsqueda: sin tildes ni signos; tolera pequeños errores (distancia de edición) ---
  const fichas = s => norm(s).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const distancia = (a, b) => {
    const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let previo = fila[0];
      fila[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const actual = fila[j];
        fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1));
        previo = actual;
      }
    }
    return fila[b.length];
  };
  const puntaje = (c, palabras) => {
    const textos = fichas(c.titulo + ' ' + c.artista);
    let total = 0;
    for (const w of palabras) {
      const tolerancia = w.length <= 3 ? 0 : w.length <= 6 ? 1 : 2;
      let mejor = Infinity;
      for (const t of textos) {
        if (t.startsWith(w)) mejor = Math.min(mejor, 0);
        else if (t.includes(w)) mejor = Math.min(mejor, 1);
        else {
          const d = Math.min(distancia(w, t), distancia(w, t.slice(0, w.length)));
          if (d <= tolerancia) mejor = Math.min(mejor, 1 + d);
        }
      }
      if (mejor === Infinity) return null;
      total += mejor;
    }
    return total;
  };

  // --- color por tono: misma nota = mismo matiz; el menor, más frío (hacia azul) y más apagado ---
  const TONO_RE = /^([A-G][#b]?)(m?)/;
  const posTono = k => {
    const m = TONO_RE.exec(k || '');
    return m ? NOTAS[m[1]] * 2 + (m[2] ? 1 : 0) : 99;
  };
  function colorear(nodo, tono) {
    const m = TONO_RE.exec(tono || '');
    if (!m) return nodo;
    let h = NOTAS[m[1]] * 30;
    if (m[2]) h = (h + (((220 - h + 540) % 360) - 180) * 0.2 + 360) % 360;
    nodo.style.setProperty('--h', Math.round(h));
    nodo.style.setProperty('--s', m[2] ? '22%' : '34%');
    return nodo;
  }
  const rotulo = t => { const m = TONO_RE.exec(t || ''); return m ? [m[1], m[2] && el('small', {}, 'm')] : [t || '—']; };
  const pastilla = t => colorear(el('span', { className: 'tono' }, ...rotulo(t)), t);

  const normalizar = d => {
    const x = clone(d || {});
    x.canciones = Array.isArray(x.canciones) ? x.canciones : [];
    return x;
  };
  let data = normalizar(null);
  const vista = { q: '', tono: '' };

  const tonosPresentes = () => [...new Set(data.canciones.map(c => c.tono).filter(Boolean))].sort((a, b) => posTono(a) - posTono(b));

  function visibles() {
    const palabras = fichas(vista.q);
    const filas = [];
    data.canciones.forEach((c, i) => {
      if (vista.tono && c.tono !== vista.tono) return;
      const p = puntaje(c, palabras);
      if (p !== null) filas.push({ c, i, p });
    });
    const porTitulo = (a, b) => a.c.titulo.localeCompare(b.c.titulo, 'es');
    return filas.sort(palabras.length ? (a, b) => a.p - b.p || porTitulo(a, b) : porTitulo);
  }

  function pastillas() {
    if (vista.tono && !tonosPresentes().includes(vista.tono)) vista.tono = '';
    const boton = (t, hijos, tono) => colorear(el('button', {
      type: 'button', 'aria-pressed': String(vista.tono === t),
      onclick: () => { vista.tono = t; render(); }
    }, ...hijos), tono);
    $('pastillas').replaceChildren(
      boton('', ['Todos']),
      ...tonosPresentes().map(t => { const b = boton(t, rotulo(t), t); b.classList.add('tono'); return b; }));
  }

  // --- tamaño de letra: se recuerda en el dispositivo (localStorage) ---
  const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (e) { return def; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* nada */ } };
  let zoom = Math.min(1.9, Math.max(.85, Number(leer('repertorio-zoom', 1)) || 1));
  let actual = null, ultima = null, orden = [];

  // Pantalla encendida mientras la canción está abierta (si el navegador lo permite).
  let candado = null;
  async function pantallaEncendida() {
    try {
      if (candado || !('wakeLock' in navigator)) return;
      candado = await navigator.wakeLock.request('screen');
      candado.addEventListener('release', () => { candado = null; });
    } catch (e) { /* nada */ }
  }
  const soltarPantalla = () => { try { candado && candado.release(); } catch (e) { /* nada */ } candado = null; };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && actual) pantallaEncendida(); });

  // --- pantalla completa por canción: capa propia, el gesto de atrás del teléfono la cierra ---
  // Compás marcado a mano con "|"; sin barras, los acordes van seguidos.
  // --- números romanos ---
  // Se calculan por NOMBRE de nota, no solo por semitonos: así F en G es ♭VII y nunca ♯VI.
  //  1) el grado sale de la distancia de letras entre el tono y la raíz (G → F = séptimo grado);
  //  2) la alteración (♭/♯) sale de comparar la raíz con ese grado en la escala del tono;
  //  3) mayúscula/minúscula y sufijo salen de la calidad del acorde.
  // Tono mayor: escala mayor. Tono menor: escala menor natural (III, VI y VII salen sin alteración).
  const LETRAS = 'CDEFGAB', PC_LETRA = [0, 2, 4, 5, 7, 9, 11];
  const ESC_MAYOR = [0, 2, 4, 5, 7, 9, 11], ESC_MENOR = [0, 2, 3, 5, 7, 8, 10];
  const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  const nota = s => {
    const m = /^([A-G])([#♯b♭]*)/.exec(s || '');
    return m && { letra: LETRAS.indexOf(m[1]), alt: [...m[2]].reduce((a, x) => a + (x === '#' || x === '♯' ? 1 : -1), 0), largo: m[0].length };
  };
  const clase = n => (PC_LETRA[n.letra] + n.alt + 120) % 12;
  function grado(n, tono) {
    const d = (n.letra - tono.nota.letra + 7) % 7;
    const esperado = (clase(tono.nota) + (tono.menor ? ESC_MENOR : ESC_MAYOR)[d]) % 12;
    const dif = ((clase(n) - esperado + 18) % 12) - 6;
    return { d, alt: dif > 0 ? '♯'.repeat(dif) : '♭'.repeat(-dif) };
  }
  function romano(acorde, tonoTexto) {
    const n0 = nota(tonoTexto);
    const tono = n0 && { nota: n0, menor: tonoTexto.slice(n0.largo).startsWith('m') };
    const barra = /^(.*?)\/([A-G][#♯b♭]*)$/.exec(acorde || '');
    const base = barra ? barra[1] : (acorde || ''), bajo = barra && nota(barra[2]);
    const raiz = nota(base);
    if (!tono || !raiz) return '';
    const { d, alt } = grado(raiz, tono);
    const q = base.slice(raiz.largo);
    let menor = false, suf = q, m;
    if ((m = /^(dim|o|°)/.exec(q))) { menor = true; suf = '°' + q.slice(m[0].length); }
    else if ((m = /^(m7b5|m7♭5|min7b5|ø)/.exec(q))) { menor = true; suf = m[0] === 'ø' ? 'ø' + q.slice(1) : 'ø7' + q.slice(m[0].length); }
    else if ((m = /^(min|m|-)(?!aj)/.exec(q))) { menor = true; suf = q.slice(m[0].length); }
    else if ((m = /^(aug|\+)/.exec(q))) suf = '+' + q.slice(m[0].length);
    const num = menor ? ROMANOS[d].toLowerCase() : ROMANOS[d];
    let r = alt + num + suf;
    if (bajo) { const b = grado(bajo, tono); r += '/' + b.alt + (b.d + 1); }  // bajo = grado de la escala (D/F# en G → V/7)
    return r;
  }
  // Separadores de acorde: espacio o guion pegado a otro acorde (F#-G-A). Un guion seguido de número (A-7) es "menor", no separador.
  const compases = prog => prog.split('|').map(g => g.trim().split(/\s+/).flatMap(t => t.split(/-(?=[A-G])/)).filter(t => t && t !== '-')).filter(g => g.length);

  // Vibración corta al tocar (Android; el iPhone no la permite y simplemente no vibra).
  const vibra = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* nada */ } };
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button');
    if (b) vibra(Number(b.dataset.h) || 10);
  });

  // Enfoque: un toque en una parte atenúa las demás; otro toque en la misma restaura.
  let foco = -1;
  function aplicarFoco() {
    const caja = $('cancion');
    caja.classList.toggle('enfoque', foco >= 0);
    caja.querySelectorAll('.parte').forEach((x, i) => { x.classList.toggle('activa', i === foco); x.setAttribute('aria-pressed', String(i === foco)); });
  }

  // Pista "toca una parte": se ve hasta la primera vez que enfocas una parte, luego desaparece.
  const ENFOQUE = 'repertorio-enfoque-visto';
  const yaVisto = () => { try { return localStorage.getItem(ENFOQUE) === '1'; } catch (e) { return false; } };
  const marcarVisto = () => { try { localStorage.setItem(ENFOQUE, '1'); } catch (e) { /* nada */ } document.querySelectorAll('.pista-enfoque').forEach(n => n.remove()); };
  function parte(p, k) {
    const gs = compases(p.prog);
    // Cada compás va junto (no se parte entre dos líneas) y la barra | lo cierra.
    const hijos = gs.map((g, i) => el('span', { className: 'compas' },
      ...g.map(a => el('span', { className: 'chip' }, el('b', {}, a), el('i', { className: 'rom' }, romano(a, p.tono || actual.tono)))),
      i < gs.length - 1 && el('span', { className: 'barra' }, '|')));
    const alternar = () => { marcarVisto(); foco = foco === k ? -1 : k; aplicarFoco(); };
    return el('section', { className: 'parte' + (norm(p.nombre).trim() === 'coro' ? ' coro' : ''), tabIndex: 0, rol: 'button', 'aria-pressed': 'false',
      'aria-label': 'Enfocar parte ' + (p.nombre || (k + 1)), onclick: alternar,
      onkeydown: e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); alternar(); } } },
      el('h3', {}, p.nombre || '', p.tono && el('small', {}, ' · ' + p.tono)),
      el('div', { className: 'chips' }, ...hijos),
      p.pista && el('p', { className: 'pista' }, p.pista));
  }

  // Anterior / Siguiente siguen el orden y el filtro con los que abriste la canción.
  function irA(d) {
    const i = orden.indexOf(actual) + d;
    if (i < 0 || i >= orden.length) return;
    actual = ultima = orden[i];
    foco = -1;
    history.replaceState({ cancion: true }, '');
    mostrar();
    $('cancion').scrollTop = 0;
  }

  let obsTitulo = null;
  function mostrar() {
    const c = actual, caja = $('cancion');
    const partes = (c.partes || []).filter(p => p.prog);
    const pos = orden.indexOf(c);
    const enlace = /^https?:\/\//i.test(c.enlace || '') ? c.enlace : '';
    caja.classList.remove('oculta');
    ultimoY = 0;
    caja.setAttribute('aria-label', c.titulo);
    caja.replaceChildren(
      el('div', { className: 'cbarra' },
        el('button', { type: 'button', title: 'Volver (Esc)', onclick: () => history.back() }, '← Volver'),
        el('span', { className: 'ctitulo' }, c.titulo),
        el('button', { type: 'button', id: 'zmenos', 'aria-label': 'Letra más chica', onclick: () => cambiarZoom(-.15) }, 'A−'),
        el('button', { type: 'button', id: 'zmas', 'aria-label': 'Letra más grande', onclick: () => cambiarZoom(.15) }, 'A+')),
      el('div', { className: 'ccuerpo' },
        el('h2', {}, c.titulo),
        el('p', { className: 'a' }, [c.artista, c.nota].filter(Boolean).join(' · ')),
        el('p', { className: 'tonos' }, pastilla(c.tono)),
        enlace && el('p', { className: 'noimp' }, el('a', { href: enlace, target: '_blank', rel: 'noopener noreferrer' }, 'Escuchar referencia ↗')),
        partes.length > 0 && !yaVisto() && el('p', { className: 'a noimp pista-enfoque' }, 'Toca una parte para enfocarla.'),
        ...(partes.length ? partes.map((p, k) => parte(p, k)) : [el('p', { className: 'vacio' }, 'Aún no hay partes ni acordes para esta canción.')]),
        el('p', { className: 'noimp' }, el('button', { type: 'button', onclick: () => print() }, 'Imprimir'))),
      el('div', { className: 'cpie noimp' },
        el('button', { type: 'button', title: 'Anterior (←)', disabled: pos <= 0, onclick: () => irA(-1) }, '‹ Anterior'),
        el('span', { className: 'pos' }, orden.length > 1 && pos >= 0 ? (pos + 1) + ' / ' + orden.length : ''),
        el('button', { type: 'button', title: 'Siguiente (→)', disabled: pos < 0 || pos >= orden.length - 1, onclick: () => irA(1) }, 'Siguiente ›')));
    if (obsTitulo) obsTitulo.disconnect();
    if ('IntersectionObserver' in window) {
      const tit = caja.querySelector('.ctitulo');
      obsTitulo = new IntersectionObserver(([e]) => tit.classList.toggle('visto', !e.isIntersecting), { rootMargin: '-64px 0px 0px 0px' });
      obsTitulo.observe(caja.querySelector('h2'));
    } else caja.querySelector('.ctitulo').classList.add('visto');
    caja.style.setProperty('--z', zoom);
    topesZoom();
    aplicarFoco();
    caja.hidden = false;
    document.body.classList.add('fija');
  }

  // Las barras de arriba y de abajo se esconden al bajar y reaparecen al subir (o al llegar a un extremo).
  let ultimoY = 0;
  $('cancion').addEventListener('scroll', e => {
    const c = e.currentTarget, y = c.scrollTop;
    if (Math.abs(y - ultimoY) < 8) return;
    const baja = y > ultimoY, fin = c.scrollHeight - c.clientHeight - y < 40;
    ultimoY = y;
    c.classList.toggle('oculta', baja && y > 40 && !fin);
  }, { passive: true });

  // A− / A+ se apagan al llegar al límite, para que se note que no hay más.
  const topesZoom = () => { const a = $('zmenos'), b = $('zmas'); if (a) a.disabled = zoom <= .85; if (b) b.disabled = zoom >= 1.9; };
  function cambiarZoom(d) {
    zoom = Math.min(1.9, Math.max(.85, Math.round((zoom + d) * 100) / 100));
    guardar('repertorio-zoom', zoom);
    $('cancion').style.setProperty('--z', zoom);
    topesZoom();
  }

  let origenFoco = null;
  function abrirCancion(c, origen, lista) {
    origenFoco = origen || document.activeElement;
    actual = ultima = c;
    orden = lista && lista.length ? lista.slice() : visibles().map(r => r.c);
    foco = -1;
    history.pushState({ cancion: true }, '');
    mostrar();
    $('cancion').focus({ preventScroll: true });
    pantallaEncendida();
  }
  function cerrarCancion() {
    actual = null;
    $('cancion').hidden = true;
    document.body.classList.remove('fija');
    soltarPantalla();
    sincronizarFondo();
    if (origenFoco && origenFoco.isConnected) origenFoco.focus({ preventScroll: true });
    origenFoco = null;
  }
  window.addEventListener('popstate', () => { if (actual) cerrarCancion(); });

  function fila({ c, i }) {
    const cuerpo = el('button', { type: 'button', className: 'abrir', onclick: e => abrirCancion(c, e.currentTarget) },
      el('span', { className: 't' }, c.titulo),
      c.artista && el('span', { className: 'a' }, c.artista),
      c.nota && el('span', { className: 'a' }, c.nota));
    return [el('div', { className: 'fila' + (c === ultima ? ' ultima' : '') }, cuerpo, pastilla(c.tono), EDITOR && app.acciones && app.acciones(i))];
  }

  function render() {
    document.title = data.nombre || NOMBRE;
    $('titulo').textContent = data.nombre || NOMBRE;
    // La letra de la ficha y del icono de la pestaña salen de la primera letra del nombre (Ajustes → Página).
    const ini = ((data.nombre || NOMBRE).match(/[0-9A-Za-zÀ-ÿ]/) || ['R'])[0].toUpperCase();
    $('logo-l').textContent = ini;
    $('icono').href = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#2a2620"/><text x="16" y="24" font-size="22" text-anchor="middle" fill="#faf6ee" font-family="Georgia,serif" font-weight="700">${ini}</text></svg>`);
    $('intro').textContent = data.intro || '';
    $('pie').textContent = data.actualizado ? 'Actualizado: ' + data.actualizado + '.' : '';
    pastillas();
    const rows = visibles();
    $('cuenta').textContent = `${rows.length} de ${data.canciones.length}`;
    $('cuenta').classList.toggle('activo', Boolean(vista.q.trim() || vista.tono));
    $('lista').replaceChildren(...(rows.length
      ? rows.flatMap(fila)
      : [el('p', { className: 'vacio' }, data.canciones.length ? 'No hay canciones con esos filtros. ' : 'Aún no hay canciones.',
          data.canciones.length > 0 && el('button', { type: 'button', onclick: () => { vista.q = ''; vista.tono = ''; $('q').value = ''; render(); } }, 'Quitar filtros'))]));
    document.dispatchEvent(new Event('repertorio-render'));
  }

  // Acceso secreto al editor: 5 toques seguidos al título (en 3 segundos). No hay enlace visible.
  try { localStorage.removeItem('repertorio-editor'); } catch (e) { /* nada */ }
  let toques = [];
  document.querySelector('.marca').addEventListener('click', () => {
    const t = Date.now();
    toques = toques.filter(x => t - x < 3000).concat(t);
    if (!EDITOR && toques.length >= 5) location.search = '?editar';
  });

  $('q').addEventListener('input', e => { vista.q = e.target.value; render(); });

  // Atajos de teclado (PC y tablet con teclado). No actúan si escribes en un campo o hay una ventana del editor abierta.
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, escribiendo = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (document.querySelector('.capa')) return;
    const teoriaAbierta = !!document.querySelector('#teoria:not([hidden]), #practica:not([hidden])');
    if (e.key === 'Escape' && (actual || teoriaAbierta)) { history.back(); return; }
    if (escribiendo) return;
    if (actual) {
      if (e.key === 'ArrowLeft') { irA(-1); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { irA(1); e.preventDefault(); }
      else if (e.key === '+' || e.key === '=') cambiarZoom(.15);
      else if (e.key === '-') cambiarZoom(-.15);
    } else if (e.key === '/' && !teoriaAbierta) { e.preventDefault(); $('q').focus(); $('q').select(); }
  });

  // Interfaz que usa editor.js (solo se carga con ?editar)
  const app = window.RepertorioApp = {
    el, norm, render, abrirCancion, pastilla,
    buscar: q => { const palabras = fichas(q); return data.canciones.map(c => ({ c, p: puntaje(c, palabras) })).filter(x => x.p !== null).sort((a, b) => a.p - b.p || a.c.titulo.localeCompare(b.c.titulo, 'es')).map(x => x.c); },
    get data() { return data; },
    set data(d) { data = d; render(); },
    acciones: null
  };

  // Datos en el servidor (/api/canciones); si no responde, la copia incluida (canciones.js).
  let copia = false, editorCargado = false;
  const avisoRed = () => {
    const a = $('sin-red');
    a.hidden = !copia;
    a.textContent = copia ? 'Sin conexión o conexión lenta: se muestra la copia guardada en este dispositivo' + (data.actualizado ? ' (actualizada: ' + data.actualizado + ')' : '') + '. Se actualiza sola al volver la señal.' : '';
  };
  async function cargar(inicial = true) {
    if (inicial) $('cuenta').textContent = '…';
    let d = window.REPERTORIO, deCopia = false;
    try {
      const r = await fetch('/api/canciones', { cache: 'no-store' });
      if (r.ok) { d = await r.json(); deCopia = r.headers.get('X-Copia') === '1'; }
    } catch (e) { deCopia = true; /* sin red: se usa la copia guardada o la del sitio */ }
    if (!inicial && deCopia) return;               // reintento que sigue sin red: no se toca nada
    data = normalizar(d);
    copia = deCopia;
    if (actual) { const nueva = data.canciones.find(c => c.id && c.id === actual.id); if (nueva) actual = ultima = nueva; }
    render();
    avisoRed();
    if (EDITOR && !editorCargado) { editorCargado = true; document.head.append(el('script', { src: 'editor.js' })); }
  }
  // Si estabas viendo la copia, al volver la señal (o al volver a la pestaña) se intenta traer lo más nuevo.
  const reintentar = () => { if (copia && !EDITOR) cargar(false); };
  addEventListener('online', reintentar);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reintentar(); });
  // Modo offline: sw.js guarda la página y las canciones en el dispositivo (con internet siempre manda lo más nuevo).
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => { /* nada */ }));
  // Franja de 12 tonos (los mismos colores de las pastillas): C, C#, D … B.
  for (let i = 0; i < 12; i++) {
    const seg = el('span');
    seg.style.setProperty('--h', i * 30);
    seg.style.setProperty('--s', '34%');
    $('franja').append(seg);
  }
  cargar();
})();
