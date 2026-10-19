// Canciones de los usuarios. Cada usuario tiene su propia sección dentro de repertorio/comunidad.json:
//   { version: 1, usuarios: { ana: { canciones: [...], actualizado }, ... } }
//   POST /api/comunidad  { token, data: { canciones }, autor? }
//     - pase de USUARIO  -> reemplaza SOLO la sección de ese usuario (el nombre sale del pase, no del cuerpo)
//     - pase de ADMINISTRADOR -> reemplaza la sección del usuario indicado en "autor" (para editar o borrar canciones de otros)
// Los cambios usan escritura condicional (ETag): si dos personas guardan casi a la vez, se reintenta
// sobre lo más nuevo, así nadie pisa el trabajo de otro.
import { leer } from '../lib/almacen.js';
import { modificarComunidad } from '../lib/comunidad.js';
import { tokenValido, usuarioDeToken, usuarioValido, problemaConClave, problemaConSecreto } from '../lib/auth.js';
import { limpiarLista } from '../lib/limpiar.js';

const MAX_BYTES = 200_000;       // tamaño de un guardado
const MAX_CANCIONES = 150;       // por usuario

const responder = (cuerpo, status = 200) =>
  Response.json(cuerpo, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request) {
  const problema = problemaConClave() || problemaConSecreto();
  if (problema) return responder({ error: problema }, 500);
  const crudo = await request.text();
  if (crudo.length > MAX_BYTES) return responder({ error: 'Demasiado grande' }, 413);
  let cuerpo;
  try { cuerpo = JSON.parse(crudo); } catch { return responder({ error: 'JSON inválido' }, 400); }
  if (!cuerpo || typeof cuerpo !== 'object') return responder({ error: 'Solicitud inválida' }, 400);

  let autor = usuarioDeToken(cuerpo.token), admin = false;
  if (!autor) {
    if (!tokenValido(cuerpo.token)) return responder({ error: 'Sesión no válida o vencida. Entra de nuevo.' }, 401);
    admin = true;
    autor = usuarioValido(cuerpo.autor);
    if (!autor) return responder({ error: 'Falta el autor de las canciones' }, 400);
  } else {
    // Si el administrador borró la cuenta, el pase deja de servir aunque no haya vencido.
    try { if (!(await leer(`repertorio/cuentas/${autor}.json`))) return responder({ error: 'Esa cuenta ya no existe.' }, 401); }
    catch (e) { console.error(e); return responder({ error: 'No se pudo comprobar la cuenta' }, 500); }
  }

  const canciones = limpiarLista(cuerpo.data?.canciones, MAX_CANCIONES);
  if (!canciones) return responder({ error: `Datos inválidos (máximo ${MAX_CANCIONES} canciones)` }, 400);

  try {
    const r = await modificarComunidad(usuarios => {
      if (admin && !usuarios[autor]) return 'Ese usuario no tiene canciones guardadas.';
      usuarios[autor] = { canciones, actualizado: new Date().toISOString().slice(0, 10) };
      return null;
    });
    if (r.error) return responder({ error: r.error }, r.error.startsWith('Hay mucha') ? 503 : 400);
    return responder({ ok: true, canciones: canciones.length, enlaces: canciones.filter(c => c.enlace).length });
  } catch (e) {
    console.error(e);
    return responder({ error: 'No se pudo guardar en Blob: ' + (e?.message || e) }, 500);
  }
}
