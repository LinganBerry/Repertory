// Cuentas de usuario.  POST /api/cuenta  { accion: 'registrar' | 'entrar' | 'borrar', usuario, clave, codigo?, token? }
//   registrar -> crea repertorio/cuentas/<usuario>.json (solo si el nombre está libre) y devuelve un pase de 30 días
//   entrar    -> comprueba la contraseña y devuelve un pase
//   borrar    -> borra la cuenta y todas las canciones de ese usuario (exige su pase y su contraseña)
// Variable opcional CODIGO_REGISTRO en Vercel: si existe, quien se registre debe escribirla (registro por invitación).
import { timingSafeEqual, createHash } from 'node:crypto';
import { leer, crear, borrar, ExisteError } from '../lib/almacen.js';
import { problemaConClave, problemaConSecreto, usuarioValido, usuarioDeToken, crearCredencial, claveUsuarioValida, crearTokenUsuario, MIN_CLAVE_USUARIO } from '../lib/auth.js';
import { modificarComunidad } from '../lib/comunidad.js';

const responder = (cuerpo, status = 200) =>
  Response.json(cuerpo, { status, headers: { 'Cache-Control': 'no-store' } });
const ruta = u => `repertorio/cuentas/${u}.json`;
const sha = s => createHash('sha256').update(String(s ?? '')).digest();

// Límites por IP en memoria (ayudan, pero en Vercel cada instancia tiene los suyos: no son una muralla).
const VENTANA = 15 * 60 * 1000, MAX_FALLOS = 8, MAX_REGISTROS = 5, VENTANA_REG = 60 * 60 * 1000;
const fallos = new Map(), registros = new Map();
const bloqueado = (mapa, ip, max) => { const r = mapa.get(ip); return Boolean(r && r.hasta > Date.now() && r.n >= max); };
const sumar = (mapa, ip, ventana) => {
  const r = mapa.get(ip), ahora = Date.now();
  mapa.set(ip, { n: r && r.hasta > ahora ? r.n + 1 : 1, hasta: r && r.hasta > ahora ? r.hasta : ahora + ventana });
  if (mapa.size > 500) for (const [k, v] of mapa) if (v.hasta < ahora) mapa.delete(k);
};
// Cuenta falsa: se usa para que "usuario inexistente" tarde lo mismo que "contraseña incorrecta".
const FALSA = { sal: '00'.repeat(16), hash: '00'.repeat(32) };

export async function POST(request) {
  const problema = problemaConClave() || problemaConSecreto();
  if (problema) return responder({ error: problema }, 500);
  let c;
  try { c = await request.json(); } catch { return responder({ error: 'Solicitud inválida' }, 400); }
  if (!c || typeof c !== 'object') return responder({ error: 'Solicitud inválida' }, 400);
  const ip = (request.headers.get('x-forwarded-for') || 'desconocida').split(',')[0].trim();
  const clave = typeof c.clave === 'string' ? c.clave : '';
  if (clave.length > 200) return responder({ error: 'Solicitud inválida' }, 400);

  try {
    if (c.accion === 'registrar') {
      if (bloqueado(registros, ip, MAX_REGISTROS)) return responder({ error: 'Demasiadas cuentas creadas desde aquí. Inténtalo más tarde.' }, 429);
      const invitacion = process.env.CODIGO_REGISTRO;
      if (invitacion && !timingSafeEqual(sha(c.codigo), sha(invitacion))) return responder({ error: 'El código de invitación no es correcto.' }, 403);
      const usuario = usuarioValido(c.usuario);
      if (!usuario) return responder({ error: 'Usuario no válido: 3 a 20 caracteres, solo letras minúsculas sin tildes, números y _ (y no puede ser un nombre reservado).' }, 400);
      if (clave.length < MIN_CLAVE_USUARIO) return responder({ error: `La contraseña debe tener al menos ${MIN_CLAVE_USUARIO} caracteres.` }, 400);
      sumar(registros, ip, VENTANA_REG);
      try { await crear(ruta(usuario), { usuario, ...(await crearCredencial(clave)), creado: new Date().toISOString().slice(0, 10) }); }
      catch (e) { if (e instanceof ExisteError) return responder({ error: 'Ese nombre ya está en uso. Elige otro.' }, 409); throw e; }
      return responder({ ok: true, usuario, ...crearTokenUsuario(usuario) });
    }

    if (c.accion === 'entrar') {
      if (bloqueado(fallos, ip, MAX_FALLOS)) return responder({ error: 'Demasiados intentos. Espera unos minutos.' }, 429);
      const usuario = usuarioValido(c.usuario);
      const cuenta = usuario ? (await leer(ruta(usuario)))?.data : null;
      const bien = await claveUsuarioValida(clave, cuenta || FALSA);
      if (!usuario || !cuenta || !bien) {
        sumar(fallos, ip, VENTANA);
        await new Promise(r => setTimeout(r, 800));
        return responder({ error: 'Usuario o contraseña incorrectos' }, 401);
      }
      fallos.delete(ip);
      return responder({ ok: true, usuario, ...crearTokenUsuario(usuario) });
    }

    if (c.accion === 'borrar') {
      const usuario = usuarioDeToken(c.token);
      if (!usuario) return responder({ error: 'Sesión no válida o vencida. Entra de nuevo.' }, 401);
      if (bloqueado(fallos, ip, MAX_FALLOS)) return responder({ error: 'Demasiados intentos. Espera unos minutos.' }, 429);
      const cuenta = (await leer(ruta(usuario)))?.data;
      if (!cuenta || !(await claveUsuarioValida(clave, cuenta))) { sumar(fallos, ip, VENTANA); return responder({ error: 'Contraseña incorrecta' }, 401); }
      await modificarComunidad(usuarios => { delete usuarios[usuario]; return null; });
      await borrar(ruta(usuario));
      return responder({ ok: true });
    }
    return responder({ error: 'Acción no válida' }, 400);
  } catch (e) {
    console.error(e);
    return responder({ error: 'Error del servidor: ' + (e?.message || e) }, 500);
  }
}
