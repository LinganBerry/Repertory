// Almacén falso en memoria con la misma interfaz que usa lib/almacen.js de @vercel/blob (get, put, ifMatch, allowOverwrite).
// OJO: imita cómo el proyecto USA Blob; no es el servicio real de Vercel.
export class BlobPreconditionFailedError extends Error {}
export const memoria = new Map();      // ruta -> { texto, etag }
export const registro = [];            // operaciones realizadas, para las pruebas
let n = 0;
export async function get(ruta, { access } = {}) {
  registro.push({ op: 'get', ruta, access });
  const b = memoria.get(ruta);
  if (!b) return null;
  return { statusCode: 200, stream: new Blob([b.texto]).stream(), blob: { etag: b.etag } };
}
export async function head(ruta) {
  registro.push({ op: 'head', ruta });
  const b = memoria.get(ruta);
  if (!b) throw new Error('not found');
  return { etag: b.etag };
}
export async function put(ruta, cuerpo, { access, ifMatch, allowOverwrite } = {}) {
  registro.push({ op: 'put', ruta, access });
  await new Promise(r => setImmediate(r));   // cede el turno: así las peticiones simultáneas sí se cruzan
  const b = memoria.get(ruta);
  if (ifMatch !== undefined) { if (!b || b.etag !== ifMatch) throw new BlobPreconditionFailedError('etag distinto'); }
  else if (b && allowOverwrite === false) throw new Error('This blob already exists');
  memoria.set(ruta, { texto: String(cuerpo), etag: '"e' + (++n) + '"' });
  return { url: 'https://falso.local/' + ruta };
}
