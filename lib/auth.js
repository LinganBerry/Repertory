// Autenticación del editor.
// La contraseña (ADMIN_PASSWORD, en Vercel) SOLO se comprueba en /api/entrar. Si es correcta, el servidor
// entrega un "pase" firmado que vence a los 30 días; el editor guarda ese pase, nunca la contraseña.
// Cambiar ADMIN_PASSWORD en Vercel invalida todos los pases (cierra todas las sesiones a la vez).
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const MIN_CLAVE = 12;
const DIAS = 30;

const hash = s => createHash('sha256').update(String(s ?? '')).digest();
const llave = () => hash('repertorio-sesion|' + process.env.ADMIN_PASSWORD);
const firmar = exp => createHmac('sha256', llave()).update('v1.' + exp).digest('hex');

// Compara en tiempo constante (sin revelar cuántas letras acertó).
export const claveValida = intento => timingSafeEqual(hash(intento), hash(process.env.ADMIN_PASSWORD));

export function crearToken() {
  const exp = Date.now() + DIAS * 864e5;
  return { token: `v1.${exp}.${firmar(exp)}`, expira: exp };
}

export function tokenValido(t) {
  const m = /^v1\.(\d{10,15})\.([0-9a-f]{64})$/.exec(String(t ?? ''));
  if (!m || Number(m[1]) < Date.now()) return false;
  return timingSafeEqual(Buffer.from(m[2], 'hex'), Buffer.from(firmar(m[1]), 'hex'));
}

// Devuelve un texto de error si la contraseña del servidor falta o es demasiado corta; si está bien, null.
export function problemaConClave() {
  const c = process.env.ADMIN_PASSWORD;
  if (!c) return 'Falta la variable ADMIN_PASSWORD en Vercel';
  if (c.length < MIN_CLAVE) return `La contraseña ADMIN_PASSWORD en Vercel es demasiado corta (mínimo ${MIN_CLAVE} caracteres)`;
  return null;
}
