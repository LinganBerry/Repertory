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
const progreso = await import('../api/progreso.js');

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
        else if (u.pathname === '/api/progreso') r = await progreso.POST(req());
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
  for (const f of [/<html lang="es"/, /name="description"/, /property="og:image" content="https:\/\/[^"]+\/og\.png"/, /rel="manifest"/, /rel="apple-touch-icon"/, /class="saltar"/, /id="practica-btn"/, /src="notacion\.js"/, /src="practicar\.js"/, /id="q"[^>]*aria-label=/, /viewport-fit=cover/, /noindex/])
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

test('LISTAS DEL CULTO: crear, agregar, ordenar, recorrer con Siguiente, atrás y borrar', async () => {
  memoria.clear();
  const doc = { version: 2, nombre: 'Acordes y Tonos', intro: '', canciones: ['Aleluya', 'Brillas', 'Cristo'].map((t, i) => ({ id: 'id' + i, titulo: t, artista: 'X', tono: 'G', partes: [{ nombre: 'Verso', tono: '', prog: 'G D | Em C' }] })) };
  memoria.set('repertorio/canciones.json', { texto: JSON.stringify(doc), etag: '"e0"' });
  const n = await navegador();
  const { d, $, w, escribir, tecla, boton } = n;
  w.confirm = () => true;
  await esperar(() => d.querySelectorAll('#lista .fila').length === 3, 'las 3 canciones');
  assert.equal($('nav').parentElement, $('app'), 'la barra de abajo está dentro de #app (se bloquea con las capas)');
  assert.equal($('teoria-btn').parentElement, $('nav')); assert.equal($('practica-btn').parentElement, $('nav'));
  assert.equal($('nav-canciones').getAttribute('aria-current'), 'page');

  $('nav-listas').click();
  assert.equal($('app').dataset.vista, 'listas');
  assert.equal($('nav-listas').getAttribute('aria-current'), 'page'); assert.equal($('nav-canciones').getAttribute('aria-current'), null);
  assert.match($('listas').textContent, /Aún no tienes listas/);

  escribir($('listas').querySelector('input'), 'Domingo'); boton('Crear', $('listas')).click();
  await esperar(() => $('l-agregar'), 'la lista nueva se abre ya en modo editar');
  assert.equal($('listas').querySelector('h2').textContent, 'Domingo');
  assert.equal($('l-empezar').disabled, true, 'vacía: no se puede empezar');

  $('l-agregar').click();
  await esperar(() => d.querySelectorAll('#listas .fila').length === 3, 'las 3 canciones para elegir');
  const elegir = t => [...d.querySelectorAll('#listas .fila .abrir')].find(b => b.textContent.includes(t));
  elegir('Cristo').click(); elegir('Aleluya').click(); elegir('Aleluya').click();   // el segundo toque no la duplica
  assert.match(elegir('Cristo').textContent, /✓ En la lista/); assert.equal(elegir('Cristo').disabled, true);
  escribir($('listas').querySelector('input[type=search]'), 'brilas');               // tolera un error de escritura
  await esperar(() => d.querySelectorAll('#listas .fila').length === 1, 'búsqueda con error de escritura');
  $('l-listo').click();
  const titulos = () => [...d.querySelectorAll('#listas .fila .t')].map(x => x.textContent);
  assert.deepEqual(titulos(), ['1. Cristo', '2. Aleluya']);

  d.querySelector('[data-mov="1:-1"]').click();                                      // sube Aleluya
  assert.deepEqual(titulos(), ['1. Aleluya', '2. Cristo']);
  assert.equal(d.querySelector('[data-mov="0:-1"]').disabled, true, 'la primera no puede subir');
  boton('Listo', $('listas')).click();
  assert.equal(d.querySelectorAll('#listas .fila-acciones').length, 0, 'fuera de editar no hay botones que se toquen sin querer');
  assert.deepEqual(JSON.parse(w.localStorage.getItem('repertorio-listas'))[0].ids, ['id0', 'id2']);

  $('l-empezar').click();
  const caja = $('cancion');
  await esperar(() => !caja.hidden && caja.getAttribute('aria-label') === 'Aleluya', 'abre la primera de la lista');
  assert.match(caja.querySelector('.pos').textContent, /1 \/ 2/);
  tecla(d, 'ArrowRight');
  await esperar(() => caja.getAttribute('aria-label') === 'Cristo', 'Siguiente sigue el orden de la lista (salta Brillas)');
  assert.match(caja.querySelector('.pos').textContent, /2 \/ 2/);
  tecla(d, 'Escape');
  await esperar(() => caja.hidden, 'Esc cierra la canción');
  assert.match($('listas').textContent, /Aleluya/, 'al cerrar la canción sigues dentro de la lista');
  assert.equal($('app').inert, false);

  w.history.back();
  await esperar(() => /Listas del culto/.test($('listas').textContent) && $('listas').querySelector('input'), 'Atrás vuelve a la lista de listas');
  assert.match($('listas').textContent, /Domingo/); assert.match($('listas').textContent, /2 canciones/);

  d.querySelector('#listas .fila .abrir').click();
  await esperar(() => $('l-empezar'), 'abre la lista otra vez');
  boton('Editar', $('listas')).click(); boton('Borrar lista', $('listas')).click();
  await esperar(() => /Aún no tienes listas/.test($('listas').textContent), 'borrada: vuelve a la lista de listas, vacía');
  assert.equal(d.querySelectorAll('#lista .fila').length, 3, 'borrar la lista no borra canciones');
  $('nav-canciones').click();
  assert.equal($('app').dataset.vista, 'canciones');
  sinErrores(n); n.cerrar();
});

// --- Practicar ---
const PASE = process.env.ADMIN_PASSWORD;
async function abrirPractica(n) {
  n.w.RepertorioPractica.CFG.pausa = 0;                       // sin esperas en las pruebas
  const btn = n.$('practica-btn'); btn.focus(); btn.click();
  await esperar(() => !n.$('practica').hidden && n.$('practica').querySelector('.pr-tema'), 'pantalla de Practicar');
  return n.$('practica');
}
const pregunta = n => n.w.RepertorioPractica.estadoSesion().preg;
async function contestar(n, bien, { teclado = false } = {}) {
  const ses = n.w.RepertorioPractica.estadoSesion(), p = ses.preg, i = ses.i;
  if (p.tipo === 'pentagrama' || p.tipo === 'escala') {
    const letra = bien ? p.respuesta.l : n.w.Notacion.LETRAS[(n.w.Notacion.LETRAS.indexOf(p.respuesta.l) + 3) % 7];
    if (p.respuesta.a !== undefined && n.d.querySelector('[data-mod]') && bien) n.d.querySelector(`[data-mod="${p.respuesta.a}"]`).click();
    n.d.querySelector(`[data-letra="${letra}"]`).click();
  } else if (p.tipo === 'oido' || p.tipo === 'armadura' || p.tipo === 'cuantas') {
    const otro = n.w.Notacion.botones(ses.tema, ses.nivel).opciones.find(o => o.id !== p.respuesta.id).id;
    n.d.querySelector(`[data-op="${bien ? p.respuesta.id : otro}"]`).click();
  } else if (p.tipo === 'teclado') {
    n.d.querySelector(`[data-pc="${bien ? p.respuesta.pc : (p.respuesta.pc + 1) % 12}"]`)?.click() || n.w.RepertorioPractica.responder({ pc: (p.respuesta.pc + 1) % 12 });
  } else {
    const m = 12 * 5 + (bien ? p.respuesta.pc : (p.respuesta.pc + 1) % 12);
    n.d.querySelector(`#practica rect[data-midi="${m}"]`).dispatchEvent(new n.w.MouseEvent('click', { bubbles: true }));
  }
  await esperar(() => n.w.RepertorioPractica.estadoSesion()?.i > i || !n.w.RepertorioPractica.estadoSesion(), 'que se registre la respuesta');
}
async function sesionCompleta(n, total, fallos) {
  for (let i = 0; i < total; i++) {
    await esperar(() => n.w.RepertorioPractica.estadoSesion()?.preg && n.w.RepertorioPractica.estadoSesion().fase === 'pregunta', 'siguiente pregunta');
    await contestar(n, i >= fallos);
    if (n.w.RepertorioPractica.estadoSesion()?.fase === 'feedback' && n.$('pr-sig')) n.$('pr-sig').click();
  }
}

test('PRACTICAR (teléfono): sesión de 10 preguntas en clave de sol, resultado y guardado local', async () => {
  memoria.clear();
  const n = await navegador();
  const cuerpo = await abrirPractica(n);
  assert.equal(cuerpo.getAttribute('role'), 'dialog'); assert.equal(n.d.activeElement, cuerpo); assert.equal(n.$('app').inert, true);
  assert.match(cuerpo.textContent, /solo en este dispositivo/i);
  assert.doesNotMatch(cuerpo.textContent, /Entrar0|^0|\b0Pentagrama/, 'no se cuelan ceros en la pantalla');
  [...n.d.querySelectorAll('[data-tema="sol"] button')].find(b => /Empezar · 10/.test(b.textContent)).click();
  await esperar(() => n.w.RepertorioPractica.estadoSesion()?.preg, 'primera pregunta');
  assert.ok(n.d.querySelector('#practica svg.pentagrama'), 'se ve el pentagrama');
  assert.equal(n.d.querySelectorAll('#practica [data-letra]').length, 7);
  await sesionCompleta(n, 10, 2);
  await esperar(() => n.$('pr-resultado'), 'pantalla de resultado');
  assert.match(n.$('pr-resultado').textContent, /8 de 10 · 80%/);
  assert.equal(n.d.activeElement, n.$('pr-resultado'));
  assert.match(n.$('practica').textContent, /Fallos de esta sesión/);
  const { pend } = n.w.RepertorioPractica.datos;
  assert.equal(pend.length, 1); assert.equal(pend[0].n, 10); assert.equal(pend[0].a, 8); assert.equal(pend[0].t, 'sol');
  assert.ok(JSON.parse(n.w.localStorage.getItem('repertorio-practica-v1')).pend.length === 1, 'quedó guardado en el dispositivo');
  assert.equal(memoria.has('repertorio/progreso.json'), false, 'sin contraseña no se sube nada');
  sinErrores(n); n.cerrar();
});

test('PRACTICAR: entrar con la contraseña sincroniza, y otro dispositivo ve el mismo progreso', async () => {
  memoria.clear();
  const a = await navegador('');
  await abrirPractica(a);
  [...a.d.querySelectorAll('[data-tema="fa"] button')].find(b => /Empezar · 10/.test(b.textContent)).click();
  await esperar(() => a.w.RepertorioPractica.estadoSesion()?.preg, 'sesión en clave de fa');
  await sesionCompleta(a, 10, 0);
  await esperar(() => a.$('pr-resultado'), 'resultado');
  assert.match(a.$('pr-resultado').textContent, /10 de 10 · 100%/);
  [...a.d.querySelectorAll('#practica button')].find(b => b.textContent === 'Otro ejercicio').click();
  await esperar(() => a.d.querySelector('#practica details'), 'formulario de entrada');
  a.d.querySelector('#pr-pass').value = PASE; a.d.querySelector('#practica details .primario').click();
  await esperar(() => /Sincronizado/.test(a.$('pr-estado')?.textContent || ''), 'estado sincronizado');
  assert.equal(a.w.RepertorioPractica.datos.pend.length, 0);
  const guardado = JSON.parse(memoria.get('repertorio/progreso.json').texto);
  assert.equal(guardado.sesiones.length, 1); assert.equal(guardado.sesiones[0].t, 'fa');
  sinErrores(a); a.cerrar();

  const b = await navegador('');                              // "la laptop": otro navegador, sin nada guardado
  assert.equal(b.w.RepertorioPractica.todas().length, 0);
  await abrirPractica(b);
  b.d.querySelector('#practica details summary').click();
  b.d.querySelector('#pr-pass').value = PASE; b.d.querySelector('#practica details .primario').click();
  await esperar(() => /Sincronizado/.test(b.$('pr-estado')?.textContent || '') && /Hoy: 10 preguntas/.test(b.$('practica').textContent), 'el otro dispositivo ve las 10 preguntas de hoy');
  assert.match(b.$('practica').textContent, /Racha: 1 día/);
  assert.match(b.d.querySelector('[data-tema="fa"]').textContent, /100%/);
  sinErrores(b); b.cerrar();
});

test('PRACTICAR: teclado del ordenador (letras, # y -), alteraciones y salir con Esc guarda la sesión a medias', async () => {
  memoria.clear();
  const n = await navegador('');
  await abrirPractica(n);
  [...n.d.querySelectorAll('[data-tema="sol"] .tg button')].find(b => /^5 /.test(b.textContent)).click();
  await esperar(() => n.d.querySelector('[data-tema="sol"] [aria-pressed="true"]')?.textContent.startsWith('5'), 'nivel 5 elegido');
  [...n.d.querySelectorAll('[data-tema="sol"] button')].find(b => /Empezar · 20/.test(b.textContent)).click();
  await esperar(() => n.w.RepertorioPractica.estadoSesion()?.preg, 'pregunta con alteraciones');
  assert.ok(n.d.querySelector('[data-mod]'), 'aparecen los botones de alteración');
  for (let i = 0; i < 4; i++) {
    await esperar(() => n.w.RepertorioPractica.estadoSesion().fase === 'pregunta', 'turno de responder');
    const p = pregunta(n);
    n.tecla(n.d, p.respuesta.a === 1 ? '#' : p.respuesta.a === -1 ? '-' : '0');
    assert.equal(n.d.querySelector(`[data-mod="${p.respuesta.a}"]`).getAttribute('aria-pressed'), 'true');
    n.tecla(n.d, p.respuesta.l.toLowerCase());
    await esperar(() => n.w.RepertorioPractica.estadoSesion().hechas.length === i + 1, 'respuesta por teclado');
    assert.equal(n.w.RepertorioPractica.estadoSesion().hechas[i][1], 1, 'la respuesta por teclado es correcta: ' + p.item);
  }
  n.tecla(n.d, 'Escape');
  await esperar(() => n.$('pr-diaria'), 'Esc sale de la sesión y vuelve al menú de Practicar');
  assert.equal(n.$('practica').hidden, false, 'Practicar sigue abierto: solo se salió de la sesión');
  assert.equal(n.w.RepertorioPractica.datos.pend.length, 1, 'se guardó la sesión a medias');
  assert.equal(n.w.RepertorioPractica.datos.pend[0].n, 4);
  n.tecla(n.d, 'Escape');
  await esperar(() => n.$('practica').hidden, 'Esc desde el menú cierra Practicar');
  assert.equal(n.$('app').inert, false);
  await esperar(() => n.d.activeElement === n.$('practica-btn'), 'el foco vuelve al botón Practicar');
  sinErrores(n); n.cerrar();
});

test('PRACTICAR: teclado de piano (nombrar la tecla y tocar la tecla)', async () => {
  memoria.clear();
  const n = await navegador('');
  await abrirPractica(n);
  [...n.d.querySelectorAll('[data-tema="teclado"] button')].find(b => /Empezar · 10/.test(b.textContent)).click();
  await esperar(() => n.w.RepertorioPractica.estadoSesion()?.preg, 'pregunta de teclado');
  assert.equal(n.d.querySelectorAll('#practica rect.pk-on').length, 1, 'hay una tecla marcada');
  await contestar(n, false);
  assert.ok(n.d.querySelector('#practica .pr-feedback.mal'), 'se muestra el fallo'); assert.match(n.d.querySelector('.pr-feedback').textContent, /Era /);
  n.d.querySelector('#pr-sig').click();
  await esperar(() => n.w.RepertorioPractica.estadoSesion().fase === 'pregunta', 'siguiente');
  await contestar(n, true);
  n.cerrar();
  const m = await navegador('');
  await abrirPractica(m);
  [...m.d.querySelectorAll('[data-tema="tecla"] button')].find(b => /Empezar · 10/.test(b.textContent)).click();
  await esperar(() => m.w.RepertorioPractica.estadoSesion()?.preg, 'pregunta de tocar tecla');
  assert.equal(m.d.querySelectorAll('#practica rect[data-midi][tabindex="0"]').length, 24, 'las 24 teclas se alcanzan con el teclado');
  await contestar(m, false);
  assert.ok(m.d.querySelector('#practica rect.pk-mal') && m.d.querySelector('#practica rect.pk-ok'), 'se marca la tocada (roja) y la correcta (verde)');
  m.d.querySelector('#pr-sig').click();
  await esperar(() => m.w.RepertorioPractica.estadoSesion().fase === 'pregunta', 'siguiente');
  await contestar(m, true);
  sinErrores(m); m.cerrar();
});

const audioFalso = (n, { falla = false } = {}) => {
  const a = { llamadas: [], async tocar(p) { if (falla) throw new Error('sin sonido'); this.llamadas.push(p); }, detener() {}, esPiano: () => true };
  n.w.RepertorioAudio = a; return a;
};
const empezarTema = async (n, tema, total = 10, nivel = 0) => {
  if (nivel) { [...n.d.querySelectorAll(`[data-tema="${tema}"] .tg button`)].find(b => b.textContent.startsWith(nivel + ' ')).click(); await esperar(() => n.d.querySelector(`[data-tema="${tema}"] [aria-pressed="true"]`)?.textContent.startsWith(nivel + ' '), 'nivel elegido'); }
  [...n.d.querySelectorAll(`[data-tema="${tema}"] button`)].find(b => new RegExp('Empezar · ' + total).test(b.textContent)).click();
  await esperar(() => n.w.RepertorioPractica.estadoSesion()?.preg, 'primera pregunta de ' + tema);
};

test('PRACTICAR (oído): intervalos que suben: suena al empezar, se repite con R, y al fallar suena de nuevo y muestra las notas', async () => {
  memoria.clear();
  const n = await navegador('');
  await abrirPractica(n);
  const audio = audioFalso(n);
  await empezarTema(n, 'int-asc', 10);
  assert.equal(audio.llamadas.length, 1, 'suena sola al aparecer la pregunta');
  assert.equal(audio.llamadas[0].length, 2, 'dos notas, una después de la otra');
  assert.equal(n.d.querySelectorAll('#practica [data-op]').length, 4); assert.ok(n.$('pr-oir')); assert.equal(n.d.querySelector('#practica svg'), null, 'sin dibujos que den la respuesta');
  n.tecla(n.d, 'r'); assert.equal(audio.llamadas.length, 2, 'R repite');
  n.$('pr-oir').click(); assert.equal(audio.llamadas.length, 3, 'el botón repite');
  await contestar(n, false);
  assert.match(n.d.querySelector('.pr-feedback').textContent, /Era .*\(.*→.*\).*dijiste/s);
  assert.equal(audio.llamadas.length, 4, 'al fallar vuelve a sonar la respuesta correcta');
  n.$('pr-sig').click();
  await esperar(() => n.w.RepertorioPractica.estadoSesion().fase === 'pregunta', 'siguiente');
  const opciones = n.w.Notacion.botones('int-asc', 1).opciones, p = pregunta(n);
  n.tecla(n.d, String(opciones.findIndex(o => o.id === p.respuesta.id) + 1));
  await esperar(() => n.w.RepertorioPractica.estadoSesion().hechas.length === 2, 'respuesta con el número');
  assert.equal(n.w.RepertorioPractica.estadoSesion().hechas[1][1], 1, 'la tecla de número elige esa opción');
  await sesionCompleta(n, 8, 0);
  await esperar(() => n.$('pr-resultado'), 'resultado');
  assert.match(n.$('pr-resultado').textContent, /9 de 10 · 90%/);
  const s = n.w.RepertorioPractica.datos.pend[0];
  assert.equal(s.t, 'int-asc'); assert.ok(s.q.every(x => x[0].startsWith('ia:')));
  sinErrores(n); n.cerrar();
});

test('PRACTICAR (oído): acordes (un solo golpe de varias notas) y sonido que no carga', async () => {
  memoria.clear();
  const n = await navegador('');
  await abrirPractica(n);
  const audio = audioFalso(n);
  await empezarTema(n, 'acordes', 10, 3);
  assert.equal(audio.llamadas[0].length, 1); assert.ok(audio.llamadas[0][0].midis.length >= 3, 'las notas del acorde suenan juntas');
  assert.deepEqual([...n.d.querySelectorAll('#practica [data-op]')].map(b => b.title), ['Mayor 7ª', 'Dominante 7ª', 'Menor 7ª', 'Semidisminuido']);
  await sesionCompleta(n, 10, 0);
  await esperar(() => n.$('pr-resultado'), 'resultado');
  assert.match(n.$('pr-resultado').textContent, /10 de 10 · 100%/);
  [...n.d.querySelectorAll('#practica button')].find(b => b.textContent === 'Otro ejercicio').click();
  await esperar(() => n.d.querySelector('[data-tema="int-desc"]'), 'inicio');
  audioFalso(n, { falla: true });
  await empezarTema(n, 'int-arm', 10);
  await esperar(() => /No se pudo cargar el sonido/.test(n.$('pr-audio').textContent), 'aviso de sonido que no carga');
  await contestar(n, true);                                   // se puede seguir practicando
  assert.equal(n.w.RepertorioPractica.estadoSesion().hechas.length, 1);
  sinErrores(n); n.cerrar();
});

test('AUDIO compartido (RepertorioAudio) con un Tone simulado: espera al piano, programa las notas y cancela lo anterior', async () => {
  const n = await navegador('');
  const sonidos = [];
  class Instrumento {
    constructor(op = {}) { this.volume = { value: 0 }; this.op = op; if (op.onload) setTimeout(op.onload, 40); }
    connect() { return this; } toDestination() { return this; } releaseAll() {}
    triggerAttackRelease(freqs, dur, t, vel) { sonidos.push({ quien: this.op.urls ? 'piano' : 'respaldo', freqs, dur, vel }); }
  }
  n.w.Tone = { start: async () => {}, Frequency: m => ({ toFrequency: () => 440 * 2 ** ((m - 69) / 12) }), Sampler: Instrumento, Reverb: Instrumento, PolySynth: Instrumento, Synth: class {}, getContext: () => ({}) };
  const A = n.w.RepertorioAudio;
  assert.equal(A.esPiano(), false);
  await A.tocar([{ midis: [60], en: 10, dur: 1 }, { midis: [64, 67], en: 60, dur: 1.5 }]);
  assert.equal(A.esPiano(), true, 'esperó a que cargara el piano');
  await esperar(() => sonidos.length === 2, 'las dos notas programadas');
  assert.deepEqual(sonidos.map(x => x.quien), ['piano', 'piano']);
  assert.equal(sonidos[0].freqs.length, 1); assert.equal(sonidos[1].freqs.length, 2);
  assert.ok(Math.abs(sonidos[0].freqs[0] - 261.63) < 0.01, 'C4 = 261.63 Hz');
  sonidos.length = 0;
  A.tocar([{ midis: [60], en: 80 }]);                          // se pide una y, enseguida, otra: la primera se cancela
  await new Promise(r => setTimeout(r, 5));
  await A.tocar([{ midis: [72], en: 20 }]);
  await new Promise(r => setTimeout(r, 200));
  assert.equal(sonidos.length, 1, 'solo suena la última petición'); assert.ok(Math.abs(sonidos[0].freqs[0] - 523.25) < 0.01);
  sinErrores(n); n.cerrar();
});

test('PRACTICAR (armaduras y escalas): dibuja la armadura, acepta respuestas, explica los fallos y guarda la sesión', async () => {
  memoria.clear();
  const n = await navegador('');
  await abrirPractica(n);
  await empezarTema(n, 'arm-sol', 10, 2);
  assert.equal(n.d.querySelectorAll('#practica svg.pentagrama').length, 1, 'se dibuja la armadura');
  assert.equal(n.d.querySelectorAll('#practica [data-op]').length, 9, 'nivel 2: 9 tonalidades mayores');
  assert.match(n.d.querySelector('.pr-pedido').textContent, /tonalidad mayor/);
  await contestar(n, false);
  assert.match(n.d.querySelector('.pr-feedback').textContent, /Era .*\(.*\).*dijiste/s);
  n.$('pr-sig').click();
  await esperar(() => n.w.RepertorioPractica.estadoSesion().fase === 'pregunta', 'siguiente');
  const opciones = n.w.Notacion.botones('arm-sol', 2).opciones, p = pregunta(n);
  n.tecla(n.d, String(opciones.findIndex(o => o.id === p.respuesta.id) + 1));
  await esperar(() => n.w.RepertorioPractica.estadoSesion().hechas.length === 2, 'respuesta con el número');
  assert.equal(n.w.RepertorioPractica.estadoSesion().hechas[1][1], 1);
  sinErrores(n); n.cerrar();

  const n2 = await navegador('');
  await abrirPractica(n2);
  await empezarTema(n2, 'arm-num', 10);
  assert.equal(n2.d.querySelector('#practica svg'), null); assert.match(n2.d.querySelector('.pr-pedido').textContent, /¿Cuántas alteraciones lleva .+ mayor\?/);
  await contestar(n2, true); sinErrores(n2); n2.cerrar();

  const n3 = await navegador('');
  await abrirPractica(n3);
  await empezarTema(n3, 'escala', 10, 3);
  assert.match(n3.d.querySelector('.pr-pedido').textContent, /grado de .+ mayor/); assert.ok(n3.d.querySelector('[data-mod]'), 'con selector de alteración');
  await contestar(n3, true);
  await esperar(() => n3.w.RepertorioPractica.estadoSesion().fase === 'pregunta', 'siguiente');
  await contestar(n3, false);
  assert.match(n3.d.querySelector('.pr-feedback').textContent, /Era .*\(.* .*\).*dijiste/s);
  sinErrores(n3); n3.cerrar();
});

test('PRACTICAR (lecciones): cada tema tiene su botón, la lección se abre, vuelve y lleva directo al ejercicio', async () => {
  memoria.clear();
  const n = await navegador('');
  await abrirPractica(n);
  const temas = Object.keys(n.w.Notacion.TEMAS);
  for (const t of temas) assert.ok([...n.d.querySelectorAll(`[data-tema="${t}"] button`)].some(b => /Lección/.test(b.textContent)), 'sin botón de lección en ' + t);
  [...n.d.querySelectorAll('[data-tema="sol"] button')].find(b => /Lección/.test(b.textContent)).click();
  await esperar(() => n.$('pr-leccion'), 'lección abierta');
  assert.equal(n.$('pr-leccion').textContent, 'Clave de sol'); assert.equal(n.d.activeElement, n.$('pr-leccion'));
  assert.ok(n.d.querySelectorAll('#practica .pr-puntos li').length >= 3); assert.ok(n.d.querySelectorAll('#practica svg.pentagrama').length >= 1);
  [...n.d.querySelectorAll('#practica button')].find(b => /← Practicar/.test(b.textContent)).click();
  await esperar(() => n.d.querySelector('#practica .pr-tema'), 'vuelve a Practicar');
  [...n.d.querySelectorAll('[data-tema="int-desc"] button')].find(b => /Lección/.test(b.textContent)).click();
  await esperar(() => n.$('pr-leccion'), 'lección de intervalos');
  assert.equal(n.d.querySelectorAll('#practica [data-practicar]').length, 3, 'una lección de intervalos con sus 3 ejercicios');
  n.d.querySelector('#practica [data-practicar="int-arm"]').click();
  await esperar(() => n.w.RepertorioPractica.estadoSesion()?.preg, 'empieza el ejercicio');
  assert.equal(n.w.RepertorioPractica.estadoSesion().tema, 'int-arm');
  sinErrores(n); n.cerrar();
});

test('PRACTICAR (sesión diaria): mezcla temas, se guarda por tema y termina al acabarse el tiempo; las estadísticas la reflejan', async () => {
  memoria.clear();
  const n = await navegador('');
  await abrirPractica(n); audioFalso(n);
  const P = n.w.RepertorioPractica;
  assert.equal(P.CFG.minutos, 15);
  n.$('pr-diaria-ir').click();
  await esperar(() => P.estadoSesion()?.preg, 'primera pregunta diaria');
  const vistos = new Set(); let respondidas = 0;
  for (let i = 0; i < 30; i++) {
    await esperar(() => P.estadoSesion()?.preg && P.estadoSesion().fase === 'pregunta', 'siguiente pregunta');
    vistos.add(P.estadoSesion().tema);
    assert.match(n.d.querySelector('#practica .cbarra').textContent, /Diaria · \d+:\d\d · \d+/);
    await contestar(n, i % 4 !== 0); respondidas++;
    if (P.estadoSesion()?.fase === 'feedback' && n.$('pr-sig')) n.$('pr-sig').click();
  }
  assert.ok(vistos.size >= 4, 'se mezclan temas: ' + [...vistos]);
  await esperar(() => P.estadoSesion()?.preg && P.estadoSesion().fase === 'pregunta', 'última pregunta');
  P.CFG.minutos = 0;                                           // se acaba el tiempo: tras esta respuesta, termina
  await contestar(n, true); respondidas++;
  if (P.estadoSesion()?.fase === 'feedback' && n.$('pr-sig')) n.$('pr-sig').click();
  await esperar(() => n.$('pr-resultado'), 'resultado');
  assert.match(n.$('pr-resultado').textContent, new RegExp(`de ${respondidas} ·`));
  assert.ok(n.d.querySelector('#practica .parte h3') && /Por tema/.test(n.d.querySelector('#practica').textContent));
  const pend = P.datos.pend;
  assert.ok(pend.length >= vistos.size && pend.every(s => n.w.Notacion.TEMAS[s.t]), 'una sesión guardada por cada tema que salió');
  assert.equal(pend.reduce((x, s) => x + s.n, 0), respondidas); assert.equal(new Set(pend.map(s => s.id)).size, pend.length);
  // estadísticas
  [...n.d.querySelectorAll('#practica button')].find(b => /Otro ejercicio/.test(b.textContent)).click();
  await esperar(() => n.$('pr-stats-ir'), 'inicio'); n.$('pr-stats-ir').click();
  await esperar(() => n.$('pr-stats'), 'estadísticas');
  const txt = n.$('practica').textContent;
  assert.match(n.$('pr-stats').textContent, new RegExp(`^${respondidas} preguntas ·`)); assert.match(txt, /Últimos 7 días/); assert.match(txt, /Por tema/); assert.match(txt, /Puntos débiles/);
  [...n.d.querySelectorAll('#practica button')].find(b => /← Practicar/.test(b.textContent)).click();
  await esperar(() => n.d.querySelector('#practica .pr-tema'), 'vuelve a Practicar');
  sinErrores(n); n.cerrar();

  const v = await navegador('');                               // sin historial: las estadísticas lo dicen y no fallan
  await abrirPractica(v); v.$('pr-stats-ir').click();
  await esperar(() => v.$('pr-stats'), 'estadísticas vacías'); assert.equal(v.$('pr-stats').textContent, 'Aún no hay práctica');
  sinErrores(v); v.cerrar();
});

test('PRACTICAR: Atrás desde una sesión, una lección o las estadísticas vuelve al menú de Practicar y recuerda dónde estabas', async () => {
  memoria.clear();
  const n = await navegador('');
  const caja = await abrirPractica(n);
  const alMenu = () => esperar(() => n.$('pr-diaria') && !n.$('practica').hidden, 'el menú de Practicar');
  caja.scrollTop = 240;
  [...caja.querySelectorAll('[data-tema="teclado"] button')].find(b => /Empezar · 10/.test(b.textContent)).click();
  await esperar(() => n.w.RepertorioPractica.estadoSesion()?.preg, 'sesión');
  n.w.history.back(); await alMenu();
  assert.equal(n.w.RepertorioPractica.estadoSesion(), null, 'la sesión terminó');
  assert.equal(caja.scrollTop, 240, 'vuelves al mismo lugar del menú, no arriba del todo');
  caja.querySelector('.b-leccion').click();
  await esperar(() => n.$('pr-leccion'), 'lección');
  n.w.history.back(); await alMenu();
  assert.equal(caja.scrollTop, 240);
  n.$('pr-stats-ir').click(); await esperar(() => n.$('pr-stats'), 'estadísticas');
  n.w.history.back(); await alMenu();
  assert.equal(n.$('practica').hidden, false, 'Practicar sigue abierto');
  n.w.history.back();
  await esperar(() => n.$('practica').hidden, 'desde el menú, Atrás sí sale de Practicar');
  assert.equal(n.$('app').inert, false);
  sinErrores(n); n.cerrar();
});

test('RETOS DE ACORDES: elegir opciones, hacer un reto completo, estadísticas guardadas y Atrás por niveles', async () => {
  memoria.clear();
  const n = await navegador('');
  const caja = await abrirPractica(n);
  n.w.Retos.CFG.guardia = 0;                                   // sin espera anti doble toque en las pruebas
  n.$('pr-retos-ir').click();
  await esperar(() => n.$('rt-empezar-10'), 'menú de los retos');
  assert.equal(caja.scrollTop, 0);
  assert.equal(n.$('rt-progreso').textContent.includes('Aún no has hecho retos'), true);
  n.d.querySelector('[data-op="calidad:m"]').click();
  n.d.querySelector('[data-op="inversiones:true"]').click();
  assert.equal(n.d.querySelector('[data-op="calidad:m"]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(JSON.parse(n.w.localStorage.getItem('repertorio-retos-pref')), { calidad: 'm', inversiones: true, tiempo: 0, teclado: true, repasar: true });

  n.$('rt-empezar-10').click();
  await esperar(() => n.$('rt-acorde'), 'primer reto');
  const bien = [], hechos = [];
  for (let i = 1; i <= 10; i++) {
    const nombre = n.$('rt-acorde').textContent;
    assert.match(nombre, /^[A-G](#|b)?m$/, 'solo menores: ' + nombre);
    assert.match(n.d.querySelector('.cbarra').textContent, new RegExp(`${i} / 10`));
    assert.equal(n.$('rt-revela'), null, 'las notas no se ven antes de tocar');
    if (i % 3 === 0) { n.$('rt-ver').click(); assert.ok(n.$('rt-revela')); n.$('rt-sig').click(); hechos.push([nombre, false]); }
    else {
      n.$('rt-toque').click();
      assert.ok(n.$('rt-revela').querySelector('svg.pteclado'), 'se dibuja el teclado');
      assert.equal(n.$('rt-revela').querySelectorAll('.pk-on').length, 3, 'tres teclas marcadas');
      assert.match(n.$('rt-tiempo').textContent, /Tardaste \d+\.\d s/);
      if (i % 4 === 0) { n.$('rt-fallo').click(); hechos.push([nombre, false]); } else { n.$('rt-bien').click(); hechos.push([nombre, true]); }
    }
  }
  await esperar(() => n.$('rt-resultado'), 'resultado');
  const buenas = hechos.filter(h => h[1]).length;
  assert.match(n.$('rt-resultado').textContent, new RegExp(`^${buenas} de 10 bien`));
  const est = JSON.parse(n.w.localStorage.getItem('repertorio-retos-v1'));
  assert.equal(Object.values(est.items).reduce((s, x) => s + x.v, 0), 10, 'cada reto quedó guardado');
  assert.equal(Object.values(est.items).reduce((s, x) => s + x.a, 0), buenas);

  n.w.history.back();                                          // Atrás desde el resultado: menú de los retos
  await esperar(() => n.$('rt-empezar-10') && n.$('rt-progreso').textContent.includes('10 retos'), 'vuelve al menú de los retos, con el progreso');
  assert.equal(n.$('practica').hidden, false);
  n.$('rt-empezar-10').click();
  await esperar(() => n.$('rt-acorde'), 'otra sesión');
  n.w.history.back();                                          // Atrás en medio de un reto: menú de los retos
  await esperar(() => n.$('rt-empezar-10'), 'menú de los retos otra vez');
  n.w.history.back();                                          // Atrás desde el menú de los retos: menú de Practicar
  await esperar(() => n.$('pr-diaria') && n.$('pr-retos-ir'), 'menú de Practicar');
  assert.equal(n.$('practica').hidden, false);
  n.w.history.back();                                          // y desde ahí, sale de Practicar
  await esperar(() => n.$('practica').hidden, 'sale de Practicar');
  assert.equal(n.$('app').inert, false);
  sinErrores(n); n.cerrar();
});

test('RETOS DE ACORDES: tiempo por acorde (al acabarse cuenta como fallo y muestra la respuesta), solo notas y sin relojes sueltos al salir', async () => {
  memoria.clear();
  const n = await navegador('');
  await abrirPractica(n);
  n.w.Retos.CFG.guardia = 0; n.w.Retos.CFG.escala = 0.02;      // 6 s -> 120 ms en la prueba
  n.$('pr-retos-ir').click(); await esperar(() => n.$('rt-empezar-10'), 'menú de los retos');
  n.d.querySelector('[data-op="tiempo:6"]').click(); n.d.querySelector('[data-op="teclado:false"]').click();
  assert.equal(n.d.querySelector('[data-op="tiempo:6"]').getAttribute('aria-pressed'), 'true');
  n.$('rt-empezar-10').click(); await esperar(() => n.$('rt-acorde'), 'primer reto');
  assert.ok(n.$('rt-barra') && /Quedan \d+ s/.test(n.$('rt-cuenta').textContent), 'se ve la cuenta regresiva');
  await esperar(() => n.$('rt-expiro'), 'se acaba el tiempo');
  assert.ok(n.$('rt-sig'), 'solo queda Siguiente'); assert.equal(n.$('rt-revela').querySelector('svg'), null, 'solo notas, sin teclado');
  assert.match(n.$('rt-revela').textContent, /\w/);
  n.$('rt-sig').click(); await esperar(() => n.$('rt-toque'), 'segundo reto');
  n.$('rt-toque').click(); assert.equal(n.$('rt-barra'), null, 'al tocar se detiene la cuenta'); n.$('rt-bien').click();
  await esperar(() => n.$('rt-toque'), 'tercer reto');
  const est = JSON.parse(n.w.localStorage.getItem('repertorio-retos-v1'));
  assert.deepEqual([Object.values(est.items).reduce((s, x) => s + x.v, 0), Object.values(est.items).reduce((s, x) => s + x.a, 0)], [2, 1], 'el tiempo agotado cuenta como fallo');
  n.w.history.back();                                           // salir con la cuenta corriendo
  await esperar(() => n.$('rt-empezar-10'), 'menú de los retos');
  await new Promise(r => setTimeout(r, 400));                   // si quedara un reloj vivo, rompería el menú
  assert.ok(n.$('rt-empezar-10') && !n.$('rt-expiro') && !n.$('rt-barra'));
  sinErrores(n); n.cerrar();
});
