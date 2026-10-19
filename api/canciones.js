// Servidor del repertorio: lee y guarda los datos en Vercel Blob.
//   GET  /api/canciones  -> devuelve el repertorio (público)
//   POST /api/canciones  -> guarda cambios; exige un pase de sesión (se obtiene en /api/entrar con ADMIN_PASSWORD)
import { leer, escribir } from '../lib/almacen.js';
import { RUTA_COMUNIDAD } from '../lib/comunidad.js';
import { tokenValido, problemaConClave } from '../lib/auth.js';
import { limpiarLista, texto } from '../lib/limpiar.js';

const RUTA = 'repertorio/canciones.json';          // canciones del administrador (como siempre)
const RUTA_PREVIA = 'repertorio/previo.json';      // estado anterior al último guardado (para deshacer)
const MAX_BYTES = 500_000;

const responder = (cuerpo, status = 200) =>
  Response.json(cuerpo, { status, headers: { 'Cache-Control': 'no-store' } });

function limpiar(d) {
  if (!d || typeof d !== 'object') return null;
  const canciones = limpiarLista(d.canciones, 1000);
  if (!canciones) return null;
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
    if (new URL(request.url).searchParams.has('previo')) {
      const previo = await leer(RUTA_PREVIA);
      return previo ? responder(previo.data) : responder({ error: 'Aún no hay datos guardados' }, 404);
    }
    const [admin, comunidad] = await Promise.all([leer(RUTA), leer(RUTA_COMUNIDAD)]);
    if (!admin && !comunidad) return responder({ error: 'Aún no hay datos guardados' }, 404);
    // Las del administrador no llevan "autor"; las de cada usuario llevan el nombre de su dueño.
    const de = comunidad?.data?.usuarios || {};
    const deUsuarios = Object.entries(de).flatMap(([autor, u]) => (u?.canciones || []).map(c => ({ ...c, autor })));
    return responder({ ...(admin?.data || { version: 1 }), canciones: [...(admin?.data?.canciones || []), ...deUsuarios] });
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
    try { const antes = await leer(RUTA); if (antes) await escribir(RUTA_PREVIA, antes.data); } catch (e) { console.error(e); }
    await escribir(RUTA, data);
    return responder({ ok: true, canciones: data.canciones.length, enlaces: data.canciones.filter(c => c.enlace).length });
  } catch (e) {
    console.error(e);
    return responder({ error: 'No se pudo guardar en Blob: ' + (e?.message || e) }, 500);
  }
}
