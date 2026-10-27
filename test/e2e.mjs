// Pruebas de extremo a extremo en un navegador simulado (jsdom): el servidor real (api/) con almacén falso.
// Ejecutar: npm i --no-save jsdom@30 && npm run test:e2e   (probado con jsdom 30.1.3)
// Limitación: jsdom no es un navegador real (no dibuja, no hay audio, no aplica CSS ni el atributo inert):
// comprueba la lógica y el DOM, no el aspecto ni el sonido.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

process.env.ADMIN_PASSWORD = 'clave-de-prueba-larga-123';
process.env.SESSION_SECRET = 's'.repeat(40);
let jsdom;
try { jsdom = await import('jsdom'); } catch { console.error('Falta jsdom: ejecuta  npm i --no-save jsdom@30'); process.exit(2); }
const { JSDOM, VirtualConsole, requestInterceptor } = jsdom.JSDOM ? jsdom : jsdom.default;
const { memoria } = await import('./blob-falso.mjs');
const canciones = await import('../api/canciones.js');
const entrar = await import('../api/entrar.js');

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
// Sirve los archivos del proyecto como si fueran el sitio publicado (y omite Tone.js, que necesita audio real).
const TIPOS = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };
const interceptor = requestInterceptor(async request => {
  const { pathname } = new URL(request.url);
  const tipo = { 'Content-Type': TIPOS[pathname.slice(pathname.lastIndexOf('.'))] || 'application/octet-stream' };
  if (pathname === '/vendor/Tone.js') return new Response('/* Tone.js se omite: jsdom no tiene audio */', { headers: tipo });
  try { return new Response(await readFile(join(RAIZ, pathname)), { headers: tipo }); }
  catch { return new Response('no existe', { status: 404 }); }
});
const esperar = async (cond, que, ms = 6000) => {
  const fin = Date.now() + ms;
  for (;;) { try { const v = await cond(); if (v) return v; } catch { /* aún no */ } if (Date.now() > fin) throw new Error('Se agotó la espera: ' + que); await new Promise(r => setTimeout(r, 15)); }
};

async function navegador(busqueda = '', red = {}) {
  const html = await readFile(join(RAIZ, 'index.html'), 'utf8');
  const errores = [], vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/Not implemented/.test(e.message)) errores.push(e.stack || e.message); });
  const dom = new JSDOM(html, {
    url: 'http://prueba.local/' + busqueda, runScripts: 'dangerously', resources: { interceptors: [interceptor] }, pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.fetch = async (url, opts = {}) => {
        if (red.caido) throw new TypeError('sin red');
        const u = new URL(url, 'http://prueba.local');
        const req = () => new Request(u.href, { method: opts.method || 'GET', headers: { 'x-vercel-forwarded-for': '7.7.7.7', ...(opts.headers || {}) }, body: opts.body });
        let r;
        if (u.pathname === '/api/canciones') r = opts.method === 'POST' ? await canciones.POST(req()) : await canciones.GET();
        else if (u.pathname === '/api/entrar') r = await entrar.POST(req());
        else return new Response('no existe', { status: 404 });
        if (red.copia && r.ok) { const h = new Headers(r.headers); h.set('X-Copia', '1'); return new Response(await r.text(), { status: r.status, headers: h }); }
        return r;
      };
    }
  });
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  await new Promise(ok => (d.readyState === 'complete' ? ok() : w.addEventListener('load', ok)));
  await esperar(() => $('cuenta').textContent !== '…' && $('cuenta').textContent !== '', 'que cargue el repertorio');
  const escribir = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const tecla = (objetivo, key) => objetivo.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const boton = (texto, raiz = d) => [...raiz.querySelectorAll('button')].find(b => b.textContent.trim() === texto);
  return { dom, w, d, $, errores, escribir, tecla, boton, cerrar: () => w.close() };
}
const sinErrores = n => assert.deepEqual(n.errores, [], 'errores de JavaScript en la página:\n' + n.errores.join('\n'));

test('estructura de index.html: etiquetas, un solo h1, OG, manifest y salto al contenido', async () => {
  const html = await readFile(join(RAIZ, 'index.html'), 'utf8');
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  for (const f of [/<html lang="es"/, /name="description"/, /property="og:image" content="https:\/\/[^"]+\/og\.png"/, /rel="manifest"/, /rel="apple-touch-icon"/, /class="saltar"/, /id="q"[^>]*aria-label=/, /viewport-fit=cover/, /noindex/])
    assert.match(html, f, String(f));
  assert.doesNotMatch(html, /\sstyle=/, 'sin estilos en línea (la CSP los bloquea)');
  const m = JSON.parse(await readFile(join(RAIZ, 'manifest.webmanifest'), 'utf8'));
  for (const i of m.icons) assert.ok(await readFile(join(RAIZ, i.src)), 'existe ' + i.src);
  assert.ok(m.icons.some(i => i.sizes === '192x192') && m.icons.some(i => i.sizes === '512x512') && m.icons.some(i => i.purpose === 'maskable'));
});

test('primera visita sin datos: lista vacía, sin aviso de "sin conexión" y sin errores', async () => {
  memoria.clear();
  const n = await navegador();
  assert.equal(n.$('sin-red').hidden, true);
  assert.equal(n.d.querySelectorAll('#lista .fila').length, 0);
  sinErrores(n); n.cerrar();
});

let titulo = 'Cuán grande es Él';
test('TELÉFONO: entrar al editor, validar y agregar una canción', async () => {
  const n = await navegador('?editar');
  const { d, $, escribir, tecla, boton, w } = n;
  const pass = await esperar(() => d.querySelector('.capa input[type=password]'), 'ventana de contraseña');
  assert.equal(d.querySelector('.capa').getAttribute('role'), 'dialog');
  assert.equal(d.activeElement, pass, 'el foco va a la contraseña');
  assert.equal($('app').inert, true, 'el fondo queda inerte');
  escribir(pass, 'incorrecta'); boton('Entrar').click();
  await esperar(() => /incorrecta/.test(d.querySelector('.capa .aviso-e').textContent), 'mensaje de contraseña incorrecta');
  escribir(pass, process.env.ADMIN_PASSWORD); boton('Entrar').click();
  await esperar(() => !d.querySelector('.capa'), 'que cierre la ventana de entrada');
  assert.equal($('app').inert, false, 'el fondo vuelve a estar activo');

  const nueva = boton('+ Nueva'); nueva.click();
  await esperar(() => $('f-titulo'), 'formulario');
  assert.equal(d.querySelector('.capa').getAttribute('aria-label'), 'Nueva canción');
  assert.equal($('f-titulo').maxLength, 200); assert.equal($('f-nota').maxLength, 300); assert.equal($('f-enlace').maxLength, 300);
  escribir($('f-titulo'), titulo); escribir($('f-artista'), 'Zaenlly'); escribir($('f-tono'), 'G');

  escribir($('f-partes'), 'Verso: ' + 'G D '.repeat(130));                      // 520 caracteres: pasa el límite
  assert.match($('avisos').textContent, /pasan de 500/);
  boton('Guardar').click();
  await esperar(() => /Corrige los errores/.test($('f-msg').textContent), 'bloqueo por exceso de longitud');
  assert.equal(JSON.parse(memoria.get('repertorio/canciones.json')?.texto || '{"canciones":[]}').canciones.length, 0, 'nada se guardó');

  escribir($('f-partes'), 'Verso: G D | Em C // entra suave\nCoro (A): A E | F#m D');
  assert.equal($('avisos').textContent, '');
  boton('Guardar').click();
  await esperar(() => !d.querySelector('.capa'), 'que se guarde y cierre');
  await esperar(() => [...d.querySelectorAll('#lista .fila')].some(f => f.textContent.includes(titulo)), 'que aparezca en la lista');
  const guardada = JSON.parse(memoria.get('repertorio/canciones.json').texto).canciones[0];
  assert.deepEqual(guardada.partes.map(p => [p.nombre, p.tono, p.prog]), [['Verso', '', 'G D | Em C'], ['Coro', 'A', 'A E | F#m D']]);

  // Esc cierra la ventana y devuelve el foco al botón que la abrió
  boton('+ Nueva').click(); await esperar(() => $('f-titulo'), 'formulario otra vez');
  tecla(d.querySelector('.capa'), 'Escape');
  await esperar(() => !d.querySelector('.capa'), 'Esc cierra el formulario');
  assert.equal(d.activeElement.textContent.trim(), '+ Nueva');
  sinErrores(n); n.cerrar();
});

test('PC: la canción guardada desde el teléfono se ve, se busca, se abre y se cierra con Esc', async () => {
  const n = await navegador();
  const { d, $, escribir, tecla, w } = n;
  await esperar(() => d.querySelectorAll('#lista .fila').length === 1, 'la lista con 1 canción');
  assert.equal($('sin-red').hidden, true);

  tecla(d, '/');
  assert.equal(d.activeElement, $('q'), 'el atajo / enfoca el buscador');
  escribir($('q'), 'zzzz'); await esperar(() => d.querySelectorAll('#lista .fila').length === 0, 'sin resultados');
  escribir($('q'), 'grande'); await esperar(() => d.querySelectorAll('#lista .fila').length === 1, 'resultado de buscar');

  const abrir = d.querySelector('#lista .fila button'); abrir.focus(); abrir.click();
  const caja = $('cancion');
  await esperar(() => !caja.hidden && !caja.classList.contains('oculta'), 'que abra la canción');
  assert.ok(d.body.classList.contains('fija'));
  assert.equal($('app').inert, true);
  assert.equal(d.activeElement, caja, 'el foco pasa al panel');
  assert.equal(caja.getAttribute('aria-label'), titulo);
  assert.match(caja.textContent, /Verso.*Em.*entra suave.*Coro/s);

  const parte = caja.querySelector('.parte');
  assert.equal(parte.tabIndex, 0); assert.equal(parte.getAttribute('role'), 'button');
  assert.equal(parte.getAttribute('aria-pressed'), 'false');
  tecla(parte, 'Enter'); assert.equal(parte.getAttribute('aria-pressed'), 'true', 'Enter activa el enfoque de la parte');
  tecla(parte, ' ');     assert.equal(parte.getAttribute('aria-pressed'), 'false', 'Espacio lo desactiva');

  const zoomAntes = caja.style.getPropertyValue('--z');
  tecla(d, '+'); assert.notEqual(caja.style.getPropertyValue('--z'), zoomAntes, '+ agranda la letra');

  tecla(d, 'Escape');
  await esperar(() => caja.hidden || caja.classList.contains('oculta'), 'Esc cierra la canción');
  assert.equal($('app').inert, false);
  await esperar(() => d.activeElement === abrir, 'el foco vuelve a la canción de la lista');
  sinErrores(n); n.cerrar();
});

test('TEORÍA: abrir, calcular tonalidades (armadura, relativa, acordes) y cerrar con Esc', async () => {
  const n = await navegador();
  const { d, $, boton, tecla } = n;
  const btn = $('teoria-btn'); btn.focus(); btn.click();
  const t = $('teoria');
  await esperar(() => !t.hidden && boton('Tonalidades', t), 'pantalla de Teoría con pestañas');
  assert.equal(t.getAttribute('role'), 'dialog'); assert.equal(d.activeElement, t);
  boton('Tonalidades', t).click();
  await esperar(() => /Sin alteraciones/.test(t.textContent), 'C mayor: sin alteraciones');
  boton('A', t).click();
  await esperar(() => /3 sostenidos: F♯ C♯ G♯/.test(t.textContent), 'A mayor: 3 sostenidos');
  assert.match(t.textContent, /Relativa: F#m \(menor\)/);
  assert.equal(t.querySelectorAll('.parte .chips .chip').length >= 7, true);
  boton('Menor', t).click();
  await esperar(() => /A menor/.test(t.querySelector('h2').textContent), 'A menor');
  assert.match(t.textContent, /Relativa: C mayor/); assert.match(t.textContent, /0 alteraciones|Sin alteraciones/);
  assert.match(t.textContent, /Armónica.*G#/); assert.ok(boton('▶ i–iv–V–i', t));
  boton('F#', t).click();
  await esperar(() => /F# menor/.test(t.querySelector('h2').textContent), 'F# menor');
  assert.match(t.textContent, /3 sostenidos: F♯ C♯ G♯/, 'F#m comparte armadura con A mayor');
  tecla(d, 'Escape');
  await esperar(() => t.hidden, 'Esc cierra Teoría');
  await esperar(() => d.activeElement === btn, 'el foco vuelve al botón Teoría');
  sinErrores(n); n.cerrar();
});

test('SIN CONEXIÓN: muestra el aviso de copia y lo quita al volver la señal', async () => {
  const red = { copia: true };
  const n = await navegador('', red);
  const { d, $, w } = n;
  assert.equal($('sin-red').hidden, false);
  assert.match($('sin-red').textContent, /copia guardada/);
  assert.equal(d.querySelectorAll('#lista .fila').length, 1, 'la copia muestra las canciones');
  red.copia = false; w.dispatchEvent(new w.Event('online'));
  await esperar(() => $('sin-red').hidden, 'que el aviso desaparezca al volver la señal');
  sinErrores(n); n.cerrar();

  const caido = await navegador('', { caido: true });          // sin red y sin copia guardada: usa canciones.js
  assert.equal(caido.$('sin-red').hidden, false);
  sinErrores(caido); caido.cerrar();
});
