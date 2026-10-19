// Acceso al almacén (Vercel Blob), compartido por todas las funciones.
//  - leer(ruta)            -> { data, etag } o null si no existe
//  - escribir(ruta, data)  -> sobrescribe (como siempre)
//  - escribir(ruta, data, { etag })  -> solo si nadie lo cambió desde que lo leíste (si no: lanza ConflictoError)
//  - crear(ruta, data)     -> solo si NO existe (si ya existe: lanza ExisteError)
//  - borrar(ruta)
import { get, put, del, BlobPreconditionFailedError } from '@vercel/blob';

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
  const r = await conAcceso(access => get(ruta, { access, useCache: false }));
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return { data: JSON.parse(await new Response(r.stream).text()), etag: r.blob.etag };
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
export const borrar = ruta => conAcceso(() => del(ruta));
