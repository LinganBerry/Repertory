// Llena canciones.js (la copia de último recurso del sitio) con tus canciones reales.
//   node scripts/generar-respaldo.mjs repertorio-copia.json [salida.js]
// Usa la copia que baja el editor ("Descargar copia"). Las canciones en papelera no se incluyen.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { limpiarCancion, idValido, texto } from '../lib/limpiar.js';

export function construir(copia) {
  const canciones = (Array.isArray(copia?.canciones) ? copia.canciones : [])
    .filter(c => !c?.borrada)
    .map(c => ({ ...(idValido(c?.id) ? { id: c.id } : {}), ...limpiarCancion(c) }))
    .filter(c => c.titulo && c.tono);
  return { version: 2, nombre: texto(copia?.nombre, 120) || 'Acordes y Tonos', intro: texto(copia?.intro, 300), actualizado: '', canciones };
}
export const archivoJs = datos =>
  '// Copia de respaldo. La página usa los datos guardados en el servidor; este archivo solo se usa si el\n' +
  '// servidor no responde ni hay copia guardada en el dispositivo.\n' +
  '// Generado con: node scripts/generar-respaldo.mjs repertorio-copia.json\n' +
  'window.REPERTORIO = ' + JSON.stringify(datos).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + ';\n';

async function principal() {
  const [entrada, salida] = process.argv.slice(2);
  if (!entrada) { console.error('Uso: node scripts/generar-respaldo.mjs repertorio-copia.json [salida.js]'); process.exit(2); }
  let copia;
  try { copia = JSON.parse(await readFile(entrada, 'utf8')); } catch (e) { console.error('No pude leer la copia:', e.message); process.exit(2); }
  const datos = construir(copia);
  const destino = salida || fileURLToPath(new URL('../canciones.js', import.meta.url));
  await writeFile(destino, archivoJs(datos), 'utf8');
  console.log(datos.canciones.length + ' canciones escritas en ' + destino);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
