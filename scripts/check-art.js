// Render a single fruit SVG to PNG so it can be visually checked.
// Usage: node scripts/check-art.js <fruit-id> [outDir]
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function main() {
  const id = process.argv[2];
  const outDir = process.argv[3] || path.join(__dirname, '..', 'preview');
  if (!id) {
    console.error('Usage: node scripts/check-art.js <fruit-id> [outDir]');
    process.exit(1);
  }
  const svgPath = path.join(__dirname, '..', 'src', 'art', `${id}.svg`);
  const svg = fs.readFileSync(svgPath);
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${id}.png`);
  await sharp(svg).resize(512, 512).png().toFile(out);
  console.log(out);
}

main().catch((err) => {
  console.error('RENDER FAILED:', err.message);
  process.exit(1);
});
