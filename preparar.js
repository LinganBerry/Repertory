// "Preparar sin internet": con internet, baja y guarda de una vez todo lo que la página necesita (piano, Tone, Tonal, la fuente de las notas,
// tus canciones al día y los archivos de la página) y comprueba que quedó guardado. No toca el service worker (sw.js):
// él ya guarda cada archivo que se pide; esto solo los pide todos y verifica. Lo que no se pudo guardar se dice, no se oculta.
(function (raiz) {
  'use strict';
  const FUENTE = '/vendor/atril-notas.woff2';   // la usa estilos.css; no aparece en el DOM, por eso se nombra aquí
  const API = '/api/canciones';

  // Rutas locales sin repetir y sin "?algo". `pagina` y `audio` vienen de la propia página (no hay una lista copiada a mano).
  function armarLista({ origen, pagina = [], audio = [] }) {
    const vistas = new Set();
    for (const u of [...pagina, ...audio, FUENTE, API, '/']) {
      try { const x = new URL(u, origen + '/'); if (x.origin === origen) vistas.add(x.pathname); } catch (e) { /* url rara: se ignora */ }
    }
    return [...vistas];
  }

  // Pide cada archivo (hasta `paralelo` a la vez) y después comprueba en la copia guardada que de verdad esté.
  async function ejecutar({ urls, pedir, guardado, alAvanzar = () => {}, paralelo = 4 }) {
    const malos = new Set();
    let hechos = 0, i = 0;
    async function obrero() {
      while (i < urls.length) {
        const u = urls[i++];
        try { const r = await pedir(u); if (!r || !r.ok) malos.add(u); } catch (e) { malos.add(u); }
        alAvanzar(++hechos, urls.length);
      }
    }
    await Promise.all(Array.from({ length: Math.min(paralelo, urls.length) }, obrero));
    const faltan = [];
    for (const u of urls) {
      let esta = false;
      try { esta = !!(await guardado(u)); } catch (e) { esta = false; }
      if (!esta || malos.has(u)) faltan.push(u);   // si no se pudo pedir, no se da por listo aunque haya una copia vieja
    }
    return { total: urls.length, guardados: urls.length - faltan.length, faltan };
  }

  const api = { armarLista, ejecutar, FUENTE, API };
  raiz.Preparar = api;
  if (typeof document === 'undefined') return;

  // --- tarjeta dentro de Practicar ---
  const CLAVE = 'repertorio-preparado';
  const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE)); } catch (e) { return null; } };
  const guardarFecha = n => { try { localStorage.setItem(CLAVE, JSON.stringify({ f: new Date().toISOString(), n })); } catch (e) { /* nada */ } };
  const cuando = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('es', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); };

  api.tarjeta = () => {
    const el = (tag, props = {}, ...kids) => { const n = document.createElement(tag); Object.assign(n, props); n.append(...kids.flat().filter(k => k != null)); return n; };
    const previo = leer();
    const estado = el('p', { id: 'pp-estado', className: 'a' }, previo && previo.f ? `Última vez: ${cuando(previo.f)} · ${previo.n} archivos.` : 'Aún no la has preparado.');
    estado.setAttribute('aria-live', 'polite');
    const boton = el('button', { type: 'button', className: 'primario', id: 'pp-ir' }, 'Preparar ahora');
    boton.addEventListener('click', async () => {
      if (!navigator.onLine) { estado.textContent = 'Necesitas internet para prepararla. Hazlo con señal y vuelve.'; return; }
      if (!('caches' in window) || !navigator.serviceWorker) { estado.textContent = 'Este navegador no guarda archivos para usar sin internet.'; return; }
      if (!navigator.serviceWorker.controller) { estado.textContent = 'Recarga la página una vez con internet y vuelve a intentarlo.'; return; }
      boton.disabled = true; estado.textContent = 'Guardando…';
      try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* pedir que no lo borren es opcional */ }
      const mismo = u => { try { return new URL(u, location.href).origin === location.origin ? u : null; } catch (e) { return null; } };
      const pagina = [...document.querySelectorAll('script[src], link[rel~="stylesheet"][href], link[rel="manifest"][href], link[rel="apple-touch-icon"][href]')]
        .map(n => mismo(n.getAttribute('src') || n.getAttribute('href'))).filter(Boolean);
      const audio = raiz.RepertorioAudio && raiz.RepertorioAudio.archivos ? raiz.RepertorioAudio.archivos() : [];
      const urls = armarLista({ origen: location.origin, pagina, audio });
      const r = await ejecutar({
        urls, paralelo: 4,
        pedir: u => fetch(u, { cache: 'no-store' }),
        guardado: u => caches.match(u),
        alAvanzar: (h, t) => { estado.textContent = `Guardando… ${h} / ${t}`; }
      });
      boton.disabled = false;
      if (r.faltan.length) estado.textContent = `Faltaron ${r.faltan.length} de ${r.total} archivos. Prueba de nuevo con mejor señal.`;
      else { guardarFecha(r.total); estado.textContent = `Listo: ${r.total} archivos guardados. Ya puedes practicar sin internet.`; }
    });
    boton.textContent = 'Preparar';
    return el('div', { className: 'pr-fila', id: 'pr-preparar' },
      el('div', { className: 'pr-fila-txt' }, el('b', {}, 'Preparar sin internet'), el('span', { className: 'a' }, 'Una vez con señal: guarda el piano y todo lo de la página.'), estado), boton);
  };
})(typeof window !== 'undefined' ? window : globalThis);
