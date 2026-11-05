// Renders the PNG app icons from icons/icon.svg. Usage: npm run icons
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const dir = new URL('../icons/', import.meta.url);
const svg = readFileSync(new URL('icon.svg', dir), 'utf8');

// Regular icons get rounded corners; the maskable and Apple icons stay full-bleed because
// the platform applies its own mask.
const rounded = svg.replace(
  '<rect width="512" height="512"',
  '<rect width="512" height="512" rx="112"',
);

const outputs = [
  ['icon-192.png', rounded, 192],
  ['icon-512.png', rounded, 512],
  ['icon-maskable-512.png', svg, 512],
  ['apple-touch-icon.png', svg, 180],
];

for (const [name, source, size] of outputs) {
  const png = new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(new URL(name, dir), png);
  console.log(`icons/${name} (${size}px)`);
}
