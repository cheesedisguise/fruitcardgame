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
    glyph: `<circle cx="64" cy="52" r="18" fill="#ffffff" opacity="0.95"/>
      <circle cx="47" cy="78" r="18" fill="#ffffff"/>
      <circle cx="81" cy="78" r="18" fill="#ffffff" opacity="0.85"/>
      <path d="M64 34 L58 22 M64 34 L72 24" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>`,
  },
  tropical: {
    color: '#00897b', dark: '#004d40',
    glyph: `<circle cx="64" cy="64" r="24" fill="#ffffff"/>
      ${[0, 45, 90, 135, 180, 225, 270, 315]
        .map((a) => {
          const r = (a * Math.PI) / 180;
          return `<line x1="${64 + 34 * Math.cos(r)}" y1="${64 + 34 * Math.sin(r)}" x2="${64 + 48 * Math.cos(r)}" y2="${64 + 48 * Math.sin(r)}" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/>`;
        })
        .join('')}`,
  },
  orchard: {
    color: '#c62828', dark: '#7f0000',
    glyph: `<circle cx="64" cy="52" r="26" fill="#ffffff"/>
      <circle cx="42" cy="64" r="18" fill="#ffffff"/>
      <circle cx="86" cy="64" r="18" fill="#ffffff"/>
      <path d="M58 84 L58 106 L70 106 L70 84 Z" fill="#ffffff"/>
      <circle cx="54" cy="56" r="5" fill="#c62828"/>
      <circle cx="76" cy="62" r="5" fill="#c62828"/>`,
  },
};

// Gameplay icons the bot uses everywhere (coins, energy, abilities...).
const ICON_EMOJI = {
  coin: {
    color: '#fbc02d', dark: '#c49000',
    glyph: `<circle cx="64" cy="64" r="36" fill="#ffffff"/>
      <circle cx="64" cy="64" r="36" fill="none" stroke="#c49000" stroke-width="5"/>
      <circle cx="64" cy="64" r="24" fill="none" stroke="#c49000" stroke-width="4"/>
      <path d="M40 48 A32 32 0 0 1 58 34" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>`,
  },
  energy: {
    color: '#7e57c2', dark: '#4527a0',
    glyph: `<polygon points="72,22 44,70 62,70 54,106 88,54 68,54" fill="#ffe082" stroke="#ffffff" stroke-width="4" stroke-linejoin="round"/>`,
  },
  shield: {
    color: '#1976d2', dark: '#0d47a1',
    glyph: `<path d="M64 22 L98 34 L98 62 C98 86 84 100 64 108 C44 100 30 86 30 62 L30 34 Z" fill="#ffffff"/>
      <path d="M64 34 L86 42 L86 62 C86 79 76 89 64 95 C52 89 42 79 42 62 L42 42 Z" fill="#1976d2"/>`,
  },
  hp: {
    color: '#e53935', dark: '#b71c1c',
    glyph: `<path d="M64 100 C64 100 28 76 28 50 C28 36 39 27 50 27 C56 27 62 30 64 36 C66 30 72 27 78 27 C89 27 100 36 100 50 C100 76 64 100 64 100 Z" fill="#ffffff"/>`,
  },
  battle: {
    color: '#8d6e63', dark: '#4e342e',
    glyph: `<g transform="rotate(-45 64 64)">
      <polygon points="64,18 69,26 69,74 59,74 59,26" fill="#ffffff"/>
      <rect x="47" y="74" width="34" height="7" rx="3.5" fill="#ffd54f"/>
      <rect x="60" y="81" width="8" height="15" rx="4" fill="#ffd54f"/>
      <circle cx="64" cy="100" r="5" fill="#ffca28"/>
    </g>
    <g transform="rotate(45 64 64)">
      <polygon points="64,18 69,26 69,74 59,74 59,26" fill="#ffffff"/>
      <rect x="47" y="74" width="34" height="7" rx="3.5" fill="#ffd54f"/>
      <rect x="60" y="81" width="8" height="15" rx="4" fill="#ffd54f"/>
      <circle cx="64" cy="100" r="5" fill="#ffca28"/>
    </g>`,
  },
  pack: {
    color: '#66bb6a', dark: '#1b5e20',
    glyph: `<rect x="34" y="36" width="60" height="66" rx="10" fill="#ffffff"/>
      <polygon points="34,36 40,26 48,36 56,26 64,36 72,26 80,36 88,26 94,36" fill="#ffffff"/>
      <circle cx="64" cy="68" r="16" fill="#66bb6a"/>`,
  },
  smash: {
    color: '#ef6c00', dark: '#bf360c',
    glyph: `<polygon points="64,20 74,48 104,44 82,64 98,90 68,78 56,106 52,76 24,80 46,58 32,32 60,46" fill="#ffffff"/>`,
  },
  regrow: {
    color: '#43a047', dark: '#1b5e20',
    glyph: `<path d="M64 104 L64 58" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/>
      <path d="M64 62 C62 42 48 34 30 34 C32 54 44 64 64 62 Z" fill="#ffffff"/>
      <path d="M64 76 C66 60 78 52 96 52 C94 70 82 78 64 76 Z" fill="#ffffff" opacity="0.9"/>`,
  },
  pierce: {
    color: '#546e7a', dark: '#263238',
    glyph: `<polygon points="64,18 74,42 74,80 54,80 54,42" fill="#ffffff"/>
      <rect x="42" y="80" width="44" height="9" rx="4.5" fill="#ffd54f"/>
      <rect x="58" y="89" width="12" height="16" rx="5" fill="#ffd54f"/>
      <circle cx="64" cy="110" r="5" fill="#ffca28"/>`,
  },
  drain: {
    color: '#6a1b9a', dark: '#38006b',
    glyph: `<path d="M64 22 C80 48 92 62 92 80 C92 96 79 106 64 106 C49 106 36 96 36 80 C36 62 48 48 64 22 Z" fill="#ffffff"/>
      <polygon points="52,58 58,74 46,74" fill="#6a1b9a"/>
      <polygon points="76,58 82,74 70,74" fill="#6a1b9a"/>`,
  },
  flurry: {
    color: '#00838f', dark: '#004d5a',
    glyph: `<circle cx="50" cy="52" r="24" fill="#ffe082" stroke="#ffffff" stroke-width="4"/>
      <circle cx="78" cy="78" r="24" fill="#ffd54f" stroke="#ffffff" stroke-width="4"/>
      <circle cx="50" cy="52" r="12" fill="none" stroke="#c49000" stroke-width="3"/>
      <circle cx="78" cy="78" r="12" fill="none" stroke="#c49000" stroke-width="3"/>`,
  },
  ripen: {
    color: '#2e7d32', dark: '#124116',
    glyph: `<polygon points="64,22 96,58 76,58 76,102 52,102 52,58 32,58" fill="#ffffff"/>`,
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
  for (const [name, e] of Object.entries(ICON_EMOJI)) {
    const svg = squareSvg(gradient('g', [e.color, e.dark]), 'url(#g)', e.glyph);
    await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, `${name}.png`));
    console.log(`assets/emoji/${name}.png`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
