// Render every card (plus a pack spread and a battle image) to preview/.
// Usage: npm run preview
const fs = require('fs');
const path = require('path');
const { FRUITS } = require('../src/fruits');
const render = require('../src/render');

async function main() {
  const outDir = path.join(__dirname, '..', 'preview');
  fs.mkdirSync(outDir, { recursive: true });

  for (const fruit of FRUITS) {
    const buf = await render.renderCard(fruit.id);
    fs.writeFileSync(path.join(outDir, `card-${fruit.id}.png`), buf);
    console.log(`card-${fruit.id}.png`);
  }
  const spread = await render.renderPackSpread(['apple', 'golden_apple', 'dragonfruit', 'kiwi', 'banana']);
  fs.writeFileSync(path.join(outDir, 'pack-spread.png'), spread);
  const battle = await render.renderBattle('durian', 'cosmic_melon');
  fs.writeFileSync(path.join(outDir, 'battle.png'), battle);
  console.log('pack-spread.png\nbattle.png\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
