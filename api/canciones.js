// Servidor del repertorio: lee y guarda los datos en Vercel Blob.
//   GET  /api/canciones  -> devuelve el repertorio (público)
//   POST /api/canciones  -> guarda cambios; exige un pase de sesión (se obtiene en /api/entrar con ADMIN_PASSWORD)
import { get, put } from '@vercel/blob';
import { tokenValido, problemaConClave } from '../lib/auth.js';

const RUTA = 'repertorio/canciones.json';
const RUTA_PREVIA = 'repertorio/previo.json'; // estado anterior al último guardado (para deshacer)
const MAX_BYTES = 500_000;

const responder = (cuerpo, status = 200) =>
  Response.json(cuerpo, { status, headers: { 'Cache-Control': 'no-store' } });

// Según cómo se creó el almacén, el acceso es "private" o "public": se prueba en ese orden.
async function conAcceso(operacion) {
  let ultimo;
  for (const access of ['private', 'public']) {
    try { return await operacion(access); } catch (e) { ultimo = e; }
  }
  throw ultimo;
}

async function leer(ruta = RUTA) {
  const r = await conAcceso(access => get(ruta, { access, useCache: false }));
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return JSON.parse(await new Response(r.stream).text());
}

const escribir = (data, ruta = RUTA) => conAcceso(access => put(ruta, JSON.stringify(data), {
  access, contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true
}));

// Solo se aceptan los campos conocidos, con límites de tamaño.
const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
// El link de referencia solo puede ser http(s): nada de javascript: ni otros esquemas.
const urlHttp = v => { const t = texto(v, 300); return /^https?:\/\/\S+$/i.test(t) ? t : ''; };
function limpiar(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.canciones) || d.canciones.length > 1000) return null;
  const canciones = d.canciones.map(c => ({
    titulo: texto(c?.titulo, 200),
    artista: texto(c?.artista, 200),
    tono: texto(c?.tono, 10),
    nota: texto(c?.nota, 300),
    enlace: urlHttp(c?.enlace),
    partes: (Array.isArray(c?.partes) ? c.partes : []).slice(0, 30)
      .map(p => ({ nombre: texto(p?.nombre, 60), tono: texto(p?.tono, 10), prog: texto(p?.prog, 500), pista: texto(p?.pista, 200) }))
      .filter(p => p.prog)
  })).filter(c => c.titulo);
  return {
    version: 1,
    nombre: texto(d.nombre, 120),
    intro: texto(d.intro, 300),
    actualizado: texto(d.actualizado, 60),
    canciones
  };
}

export async function GET(request) {
  try {
    const previo = new URL(request.url).searchParams.has('previo');
    const data = await leer(previo ? RUTA_PREVIA : RUTA);
    return data ? responder(data) : responder({ error: 'Aún no hay datos guardados' }, 404);
  } catch (e) {
    console.error(e);
    return responder({ error: 'No se pudo leer el almacenamiento' }, 500);
  }
}

export async function POST(request) {
  const problema = problemaConClave();
  if (problema) return responder({ error: problema }, 500);
  const crudo = await request.text();
  if (crudo.length > MAX_BYTES) return responder({ error: 'Demasiado grande' }, 413);
  let cuerpo;
  try { cuerpo = JSON.parse(crudo); } catch { return responder({ error: 'JSON inválido' }, 400); }
  if (!cuerpo || typeof cuerpo !== 'object') return responder({ error: 'Solicitud inválida' }, 400);
  if (!tokenValido(cuerpo.token)) return responder({ error: 'Sesión no válida o vencida. Entra de nuevo.' }, 401);
  const data = limpiar(cuerpo.data);
  if (!data) return responder({ error: 'Datos inválidos' }, 400);
  if (!data.canciones.length) return responder({ error: 'No se guarda una lista vacía (protege contra borrados por accidente)' }, 400);
  try {
    // Copia del estado anterior para poder deshacer el último guardado. Si falla, no impide guardar.
    try { const antes = await leer(); if (antes) await escribir(antes, RUTA_PREVIA); } catch (e) { console.error(e); }
    await escribir(data);
    return responder({ ok: true, canciones: data.canciones.length, enlaces: data.canciones.filter(c => c.enlace).length });
  } catch (e) {
    console.error(e);
    return responder({ error: 'No se pudo guardar en Blob: ' + (e?.message || e) }, 500);
  }
}
