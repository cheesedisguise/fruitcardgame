const crypto = require('crypto');
const { FRUITS, RARITIES } = require('./fruits');
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

// Roll a full pack of a given type. Returns [{ fruit, variant }].
// Pity rule: at least one card at packDef.pity rarity or better.
function rollPack(packDef) {
  const cards = [];
  for (let i = 0; i < packDef.size; i++) {
    const fruit = randomFruitOfRarity(rollRarity(packDef.odds));
    const variant = crypto.randomInt(10000) < packDef.foilChance * 10000 ? 'foil' : 'normal';
    cards.push({ fruit, variant });
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
  return variant === 'foil' ? base * config.FOIL_SELL_MULTIPLIER : base;
}

function coins(n) {
  return `**${Number(n).toLocaleString('en-US')}** ${config.CURRENCY_EMOJI}`;
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

function variantLabel(variant) {
  return variant === 'foil' ? ' ✨FOIL' : '';
}

module.exports = {
  findFruit,
  findPack,
  rollPack,
  sortByRarity,
  sellValue,
  coins,
  timeUntil,
  normalize,
  setEmojiClient,
  remoji,
  variantLabel,
  RARITY_ORDER,
  RARITY_RANK,
};
