// Lectura/modificación de repertorio/comunidad.json (canciones de los usuarios), con reintentos por ETag.
import { leer, escribir, crear, ConflictoError, ExisteError } from './almacen.js';

export const RUTA_COMUNIDAD = 'repertorio/comunidad.json';
const MAX_TOTAL = 3_000_000;     // tamaño de todo el archivo (protege la lectura de la página)

// Aplica un cambio a comunidad.json con reintentos. `cambiar(usuarios)` modifica el objeto y devuelve un texto de error o null.
export async function modificarComunidad(cambiar) {
  for (let intento = 0; intento < 8; intento++) {
    if (intento) await new Promise(r => setTimeout(r, Math.random() * 60 * intento));   // pausa al azar: evita que todos reintenten a la vez
    const actual = await leer(RUTA_COMUNIDAD);
    const doc = actual?.data && typeof actual.data === 'object' ? actual.data : { version: 1, usuarios: {} };
    doc.usuarios = doc.usuarios && typeof doc.usuarios === 'object' ? doc.usuarios : {};
    const error = cambiar(doc.usuarios);
    if (error) return { error };
    if (JSON.stringify(doc).length > MAX_TOTAL) return { error: 'La comunidad llegó al límite de espacio. Avisa al administrador.' };
    try {
      if (actual) await escribir(RUTA_COMUNIDAD, doc, { etag: actual.etag }); else await crear(RUTA_COMUNIDAD, doc);
      return { ok: true };
    } catch (e) {
      if (e instanceof ConflictoError || e instanceof ExisteError) continue;   // alguien guardó justo antes: reintentar
      throw e;
    }
  }
  return { error: 'Hay mucha gente guardando a la vez. Inténtalo de nuevo en unos segundos.' };
}

