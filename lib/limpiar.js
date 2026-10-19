// Limpieza de canciones, compartida por el servidor del administrador y el de la comunidad.
// Solo se aceptan los campos conocidos, con límites de tamaño.
const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
// El link de referencia solo puede ser http(s): nada de javascript: ni otros esquemas.
const urlHttp = v => { const t = texto(v, 300); return /^https?:\/\/\S+$/i.test(t) ? t : ''; };

export { texto };
export function limpiarCancion(c) {
  return {
    titulo: texto(c?.titulo, 200),
    artista: texto(c?.artista, 200),
    tono: texto(c?.tono, 10),
    nota: texto(c?.nota, 300),
    enlace: urlHttp(c?.enlace),
    partes: (Array.isArray(c?.partes) ? c.partes : []).slice(0, 30)
      .map(p => ({ nombre: texto(p?.nombre, 60), tono: texto(p?.tono, 10), prog: texto(p?.prog, 500), pista: texto(p?.pista, 200) }))
      .filter(p => p.prog)
  };
}
// Devuelve la lista limpia (sin canciones sin título) o null si no es una lista válida / pasa del máximo.
export function limpiarLista(lista, max) {
  if (!Array.isArray(lista) || lista.length > max) return null;
  return lista.map(limpiarCancion).filter(c => c.titulo);
}
