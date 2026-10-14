(() => {
  'use strict';

  const EDITOR = new URLSearchParams(location.search).has('editar');
  const NOTAS = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

  const $ = id => document.getElementById(id);
  const clone = o => JSON.parse(JSON.stringify(o));
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) k.includes('-') ? n.setAttribute(k, v) : (n[k] = v);
    n.append(...kids.flat().filter(k => k != null && k !== false));
    return n;
  };

  // --- tema (Papel / Escenario): arranca según el modo del teléfono y se recuerda ---
  const TEMA = 'repertorio-tema';
  const guardado = () => { try { return localStorage.getItem(TEMA); } catch (e) { return null; } };
  function aplicarTema(t) {
    document.documentElement.dataset.tema = t;
    $('tema').textContent = t === 'papel' ? 'Escenario' : 'Papel';
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

  // --- transposición (solo en pantalla: no cambia lo guardado) ---
  // Se transpone por intervalo con nombre de nota (G → A mueve F# a G#, no a Ab), igual que los romanos.
  const NOMBRE_MAYOR = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const NOMBRE_MENOR = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];
  const TONOS_PLANOS = new Set(['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Am', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']);
  const SOSTENIDOS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const BEMOLES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const RARAS = { Cb: 'B', Fb: 'E', 'E#': 'F', 'B#': 'C' };  // grafías que nadie escribe
  const trans = new Map();  // canción → semitonos (se olvida al recargar la página)
  const semis = c => trans.get(c) || 0;
  function planTransp(tono, n) {
    const k = nota(tono);
    if (!k || !n) return null;
    const menor = tono.slice(k.largo).startsWith('m');
    const destino = (menor ? NOMBRE_MENOR : NOMBRE_MAYOR)[(clase(k) + n + 120) % 12];
    return { n, destino, dl: (LETRAS.indexOf(destino[0]) - k.letra + 7) % 7, planos: TONOS_PLANOS.has(destino) };
  }
  function moverRaiz(r, plan) {
    const x = nota(r), letra = (x.letra + plan.dl) % 7;
    const objetivo = (clase(x) + plan.n + 120) % 12;
    const alt = ((objetivo - PC_LETRA[letra] + 18) % 12) - 6;
    const nombre = alt === 0 ? LETRAS[letra]
      : Math.abs(alt) === 1 ? LETRAS[letra] + (alt > 0 ? '#' : 'b')
      : (plan.planos ? BEMOLES : SOSTENIDOS)[objetivo];  // caso raro (doble alteración)
    return RARAS[nombre] || nombre;
  }
  function mover(texto, plan) {  // acorde o tono; también el bajo de "C/E"
    const m = plan && /^([A-G][#♯b♭]*)(.*)$/.exec(texto);
    if (!m) return texto;
    return moverRaiz(m[1], plan) + m[2].replace(/\/([A-G][#♯b♭]*)$/, (_, b) => '/' + moverRaiz(b, plan));
  }

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
    caja.querySelectorAll('.parte').forEach((x, i) => x.classList.toggle('activa', i === foco));
  }

  function parte(p, plan, k) {
    const hijos = [];
    compases(p.prog).forEach((g, i) => {
      if (i) hijos.push(el('span', { className: 'barra' }, '|'));
      // El acorde se transpone; el número romano sale del original (no cambia al transponer).
      g.forEach(a => hijos.push(el('span', { className: 'chip' }, el('b', {}, mover(a, plan)), el('i', { className: 'rom' }, romano(a, p.tono || actual.tono)))));
    });
    return el('section', { className: 'parte' + (norm(p.nombre).trim() === 'coro' ? ' coro' : ''), onclick: () => { foco = foco === k ? -1 : k; aplicarFoco(); } },
      el('h3', {}, p.nombre || '', p.tono && el('small', {}, ' · ' + mover(p.tono, plan))),
      el('div', { className: 'chips' }, ...hijos),
      p.pista && el('p', { className: 'pista' }, p.pista));
  }

  function transponer(d) {
    const caja = $('cancion'), y = caja.scrollTop;
    trans.set(actual, ((semis(actual) + d + 5) % 12 + 12) % 12 - 5);  // rango -5 … +6
    mostrar();
    caja.scrollTop = y;
    caja.style.setProperty('--dy', d > 0 ? '-6px' : '6px');
    caja.classList.add('rueda');
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

  function mostrar() {
    const c = actual, caja = $('cancion');
    const n = semis(c), plan = planTransp(c.tono, n);
    const partes = (c.partes || []).filter(p => p.prog);
    const pos = orden.indexOf(c);
    const enlace = /^https?:\/\//i.test(c.enlace || '') ? c.enlace : '';
    caja.classList.remove('rueda', 'oculta');
    caja.replaceChildren(
      el('div', { className: 'cbarra' },
        el('button', { type: 'button', onclick: () => history.back() }, '← Volver'),
        el('span', { className: 'ctitulo' }, c.titulo),
        el('button', { type: 'button', id: 'zmenos', 'aria-label': 'Letra más chica', onclick: () => cambiarZoom(-.15) }, 'A−'),
        el('button', { type: 'button', id: 'zmas', 'aria-label': 'Letra más grande', onclick: () => cambiarZoom(.15) }, 'A+')),
      el('div', { className: 'ccuerpo' },
        el('h2', {}, c.titulo),
        el('p', { className: 'a' }, [c.artista, c.nota].filter(Boolean).join(' · ')),
        el('p', { className: 'tonos' }, pastilla(plan ? plan.destino : c.tono),
          plan && el('span', { className: 'a' }, 'original ' + c.tono + ' · ' + (n > 0 ? '+' : '−') + Math.abs(n))),
        nota(c.tono) && el('p', { className: 'transp noimp' },
          el('span', { className: 'a' }, 'Transponer'),
          el('button', { type: 'button', 'data-h': '18', onclick: () => transponer(-1) }, '−1'),
          el('button', { type: 'button', 'data-h': '18', onclick: () => transponer(1) }, '+1'),
          n !== 0 && el('button', { type: 'button', 'data-h': '18', onclick: () => transponer(-n) }, 'Original')),
        enlace && el('p', { className: 'noimp' }, el('a', { href: enlace, target: '_blank', rel: 'noopener noreferrer' }, 'Escuchar referencia ↗')),
        ...(partes.length ? partes.map((p, k) => parte(p, plan, k)) : [el('p', { className: 'vacio' }, 'Aún no hay partes ni acordes para esta canción.')]),
        el('p', { className: 'noimp' }, el('button', { type: 'button', onclick: () => print() }, 'Imprimir'))),
      el('div', { className: 'cpie noimp' },
        el('button', { type: 'button', disabled: pos <= 0, onclick: () => irA(-1) }, '‹ Anterior'),
        el('span', { className: 'pos' }, orden.length > 1 && pos >= 0 ? (pos + 1) + ' / ' + orden.length : ''),
        el('button', { type: 'button', disabled: pos < 0 || pos >= orden.length - 1, onclick: () => irA(1) }, 'Siguiente ›')));
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

  function abrirCancion(c) {
    actual = ultima = c;
    orden = visibles().map(r => r.c);
    foco = -1;
    history.pushState({ cancion: true }, '');
    mostrar();
    pantallaEncendida();
  }
  function cerrarCancion() {
    actual = null;
    $('cancion').hidden = true;
    document.body.classList.remove('fija');
    soltarPantalla();
  }
  window.addEventListener('popstate', () => { if (actual) cerrarCancion(); });

  function fila({ c, i }) {
    const cuerpo = el('button', { type: 'button', className: 'abrir', onclick: () => abrirCancion(c) },
      el('span', { className: 't' }, c.titulo),
      c.artista && el('span', { className: 'a' }, c.artista),
      c.nota && el('span', { className: 'a' }, c.nota));
    return [el('div', { className: 'fila' + (c === ultima ? ' ultima' : '') }, cuerpo, pastilla(c.tono), EDITOR && app.acciones && app.acciones(i))];
  }

  function render() {
    document.title = data.nombre || 'Repertorio';
    $('titulo').textContent = data.nombre || 'Repertorio';
    // La letra de la ficha y del icono de la pestaña salen de la primera letra del nombre (Ajustes → Página).
    const ini = ((data.nombre || 'Repertorio').match(/[0-9A-Za-zÀ-ÿ]/) || ['R'])[0].toUpperCase();
    $('logo-l').textContent = ini;
    $('icono').href = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#2a2620"/><text x="16" y="24" font-size="22" text-anchor="middle" fill="#faf6ee" font-family="Georgia,serif" font-weight="700">${ini}</text></svg>`);
    $('intro').textContent = data.intro || '';
    $('pie').textContent = data.actualizado ? 'Actualizado: ' + data.actualizado : '';
    pastillas();
    const rows = visibles();
    $('cuenta').textContent = `${rows.length} de ${data.canciones.length}`;
    $('cuenta').classList.toggle('activo', Boolean(vista.q.trim() || vista.tono));
    $('lista').replaceChildren(...(rows.length
      ? rows.flatMap(fila)
      : [el('p', { className: 'vacio' }, data.canciones.length ? 'No hay canciones con esos filtros. ' : 'Aún no hay canciones.',
          data.canciones.length > 0 && el('button', { type: 'button', onclick: () => { vista.q = ''; vista.tono = ''; $('q').value = ''; render(); } }, 'Quitar filtros'))]));
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

  // Interfaz que usa editor.js (solo se carga con ?editar)
  const app = window.RepertorioApp = {
    el, norm, render,
    get data() { return data; },
    set data(d) { data = d; render(); },
    acciones: null
  };

  // Datos en el servidor (/api/canciones); si no responde, la copia incluida (canciones.js).
  async function cargar() {
    $('cuenta').textContent = '…';
    let d = window.REPERTORIO;
    try {
      const r = await fetch('/api/canciones', { cache: 'no-store' });
      if (r.ok) d = await r.json();
    } catch (e) { /* sin servidor: se usa la copia del sitio */ }
    data = normalizar(d);
    render();
    if (EDITOR) document.head.append(el('script', { src: 'editor.js' }));
  }
  // Versiones anteriores instalaron una copia offline (service worker). Se desinstala y se borra.
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => { /* nada */ });
  if ('caches' in window) caches.keys().then(ks => ks.forEach(k => caches.delete(k))).catch(() => { /* nada */ });
  // Franja de 12 tonos (los mismos colores de las pastillas): C, C#, D … B.
  for (let i = 0; i < 12; i++) {
    const seg = el('span');
    seg.style.setProperty('--h', i * 30);
    seg.style.setProperty('--s', '34%');
    $('franja').append(seg);
  }
  cargar();
})();
