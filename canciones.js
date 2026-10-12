// Servidor del repertorio: lee y guarda los datos en Vercel Blob.
//   GET  /api/canciones  -> devuelve el repertorio (público)
//   POST /api/canciones  -> guarda cambios; exige la contraseña ADMIN_PASSWORD
import { get, put } from '@vercel/blob';
import { createHash, timingSafeEqual } from 'node:crypto';

const RUTA = 'repertorio/canciones.json';
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

async function leer() {
  const r = await conAcceso(access => get(RUTA, { access, useCache: false }));
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return JSON.parse(await new Response(r.stream).text());
}

const escribir = data => conAcceso(access => put(RUTA, JSON.stringify(data), {
  access, contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true
}));

// Compara las contraseñas en tiempo constante (sin revelar cuántas letras acertó).
const hash = s => createHash('sha256').update(String(s ?? '')).digest();
const claveValida = intento => timingSafeEqual(hash(intento), hash(process.env.ADMIN_PASSWORD));

// Solo se aceptan los campos conocidos, con límites de tamaño.
const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
function limpiar(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.canciones) || d.canciones.length > 1000) return null;
  const canciones = d.canciones.map(c => ({
    titulo: texto(c?.titulo, 200),
    artista: texto(c?.artista, 200),
    tono: texto(c?.tono, 10),
    nota: texto(c?.nota, 300),
    partes: (Array.isArray(c?.partes) ? c.partes : []).slice(0, 30)
      .map(p => ({ nombre: texto(p?.nombre, 60), prog: texto(p?.prog, 500) }))
      .filter(p => p.prog)
  })).filter(c => c.titulo);
  return {
    nombre: texto(d.nombre, 120),
    intro: texto(d.intro, 300),
    whatsapp: texto(d.whatsapp, 20).replace(/\D/g, ''),
    actualizado: texto(d.actualizado, 60),
    canciones
  };
}

export async function GET() {
  try {
    const data = await leer();
    return data ? responder(data) : responder({ error: 'Aún no hay datos guardados' }, 404);
  } catch (e) {
    console.error(e);
    return responder({ error: 'No se pudo leer el almacenamiento' }, 500);
  }
}

export async function POST(request) {
  if (!process.env.ADMIN_PASSWORD) return responder({ error: 'Falta la variable ADMIN_PASSWORD en Vercel' }, 500);
  const crudo = await request.text();
  if (crudo.length > MAX_BYTES) return responder({ error: 'Demasiado grande' }, 413);
  let cuerpo;
  try { cuerpo = JSON.parse(crudo); } catch { return responder({ error: 'JSON inválido' }, 400); }
  if (!cuerpo || typeof cuerpo !== 'object') return responder({ error: 'Solicitud inválida' }, 400);
  if (!claveValida(cuerpo.clave)) {
    await new Promise(r => setTimeout(r, 800)); // frena los intentos repetidos
    return responder({ error: 'Contraseña incorrecta' }, 401);
  }
  const data = limpiar(cuerpo.data);
  if (!data) return responder({ error: 'Datos inválidos' }, 400);
  try {
    await escribir(data);
    return responder({ ok: true, canciones: data.canciones.length });
  } catch (e) {
    console.error(e);
    return responder({ error: 'No se pudo guardar en Blob: ' + (e?.message || e) }, 500);
  }
}
