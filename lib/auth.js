// Autenticación del editor (un solo usuario: tú).
// La contraseña (ADMIN_PASSWORD, en Vercel) SOLO se comprueba en /api/entrar. Si es correcta, el servidor
// entrega un "pase" firmado que vence a los 30 días; el editor guarda ese pase, nunca la contraseña.
// La firma usa SESSION_SECRET (texto aleatorio largo, también en Vercel y OBLIGATORIO). Así, aunque alguien
// robe un pase, no puede usarlo para adivinar la contraseña.
// Cambiar ADMIN_PASSWORD o SESSION_SECRET en Vercel invalida todos los pases (cierra todas las sesiones).
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const MIN_CLAVE = 12;
export const MIN_SECRETO = 32;
const DIAS = 30;

const hash = s => createHash('sha256').update(String(s ?? '')).digest();

let memo = null;
function llave() {
  const secreto = process.env.SESSION_SECRET;
  if (memo && memo.base === secreto) return memo.valor;
  memo = { base: secreto, valor: hash('repertorio-sesion-v3|' + secreto) };
  return memo.valor;
}
const firmar = exp => createHmac('sha256', llave()).update('v3.' + exp).digest('hex');

// Compara en tiempo constante (sin revelar cuántas letras acertó).
export const claveValida = intento => timingSafeEqual(hash(intento), hash(process.env.ADMIN_PASSWORD));

export function crearToken() {
  const exp = Date.now() + DIAS * 864e5;
  return { token: `v3.${exp}.${firmar(exp)}`, expira: exp };
}

export function tokenValido(t) {
  const m = /^v3\.(\d{10,15})\.([0-9a-f]{64})$/.exec(String(t ?? ''));
  if (!m || Number(m[1]) < Date.now()) return false;
  return timingSafeEqual(Buffer.from(m[2], 'hex'), Buffer.from(firmar(m[1]), 'hex'));
}

// Devuelve un texto de error si la configuración del servidor es insegura o falta; si está bien, null.
export function problemaConClave() {
  const c = process.env.ADMIN_PASSWORD, s = process.env.SESSION_SECRET;
  if (!c) return 'Falta la variable ADMIN_PASSWORD en Vercel';
  if (c.length < MIN_CLAVE) return `ADMIN_PASSWORD en Vercel es demasiado corta (mínimo ${MIN_CLAVE} caracteres)`;
  if (!s) return 'Falta la variable SESSION_SECRET en Vercel';
  if (s.length < MIN_SECRETO) return `SESSION_SECRET en Vercel es demasiado corta (mínimo ${MIN_SECRETO} caracteres)`;
  return null;
}
