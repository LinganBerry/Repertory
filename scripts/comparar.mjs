// Compara tu copia (.json de "Descargar copia") con lo que hay publicado en el servidor.
//   node scripts/comparar.mjs repertorio-copia.json https://TU-URL [reintentos]
// Cuenta: canciones de la copia que FALTAN en el servidor y las que están DISTINTAS. Las que solo existen
// en el servidor no cuentan (importar suma y nunca quita). Termina con código 0 si hay 0 diferencias, 1 si hay.
// El 3er argumento son los reintentos si la red falla (por defecto 2).
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { limpiarCancion } from '../lib/limpiar.js';

const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const clave = c => norm(c.titulo) + '|' + norm(c.artista);
const contenido = c => JSON.stringify(limpiarCancion(c));

export function comparar(copia, vivo) {
  const enVivo = Array.isArray(vivo?.canciones) ? vivo.canciones : [];
  const porId = new Map(enVivo.filter(c => c.id).map(c => [c.id, c]));
  const porClave = new Map(enVivo.map(c => [clave(c), c]));
  const faltan = [], distintas = [];
  for (const c of (Array.isArray(copia?.canciones) ? copia.canciones : [])) {
    const ahi = (c.id && porId.get(c.id)) || porClave.get(clave(c));
    if (!ahi) faltan.push(c.titulo || '(sin título)');
    else if (contenido(ahi) !== contenido(c)) distintas.push(c.titulo || '(sin título)');
  }
  const idsCopia = new Set((copia?.canciones || []).map(c => c.id).filter(Boolean));
  const clavesCopia = new Set((copia?.canciones || []).map(clave));
  const soloServidor = enVivo.filter(c => !idsCopia.has(c.id) && !clavesCopia.has(clave(c))).length;
  return { faltan, distintas, soloServidor, diferencias: faltan.length + distintas.length };
}

async function traer(url, reintentos) {
  let ultimo;
  for (let i = 0; i <= reintentos; i++) {
    try {
      const r = await fetch(url.replace(/\/+$/, '') + '/api/canciones', { cache: 'no-store' });
      if (!r.ok) throw new Error('el servidor respondió ' + r.status);
      return await r.json();
    } catch (e) { ultimo = e; await new Promise(ok => setTimeout(ok, 500 * (i + 1))); }
  }
  throw ultimo;
}

async function principal() {
  const [archivo, url, rein] = process.argv.slice(2);
  if (!archivo || !url) { console.error('Uso: node scripts/comparar.mjs repertorio-copia.json https://TU-URL [reintentos]'); process.exit(2); }
  const reintentos = rein === undefined ? 2 : Number(rein);
  if (!Number.isInteger(reintentos) || reintentos < 0) { console.error('reintentos debe ser un número entero (0 o más).'); process.exit(2); }
  let copia, vivo;
  try { copia = JSON.parse(await readFile(archivo, 'utf8')); } catch (e) { console.error('No pude leer la copia:', e.message); process.exit(2); }
  try { vivo = await traer(url, reintentos); } catch (e) { console.error('No pude leer el servidor:', e.message); process.exit(2); }
  const r = comparar(copia, vivo);
  if (r.faltan.length) console.log('Faltan en el servidor: ' + r.faltan.join(' · '));
  if (r.distintas.length) console.log('Distintas: ' + r.distintas.join(' · '));
  if (r.soloServidor) console.log('Solo en el servidor (no cuentan): ' + r.soloServidor);
  console.log(r.diferencias + ' diferencias');
  process.exit(r.diferencias ? 1 : 0);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
