// POST /api/entrar  { clave } -> { ok, token, expira }   (único lugar donde se prueba la contraseña)
import { claveValida, crearToken, problemaConClave } from '../lib/auth.js';

const VENTANA = 15 * 60 * 1000; // 15 minutos
const MAX_FALLOS = 5;
// Contador por IP en memoria. En Vercel cada instancia tiene el suyo, así que esto ayuda pero no es
// una muralla: la defensa real es una contraseña larga (y, si quieres, una regla de límite en el Firewall de Vercel).
const fallos = new Map();

const responder = (cuerpo, status = 200) =>
  Response.json(cuerpo, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request) {
  const problema = problemaConClave();
  if (problema) return responder({ error: problema }, 500);

  const ip = (request.headers.get('x-forwarded-for') || 'desconocida').split(',')[0].trim();
  const ahora = Date.now();
  const reg = fallos.get(ip);
  if (reg && reg.hasta > ahora && reg.n >= MAX_FALLOS) return responder({ error: 'Demasiados intentos. Espera unos minutos.' }, 429);

  let cuerpo;
  try { cuerpo = await request.json(); } catch { return responder({ error: 'Solicitud inválida' }, 400); }
  if (!cuerpo || typeof cuerpo.clave !== 'string' || cuerpo.clave.length > 200) return responder({ error: 'Solicitud inválida' }, 400);

  if (!claveValida(cuerpo.clave)) {
    fallos.set(ip, { n: reg && reg.hasta > ahora ? reg.n + 1 : 1, hasta: ahora + VENTANA });
    if (fallos.size > 500) for (const [k, v] of fallos) if (v.hasta < ahora) fallos.delete(k);
    await new Promise(r => setTimeout(r, 1000)); // frena cada intento
    return responder({ error: 'Contraseña incorrecta' }, 401);
  }
  fallos.delete(ip);
  return responder({ ok: true, ...crearToken() });
}
