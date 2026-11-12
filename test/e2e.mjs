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
  await esperar(() => !t.hidden && boton('Círculo', t), 'pantalla de Teoría con pestañas');
  assert.equal(t.getAttribute('role'), 'dialog'); assert.equal(d.activeElement, t);
  assert.equal(boton('Tonalidades', t), undefined, 'ya no hay una pestaña Tonalidades repetida');
  boton('Círculo', t).click();
  const toca = nombre => t.querySelector(`[aria-label="${nombre}"]`).dispatchEvent(new n.w.Event('click', { bubbles: true }));
  await esperar(() => /Sin alteraciones/.test(t.textContent), 'C mayor: sin alteraciones');
  toca('A mayor');
  await esperar(() => /3 sostenidos: F♯ C♯ G♯/.test(t.textContent), 'A mayor: 3 sostenidos');
  assert.match(t.textContent, /Relativa: F#m \(menor\)/);
  assert.equal(t.querySelectorAll('.parte .chips .chip').length >= 7, true);
  toca('A menor');
  await esperar(() => /A menor/.test(t.querySelector('h2').textContent), 'A menor');
  assert.match(t.textContent, /Relativa: C mayor/); assert.match(t.textContent, /0 alteraciones|Sin alteraciones/);
  assert.match(t.textContent, /Armónica.*G#/); assert.ok(boton('▶ i–iv–V–i', t));
  toca('F sostenido menor');
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

test('PRACTICAR: una sesión inválida no traba la cola: las buenas se guardan y la mala se aparta', async () => {
  memoria.clear();
  const a = await navegador('');
  await abrirPractica(a);
  [...a.d.querySelectorAll('[data-tema="fa"] button')].find(b => /Empezar · 10/.test(b.textContent)).click();
  await esperar(() => a.w.RepertorioPractica.estadoSesion()?.preg, 'sesión en clave de fa');
  await sesionCompleta(a, 10, 0);
  await esperar(() => a.$('pr-resultado'), 'resultado');
  [...a.d.querySelectorAll('#practica button')].find(b => b.textContent === 'Otro ejercicio').click();
  await esperar(() => a.d.querySelector('#practica details'), 'formulario de entrada');
  a.d.querySelector('#pr-pass').value = PASE; a.d.querySelector('#practica details .primario').click();
  await esperar(() => /Sincronizado/.test(a.$('pr-estado')?.textContent || ''), 'estado sincronizado');
  const P = a.w.RepertorioPractica;
  const buena = id => ({ id, t: 'fa', l: 1, f: '2026-11-05', n: 2, a: 1, ms: 5000, q: [['fa:c4', 1, 1000], ['fa:d4', 0, 2000]] });
  P.datos.pend.push(buena('buenauno1'), { ...buena('mala'), id: 'x' }, buena('buenados2'));   // el id 'x' no es válido
  await P.sincronizar();
  await esperar(() => /apartada/.test(a.$('pr-estado')?.textContent || ''), 'aviso de sesión apartada');
  assert.equal(P.datos.pend.length, 0, 'la cola quedó vacía: la mala no la traba');
  assert.deepEqual([...P.datos.apartadas.map(s => s.id)], ['x'], 'la mala quedó apartada, no perdida');
  const ids = JSON.parse(memoria.get('repertorio/progreso.json').texto).sesiones.map(s => s.id);
  assert.ok(ids.includes('buenauno1') && ids.includes('buenados2') && !ids.includes('x'), 'las dos buenas llegaron al servidor: ' + ids);
  assert.match(a.$('pr-estado').textContent, /1 sesión no era válida/);
  assert.equal(JSON.parse(a.w.localStorage.getItem('repertorio-practica-v1')).apartadas.length, 1, 'la apartada sobrevive al recargar');
  sinErrores(a); a.cerrar();
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
  await empezarTema(n, 'arm', 10, 2);
  assert.equal(n.d.querySelectorAll('#practica svg.pentagrama').length, 1, 'se dibuja la armadura');
  assert.equal(n.d.querySelectorAll('#practica [data-op]').length, 9, 'nivel 2: 9 tonalidades mayores');
  assert.match(n.d.querySelector('.pr-pedido').textContent, /tonalidad mayor/);
  await contestar(n, false);
  assert.match(n.d.querySelector('.pr-feedback').textContent, /Era .*\(.*\).*dijiste/s);
  n.$('pr-sig').click();
  await esperar(() => n.w.RepertorioPractica.estadoSesion().fase === 'pregunta', 'siguiente');
  const opciones = n.w.Notacion.botones('arm', 2).opciones, p = pregunta(n);
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
  assert.match(n.$('pr-stats').textContent, new RegExp(`^${respondidas} preguntas ·`)); assert.match(txt, /Últimos 7 días/); assert.match(txt, /Por tema/);
  // "Puntos débiles" solo sale si algún ejercicio tuvo 3 o más intentos con menos de 80 % de aciertos; con preguntas al azar eso no siempre pasa
  // (por eso esta prueba fallaba a veces): se comprueba que la pantalla coincide con lo que calcula la lógica, sea cual sea el azar.
  const hayDebiles = n.w.Notacion.debiles(n.w.Notacion.estadisticas(P.todas()), 8).length > 0;
  assert.equal(/Puntos débiles/.test(txt), hayDebiles, 'Puntos débiles aparece exactamente cuando hay ejercicios débiles');
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
  [...caja.querySelectorAll('[data-tema="fa"] button')].find(b => /Empezar · 10/.test(b.textContent)).click();
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

// Estas pruebas reemplazan los datos del almacén falso: van al final para no alterar a las demás.
const sembrar = lista => memoria.set('repertorio/canciones.json', { texto: JSON.stringify({ version: 2, nombre: 'Acordes y Tonos', intro: '', canciones: lista.map(([t, tono, ...partes], i) => ({ id: 'id' + i + 'x' + t.length, titulo: t, artista: 'Artista ' + i, tono, partes: partes.map(([nombre, prog]) => ({ nombre, tono: '', prog, letra: '', pista: '' })) })) }), etag: '"e0"' });

test('CANCIÓN: canciones con la misma progresión, clickeables, con "Volver a" y sin callejón sin salida', async () => {
  memoria.clear();
  sembrar([
    ['Aleluya', 'G', ['Verso', 'G D Em C'], ['Puente', 'C G Am F']],
    ['Brillas', 'C', ['Coro', 'C G Am F']],
    ['Cristo', 'D', ['Verso', 'Bm G D A']],
    ['Distinta', 'G', ['Verso', 'G C D G']],
    ['Vacía', 'G'],
  ]);
  const n = await navegador();
  const { d, $, tecla } = n;
  await esperar(() => d.querySelectorAll('#lista .fila').length === 5, 'las 5 canciones');
  const fila = t => [...d.querySelectorAll('#lista .fila .abrir')].find(b => b.querySelector('.t').textContent === t);
  const caja = $('cancion');
  fila('Aleluya').click();
  await esperar(() => !caja.hidden, 'abrir Aleluya');

  const rel = caja.querySelector('.rel');
  assert.ok(rel, 'hay canciones con la misma progresión');
  const filas = [...rel.querySelectorAll('.fila')];
  assert.deepEqual(filas.map(f => f.querySelector('.t').textContent), ['Brillas', 'Cristo'], 'las iguales primero, luego las del mismo ciclo; Distinta y Vacía no salen');
  assert.match(filas[0].textContent, /Coro · I V vi IV/); assert.doesNotMatch(filas[0].textContent, /mismo ciclo/);
  assert.match(filas[1].textContent, /Verso · vi IV I V · mismo ciclo/);
  assert.equal(rel.querySelector('.rel-mas'), null, 'con pocas no hay botón "Ver las"');
  assert.equal(caja.querySelector('.volver-rel'), null, 'aún no vienes de otra canción');

  filas[0].querySelector('.abrir').click();
  await esperar(() => caja.getAttribute('aria-label') === 'Brillas', 'saltar a Brillas');
  assert.match(caja.querySelector('.volver-rel').textContent, /Volver a «Aleluya»/);
  assert.deepEqual([...caja.querySelectorAll('.rel .fila .t')].map(x => x.textContent).sort(), ['Aleluya', 'Cristo'], 'desde Brillas se ven las demás: no hay callejón sin salida');
  assert.equal(caja.scrollTop, 0);

  [...caja.querySelectorAll('.rel .fila .abrir')].find(b => b.textContent.includes('Cristo')).click();
  await esperar(() => caja.getAttribute('aria-label') === 'Cristo', 'saltar a Cristo');
  caja.querySelector('.volver-rel').click();
  await esperar(() => caja.getAttribute('aria-label') === 'Brillas', 'volver a Brillas');
  caja.querySelector('.volver-rel').click();
  await esperar(() => caja.getAttribute('aria-label') === 'Aleluya', 'volver a Aleluya');
  assert.equal(caja.querySelector('.volver-rel'), null, 'ya no hay a dónde volver');

  tecla(d, 'Escape');
  await esperar(() => caja.hidden || caja.classList.contains('oculta'), 'Esc cierra todo de una vez');
  fila('Brillas').click(); await esperar(() => !caja.hidden, 'abrir Brillas desde la lista');
  assert.equal(caja.querySelector('.volver-rel'), null, 'al abrir desde la lista no arrastra el camino anterior');
  tecla(d, 'Escape');

  fila('Distinta').click(); await esperar(() => !caja.hidden, 'abrir Distinta');
  assert.equal(caja.querySelector('.rel'), null, 'sin canciones iguales no se muestra la sección vacía');
  tecla(d, 'Escape');
  fila('Vacía').click(); await esperar(() => !caja.hidden, 'abrir Vacía');
  assert.equal(caja.querySelector('.rel'), null);
  sinErrores(n); n.cerrar();
});

test('CANCIÓN: con muchas canciones iguales se muestran 4 y "Ver las N" abre el resto', async () => {
  memoria.clear();
  sembrar(['A', 'B', 'C', 'D', 'E', 'F'].map((t, i) => ['Canción ' + t, ['G', 'C', 'D', 'A', 'E', 'F'][i], ['Coro', ['G D Em C', 'C G Am F', 'D A Bm G', 'A E F#m D', 'E B C#m A', 'F C Dm Bb'][i]]]));
  const n = await navegador();
  const { d, $ } = n;
  await esperar(() => d.querySelectorAll('#lista .fila').length === 6, 'las 6 canciones');
  d.querySelector('#lista .fila .abrir').click();
  const caja = $('cancion'); await esperar(() => !caja.hidden, 'abrir una');
  const visibles = () => [...caja.querySelectorAll('.rel .fila')].filter(f => !f.hidden).length;
  assert.equal(caja.querySelectorAll('.rel .fila').length, 5); assert.equal(visibles(), 4);
  const mas = caja.querySelector('.rel-mas');
  assert.equal(mas.textContent, 'Ver las 5'); assert.equal(mas.getAttribute('aria-expanded'), 'false');
  mas.click(); assert.equal(visibles(), 5); assert.equal(mas.textContent, 'Ver menos'); assert.equal(mas.getAttribute('aria-expanded'), 'true');
  mas.click(); assert.equal(visibles(), 4);
  sinErrores(n); n.cerrar();
});

test('PRACTICAR · Progresiones: el nombre de la canción abre la canción encima, y Esc o atrás vuelve al reto sin salir de Practicar', async () => {
  memoria.clear();
  sembrar([['Aleluya', 'G', ['Coro', 'G D Em C']], ['Brillas', 'C', ['Coro', 'C G Am F']]]);
  const n = await navegador();
  const { d, $, tecla, w } = n;
  await esperar(() => d.querySelectorAll('#lista .fila').length === 2, 'las 2 canciones');
  const pr = await abrirPractica(n);
  pr.querySelector('#pr-progs-ir').click();
  await esperar(() => $('pg-empezar-5') && !$('pg-empezar-5').disabled, 'menú de progresiones');
  $('pg-empezar-5').click();
  await esperar(() => $('pg-toque'), 'primer reto');
  assert.equal($('pg-abrir'), null, 'antes de ver la respuesta no se muestra de qué canción es');
  $('pg-toque').click();
  await esperar(() => $('pg-abrir'), 'respuesta revelada');
  const titulo = $('pg-revela').textContent.match(/Es «([^»]+)»/)[1];
  assert.equal($('pg-abrir').textContent, 'Abrir «' + titulo + '»');
  $('pg-abrir').click();
  const caja = $('cancion');
  await esperar(() => !caja.hidden && caja.getAttribute('aria-label') === titulo, 'se abre ' + titulo);
  tecla(d, 'Escape');
  await esperar(() => caja.hidden, 'Esc cierra la canción');
  await new Promise(r => setTimeout(r, 400));
  assert.equal(pr.hidden, false, 'Practicar sigue abierto');
  assert.ok($('pg-revela'), 'y el reto sigue en pantalla, con su respuesta');
  assert.ok(w.RepertorioApp.cerroCancionEn > 0);
  sinErrores(n); n.cerrar();
});

test('TEORÍA · Círculo de quintas: se elige una tonalidad tocando, sus 6 acordes marcados con número romano, relativa menor y teclado', async () => {
  const n = await navegador();
  const { d, $, boton, tecla } = n;
  const btn = $('teoria-btn'); btn.focus(); btn.click();
  const t = $('teoria');
  await esperar(() => !t.hidden && boton('Círculo', t), 'pestaña Círculo');
  boton('Círculo', t).click();
  await esperar(() => t.querySelector('svg.cq'), 'se dibuja el círculo');
  const sectores = [...t.querySelectorAll('.cq-s')];
  assert.equal(sectores.length, 24, '12 mayores y 12 menores');
  assert.equal(t.querySelectorAll('.cq-M').length, 12); assert.equal(t.querySelectorAll('.cq-m').length, 12);
  assert.ok(sectores.every(g => g.getAttribute('role') === 'button' && g.getAttribute('tabindex') === '0' && g.getAttribute('aria-label')), 'todos son botones con nombre');
  const sel = () => [...t.querySelectorAll('.cq-s.sel')].map(g => g.getAttribute('aria-label'));
  const vec = () => [...t.querySelectorAll('.cq-s.vec')].map(g => g.getAttribute('aria-label')).sort();
  assert.deepEqual(sel(), ['C mayor']); assert.deepEqual(vec(), ['A menor', 'D menor', 'E menor', 'F mayor', 'G mayor']);
  const romanos = () => Object.fromEntries([...t.querySelectorAll('.cq-s')].filter(g => g.querySelector('.cq-r')).map(g => [g.getAttribute('aria-label'), g.querySelector('.cq-r').textContent]));
  assert.deepEqual(romanos(), { 'F mayor': 'IV', 'C mayor': 'I', 'G mayor': 'V', 'D menor': 'ii', 'A menor': 'vi', 'E menor': 'iii' }, 'los 6 acordes de C mayor, con su número romano');
  assert.equal(t.querySelectorAll('.cq-r').length, 6, 'solo los 6 acordes llevan número');
  assert.equal(t.querySelector('.cq-c').textContent, 'C'); assert.equal(t.querySelector('.cq-c2').textContent, '0');
  assert.match(t.textContent, /Sin alteraciones/);

  // Tocar G mayor (una quinta arriba): 1 sostenido, vecinas C y D, relativa Em
  t.querySelector('[aria-label="G mayor"]').dispatchEvent(new n.w.Event('click', { bubbles: true }));
  await esperar(() => sel()[0] === 'G mayor', 'se elige G');
  assert.deepEqual(vec(), ['A menor', 'B menor', 'C mayor', 'D mayor', 'E menor']);   // G mayor: IV V arriba; ii vi iii abajo
  assert.equal(t.querySelector('.cq-c2').textContent, '1♯');
  assert.match(t.textContent, /Relativa: Em \(menor\)/);
  assert.ok(boton('▶ I–IV–V–I', t), 'sigue habiendo sonido');
  assert.ok(t.querySelector('svg.teclado'), 'y el teclado con las notas');

  // Un bemol: F mayor está a la izquierda de C (IV); con teclado (Enter) sobre su sector
  const f = t.querySelector('[aria-label="F mayor"]');
  tecla(f, 'Enter');
  await esperar(() => sel()[0] === 'F mayor', 'Enter elige F');
  assert.equal(t.querySelector('.cq-c2').textContent, '1♭');
  assert.deepEqual(vec(), ['A menor', 'B bemol mayor', 'C mayor', 'D menor', 'G menor']);

  // Relativa menor (anillo de adentro): F♯m comparte armadura con A mayor (3 sostenidos)
  t.querySelector('[aria-label="F sostenido menor"]').dispatchEvent(new n.w.Event('click', { bubbles: true }));
  await esperar(() => sel()[0] === 'F sostenido menor', 'se elige F♯m');
  assert.equal(t.querySelector('.cq-c2').textContent, '3♯'); assert.equal(t.querySelector('.cq-c').textContent, 'F♯m');
  assert.deepEqual(vec(), ['A mayor', 'B menor', 'C sostenido menor', 'D mayor', 'E mayor']);
  assert.deepEqual(romanos(), { 'D mayor': 'VI', 'A mayor': 'III', 'E mayor': 'VII', 'B menor': 'iv', 'F sostenido menor': 'i', 'C sostenido menor': 'v' }, 'en menor: i iv v abajo; III VI VII arriba');
  assert.match(t.textContent, /Relativa: A mayor/);

  // Otra pestaña y de vuelta: el círculo conserva la tonalidad
  boton('Acordes', t).click();
  await esperar(() => !t.querySelector('svg.cq'), 'sale del círculo');

  // Extremos del círculo: 6 sostenidos (F♯) y 5 bemoles (D♭); D♯m = 6 sostenidos
  boton('Círculo', t).click();
  await esperar(() => t.querySelector('svg.cq'), 'otra vez el círculo');
  t.querySelector('[aria-label="D sostenido menor"]').dispatchEvent(new n.w.Event('click', { bubbles: true }));
  await esperar(() => sel()[0] === 'D sostenido menor', 'D♯m');
  assert.equal(t.querySelector('.cq-c2').textContent, '6♯');
  t.querySelector('[aria-label="D bemol mayor"]').dispatchEvent(new n.w.Event('click', { bubbles: true }));
  await esperar(() => sel()[0] === 'D bemol mayor', 'D♭');
  assert.equal(t.querySelector('.cq-c2').textContent, '5♭');
  sinErrores(n); n.cerrar();
});

test('PRACTICAR · Canción sorpresa: sale una canción sin acordes a la vista, no repite hasta agotar y abre la canción', async () => {
  memoria.clear();
  sembrar([['Aleluya', 'G', ['Coro', 'G D | Em C']], ['Brillas', 'C', ['Coro', 'C G Am F']], ['Vacía', 'D']]);
  const n = await navegador();
  const { d, $, tecla, w } = n;
  await esperar(() => d.querySelectorAll('#lista .fila').length === 3, 'las 3 canciones');
  const pr = await abrirPractica(n);
  pr.querySelector('#pr-sorpresa-ir').click();
  await esperar(() => $('so-ir') && !$('so-ir').disabled, 'menú de Canción sorpresa');
  assert.match($('so-cuenta').textContent, /3 canciones/);
  $('so-ir').click();
  await esperar(() => $('so-titulo'), 'primera canción');
  assert.ok($('so-tono').textContent.length > 0);
  assert.equal($('so-acordes'), null, 'antes de ver, no se muestran los acordes');
  const vistas = [$('so-titulo').textContent];
  $('so-ver').click();
  await esperar(() => $('so-acordes'), 'acordes revelados');
  assert.ok($('so-abrir') && $('so-abrir').textContent === 'Abrir «' + vistas[0] + '»');
  for (let i = 0; i < 2; i++) {
    const antes = $('so-titulo').textContent;
    $('so-otra').click();
    await esperar(() => $('so-titulo') && $('so-titulo').textContent !== antes, 'otra canción');
    vistas.push($('so-titulo').textContent);
  }
  assert.equal(new Set(vistas).size, 3, 'las 3 distintas antes de repetir: ' + vistas);
  assert.match(d.querySelector('#practica .ctitulo').textContent, /Última de la vuelta/);
  $('so-otra').click();
  await esperar(() => $('so-vuelta'), 'empieza una vuelta nueva');
  assert.notEqual($('so-titulo').textContent, vistas[2], 'la última no sale de seguido');
  $('so-ver').click();
  await esperar(() => $('so-abrir'), 'revelar');
  const titulo = $('so-titulo').textContent;
  $('so-abrir').click();
  const caja = $('cancion');
  await esperar(() => !caja.hidden && caja.getAttribute('aria-label') === titulo, 'se abre ' + titulo);
  tecla(d, 'Escape');
  await esperar(() => caja.hidden, 'Esc cierra la canción');
  await new Promise(r => setTimeout(r, 400));
  assert.equal(pr.hidden, false, 'Practicar sigue abierto'); assert.ok($('so-titulo'), 'y la sorpresa sigue en pantalla');
  // Atrás desde la canción vuelve al menú de la sorpresa; otra vez atrás, al menú de Practicar
  w.history.back();
  await esperar(() => $('so-ir') && !$('so-titulo'), 'atrás vuelve al menú de la sorpresa');
  w.history.back();
  await esperar(() => $('pr-sorpresa-ir'), 'y luego al menú de Practicar');
  sinErrores(n); n.cerrar();
});

test('EDITOR · Copia de seguridad: el archivo lleva la fecha y Ajustes recuerda cuándo fue la última', async () => {
  memoria.clear();
  sembrar([['Aleluya', 'G', ['Coro', 'G D | Em C']]]);
  const n = await navegador('?editar');
  const { d, $, escribir, boton, w } = n;
  const pass = await esperar(() => d.querySelector('.capa input[type=password]'), 'ventana de contraseña');
  escribir(pass, process.env.ADMIN_PASSWORD); boton('Entrar').click();
  await esperar(() => !d.querySelector('.capa'), 'entrada');
  const bajadas = [];
  w.URL.createObjectURL = blob => { bajadas.push(blob); return 'blob:prueba'; };
  w.URL.revokeObjectURL = () => {};
  const clic = w.HTMLAnchorElement.prototype.click;
  let nombre = '';
  w.HTMLAnchorElement.prototype.click = function () { nombre = this.download; };
  boton('Ajustes').click();
  await esperar(() => $('copia-ultima'), 'Ajustes');
  assert.match($('copia-ultima').textContent, /Aún no has descargado una copia/);
  boton('Descargar copia').click();
  const hoy = new Date().toLocaleDateString('en-CA');
  assert.equal(nombre, 'repertorio-copia-' + hoy + '.json');
  assert.equal(bajadas.length, 1);
  const copia = JSON.parse(await bajadas[0].text());
  assert.equal(copia.canciones.length, 1); assert.equal(copia.canciones[0].titulo, 'Aleluya');
  assert.match($('copia-ultima').textContent, /Última copia descargada en este dispositivo: hoy \(\d{4}-\d{2}-\d{2}\)\./);
  assert.doesNotMatch($('copia-ultima').textContent, /Ya pasó más de un mes/);
  // Con una copia vieja, avisa
  w.localStorage.setItem('repertorio-ultima-copia', JSON.stringify('2020-01-01'));
  d.querySelector('.capa-t button').click();
  boton('Ajustes').click();
  await esperar(() => /Ya pasó más de un mes/.test(($('copia-ultima') || { textContent: '' }).textContent), 'aviso de copia vieja');
  w.HTMLAnchorElement.prototype.click = clic;
  sinErrores(n); n.cerrar();
});

test('CANCIÓN · Nashville: Letras, Romanos o Números; el acorde sigue en el chip y la elección se recuerda', async () => {
  memoria.clear();
  sembrar([['Aleluya', 'G', ['Verso', 'G D Em C'], ['Puente', 'C G Am F']], ['Sola', 'Am', ['Coro', 'Am F C G']], ['Vacía', 'G']]);
  const n = await navegador();
  const { d, $, w } = n;
  await esperar(() => d.querySelectorAll('#lista .fila').length === 3, 'las 3 canciones');
  const fila = t => [...d.querySelectorAll('#lista .fila .abrir')].find(b => b.querySelector('.t').textContent === t);
  const caja = $('cancion');
  const abrir = async t => { fila(t).click(); await esperar(() => !caja.hidden && caja.querySelector('.ccuerpo'), 'se abre ' + t); };
  await abrir('Vacía');
  assert.equal(caja.querySelector('.n-sel'), null, 'sin acordes no hay selector');
  caja.querySelector('.cbarra button').click();
  await esperar(() => caja.hidden, 'cerrada');
  await abrir('Aleluya');
  const cuerpo = () => caja.querySelector('.ccuerpo');
  const pastillas = [...caja.querySelectorAll('.n-sel button')];
  assert.deepEqual(pastillas.map(b => b.textContent), ['Letras', 'Romanos', 'Números']);
  assert.match(cuerpo().className, /n-letras/); assert.equal(pastillas[0].getAttribute('aria-pressed'), 'true');
  const chips = () => [...caja.querySelectorAll('.parte')[0].querySelectorAll('.chip')];
  assert.deepEqual(chips().map(c => c.querySelector('b').textContent), ['G', 'D', 'Em', 'C']);
  assert.deepEqual(chips().map(c => c.querySelector('.rom').textContent), ['I', 'V', 'vi', 'IV']);
  assert.deepEqual(chips().map(c => c.querySelector('.nas').textContent), ['1', '5', '6m', '4']);
  assert.deepEqual(chips().map(c => c.firstChild.tagName + c.firstChild.textContent), ['BG', 'BD', 'BEm', 'BC'], 'el acorde sigue siendo lo primero del chip');
  pastillas[2].click();
  assert.match(cuerpo().className, /n-numeros/); assert.doesNotMatch(cuerpo().className, /n-letras/);
  assert.equal(pastillas[2].getAttribute('aria-pressed'), 'true'); assert.equal(pastillas[0].getAttribute('aria-pressed'), 'false');
  assert.deepEqual(chips().map(c => c.firstChild.textContent), ['G', 'D', 'Em', 'C'], 'el cambio es solo de vista: los acordes no se tocan');
  assert.equal(JSON.parse(w.localStorage.getItem('repertorio-acordes-vista')), 'numeros');
  pastillas[1].click();
  assert.match(cuerpo().className, /n-romanos/); assert.equal(JSON.parse(w.localStorage.getItem('repertorio-acordes-vista')), 'romanos');
  // Otra canción (tono menor) y el segundo bloque: se mantiene la vista elegida y se cuenta desde la tónica
  caja.querySelector('.cbarra button').click();
  await esperar(() => caja.hidden, 'cerrada');
  await abrir('Sola');
  assert.match(cuerpo().className, /n-romanos/, 'la vista se recuerda');
  assert.deepEqual(chips().map(c => c.querySelector('.nas').textContent), ['1m', '♭6', '♭3', '♭7']);
  assert.deepEqual(chips().map(c => c.querySelector('.rom').textContent), ['i', 'VI', 'III', 'VII']);
  sinErrores(n); n.cerrar();
});

test('PRACTICAR · Rearmonizar: nivel 5 (ciclo de dominantes y bajo caminando) y "Sumar niveles anteriores"', async () => {
  memoria.clear();
  sembrar([['Aleluya', 'C', ['Coro', 'C F | G C']]]);
  const n = await navegador();
  const { d, $, w } = n;
  await esperar(() => d.querySelectorAll('#lista .fila').length === 1, 'la canción');
  const pr = await abrirPractica(n);
  pr.querySelector('#pr-rearm-ir').click();
  await esperar(() => pr.querySelector('.rr-cancion') && !pr.querySelector('.rr-cancion').disabled, 'teoría cargada');
  assert.equal(pr.querySelectorAll('[data-nivel]').length, 5, 'cinco niveles');
  pr.querySelector('.rr-cancion').click();
  await esperar(() => pr.querySelector('#rr-acordes'), 'la canción');
  pr.querySelector('[data-nivel="5"]').click();
  await esperar(() => pr.querySelector('[data-nivel="5"][aria-pressed="true"]'), 'nivel 5');
  assert.match(pr.querySelector('#rr-nivel-texto').textContent, /Ciclos y bajo caminando/);
  pr.querySelector('[data-ix="0"]').click();
  await esperar(() => pr.querySelector('.rr-idea'), 'ideas del primer acorde');
  const reglas = () => [...pr.querySelectorAll('.rr-idea')].map(x => x.getAttribute('data-regla'));
  assert.deepEqual(reglas(), ['backCycle', 'bassWalk']);
  const texto = id => pr.querySelector(`.rr-idea[data-regla="${id}"] .rt-prog`).textContent;
  assert.equal(texto('backCycle'), 'D7 → G7 → C'); assert.equal(texto('bassWalk'), 'C → C/E');
  assert.match(pr.querySelector('.rr-idea[data-regla="bassWalk"]').textContent, /bajo camina C → E → F/);
  // Sumar niveles anteriores: salen también las ideas de los niveles 1 a 4, marcadas con su nivel
  assert.equal(pr.querySelector('#rr-suma').getAttribute('aria-pressed'), 'false'); assert.match(pr.querySelector('#rr-suma-texto').textContent, /Apagado/);
  pr.querySelector('#rr-suma').click();
  await esperar(() => pr.querySelector('#rr-suma[aria-pressed="true"]'), 'suma encendida');
  await esperar(() => pr.querySelectorAll('.rr-idea').length > 2, 'más ideas');
  assert.ok(reglas().includes('backCycle') && reglas().some(r => !['backCycle', 'bassWalk'].includes(r)), 'ideas de otros niveles');
  assert.match(pr.querySelector('#rr-ideas').textContent, /· nivel [1-4]/); assert.match(pr.querySelector('#rr-suma-texto').textContent, /niveles 1 a 5/);
  assert.equal(w.localStorage.getItem('repertorio-rearm-suma'), '1');
  pr.querySelector('#rr-suma').click();
  await esperar(() => pr.querySelector('#rr-suma[aria-pressed="false"]'), 'suma apagada');
  assert.equal(w.localStorage.getItem('repertorio-rearm-suma'), '0');
  sinErrores(n); n.cerrar();
});

test('PRACTICAR · Improvisación: base en bucle con notas guía, cambia de acorde, reprograma el bucle y se apaga al salir', async () => {
  memoria.clear();
  const n = await navegador('');
  const { d, $, w } = n;
  const pr = await abrirPractica(n);
  const llamadas = []; let paradas = 0;
  w.RepertorioAudio = { tocar: async p => { llamadas.push(JSON.parse(JSON.stringify(p))); }, detener: () => { paradas++; } };
  pr.querySelector('#pr-improv-ir').click();
  await esperar(() => $('im-tocar') && !$('im-tocar').disabled, 'teoría cargada');
  assert.equal(pr.querySelectorAll('[data-tono]').length, 12); assert.equal(pr.querySelectorAll('[data-base]').length, 5); assert.equal(pr.querySelectorAll('[data-bpm]').length, 3);
  assert.equal($('im-parar').disabled, true, 'parar está apagado hasta que suena');
  pr.querySelector('[data-tono="G"]').click();
  await esperar(() => $('im-acorde').textContent === 'Am7', 'ii–V–I en G empieza en Am7');
  assert.equal(pr.querySelector('[data-tono="G"]').getAttribute('aria-pressed'), 'true');
  assert.equal(llamadas.length, 0, 'no suena hasta tocar');
  $('im-tocar').click();
  await esperar(() => llamadas.length === 1, 'programa el bloque');
  assert.equal(llamadas[0].length, 32, '8 vueltas de 4 acordes');
  assert.deepEqual(llamadas[0][0].midis, [45, 57, 60, 64, 67], 'A2 de bajo y Am7');
  assert.equal(llamadas[0][1].en, 3000, '80 pulsos: un compás cada 3 s');
  assert.equal($('im-guia').textContent.replace(/\s+/g, ' '), '3ª: C · 7ª: G');
  assert.match($('im-sig').textContent, /Siguiente: D7\. La 7ª \(G\) baja medio tono hasta la 3ª \(F♯\)\./);
  assert.match($('im-escala').textContent, /Escala: G mayor desde A — A B C D E F♯ G/);
  assert.equal($('im-parar').disabled, false); assert.equal($('im-tocar').textContent, '↻ Reiniciar');
  const fila = () => [...d.querySelectorAll('#im-fila .chip')].map(c => c.classList.contains('oye'));
  assert.deepEqual(fila(), [true, false, false, false]);
  w.Improvisar.avanzar();
  assert.equal($('im-acorde').textContent, 'D7'); assert.deepEqual(fila(), [false, true, false, false]);
  assert.match($('im-escala').textContent, /Escala: D Mixolidio/);
  w.Improvisar.avanzar(); assert.equal($('im-acorde').textContent, 'Gmaj7');
  w.Improvisar.avanzar(); w.Improvisar.avanzar(); assert.equal($('im-acorde').textContent, 'Am7', 'vuelve al principio');
  for (let i = 0; i < 27; i++) w.Improvisar.avanzar();   // 31 compases: todavía dentro del bloque
  assert.equal(llamadas.length, 1);
  w.Improvisar.avanzar();                                 // el 32: se acabó lo programado → reprograma sin que se note
  await esperar(() => llamadas.length === 2, 'segunda tanda');
  assert.equal($('im-acorde').textContent, 'Am7');
  // Cambiar de tono mientras suena reinicia con el nuevo tono; cambiar de base cambia la fila de acordes
  pr.querySelector('[data-tono="Eb"]').click();
  await esperar(() => llamadas.length === 3, 'reinicia en E♭');
  assert.equal($('im-acorde').textContent, 'Fm7'); assert.equal(pr.querySelector('[data-tono="Eb"]').getAttribute('aria-pressed'), 'true');
  pr.querySelector('[data-base="blues"]').click();
  await esperar(() => llamadas.length === 4, 'reinicia con el blues');
  assert.equal(d.querySelectorAll('#im-fila .chip').length, 12); assert.equal($('im-acorde').textContent, 'E♭7'); assert.equal(llamadas[3].length, 36, '3 vueltas de 12');
  assert.match($('im-base-texto').textContent, /dominantes/);
  const antes = paradas;
  $('im-parar').click();
  assert.ok(paradas > antes, 'parar apaga el sonido'); assert.equal($('im-parar').disabled, true);
  // Volver a Practicar con la base sonando: se apaga todo
  $('im-tocar').click();
  await esperar(() => llamadas.length === 5, 'suena otra vez');
  const antes2 = paradas;
  pr.querySelector('.cbarra button').click();
  await esperar(() => pr.querySelector('#pr-improv-ir'), 'menú de Practicar');
  assert.ok(paradas > antes2, 'al salir se detiene el sonido');
  await new Promise(r => setTimeout(r, 50));
  w.Improvisar.avanzar();                                 // un reloj que quedara vivo no debe reprogramar nada
  assert.equal(llamadas.length, 5);
  sinErrores(n); n.cerrar();
});

test('PRACTICAR (oído): progresiones de acordes con números romanos, cuatro acordes por pregunta y aviso con el tono', async () => {
  memoria.clear();
  const n = await navegador('');
  await abrirPractica(n);
  const audio = audioFalso(n);
  assert.ok(n.d.querySelector('[data-tema="prog-oido"]'), 'el tema aparece en Oído');
  await empezarTema(n, 'prog-oido', 10, 1);
  assert.equal(audio.llamadas[0].length, 4, 'un golpe por acorde'); assert.ok(audio.llamadas[0].every(p => p.midis.length === 4), 'bajo y tres notas');
  assert.deepEqual([...n.d.querySelectorAll('#practica [data-op]')].map(b => b.title), ['I – IV – V – I', 'I – V – vi – IV', 'I – vi – IV – V', 'vi – IV – I – V']);
  assert.match(n.$('practica').textContent, /¿Qué progresión suena\?/);
  await contestar(n, false);
  await esperar(() => /\(en [A-G][♯b]? mayor: /.test(n.$('practica').textContent), 'al fallar dice el tono y los acordes');
  n.$('pr-sig').click();
  await sesionCompleta(n, 9, 0);
  await esperar(() => n.$('pr-resultado'), 'resultado');
  assert.match(n.$('pr-resultado').textContent, /9 de 10 · 90%/);
  sinErrores(n); n.cerrar();
});
