// Acceso al almacén (Vercel Blob), compartido por todas las funciones.
//  - leer(ruta)            -> { data, etag } o null si no existe
//  - escribir(ruta, data)  -> sobrescribe (como siempre)
//  - escribir(ruta, data, { etag })  -> solo si nadie lo cambió desde que lo leíste (si no: lanza ConflictoError)
//  - crear(ruta, data)     -> solo si NO existe (si ya existe: lanza ExisteError)
//  (No hay función de borrar: el servidor de este proyecto no puede eliminar archivos.)
import { get, put, head, BlobPreconditionFailedError } from '@vercel/blob';

export class ConflictoError extends Error {}
export class ExisteError extends Error {}

// Según cómo se creó el almacén, el acceso es "private" o "public": se prueba en ese orden.
async function conAcceso(operacion) {
  let ultimo;
  for (const access of ['private', 'public']) {
    try { return await operacion(access); } catch (e) { ultimo = e; if (esConflicto(e)) throw e; }
  }
  throw ultimo;
}
const esConflicto = e => e instanceof BlobPreconditionFailedError;

export async function leer(ruta) {
  // La huella (ETag) se pide a la API de Blob con head(): es la misma que compara put({ ifMatch }).
  // La que llega en la cabecera de get() pasa por la red de entrega y puede venir distinta (aunque nadie haya cambiado nada),
  // y eso hacía fallar todos los guardados. Se pide ANTES de leer el contenido: si alguien guarda en medio,
  // la huella queda vieja y el guardado se rechaza (nunca pisa cambios ajenos).
  let etagApi = null;
  try { etagApi = (await head(ruta)).etag || null; } catch { etagApi = null; }
  const r = await conAcceso(access => get(ruta, { access, useCache: false }));
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return { data: JSON.parse(await new Response(r.stream).text()), etag: etagApi || r.blob.etag };
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
export const escribir = (ruta, data, { etag } = {}) => poner(ruta, data, etag ? { ifMatch: etag } : { allowOverwrite: true });
export const crear = (ruta, data) => poner(ruta, data, { allowOverwrite: false }, true);
