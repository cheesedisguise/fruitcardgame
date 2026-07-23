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

const { RARITIES, TYPES, getFruit, movesFor } = require('./fruits');

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

// Variant frame treatments layered over/instead of the rarity gradient.
const VARIANT_FRAMES = {
  foil: `<linearGradient id="frame" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#b388ff"/><stop offset="0.33" stop-color="#4dd0e1"/>
      <stop offset="0.66" stop-color="#ffd54f"/><stop offset="1" stop-color="#ff80ab"/>
    </linearGradient>`,
  gold: `<linearGradient id="frame" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f9e8a8"/><stop offset="0.5" stop-color="#d4af37"/>
      <stop offset="1" stop-color="#8a6d1a"/>
    </linearGradient>`,
  prism: `<linearGradient id="frame" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff5252"/><stop offset="0.2" stop-color="#ffb300"/>
      <stop offset="0.4" stop-color="#ffee58"/><stop offset="0.6" stop-color="#66bb6a"/>
      <stop offset="0.8" stop-color="#42a5f5"/><stop offset="1" stop-color="#ab47bc"/>
    </linearGradient>`,
};

function sheenStripes(opacity, angle = 24) {
  return `<g clip-path="url(#cardClip)" opacity="${opacity}">
    <rect x="-260" y="-40" width="70" height="760" fill="#ffffff" transform="rotate(${angle} 200 280)"/>
    <rect x="-40" y="-40" width="34" height="760" fill="#ffffff" transform="rotate(${angle} 200 280)"/>
    <rect x="180" y="-40" width="52" height="760" fill="#ffffff" transform="rotate(${angle} 200 280)"/>
    <rect x="400" y="-40" width="26" height="760" fill="#ffffff" transform="rotate(${angle} 200 280)"/>
  </g>`;
}

// TCG-style card: type pill + HP in the header, art window, two printed
// moves with energy-cost dots, rarity ribbon, fun-fact footer.
function cardSvg(fruit, variant = 'normal') {
  const special = variant !== 'normal';
  const [light, dark] = FRAME_COLORS[fruit.rarity];
  const rarity = RARITIES[fruit.rarity];
  const type = TYPES[fruit.type];
  const moves = movesFor(fruit);

  const frameGradient =
    VARIANT_FRAMES[variant] ||
    `<linearGradient id="frame" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/>
    </linearGradient>`;

  const sheen =
    variant === 'foil' ? sheenStripes(0.22) : variant === 'gold' ? sheenStripes(0.16) : variant === 'prism' ? sheenStripes(0.2) + sheenStripes(0.12, -24) : '';

  const sparkles =
    special || fruit.rarity === 'legendary' || fruit.rarity === 'mythic'
      ? [sparkle(38, 100, 9), sparkle(366, 130, 7), sparkle(30, 340, 6), sparkle(372, 310, 9), sparkle(363, 64, 5)].join('\n') +
        (variant === 'prism' ? [sparkle(60, 460, 8), sparkle(340, 490, 7), sparkle(200, 70, 6)].join('\n') : '')
      : '';

  const costDots = (n, y) => {
    let dots = '';
    for (let i = 0; i < n; i++) {
      dots += `<circle cx="${42 + i * 16}" cy="${y}" r="5.5" fill="#ffd54f" stroke="#00000055" stroke-width="1"/>`;
    }
    return dots;
  };

  const sig = moves.signature;
  const sigRight = sig.dmg != null ? `${sig.dmg}${sig.kind === 'flurry' ? '×2' : ''}` : sig.heal != null ? `+${sig.heal}` : `+${sig.buff}`;
  const sigRightLabel = sig.kind === 'flurry' ? 'PER HEADS' : sig.heal != null ? 'HEAL' : sig.buff != null ? 'TEAM ATK' : sig.kind === 'pierce' ? 'PIERCING' : 'DMG';

  const flavorLines = wrapFlavor(fruit.flavor, 46);
  const flavorSvg = flavorLines
    .map(
      (line, i) =>
        `<text x="200" y="${512 + i * 16}" font-family="Finger Paint" font-style="italic" font-size="11.5" fill="#ffffff" opacity="0.85" text-anchor="middle">${esc(line)}</text>`
    )
    .join('\n');

  const rarityLabel = `${rarity.name.toUpperCase()}${special ? ` · ${variant.toUpperCase()}` : ''}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <defs>
    ${frameGradient}
    <clipPath id="cardClip"><rect width="${CARD_W}" height="${CARD_H}" rx="24"/></clipPath>
  </defs>

  <rect width="${CARD_W}" height="${CARD_H}" rx="24" fill="url(#frame)"/>
  <rect x="8" y="8" width="${CARD_W - 16}" height="${CARD_H - 16}" rx="18" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2"/>

  <rect x="20" y="18" width="360" height="46" rx="14" fill="#000000" opacity="0.3"/>
  <rect x="28" y="27" width="88" height="27" rx="13.5" fill="${type.color}"/>
  <text x="72" y="45" font-family="Finger Paint" font-size="13" fill="#ffffff" text-anchor="middle">${type.name.toUpperCase()}</text>
  <text x="126" y="49" font-family="Finger Paint" font-size="${fruit.name.length > 11 ? 17 : 21}" fill="#ffffff">${esc(fruit.name)}</text>
  <text x="372" y="49" font-family="Finger Paint" font-size="21" fill="#ffffff" text-anchor="end">HP ${fruit.hp}</text>

  <rect x="20" y="72" width="360" height="280" rx="14" fill="#ffffff"/>

  <rect x="20" y="360" width="360" height="48" rx="12" fill="#000000" opacity="0.28"/>
  ${costDots(1, 384)}
  <text x="62" y="391" font-family="Finger Paint" font-size="16" fill="#ffffff">${esc(moves.quick.name)}</text>
  <text x="364" y="393" font-family="Finger Paint" font-size="22" fill="#ffffff" text-anchor="end">${moves.quick.dmg}</text>

  <rect x="20" y="414" width="360" height="48" rx="12" fill="#000000" opacity="0.28"/>
  ${costDots(3, 438)}
  <text x="94" y="445" font-family="Finger Paint" font-size="16" fill="#ffffff">${esc(sig.name)}</text>
  <text x="364" y="440" font-family="Finger Paint" font-size="20" fill="#ffffff" text-anchor="end">${sigRight}</text>
  <text x="364" y="456" font-family="Finger Paint" font-size="9.5" fill="#ffffff" opacity="0.75" text-anchor="end" letter-spacing="1">${sigRightLabel}</text>

  <g fill="#ffffff" opacity="0.9">
    <polygon points="46,482 52,476 58,482 52,488"/>
    <polygon points="342,482 348,476 354,482 348,488"/>
  </g>
  <text x="200" y="488" font-family="Finger Paint" font-size="14" fill="#ffffff" opacity="0.95" text-anchor="middle" letter-spacing="3">${rarityLabel}</text>

  ${sheen}
  ${sparkles}
  ${flavorSvg}
</svg>`;
}

// Render a single card to PNG. Cached in memory and on disk.
async function renderCard(fruitId, variant = 'normal') {
  const cacheKey = `${fruitId}-${variant}`;
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey);
  const fruit = getFruit(fruitId);
  if (!fruit) throw new Error(`Unknown fruit: ${fruitId}`);

  const diskPath = path.join(CACHE_DIR, 'cards', `${cacheKey}.png`);
  let buf;
  if (fs.existsSync(diskPath)) {
    buf = fs.readFileSync(diskPath);
  } else {
    // Frame first (with an empty white art window), then the photo on top.
    const photo = await sharp(artPath(fruitId))
      .resize(264, 264, { fit: 'contain', background: '#ffffff' })
      .png()
      .toBuffer();
    buf = await sharp(Buffer.from(cardSvg(fruit, variant)))
      .composite([{ input: photo, left: 68, top: 78 }])
      .png()
      .toBuffer();
    fs.mkdirSync(path.dirname(diskPath), { recursive: true });
    fs.writeFileSync(diskPath, buf);
  }
  memoryCache.set(cacheKey, buf);
  return buf;
}

// Five cards side by side — the pack opening image.
// items: [{ id, variant }] (plain fruit-id strings also accepted).
async function renderPackSpread(items) {
  const norm = items.map((it) => (typeof it === 'string' ? { id: it, variant: 'normal' } : it));
  const scale = 0.5;
  const w = Math.round(CARD_W * scale);
  const h = Math.round(CARD_H * scale);
  const gap = 14;
  const pad = 22;
  const totalW = pad * 2 + w * norm.length + gap * (norm.length - 1);
  const totalH = pad * 2 + h;

  const cards = await Promise.all(norm.map((it) => renderCard(it.id, it.variant)));
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

// ── Pack art ───────────────────────────────────────────────────────
const PACK_ART = {
  standard: { colors: ['#81c784', '#1b5e20'], hero: 'orange' },
  juicy: { colors: ['#ff8a80', '#b71c1c'], hero: 'watermelon' },
  exotic: { colors: ['#ce93d8', '#4a148c'], hero: 'dragonfruit' },
};
const PACK_W = 300;
const PACK_H = 420;

function packSvg(pack) {
  const art = PACK_ART[pack.id] || PACK_ART.standard;
  const [light, dark] = art.colors;
  // top crimp zigzag
  let zigzag = '';
  for (let x = 0; x < PACK_W; x += 30) {
    zigzag += `${x},26 ${x + 15},8 `;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PACK_W}" height="${PACK_H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${light}"/>
      <stop offset="1" stop-color="${dark}"/>
    </linearGradient>
    <clipPath id="pouch"><rect x="0" y="14" width="${PACK_W}" height="${PACK_H - 14}" rx="22"/></clipPath>
  </defs>
  <rect x="0" y="14" width="${PACK_W}" height="${PACK_H - 14}" rx="22" fill="url(#bg)"/>
  <polygon points="0,26 ${zigzag}${PACK_W},26 ${PACK_W},40 0,40" fill="${dark}" opacity="0.55"/>
  <g clip-path="url(#pouch)" opacity="0.16">
    <rect x="-160" y="-20" width="60" height="520" fill="#ffffff" transform="rotate(20 150 210)"/>
    <rect x="60" y="-20" width="26" height="520" fill="#ffffff" transform="rotate(20 150 210)"/>
  </g>
  <text x="${PACK_W / 2}" y="66" font-family="Finger Paint" font-size="21" fill="#ffffff" text-anchor="middle" letter-spacing="2">FRUITCARDS</text>
  <circle cx="${PACK_W / 2}" cy="188" r="98" fill="#ffffff"/>
  <circle cx="${PACK_W / 2}" cy="188" r="98" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="6"/>
  <rect x="24" y="304" width="${PACK_W - 48}" height="46" rx="14" fill="#000000" opacity="0.3"/>
  <text x="${PACK_W / 2}" y="335" font-family="Finger Paint" font-size="24" fill="#ffffff" text-anchor="middle">${pack.name}</text>
  <rect x="${PACK_W / 2 - 62}" y="362" width="124" height="30" rx="15" fill="#ffffff" opacity="0.92"/>
  <text x="${PACK_W / 2}" y="383" font-family="Finger Paint" font-size="16" fill="${dark}" text-anchor="middle">${pack.size} CARDS</text>
</svg>`;
}

async function renderPackArt(packId) {
  const config = require('./config');
  const pack = config.PACKS[packId];
  if (!pack) throw new Error(`Unknown pack: ${packId}`);
  const cacheKey = `pack-${packId}`;
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey);
  const diskPath = path.join(CACHE_DIR, 'cards', `${cacheKey}.png`);
  let buf;
  if (fs.existsSync(diskPath)) {
    buf = fs.readFileSync(diskPath);
  } else {
    const hero = (PACK_ART[packId] || PACK_ART.standard).hero;
    const circleMask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="168" height="168"><circle cx="84" cy="84" r="84" fill="#fff"/></svg>`
    );
    const photo = await sharp(artPath(hero))
      .resize(168, 168, { fit: 'contain', background: '#ffffff' })
      .composite([{ input: circleMask, blend: 'dest-in' }])
      .png()
      .toBuffer();
    buf = await sharp(Buffer.from(packSvg(pack)))
      .composite([{ input: photo, left: Math.round(PACK_W / 2 - 84), top: 188 - 84 }])
      .png()
      .toBuffer();
    fs.mkdirSync(path.dirname(diskPath), { recursive: true });
    fs.writeFileSync(diskPath, buf);
  }
  memoryCache.set(cacheKey, buf);
  return buf;
}

// The three packs side by side — the shop window.
async function renderShopBanner() {
  const config = require('./config');
  const cacheKey = 'shop-banner';
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey);
  const ids = Object.keys(config.PACKS);
  const gap = 26;
  const pad = 30;
  const totalW = pad * 2 + PACK_W * ids.length + gap * (ids.length - 1);
  const totalH = pad * 2 + PACK_H;
  const composites = [];
  for (let i = 0; i < ids.length; i++) {
    composites.push({ input: await renderPackArt(ids[i]), left: pad + i * (PACK_W + gap), top: pad });
  }
  const buf = await sharp({
    create: { width: totalW, height: totalH, channels: 4, background: '#ffffff' },
  })
    .composite(composites)
    .png()
    .toBuffer();
  memoryCache.set(cacheKey, buf);
  return buf;
}

module.exports = { renderCard, renderPackSpread, renderBattle, renderPackArt, renderShopBanner, cardSvg };
