// Progreso de práctica (solo para ti): POST /api/progreso { token, accion: 'leer' | 'sesiones', sesiones? }
// Exige el mismo pase de sesión del editor. Guarda las últimas MAX_SESIONES sesiones en repertorio/progreso.json.
// Solo agrega (una sesión con el mismo id no se repite); no hay ninguna ruta que borre.
import { leer, escribir, crear, ConflictoError, ExisteError } from '../lib/almacen.js';
import { tokenValido, problemaConClave } from '../lib/auth.js';
import { limpiarSesion, MAX_SESIONES } from '../lib/progreso.js';

const RUTA = 'repertorio/progreso.json';
const MAX_BYTES = 200_000;
const MAX_POR_ENVIO = 20;
const responder = (cuerpo, status = 200) => Response.json(cuerpo, { status, headers: { 'Cache-Control': 'no-store' } });

async function agregar(nuevas) {
  for (let i = 0; i < 12; i++) {
    const actual = await leer(RUTA);
    const doc = actual?.data && Array.isArray(actual.data.sesiones) ? actual.data : { version: 1, sesiones: [] };
    const ids = new Set(doc.sesiones.map(s => s.id));
    const nuevasSinRepetir = nuevas.filter(s => !ids.has(s.id));
    if (!nuevasSinRepetir.length) return { guardadas: 0, total: doc.sesiones.length };
    doc.sesiones = [...doc.sesiones, ...nuevasSinRepetir].slice(-MAX_SESIONES);
    try {
      if (actual) await escribir(RUTA, doc, { etag: actual.etag }); else await crear(RUTA, doc);
      return { guardadas: nuevasSinRepetir.length, total: doc.sesiones.length };
    } catch (e) { if (e instanceof ConflictoError || e instanceof ExisteError) continue; throw e; }
  }
  return { error: 'Hubo cambios al mismo tiempo. Intenta de nuevo.', status: 409 };
}

export async function POST(request) {
  const problema = problemaConClave();
  if (problema) return responder({ error: problema }, 500);
  let cuerpo;
  try {
    const bruto = await request.text();
    if (bruto.length > MAX_BYTES) return responder({ error: 'Los datos son demasiado grandes' }, 413);
    cuerpo = JSON.parse(bruto);
  } catch { return responder({ error: 'Solicitud inválida' }, 400); }
  if (!cuerpo || typeof cuerpo !== 'object') return responder({ error: 'Solicitud inválida' }, 400);
  if (!tokenValido(cuerpo.token)) return responder({ error: 'Sesión no válida o vencida' }, 401);
  try {
    if (cuerpo.accion === 'leer') {
      const r = await leer(RUTA);
      return responder({ version: 1, sesiones: Array.isArray(r?.data?.sesiones) ? r.data.sesiones : [] });
    }
    if (cuerpo.accion === 'sesiones') {
      if (!Array.isArray(cuerpo.sesiones) || !cuerpo.sesiones.length || cuerpo.sesiones.length > MAX_POR_ENVIO) return responder({ error: `Envía de 1 a ${MAX_POR_ENVIO} sesiones.` }, 400);
      const limpias = cuerpo.sesiones.map(limpiarSesion);
      if (limpias.some(s => !s)) return responder({ error: 'Alguna sesión no es válida.' }, 400);
      const res = await agregar(limpias);
      if (res.error) return responder({ error: res.error }, res.status);
      return responder({ ok: true, ...res });
    }
    return responder({ error: 'Acción desconocida' }, 400);
  } catch (e) {
    console.error('POST /api/progreso:', e);
    return responder({ error: 'No se pudo guardar el progreso. Intenta de nuevo.' }, 500);
  }
}
