const crypto = require('crypto');
const { FRUITS, RARITIES, TYPES } = require('./fruits');
const config = require('./config');

const RARITY_ORDER = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
const RARITY_RANK = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']; // ascending

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Find a fruit from user input: exact match first, then prefix, then substring.
function findFruit(query) {
  const q = normalize(query);
  if (!q) return null;
  const exact = FRUITS.find((f) => normalize(f.id) === q || normalize(f.name) === q);
  if (exact) return exact;
  const prefix = FRUITS.filter((f) => normalize(f.name).startsWith(q));
  if (prefix.length === 1) return prefix[0];
  const sub = FRUITS.filter((f) => normalize(f.name).includes(q));
  if (sub.length === 1) return sub[0];
  return prefix[0] || sub[0] || null;
}

function findPack(query) {
  if (!query) return null;
  const q = normalize(query);
  return (
    Object.values(config.PACKS).find((p) => normalize(p.id) === q || normalize(p.name).startsWith(q)) || null
  );
}

function rollRarity(odds) {
  const total = Object.values(odds).reduce((s, w) => s + w, 0);
  let roll = crypto.randomInt(total);
  for (const [rarity, weight] of Object.entries(odds)) {
    roll -= weight;
    if (roll < 0) return rarity;
  }
  return 'common';
}

// Weighted pick within a rarity tier (fruit.weight, default 1; lower = rarer).
function randomFruitOfRarity(rarity) {
  const pool = FRUITS.filter((f) => f.rarity === rarity);
  const total = pool.reduce((s, f) => s + (f.weight || 1), 0);
  let roll = crypto.randomInt(total);
  for (const f of pool) {
    roll -= f.weight || 1;
    if (roll < 0) return f;
  }
  return pool[pool.length - 1];
}

// Roll a card's variant: rarest first (prism, then gold, then foil).
function rollVariant(variantChances) {
  const roll = crypto.randomInt(1000000) / 1000000;
  let cumulative = 0;
  for (const variant of ['prism', 'gold', 'foil']) {
    cumulative += variantChances[variant] || 0;
    if (roll < cumulative) return variant;
  }
  return 'normal';
}

// Roll a full pack of a given type. Returns [{ fruit, variant }].
// Pity rule: at least one card at packDef.pity rarity or better.
function rollPack(packDef) {
  const cards = [];
  for (let i = 0; i < packDef.size; i++) {
    const fruit = randomFruitOfRarity(rollRarity(packDef.odds));
    cards.push({ fruit, variant: rollVariant(packDef.variantChances || {}) });
  }
  const pityRank = RARITY_RANK.indexOf(packDef.pity);
  if (!cards.some((c) => RARITY_RANK.indexOf(c.fruit.rarity) >= pityRank)) {
    cards[cards.length - 1].fruit = randomFruitOfRarity(packDef.pity);
  }
  return cards;
}

function sortByRarity(a, b) {
  const r = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
  return r !== 0 ? r : a.name.localeCompare(b.name);
}

function sellValue(fruit, variant = 'normal') {
  const base = RARITIES[fruit.rarity].sellValue;
  const mult = config.VARIANTS[variant]?.sellMult || 1;
  return base * mult;
}

// Pull a variant token ('foil'/'gold'/'prism') out of a token array, if present.
// Mutates the array. Returns the variant name or 'normal'.
function extractVariant(tokens) {
  for (const key of Object.keys(config.VARIANTS)) {
    const idx = tokens.findIndex((t) => t.toLowerCase() === key);
    if (idx !== -1) {
      tokens.splice(idx, 1);
      return key;
    }
  }
  return 'normal';
}

function coins(n) {
  return `**${Number(n).toLocaleString('en-US')}** ${gemoji('coin', config.CURRENCY_EMOJI)}`;
}

function timeUntil(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.ceil((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Custom rarity emojis ───────────────────────────────────────────
// If the bot can see server emojis named after rarity keys (:common:,
// :uncommon:, :rare:, :epic:, :legendary:, :mythic:), it uses them
// everywhere; otherwise it falls back to the built-in colored circles.
let emojiClient = null;
function setEmojiClient(client) {
  emojiClient = client;
}
function remoji(rarityKey) {
  if (emojiClient) {
    const custom = emojiClient.emojis.cache.find((e) => e.name === rarityKey);
    if (custom) return custom.toString();
  }
  return RARITIES[rarityKey].emoji;
}

// Type emoji: custom :citrus:/:vine:/... server emoji when available.
function temoji(typeKey) {
  if (emojiClient) {
    const custom = emojiClient.emojis.cache.find((e) => e.name === typeKey);
    if (custom) return custom.toString();
  }
  return TYPES[typeKey].emoji;
}

// Generic icon lookup: any custom emoji by name (:coin:, :energy:, :shield:,
// :smash:, ...) with a unicode fallback. Embed/message text only — Discord
// button labels can't render custom emojis.
function gemoji(name, fallback) {
  if (emojiClient) {
    const custom = emojiClient.emojis.cache.find((e) => e.name === name);
    if (custom) return custom.toString();
  }
  return fallback;
}

// Variant tag like " ✨FOIL" — uses a custom :foil:/:gold:/:prism: server
// emoji when the bot can see one, otherwise the fallback emoji.
function variantLabel(variant) {
  const def = config.VARIANTS[variant];
  if (!def) return '';
  let emoji = def.fallbackEmoji;
  if (emojiClient) {
    const custom = emojiClient.emojis.cache.find((e) => e.name === variant);
    if (custom) emoji = custom.toString();
  }
  return ` ${emoji}${def.name.toUpperCase()}`;
}

module.exports = {
  findFruit,
  findPack,
  rollPack,
  rollVariant,
  sortByRarity,
  sellValue,
  extractVariant,
  coins,
  timeUntil,
  normalize,
  setEmojiClient,
  remoji,
  temoji,
  gemoji,
  variantLabel,
  RARITY_ORDER,
  RARITY_RANK,
};
