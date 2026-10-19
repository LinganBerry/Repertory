// Autenticación del editor.
// La contraseña (ADMIN_PASSWORD, en Vercel) SOLO se comprueba en /api/entrar. Si es correcta, el servidor
// entrega un "pase" firmado que vence a los 30 días; el editor guarda ese pase, nunca la contraseña.
// La firma usa SESSION_SECRET (un texto aleatorio largo, también en Vercel). Así, aunque alguien robe un pase,
// no puede usarlo para adivinar la contraseña. Si SESSION_SECRET no existe, se deriva de la contraseña con
// scrypt (lento a propósito), pero lo correcto es definirlo.
// Cambiar ADMIN_PASSWORD o SESSION_SECRET en Vercel invalida todos los pases (cierra todas las sesiones).
import { createHash, createHmac, scryptSync, timingSafeEqual } from 'node:crypto';

export const MIN_CLAVE = 12;
export const MIN_SECRETO = 32;
const DIAS = 30;

const hash = s => createHash('sha256').update(String(s ?? '')).digest();

let memo = null;
function llave() {
  const secreto = process.env.SESSION_SECRET, base = secreto || process.env.ADMIN_PASSWORD;
  if (memo && memo.base === base) return memo.valor;
  const valor = secreto
    ? hash('repertorio-sesion-v2|' + secreto)
    : scryptSync(base, 'repertorio-sesion-v2', 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  memo = { base, valor };
  return valor;
}
const firmar = exp => createHmac('sha256', llave()).update('v2.' + exp).digest('hex');

// Compara en tiempo constante (sin revelar cuántas letras acertó).
export const claveValida = intento => timingSafeEqual(hash(intento), hash(process.env.ADMIN_PASSWORD));

export function crearToken() {
  const exp = Date.now() + DIAS * 864e5;
  return { token: `v2.${exp}.${firmar(exp)}`, expira: exp };
}

export function tokenValido(t) {
  const m = /^v2\.(\d{10,15})\.([0-9a-f]{64})$/.exec(String(t ?? ''));
  if (!m || Number(m[1]) < Date.now()) return false;
  return timingSafeEqual(Buffer.from(m[2], 'hex'), Buffer.from(firmar(m[1]), 'hex'));
}

// Devuelve un texto de error si la configuración del servidor es insegura o falta; si está bien, null.
export function problemaConClave() {
  const c = process.env.ADMIN_PASSWORD, s = process.env.SESSION_SECRET;
  if (!c) return 'Falta la variable ADMIN_PASSWORD en Vercel';
  if (c.length < MIN_CLAVE) return `La contraseña ADMIN_PASSWORD en Vercel es demasiado corta (mínimo ${MIN_CLAVE} caracteres)`;
  if (s && s.length < MIN_SECRETO) return `SESSION_SECRET en Vercel es demasiado corta (mínimo ${MIN_SECRETO} caracteres)`;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Cuentas de usuarios (la gente que agrega sus propias canciones).
// - El pase de usuario es distinto al del administrador: empieza con "u1." y lleva el nombre dentro,
//   firmado con la misma llave (SESSION_SECRET). Un pase de usuario NUNCA sirve como pase de administrador.
// - La contraseña del usuario nunca se guarda: se guarda scrypt(HMAC(SESSION_SECRET, contraseña), sal).
//   Así, aunque alguien viera el archivo de la cuenta, no podría probar contraseñas sin SESSION_SECRET.
// ---------------------------------------------------------------------------------------------
import { randomBytes, scrypt } from 'node:crypto';

export const MIN_USUARIO = 3, MAX_USUARIO = 20, MIN_CLAVE_USUARIO = 8;
const RESERVADOS = ['admin', 'administrador', 'administrator', 'moderador', 'soporte', 'root', 'sistema', 'yo', 'anonimo',
  ...(process.env.NOMBRES_RESERVADOS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)];

// Nombre de usuario: minúsculas, números y guion bajo. Devuelve el nombre limpio o '' si no es válido.
export function usuarioValido(v) {
  const u = String(v ?? '').trim().toLowerCase();
  return /^[a-z0-9_]+$/.test(u) && u.length >= MIN_USUARIO && u.length <= MAX_USUARIO && !RESERVADOS.includes(u) ? u : '';
}

// Para registrarse hace falta SESSION_SECRET (sirve de "pimienta" de las contraseñas).
export function problemaConSecreto() {
  const s = process.env.SESSION_SECRET;
  if (!s) return 'Falta SESSION_SECRET en Vercel: es obligatoria para que la gente pueda crear cuentas';
  if (s.length < MIN_SECRETO) return `SESSION_SECRET en Vercel es demasiado corta (mínimo ${MIN_SECRETO} caracteres)`;
  return null;
}

const derivar = (clave, sal) => new Promise((ok, no) => {
  const pre = createHmac('sha256', process.env.SESSION_SECRET).update('clave-usuario.' + clave).digest();
  scrypt(pre, sal, 32, { N: 2 ** 14, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? no(e) : ok(k)));
});
export async function crearCredencial(clave) {
  const sal = randomBytes(16);
  return { sal: sal.toString('hex'), hash: (await derivar(clave, sal)).toString('hex') };
}
export async function claveUsuarioValida(clave, cuenta) {
  if (!cuenta?.sal || !cuenta?.hash) return false;
  const k = await derivar(String(clave ?? ''), Buffer.from(cuenta.sal, 'hex'));
  const h = Buffer.from(cuenta.hash, 'hex');
  return h.length === k.length && timingSafeEqual(h, k);
}

const firmarU = (usuario, exp) => createHmac('sha256', llave()).update(`u1.${usuario}.${exp}`).digest('hex');
export function crearTokenUsuario(usuario) {
  const exp = Date.now() + DIAS * 864e5;
  return { token: `u1.${usuario}.${exp}.${firmarU(usuario, exp)}`, expira: exp };
}
// Devuelve el nombre del usuario si el pase es válido; si no, ''.
export function usuarioDeToken(t) {
  const m = /^u1\.([a-z0-9_]{3,20})\.(\d{10,15})\.([0-9a-f]{64})$/.exec(String(t ?? ''));
  if (!m || Number(m[2]) < Date.now()) return '';
  const bien = timingSafeEqual(Buffer.from(m[3], 'hex'), Buffer.from(firmarU(m[1], m[2]), 'hex'));
  return bien ? m[1] : '';
}
