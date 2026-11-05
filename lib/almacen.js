// Acceso al almacén (Vercel Blob), compartido por todas las funciones.
//  - leer(ruta)            -> { data, etag } o null si no existe
//  - leer(ruta, { conEtag: false }) -> igual pero sin pedir la huella (una operación menos): para lecturas que no van a escribir
//  - escribir(ruta, data)  -> sobrescribe (como siempre)
//  - escribir(ruta, data, { etag })  -> solo si nadie lo cambió desde que lo leíste (si no: lanza ConflictoError)
//  - crear(ruta, data)     -> solo si NO existe (si ya existe: lanza ExisteError)
//  (No hay función de borrar: el servidor de este proyecto no puede eliminar archivos.)
import { get, put, head, BlobPreconditionFailedError } from '@vercel/blob';

export class ConflictoError extends Error {}
export class ExisteError extends Error {}

// Según cómo se creó el almacén, el acceso es "private" o "public": se prueba en ese orden.
// Se recuerda el acceso que funcionó la última vez y se prueba primero: si el almacén es "public", así no se pierde un intento fallido en cada operación.
let preferido = 'private';
async function conAcceso(operacion) {
  let ultimo;
  for (const access of preferido === 'private' ? ['private', 'public'] : ['public', 'private']) {
    try { const r = await operacion(access); preferido = access; return r; } catch (e) { ultimo = e; if (esConflicto(e)) throw e; }
  }
  throw ultimo;
}
const esConflicto = e => e instanceof BlobPreconditionFailedError;

// Huella sin comillas, sin "W/" y sin sufijos de compresión, solo para comparar dos huellas entre sí.
const sinFormato = e => String(e || '').replace(/^W\//, '').replace(/"/g, '').replace(/-(gzip|br)$/, '');

export async function leer(ruta, { conEtag = true } = {}) {
  // La huella (ETag) que acepta put({ ifMatch }) es la de la API de Blob (head). La de la cabecera de get() puede venir
  // con otro formato aunque nadie haya cambiado nada, y eso hacía fallar los guardados.
  // Se pide ANTES de leer el contenido. Solo se usa la de head() si coincide con la de get() (mismo archivo, solo cambia el formato):
  // así se garantiza que el contenido leído y la huella son de la misma versión. Si no coinciden, se usa la de get() (más lento, pero seguro).
  let etagApi = null;
  if (conEtag) { try { etagApi = (await head(ruta)).etag || null; } catch { etagApi = null; } }
  const r = await conAcceso(access => get(ruta, { access, useCache: false }));
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  const etagGet = r.blob.etag;
  let etag = etagGet;
  if (etagApi && sinFormato(etagApi) === sinFormato(etagGet)) etag = etagApi;
  else if (etagApi) console.warn('ETag distinto entre head y get:', etagApi, etagGet);   // queda en los registros de Vercel
  return { data: JSON.parse(await new Response(r.stream).text()), etag };
}

async function poner(ruta, data, extra, soloSiNoExiste = false) {
  try {
    return await conAcceso(access => put(ruta, JSON.stringify(data), { access, contentType: 'application/json', addRandomSuffix: false, ...extra }));
  } catch (e) {
    if (esConflicto(e)) throw new ConflictoError('conflicto');
    // No se depende del texto del error de Blob: si no se podía sobrescribir y el archivo existe, es que ya existía.
    if (soloSiNoExiste) { let hay = false; try { hay = Boolean(await leer(ruta)); } catch { /* nada */ } if (hay) throw new ExisteError('existe'); }
    throw e;
  }
}
// Rutas que ya se sabe que existen. Nada en este proyecto borra archivos, así que no hace falta volver a preguntárselo a Blob:
// cada intento fallido de crear cuesta varias operaciones. Solo se usa con { recordar: true } (el respaldo del día).
const sabidas = new Set();
export const olvidarSabidas = () => sabidas.clear();   // solo para las pruebas
export const escribir = (ruta, data, { etag } = {}) => poner(ruta, data, etag ? { ifMatch: etag } : { allowOverwrite: true });
export async function crear(ruta, data, { recordar = false } = {}) {
  if (recordar && sabidas.has(ruta)) throw new ExisteError('existe');
  try { const r = await poner(ruta, data, { allowOverwrite: false }, true); if (recordar) sabidas.add(ruta); return r; }
  catch (e) { if (recordar && e instanceof ExisteError) sabidas.add(ruta); throw e; }
}
