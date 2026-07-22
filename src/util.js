const crypto = require('crypto');
const { FRUITS, RARITIES } = require('./fruits');
const config = require('./config');

const RARITY_ORDER = ['legendary', 'epic', 'rare', 'uncommon', 'common'];

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

function rollRarity() {
  const total = Object.values(RARITIES).reduce((s, r) => s + r.weight, 0);
  let roll = crypto.randomInt(total);
  for (const [key, r] of Object.entries(RARITIES)) {
    roll -= r.weight;
    if (roll < 0) return key;
  }
  return 'common';
}

function randomFruitOfRarity(rarity) {
  const pool = FRUITS.filter((f) => f.rarity === rarity);
  return pool[crypto.randomInt(pool.length)];
}

// Roll a full pack. Pity rule: at least one card above Common per pack.
function rollPack() {
  const cards = [];
  for (let i = 0; i < config.PACK_SIZE; i++) {
    cards.push(randomFruitOfRarity(rollRarity()));
  }
  if (cards.every((c) => c.rarity === 'common')) {
    cards[config.PACK_SIZE - 1] = randomFruitOfRarity('uncommon');
  }
  return cards;
}

function sortByRarity(a, b) {
  const r = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
  return r !== 0 ? r : a.name.localeCompare(b.name);
}

function coins(n) {
  return `**${Number(n).toLocaleString('en-US')}** ${config.CURRENCY_EMOJI}`;
}

function timeUntil(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.ceil((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

module.exports = { findFruit, rollPack, sortByRarity, coins, timeUntil, RARITY_ORDER, normalize };
