// Mide el contraste (WCAG 2.x) de los colores de estilos.css, leyendo las variables de cada tema.
//   node scripts/contraste.mjs        -> imprime la tabla; termina con código 1 si algún par no llega a su mínimo
// Texto normal: 4.5:1. Bordes y foco (elementos no textuales): 3:1.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const canal = c => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
export const luz = ([r, g, b]) => 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
export const ratio = (a, b) => { const [x, y] = [luz(a), luz(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export const hex = h => { const t = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(t.slice(i, i + 2), 16)); };
export function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map(v => Math.round(v * 255));
}
const variables = (css, tema) => {
  const m = new RegExp(':root\\[data-tema=' + tema + '\\]\\s*\\{([^}]*)\\}').exec(css);
  if (!m) throw new Error('No encuentro el tema ' + tema + ' en estilos.css');
  return Object.fromEntries([...m[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map(x => [x[1], x[2].trim()]));
};

export async function medir(ruta = new URL('../estilos.css', import.meta.url)) {
  const css = await readFile(ruta, 'utf8'), filas = [];
  for (const tema of ['papel', 'escenario']) {
    const v = variables(css, tema), fondos = { fondo: v.bg, fila: v.fila, 'fila coro': v.fila2 };
    for (const [nf, fondo] of Object.entries(fondos)) {
      for (const [nt, min] of [['ink', 4.5], ['muted', 4.5], ['accent', 4.5], ['peligro', 4.5]]) {
        filas.push({ tema, par: `${nt} sobre ${nf}`, ratio: ratio(hex(v[nt]), hex(fondo)), min });
      }
      filas.push({ tema, par: `foco/acento (no texto) sobre ${nf}`, ratio: ratio(hex(v.accent), hex(fondo)), min: 3 });
    }
    // Pastillas de tono: texto --pt sobre hsl(h s pl) para los 12 tonos, mayor (34%) y menor (22%).
    const pl = parseFloat(v.pl);
    let peor = { ratio: Infinity };
    for (let i = 0; i < 12; i++) for (const s of [34, 22]) {
      const r = ratio(hex(v.pt), hsl(i * 30, s, pl));
      if (r < peor.ratio) peor = { ratio: r, par: `pastilla de tono (peor de 24: hue ${i * 30}, sat ${s}%)` };
    }
    filas.push({ tema, par: peor.par, ratio: peor.ratio, min: 4.5 });
  }
  return filas;
}

async function principal() {
  const filas = await medir();
  let mal = 0;
  for (const f of filas) {
    const ok = f.ratio >= f.min; if (!ok) mal++;
    console.log((ok ? '  ok ' : 'FALLA') + ` ${f.ratio.toFixed(2).padStart(5)}:1 (mín ${f.min})  ${f.tema.padEnd(9)} ${f.par}`);
  }
  console.log(mal + ' pares bajo el mínimo de ' + filas.length);
  process.exit(mal ? 1 : 0);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
