/**
 * gen-icons.mjs — Regenera los PNGs de tamaños derivados del ícono de la
 * PWA de Estixa a partir del ícono maestro.
 * Usar: node scripts/gen-icons.mjs
 *
 * Requiere: npm install -D sharp  (ya instalado)
 *
 * IMPORTANTE: este script YA NO dibuja el logo (antes generaba el ícono
 * viejo —tijeras/figura— como SVG a mano). El logo actual ("E" + destello,
 * dorado sobre negro) es arte final entregado por Draulin en PNG, sin
 * fuente vectorial — así que este script solo REESCALA public/icon-512.png
 * (el maestro, ya en la "zona segura" del 80% tanto para uso normal como
 * maskable) hacia los tamaños más chicos que hagan falta. No reemplaza
 * favicon.ico (formato multi-resolución, no se genera bien con sharp) ni
 * los PNG ya entregados — solo sirve para el día que se necesite un
 * tamaño nuevo que hoy no está en public/.
 */

import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const masterPath = path.join(publicDir, 'icon-512.png');

if (!fs.existsSync(masterPath)) {
  console.error(`✗ No se encontró el ícono maestro en ${masterPath}`);
  process.exit(1);
}

const sizes = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-192-maskable.png', size: 192 },
  { file: 'apple-touch-icon.png', size: 180 },
];

for (const { file, size } of sizes) {
  const outPath = path.join(publicDir, file);
  await sharp(masterPath).resize(size, size).png().toFile(outPath);
  const stat = fs.statSync(outPath);
  console.log(`✓  ${file}  (${size}×${size}, ${Math.round(stat.size / 1024)} KB)`);
}

console.log('\nÍconos regenerados en public/ a partir de icon-512.png. ✅');
