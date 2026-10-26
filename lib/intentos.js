// Límite de intentos de contraseña, guardado en el almacén (sobrevive entre instancias de Vercel).
//  - Por IP: 5 intentos fallidos seguidos -> bloqueada 15 minutos (se cuenta desde el último fallo).
//  - Global: 20 fallos entre todas las IPs en 15 minutos -> bloqueo de todos (por si cambian de IP).
//    Efecto secundario aceptado: un atacante puede dejarte fuera hasta 15 minutos. Se levanta solo.
// Cada intento se REGISTRA ANTES de comprobar la contraseña (con ETag), así que enviar muchos intentos
// a la vez no sirve para esquivar el límite. Si el almacén falla, NO se deja pasar: se rechaza (cierra seguro).
import { leer, escribir, crear, ConflictoError, ExisteError } from './almacen.js';

export const RUTA = 'repertorio/intentos.json';
export const VENTANA = 15 * 60 * 1000;
export const MAX_IP = 5;
export const MAX_GLOBAL = 20;
const REINTENTOS = 25;

const vacio = () => ({ ips: {}, global: { n: 0, hasta: 0 } });

function depurar(d, ahora) {
  for (const [ip, r] of Object.entries(d.ips)) if (r.hasta <= ahora) delete d.ips[ip];
  if (d.global.hasta <= ahora) d.global = { n: 0, hasta: 0 };
  // Tope de tamaño: si hubiera demasiadas IPs distintas, se conservan las que más fallaron.
  const claves = Object.keys(d.ips);
  if (claves.length > 200) claves.sort((a, b) => d.ips[b].n - d.ips[a].n).slice(200).forEach(k => delete d.ips[k]);
  return d;
}

async function modificar(cambiar) {
  for (let i = 0; i < REINTENTOS; i++) {
    const actual = await leer(RUTA);
    const d = depurar(actual?.data ?? vacio(), Date.now());
    const res = cambiar(d, Date.now());
    if (res.sinCambios) return res;
    try {
      if (actual) await escribir(RUTA, d, { etag: actual.etag }); else await crear(RUTA, d);
      return res;
    } catch (e) {
      if (!(e instanceof ConflictoError || e instanceof ExisteError)) throw e;
      await new Promise(r => setTimeout(r, Math.random() * 30 * (i + 1)));   // evita que todos choquen a la vez
    }
  }
  throw new Error('no se pudo registrar el intento');
}

// Registra un intento. Devuelve { permitido: true } o { permitido: false, espera: segundos }.
export const reservar = ip => modificar((d, ahora) => {
  const r = d.ips[ip];
  if (r && r.n >= MAX_IP) return { permitido: false, espera: Math.ceil((r.hasta - ahora) / 1000), sinCambios: true };
  if (d.global.n >= MAX_GLOBAL) return { permitido: false, espera: Math.ceil((d.global.hasta - ahora) / 1000), sinCambios: true };
  d.ips[ip] = { n: (r?.n || 0) + 1, hasta: ahora + VENTANA };
  d.global = { n: d.global.n + 1, hasta: ahora + VENTANA };
  return { permitido: true };
});

// Contraseña correcta: se borra el registro de esa IP y se devuelve su intento al contador global.
export const exito = ip => modificar(d => {
  if (!d.ips[ip]) return { sinCambios: true };
  delete d.ips[ip];
  d.global.n = Math.max(0, d.global.n - 1);
  return {};
});
