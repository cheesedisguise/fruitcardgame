// Generate the rarity emoji images (128x128 PNG) for server upload.
// Upload each file as a custom emoji named exactly after its filename
// (:common:, :uncommon:, :rare:, :epic:, :legendary:, :mythic:) and the bot
// will pick them up automatically.
const fs = require('fs');
const path = require('path');

process.env.FONTCONFIG_PATH = (() => {
  // reuse the bot's font setup
  require('../src/render');
  return process.env.FONTCONFIG_PATH;
})();
const sharp = require('sharp');

const EMOJI = {
  common: { color: '#95a5a6', dark: '#7f8c8d', label: 'C' },
  uncommon: { color: '#2ecc71', dark: '#27ae60', label: 'UC' },
  rare: { color: '#3498db', dark: '#2980b9', label: 'R' },
  epic: { color: '#9b59b6', dark: '#8e44ad', label: 'E' },
  legendary: { color: '#f1c40f', dark: '#f39c12', label: 'L' },
  mythic: { color: '#e74c3c', dark: '#c0392b', label: 'M' },
};

async function main() {
  const outDir = path.join(__dirname, '..', 'assets', 'emoji');
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, e] of Object.entries(EMOJI)) {
    const fontSize = e.label.length > 1 ? 56 : 76;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${e.color}"/>
          <stop offset="1" stop-color="${e.dark}"/>
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="120" height="120" rx="30" fill="url(#g)"/>
      <rect x="8" y="8" width="112" height="112" rx="26" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="4"/>
      <text x="64" y="${64 + fontSize * 0.36}" font-family="Nunito" font-weight="800" font-size="${fontSize}"
            fill="#ffffff" text-anchor="middle">${e.label}</text>
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, `${name}.png`));
    console.log(`assets/emoji/${name}.png`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
