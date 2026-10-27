// Limpieza de canciones. Solo se aceptan los campos conocidos, con límites de tamaño.
const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
// El link de referencia solo puede ser http(s): nada de javascript: ni otros esquemas.
const urlHttp = v => { const t = texto(v, LIMITES.enlace); return /^https?:\/\/\S+$/i.test(t) ? t : ''; };
// Límites de tamaño. editor.js tiene una copia (LIM) y test/probar.mjs comprueba que coinciden.
export const LIMITES = { titulo: 200, artista: 200, nota: 300, enlace: 300, partes: 30, nombre: 60, prog: 500, pista: 200 };
const TONO = /^[A-G][#b]?m?$/;
const ID = /^[A-Za-z0-9_-]{6,40}$/;

export { texto };
export const idValido = v => typeof v === 'string' && ID.test(v);

// Devuelve los campos de contenido de una canción (sin id ni marcas de fecha).
export function limpiarCancion(c) {
  const tono = texto(c?.tono, 10);
  return {
    titulo: texto(c?.titulo, LIMITES.titulo),
    artista: texto(c?.artista, LIMITES.artista),
    tono: TONO.test(tono) ? tono : '',
    nota: texto(c?.nota, LIMITES.nota),
    enlace: urlHttp(c?.enlace),
    partes: (Array.isArray(c?.partes) ? c.partes : []).slice(0, LIMITES.partes)
      .map(p => ({ nombre: texto(p?.nombre, LIMITES.nombre), tono: TONO.test(texto(p?.tono, 10)) ? texto(p?.tono, 10) : '', prog: texto(p?.prog, LIMITES.prog), pista: texto(p?.pista, LIMITES.pista) }))
      .filter(p => p.prog)
  };
}
// Una canción es guardable si tiene título y un tono válido.
export const guardable = c => Boolean(c.titulo && c.tono);
