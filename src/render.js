// Card image rendering. Composes src/art/<id>.svg (fruit on white background)
// into a TCG-style card frame, rasterized with sharp.
//
// Fonts: librsvg finds fonts through fontconfig. Railway containers ship no
// fonts, so we bundle Nunito and point FONTCONFIG_PATH at a generated config
// BEFORE sharp is loaded for the first time.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, '.cache');
const FONT_DIR = path.join(ROOT, 'assets', 'fonts');

function setupFonts() {
  const fcDir = path.join(CACHE_DIR, 'fontconfig');
  fs.mkdirSync(fcDir, { recursive: true });
  const conf = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${FONT_DIR}</dir>
  <cachedir>${path.join(fcDir, 'cache')}</cachedir>
</fontconfig>`;
  fs.writeFileSync(path.join(fcDir, 'fonts.conf'), conf);
  process.env.FONTCONFIG_PATH = fcDir;
}
setupFonts();
const sharp = require('sharp');

const { RARITIES, getFruit } = require('./fruits');

const CARD_W = 400;
const CARD_H = 560;

// [light, dark] frame gradient per rarity
const FRAME_COLORS = {
  common: ['#cfd8dc', '#78909c'],
  uncommon: ['#81c784', '#2e7d32'],
  rare: ['#64b5f6', '#1565c0'],
  epic: ['#ce93d8', '#6a1b9a'],
  legendary: ['#ffe082', '#f57f17'],
  mythic: ['#ff8a80', '#b71c1c'],
};

const memoryCache = new Map();

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Card art: real fruit photos (512x512 PNG, white background) in src/art/.
function artPath(fruitId) {
  const file = path.join(ROOT, 'src', 'art', `${fruitId}.png`);
  if (!fs.existsSync(file)) throw new Error(`Missing art file for ${fruitId}`);
  return file;
}

// Split flavor text into at most two centered lines.
function wrapFlavor(text, maxChars = 40) {
  if (text.length <= maxChars) return [text];
  const words = text.split(' ');
  let first = '';
  let i = 0;
  while (i < words.length && (first + ' ' + words[i]).trim().length <= maxChars) {
    first = (first + ' ' + words[i]).trim();
    i++;
  }
  return [first, words.slice(i).join(' ')];
}

const SWORD_ICON = `
  <g transform="rotate(45 9 10)">
    <polygon points="9,0 11.6,3 11.6,12 6.4,12 6.4,3" fill="#ffffff" opacity="0.95"/>
    <rect x="3.5" y="12" width="11" height="2.6" rx="1.3" fill="#ffd54f"/>
    <rect x="7.6" y="14.6" width="2.8" height="4" rx="1.2" fill="#ffd54f"/>
    <circle cx="9" cy="19.2" r="1.7" fill="#ffca28"/>
  </g>`;

const HEART_ICON = `
  <path d="M9 16 C9 16 1.5 11 1.5 5.8 C1.5 3 3.7 1.2 6 1.2 C7.3 1.2 8.4 1.9 9 2.9 C9.6 1.9 10.7 1.2 12 1.2 C14.3 1.2 16.5 3 16.5 5.8 C16.5 11 9 16 9 16 Z" fill="#ff8a95"/>`;

function sparkle(cx, cy, r, fill = '#ffffff', opacity = 0.9) {
  return `<path d="M${cx} ${cy - r} Q${cx + r * 0.18} ${cy - r * 0.18} ${cx + r} ${cy} Q${cx + r * 0.18} ${cy + r * 0.18} ${cx} ${cy + r} Q${cx - r * 0.18} ${cy + r * 0.18} ${cx - r} ${cy} Q${cx - r * 0.18} ${cy - r * 0.18} ${cx} ${cy - r} Z" fill="${fill}" opacity="${opacity}"/>`;
}

function cardSvg(fruit) {
  const [light, dark] = FRAME_COLORS[fruit.rarity];
  const rarity = RARITIES[fruit.rarity];
  const flavorLines = wrapFlavor(fruit.flavor);
  const flavorSvg = flavorLines
    .map(
      (line, i) =>
        `<text x="200" y="${524 + i * 18}" font-family="Finger Paint" font-style="italic" font-weight="600" font-size="14" fill="#ffffff" opacity="0.85" text-anchor="middle">${esc(line)}</text>`
    )
    .join('\n');

  const legendarySparkles =
    fruit.rarity === 'legendary' || fruit.rarity === 'mythic'
      ? [sparkle(38, 100, 9), sparkle(366, 130, 7), sparkle(30, 350, 6), sparkle(372, 320, 9), sparkle(360, 66, 5)].join('\n')
      : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <defs>
    <linearGradient id="frame" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${light}"/>
      <stop offset="1" stop-color="${dark}"/>
    </linearGradient>
    <clipPath id="artClip"><rect x="20" y="80" width="360" height="310" rx="14"/></clipPath>
  </defs>

  <rect width="${CARD_W}" height="${CARD_H}" rx="24" fill="url(#frame)"/>
  <rect x="8" y="8" width="${CARD_W - 16}" height="${CARD_H - 16}" rx="18" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2"/>

  <rect x="20" y="20" width="360" height="48" rx="14" fill="#000000" opacity="0.28"/>
  <text x="200" y="53" font-family="Finger Paint" font-weight="800" font-size="28" fill="#ffffff" text-anchor="middle">${esc(fruit.name)}</text>

  <rect x="20" y="80" width="360" height="310" rx="14" fill="#ffffff"/>

  <g fill="#ffffff" opacity="0.9">
    <polygon points="46,410 52,404 58,410 52,416"/>
    <polygon points="342,410 348,404 354,410 348,416"/>
  </g>
  <text x="200" y="416" font-family="Finger Paint" font-weight="800" font-size="17" fill="#ffffff" opacity="0.95" text-anchor="middle" letter-spacing="3">${rarity.name.toUpperCase()}</text>

  <rect x="28" y="430" width="164" height="62" rx="14" fill="#000000" opacity="0.28"/>
  <g transform="translate(44,452) scale(1.3)">${SWORD_ICON}</g>
  <text x="80" y="454" font-family="Finger Paint" font-weight="700" font-size="14" fill="#ffffff" opacity="0.75">ATK</text>
  <text x="80" y="482" font-family="Finger Paint" font-weight="800" font-size="30" fill="#ffffff">${fruit.atk}</text>

  <rect x="208" y="430" width="164" height="62" rx="14" fill="#000000" opacity="0.28"/>
  <g transform="translate(224,452) scale(1.3)">${HEART_ICON}</g>
  <text x="262" y="454" font-family="Finger Paint" font-weight="700" font-size="14" fill="#ffffff" opacity="0.75">HP</text>
  <text x="262" y="482" font-family="Finger Paint" font-weight="800" font-size="30" fill="#ffffff">${fruit.hp}</text>

  ${legendarySparkles}
  ${flavorSvg}
</svg>`;
}

// Render a single card to PNG. Cached in memory and on disk.
async function renderCard(fruitId) {
  if (memoryCache.has(fruitId)) return memoryCache.get(fruitId);
  const fruit = getFruit(fruitId);
  if (!fruit) throw new Error(`Unknown fruit: ${fruitId}`);

  const diskPath = path.join(CACHE_DIR, 'cards', `${fruitId}.png`);
  let buf;
  if (fs.existsSync(diskPath)) {
    buf = fs.readFileSync(diskPath);
  } else {
    // Frame first (with an empty white art window), then the photo on top.
    const photo = await sharp(artPath(fruitId))
      .resize(310, 310, { fit: 'contain', background: '#ffffff' })
      .png()
      .toBuffer();
    buf = await sharp(Buffer.from(cardSvg(fruit)))
      .composite([{ input: photo, left: 45, top: 80 }])
      .png()
      .toBuffer();
    fs.mkdirSync(path.dirname(diskPath), { recursive: true });
    fs.writeFileSync(diskPath, buf);
  }
  memoryCache.set(fruitId, buf);
  return buf;
}

// Five cards side by side — the pack opening image.
async function renderPackSpread(fruitIds) {
  const scale = 0.5;
  const w = Math.round(CARD_W * scale);
  const h = Math.round(CARD_H * scale);
  const gap = 14;
  const pad = 22;
  const totalW = pad * 2 + w * fruitIds.length + gap * (fruitIds.length - 1);
  const totalH = pad * 2 + h;

  const cards = await Promise.all(fruitIds.map((id) => renderCard(id)));
  const composites = [];
  for (let i = 0; i < cards.length; i++) {
    const resized = await sharp(cards[i]).resize(w, h).png().toBuffer();
    composites.push({ input: resized, left: pad + i * (w + gap), top: pad });
  }
  return sharp({
    create: { width: totalW, height: totalH, channels: 4, background: '#ffffff' },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

// Two cards facing off with a VS mark — the battle image.
async function renderBattle(fruitIdA, fruitIdB) {
  const scale = 0.55;
  const w = Math.round(CARD_W * scale);
  const h = Math.round(CARD_H * scale);
  const mid = 130;
  const pad = 20;
  const totalW = pad * 2 + w * 2 + mid;
  const totalH = pad * 2 + h;

  const vsSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">
    <rect width="${totalW}" height="${totalH}" fill="#ffffff"/>
    <text x="${totalW / 2}" y="${totalH / 2 + 24}" font-family="Finger Paint" font-weight="800" font-size="64" fill="#37474f" text-anchor="middle">VS</text>
  </svg>`;

  const [a, b] = await Promise.all([renderCard(fruitIdA), renderCard(fruitIdB)]);
  const [ra, rb] = await Promise.all([
    sharp(a).resize(w, h).png().toBuffer(),
    sharp(b).resize(w, h).png().toBuffer(),
  ]);
  return sharp(Buffer.from(vsSvg))
    .composite([
      { input: ra, left: pad, top: pad },
      { input: rb, left: pad + w + mid, top: pad },
    ])
    .png()
    .toBuffer();
}

module.exports = { renderCard, renderPackSpread, renderBattle, cardSvg };
