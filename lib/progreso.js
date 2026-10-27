// Validación de las sesiones de práctica. Una sesión: { id, t: tema, l: nivel, f: 'AAAA-MM-DD', n, a, ms, q: [[item, 1|0, ms], ...] }
export const MAX_SESIONES = 500;     // se conservan las más recientes
export const MAX_PREGUNTAS = 100;
const ID = /^[a-z0-9]{8,24}$/, TEMA = /^[a-z0-9-]{1,30}$/, FECHA = /^\d{4}-\d{2}-\d{2}$/, ITEM = /^[A-Za-z0-9#/_.:-]{1,24}$/;
const entero = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

// Devuelve la sesión limpia o null si no es válida (nada se "arregla" en silencio: o es válida o se rechaza).
export function limpiarSesion(s) {
  if (!s || typeof s !== 'object') return null;
  if (typeof s.id !== 'string' || !ID.test(s.id) || typeof s.t !== 'string' || !TEMA.test(s.t)) return null;
  if (typeof s.f !== 'string' || !FECHA.test(s.f) || Number.isNaN(Date.parse(s.f + 'T00:00:00Z'))) return null;
  if (!entero(s.l, 1, 20) || !entero(s.n, 1, MAX_PREGUNTAS) || !entero(s.a, 0, s.n) || !entero(s.ms, 0, 3_600_000)) return null;
  if (!Array.isArray(s.q) || s.q.length > MAX_PREGUNTAS) return null;
  const q = [];
  for (const e of s.q) {
    if (!Array.isArray(e) || e.length !== 3 || typeof e[0] !== 'string' || !ITEM.test(e[0]) || !(e[1] === 0 || e[1] === 1) || !entero(e[2], 0, 120_000)) return null;
    q.push([e[0], e[1], e[2]]);
  }
  return { id: s.id, t: s.t, l: s.l, f: s.f, n: s.n, a: s.a, ms: s.ms, q };
}
