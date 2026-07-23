// Generate every custom-emoji image (128x128 PNG) for server upload.
// Upload each file as a custom emoji named exactly after its filename and the
// bot picks them up automatically:
//   rarities: :common: :uncommon: :rare: :epic: :legendary: :mythic:
//   variants: :foil: :gold: :prism:
//   types:    :citrus: :vine: :stone: :berry: :tropical: :orchard:
const fs = require('fs');
const path = require('path');

process.env.FONTCONFIG_PATH = (() => {
  require('../src/render'); // reuse the bot's font setup
  return process.env.FONTCONFIG_PATH;
})();
const sharp = require('sharp');

const RARITY_EMOJI = {
  common: { color: '#95a5a6', dark: '#7f8c8d', label: 'C' },
  uncommon: { color: '#2ecc71', dark: '#27ae60', label: 'UC' },
  rare: { color: '#3498db', dark: '#2980b9', label: 'R' },
  epic: { color: '#9b59b6', dark: '#8e44ad', label: 'E' },
  legendary: { color: '#f1c40f', dark: '#f39c12', label: 'L' },
  mythic: { color: '#e74c3c', dark: '#c0392b', label: 'M' },
};

function squareSvg(fillDefs, fillRef, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">
    <defs>${fillDefs}</defs>
    <rect x="4" y="4" width="120" height="120" rx="30" fill="${fillRef}"/>
    <rect x="8" y="8" width="112" height="112" rx="26" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="4"/>
    ${inner}
  </svg>`;
}

function gradient(id, stops) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${stops
    .map((s, i) => `<stop offset="${i / (stops.length - 1)}" stop-color="${s}"/>`)
    .join('')}</linearGradient>`;
}

const star = (cx, cy, r, fill = '#ffffff') =>
  `<path d="M${cx} ${cy - r} Q${cx + r * 0.2} ${cy - r * 0.2} ${cx + r} ${cy} Q${cx + r * 0.2} ${cy + r * 0.2} ${cx} ${cy + r} Q${cx - r * 0.2} ${cy + r * 0.2} ${cx - r} ${cy} Q${cx - r * 0.2} ${cy - r * 0.2} ${cx} ${cy - r} Z" fill="${fill}"/>`;

// Simple white glyphs per type, drawn with shapes (no font dependence).
const TYPE_EMOJI = {
  citrus: {
    color: '#fbc02d', dark: '#f57f17',
    glyph: `<circle cx="64" cy="64" r="34" fill="#ffffff"/>
      <circle cx="64" cy="64" r="28" fill="#fbc02d"/>
      ${[0, 60, 120, 180, 240, 300]
        .map((a) => `<path d="M64 64 L${64 + 26 * Math.cos(((a - 24) * Math.PI) / 180)} ${64 + 26 * Math.sin(((a - 24) * Math.PI) / 180)} A26 26 0 0 1 ${64 + 26 * Math.cos(((a + 24) * Math.PI) / 180)} ${64 + 26 * Math.sin(((a + 24) * Math.PI) / 180)} Z" fill="#ffffff" opacity="0.9"/>`)
        .join('')}`,
  },
  vine: {
    color: '#7cb342', dark: '#33691e',
    glyph: `<path d="M40 96 C40 60 60 44 88 36" fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round"/>
      <path d="M88 36 C80 52 64 56 52 52 C58 38 72 32 88 36 Z" fill="#ffffff"/>
      <path d="M46 84 C56 82 62 74 62 64" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>`,
  },
  stone: {
    color: '#f4511e', dark: '#b71c1c',
    glyph: `<circle cx="64" cy="60" r="32" fill="#ffffff"/>
      <ellipse cx="64" cy="60" rx="16" ry="22" fill="#f4511e"/>
      <ellipse cx="59" cy="54" rx="5" ry="8" fill="#ffffff" opacity="0.55"/>
      <path d="M64 96 C58 104 70 104 64 112" stroke="#ffffff" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  },
  berry: {
    color: '#5e35b1', dark: '#311b92',
    glyph: `<circle cx="50" cy="72" r="18" fill="#ffffff"/>
      <circle cx="78" cy="72" r="18" fill="#ffffff" opacity="0.85"/>
      <circle cx="64" cy="48" r="18" fill="#ffffff" opacity="0.95"/>
      <path d="M64 30 L58 18 M64 30 L72 20" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>`,
  },
  tropical: {
    color: '#00897b', dark: '#004d40',
    glyph: `${[-60, -20, 20, 60]
      .map((a) => `<path d="M64 88 C${64 + 40 * Math.sin((a * Math.PI) / 180)} ${60 - 20 * Math.cos((a * Math.PI) / 180)} ${64 + 44 * Math.sin((a * Math.PI) / 180)} ${44 - 14 * Math.cos((a * Math.PI) / 180)} ${64 + 34 * Math.sin(((a + 8) * Math.PI) / 180)} 30" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/>`)
      .join('')}
      <rect x="59" y="84" width="10" height="24" rx="5" fill="#ffffff"/>`,
  },
  orchard: {
    color: '#c62828', dark: '#7f0000',
    glyph: `<circle cx="55" cy="72" r="24" fill="#ffffff"/>
      <circle cx="73" cy="72" r="24" fill="#ffffff"/>
      <path d="M64 46 C62 36 66 30 72 26" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>
      <path d="M72 26 C84 24 92 30 94 40 C82 44 74 38 72 26 Z" fill="#ffffff"/>`,
  },
};

const VARIANT_EMOJI = {
  foil: {
    defs: gradient('g', ['#b388ff', '#4dd0e1', '#ffd54f', '#ff80ab']),
    inner: `${star(64, 60, 30)}${star(94, 92, 12)}${star(34, 92, 9)}`,
  },
  gold: {
    defs: gradient('g', ['#f9e8a8', '#d4af37', '#8a6d1a']),
    inner: `${star(64, 64, 32, '#fffbe8')}<circle cx="64" cy="64" r="10" fill="#d4af37"/>`,
  },
  prism: {
    defs: gradient('g', ['#ff5252', '#ffb300', '#ffee58', '#66bb6a', '#42a5f5', '#ab47bc']),
    inner: `<polygon points="64,30 96,64 64,98 32,64" fill="#ffffff" opacity="0.92"/>
      <polygon points="64,44 84,64 64,84 44,64" fill="url(#g)"/>`,
  },
};

async function main() {
  const outDir = path.join(__dirname, '..', 'assets', 'emoji');
  fs.mkdirSync(outDir, { recursive: true });

  for (const [name, e] of Object.entries(RARITY_EMOJI)) {
    const fontSize = e.label.length > 1 ? 56 : 76;
    const svg = squareSvg(gradient('g', [e.color, e.dark]), 'url(#g)',
      `<text x="64" y="${64 + fontSize * 0.36}" font-family="Nunito" font-weight="800" font-size="${fontSize}" fill="#ffffff" text-anchor="middle">${e.label}</text>`);
    await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, `${name}.png`));
    console.log(`assets/emoji/${name}.png`);
  }
  for (const [name, t] of Object.entries(TYPE_EMOJI)) {
    const svg = squareSvg(gradient('g', [t.color, t.dark]), 'url(#g)', t.glyph);
    await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, `${name}.png`));
    console.log(`assets/emoji/${name}.png`);
  }
  for (const [name, v] of Object.entries(VARIANT_EMOJI)) {
    const svg = squareSvg(v.defs, 'url(#g)', v.inner);
    await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, `${name}.png`));
    console.log(`assets/emoji/${name}.png`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
