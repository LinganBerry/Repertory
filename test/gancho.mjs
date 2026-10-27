// Gancho de módulos: en las pruebas, '@vercel/blob' se reemplaza por el almacén falso.
export async function resolve(especificador, contexto, siguiente) {
  if (especificador === '@vercel/blob') return { url: new URL('./blob-falso.mjs', import.meta.url).href, shortCircuit: true };
  return siguiente(especificador, contexto);
}
