// Limpieza de canciones. Solo se aceptan los campos conocidos, con límites de tamaño.
const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
// El link de referencia solo puede ser http(s): nada de javascript: ni otros esquemas.
const urlHttp = v => { const t = texto(v, 300); return /^https?:\/\/\S+$/i.test(t) ? t : ''; };
const TONO = /^[A-G][#b]?m?$/;
const ID = /^[A-Za-z0-9_-]{6,40}$/;

export { texto };
export const idValido = v => typeof v === 'string' && ID.test(v);

// Devuelve los campos de contenido de una canción (sin id ni marcas de fecha).
export function limpiarCancion(c) {
  const tono = texto(c?.tono, 10);
  return {
    titulo: texto(c?.titulo, 200),
    artista: texto(c?.artista, 200),
    tono: TONO.test(tono) ? tono : '',
    nota: texto(c?.nota, 300),
    enlace: urlHttp(c?.enlace),
    partes: (Array.isArray(c?.partes) ? c.partes : []).slice(0, 30)
      .map(p => ({ nombre: texto(p?.nombre, 60), tono: TONO.test(texto(p?.tono, 10)) ? texto(p?.tono, 10) : '', prog: texto(p?.prog, 500), pista: texto(p?.pista, 200) }))
      .filter(p => p.prog)
  };
}
// Una canción es guardable si tiene título y un tono válido.
export const guardable = c => Boolean(c.titulo && c.tono);
