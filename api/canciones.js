// Servidor del repertorio: lee y guarda los datos en Vercel Blob.
//   GET  /api/canciones  -> el repertorio (público). No incluye las canciones en la papelera.
//   POST /api/canciones  -> { token, accion, ... }  exige un pase de sesión (se obtiene en /api/entrar).
//
// Lo que este servidor PUEDE hacer: agregar y editar canciones, mandar una a la papelera y restaurarla,
// importar una copia (suma y actualiza, nunca quita) y cambiar el nombre/intro de la página.
// Lo que NO puede hacer: no existe ninguna ruta ni función que elimine canciones o archivos.
// "Borrar" solo marca la canción como borrada (borrada: true); sigue guardada y se puede restaurar.
// Además, la primera vez que hay un cambio cada día se guarda una copia del estado anterior en repertorio/historial/.
import { leer, escribir, crear, ConflictoError, ExisteError } from '../lib/almacen.js';
import { tokenValido, problemaConClave } from '../lib/auth.js';
import { limpiarCancion, guardable, idValido, texto } from '../lib/limpiar.js';
import { randomBytes } from 'node:crypto';

const RUTA = 'repertorio/canciones.json';
const MAX_BYTES = 600_000;
const MAX_CANCIONES = 1000;   // en total, contando las de la papelera
const MAX_IMPORTAR = 300;

const responder = (cuerpo, status = 200) =>
  Response.json(cuerpo, { status, headers: { 'Cache-Control': 'no-store' } });

const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const clave = c => norm(c.titulo) + '|' + norm(c.artista);
const nuevoId = () => randomBytes(8).toString('hex');
const hoy = () => new Date().toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santo_Domingo' });
const vacio = () => ({ version: 2, nombre: '', intro: '', actualizado: '', canciones: [] });
const contenido = c => JSON.stringify(limpiarCancion(c));

// Lee, aplica el cambio y escribe solo si nadie más guardó en medio (ETag). Si chocó, repite.
async function modificar(cambiar) {
  for (let i = 0; i < 12; i++) {
    const actual = await leer(RUTA);
    const previo = actual ? structuredClone(actual.data) : null;   // copia intacta, antes de aplicar el cambio
    const doc = actual?.data ?? vacio();
    if (!Array.isArray(doc.canciones)) doc.canciones = [];
    const res = cambiar(doc);
    if (res.error || res.sinCambios) return res;
    doc.version = 2;
    doc.actualizado = hoy();
    try {
      if (actual) {
        await respaldoDelDia(previo);
        await escribir(RUTA, doc, { etag: actual.etag });
      } else await crear(RUTA, doc);
      return res;
    } catch (e) { if (e instanceof ConflictoError || e instanceof ExisteError) continue; throw e; }
  }
  return { error: 'Hubo cambios al mismo tiempo. Intenta de nuevo.', status: 409 };
}
async function respaldoDelDia(anterior) {
  const dia = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' }); // AAAA-MM-DD
  try { await crear(`repertorio/historial/${dia}.json`, anterior); }
  catch (e) { if (!(e instanceof ExisteError)) console.error('respaldo del día:', e); }   // un fallo aquí no impide guardar
}

const publica = c => { const { borrada, ...resto } = c; return resto; };

export async function GET() {
  try {
    const r = await leer(RUTA);
    if (!r) return responder({ error: 'Aún no hay datos guardados' }, 404);
    const d = r.data;
    return responder({ version: 2, nombre: d.nombre || '', intro: d.intro || '', actualizado: d.actualizado || '',
      canciones: (d.canciones || []).filter(c => !c.borrada).map(publica) });
  } catch (e) {
    console.error('GET /api/canciones:', e);
    return responder({ error: 'No se pudieron leer los datos' }, 500);
  }
}

const buscarPorId = (doc, id) => doc.canciones.findIndex(c => c.id === id);

const ACCIONES = {
  guardar(doc, cuerpo) {
    const c = limpiarCancion(cuerpo.cancion);
    if (!guardable(c)) return { error: 'La canción necesita título y un tono válido.', status: 400 };
    const id = cuerpo.cancion?.id === undefined ? nuevoId() : cuerpo.cancion.id;
    if (!idValido(id)) return { error: 'Identificador inválido.', status: 400 };
    const i = buscarPorId(doc, id), ahora = new Date().toISOString();
    if (i < 0 && doc.canciones.length >= MAX_CANCIONES) return { error: 'Se llegó al máximo de canciones.', status: 400 };
    const guardada = i >= 0 ? { ...doc.canciones[i], ...c, id, actualizada: ahora } : { id, ...c, creada: ahora, actualizada: ahora };
    if (i >= 0) doc.canciones[i] = guardada; else doc.canciones.push(guardada);
    return { cancion: publica(guardada), enlaces: guardada.enlace ? 1 : 0 };
  },
  borrar(doc, cuerpo) {
    const i = buscarPorId(doc, cuerpo.id);
    if (i < 0) return { error: 'No existe esa canción.', status: 404 };
    if (!doc.canciones[i].borrada) doc.canciones[i] = { ...doc.canciones[i], borrada: true, actualizada: new Date().toISOString() };
    return { ok: true };
  },
  restaurar(doc, cuerpo) {
    const i = buscarPorId(doc, cuerpo.id);
    if (i < 0) return { error: 'No existe esa canción.', status: 404 };
    const { borrada, ...resto } = doc.canciones[i];
    doc.canciones[i] = { ...resto, actualizada: new Date().toISOString() };
    return { cancion: publica(doc.canciones[i]) };
  },
  ajustes(doc, cuerpo) {
    doc.nombre = texto(cuerpo.nombre, 120);
    doc.intro = texto(cuerpo.intro, 300);
    return { ok: true };
  },
  // Suma y actualiza; NUNCA quita. Una canción se reconoce por su id o, si no trae, por título + artista.
  importar(doc, cuerpo) {
    if (!Array.isArray(cuerpo.canciones) || !cuerpo.canciones.length) return { error: 'La copia no trae canciones.', status: 400 };
    if (cuerpo.canciones.length > MAX_IMPORTAR) return { error: `Máximo ${MAX_IMPORTAR} canciones por importación.`, status: 400 };
    const porClave = new Map(doc.canciones.map((c, i) => [clave(c), i]));
    let nuevas = 0, actualizadas = 0, iguales = 0, omitidas = 0;
    const ahora = new Date().toISOString();
    for (const original of cuerpo.canciones) {
      const c = limpiarCancion(original);
      if (!guardable(c)) { omitidas++; continue; }
      let i = idValido(original?.id) ? buscarPorId(doc, original.id) : -1;
      if (i < 0 && porClave.has(clave(c))) i = porClave.get(clave(c));
      if (i >= 0) {
        const previa = doc.canciones[i];
        if (contenido(previa) === JSON.stringify(c) && !previa.borrada) { iguales++; continue; }
        const { borrada, ...resto } = previa;
        doc.canciones[i] = { ...resto, ...c, actualizada: ahora };
        actualizadas++;
      } else {
        if (doc.canciones.length >= MAX_CANCIONES) return { error: 'Se llegó al máximo de canciones.', status: 400 };
        const id = idValido(original?.id) ? original.id : nuevoId();
        doc.canciones.push({ id, ...c, creada: ahora, actualizada: ahora });
        porClave.set(clave(c), doc.canciones.length - 1);
        nuevas++;
      }
    }
    if (typeof cuerpo.nombre === 'string' && !doc.nombre) doc.nombre = texto(cuerpo.nombre, 120);
    if (typeof cuerpo.intro === 'string' && !doc.intro) doc.intro = texto(cuerpo.intro, 300);
    const resumen = { nuevas, actualizadas, iguales, omitidas };
    return cuerpo.simular ? { ...resumen, simulado: true, sinCambios: true } : (nuevas || actualizadas ? resumen : { ...resumen, sinCambios: true });
  }
};

export async function POST(request) {
  const problema = problemaConClave();
  if (problema) return responder({ error: problema }, 500);

  const largo = Number(request.headers.get('content-length') || 0);
  if (largo > MAX_BYTES) return responder({ error: 'Los datos son demasiado grandes' }, 413);
  let cuerpo;
  try {
    const bruto = await request.text();
    if (bruto.length > MAX_BYTES) return responder({ error: 'Los datos son demasiado grandes' }, 413);
    cuerpo = JSON.parse(bruto);
  } catch { return responder({ error: 'Solicitud inválida' }, 400); }
  if (!cuerpo || typeof cuerpo !== 'object') return responder({ error: 'Solicitud inválida' }, 400);

  // Primero el pase: sin él no se toca nada.
  if (!tokenValido(cuerpo.token)) return responder({ error: 'Sesión no válida o vencida' }, 401);

  try {
    if (cuerpo.accion === 'papelera') {
      const r = await leer(RUTA);
      return responder({ canciones: (r?.data?.canciones || []).filter(c => c.borrada).map(publica) });
    }
    if (!Object.hasOwn(ACCIONES, cuerpo.accion)) return responder({ error: 'Acción desconocida' }, 400);
    const res = await modificar(doc => ACCIONES[cuerpo.accion](doc, cuerpo));
    if (res.error) return responder({ error: res.error }, res.status || 400);
    const { status, sinCambios, ...salida } = res;
    return responder({ ok: true, ...salida });
  } catch (e) {
    console.error('POST /api/canciones:', e);
    return responder({ error: 'No se pudo guardar. Intenta de nuevo.' }, 500);
  }
}
