// The FruitCards catalog. Every card in the game lives here.
// Art for each fruit is a real photo in src/art/<id>.png (512x512, white background).
//
// Rarity = power: each tier is a clear step up in ATK/HP. The Apple is the
// rarest card in the game (within-tier weight: lower = rarer).
//
// ability archetypes (mechanics live in src/battle.js):
//   smash  — heavy hit, 1.8x ATK
//   regrow — heal 45% of max HP
//   pierce — 1.2x ATK, ignores shield
//   drain  — 0.9x ATK, heal half the damage dealt
//   flurry — two hits of 0.75x ATK
//   ripen  — permanently gain +5 ATK this battle

// weight is per-mille (out of 1000); pct is the display string.
const RARITIES = {
  common: { name: 'Common', color: 0x95a5a6, hex: '#95a5a6', emoji: '⚪', weight: 599, pct: '59.9%', sellValue: 10 },
  uncommon: { name: 'Uncommon', color: 0x2ecc71, hex: '#2ecc71', emoji: '🟢', weight: 250, pct: '25%', sellValue: 25 },
  rare: { name: 'Rare', color: 0x3498db, hex: '#3498db', emoji: '🔵', weight: 100, pct: '10%', sellValue: 60 },
  epic: { name: 'Epic', color: 0x9b59b6, hex: '#9b59b6', emoji: '🟣', weight: 40, pct: '4%', sellValue: 150 },
  legendary: { name: 'Legendary', color: 0xf1c40f, hex: '#f1c40f', emoji: '🟡', weight: 10, pct: '1%', sellValue: 400 },
  mythic: { name: 'Mythic', color: 0xe74c3c, hex: '#e74c3c', emoji: '🌟', weight: 1, pct: '0.1%', sellValue: 1000 },
};

const FRUITS = [
  // ── Common ──────────────────────────────────────────────
  { id: 'banana', name: 'Banana', rarity: 'common', atk: 16, hp: 48, ability: 'flurry', flavor: 'Botanically a berry — and the banana plant is a giant herb, not a tree.' },
  { id: 'orange', name: 'Orange', rarity: 'common', atk: 13, hp: 58, ability: 'drain', flavor: 'An ancient hybrid of pomelo and mandarin, first grown in China.' },
  { id: 'lemon', name: 'Lemon', rarity: 'common', atk: 18, hp: 45, ability: 'pierce', flavor: 'Sailors carried lemons on long voyages to fight off scurvy.' },
  { id: 'pear', name: 'Pear', rarity: 'common', atk: 12, hp: 62, ability: 'regrow', flavor: 'Pear wood is so fine it is used to build instruments and furniture.' },
  { id: 'grape', name: 'Grape', rarity: 'common', atk: 15, hp: 50, ability: 'flurry', flavor: 'Humans have been growing grapes for more than 8,000 years.' },
  { id: 'strawberry', name: 'Strawberry', rarity: 'common', atk: 17, hp: 47, ability: 'ripen', flavor: 'The only fruit that wears its seeds on the outside — about 200 of them.' },
  { id: 'watermelon', name: 'Watermelon', rarity: 'common', atk: 10, hp: 70, ability: 'smash', flavor: 'About 92% water. Ancient Egyptians placed them in royal tombs.' },
  { id: 'peach', name: 'Peach', rarity: 'common', atk: 15, hp: 52, ability: 'regrow', flavor: 'Originated in China, where the peach is a symbol of immortality.' },
  { id: 'cherry', name: 'Cherry', rarity: 'common', atk: 20, hp: 40, ability: 'flurry', flavor: 'A single mature cherry tree can carry about 7,000 cherries.' },

  // ── Uncommon ────────────────────────────────────────────
  { id: 'pineapple', name: 'Pineapple', rarity: 'uncommon', atk: 26, hp: 78, ability: 'pierce', flavor: 'One plant takes up to two years to grow a single pineapple.' },
  { id: 'mango', name: 'Mango', rarity: 'uncommon', atk: 28, hp: 70, ability: 'smash', flavor: 'The most eaten fruit on Earth, cultivated for over 4,000 years.' },
  { id: 'kiwi', name: 'Kiwi', rarity: 'uncommon', atk: 24, hp: 76, ability: 'drain', flavor: 'Gram for gram, kiwifruit packs more vitamin C than an orange.' },
  { id: 'blueberry', name: 'Blueberry', rarity: 'uncommon', atk: 30, hp: 62, ability: 'ripen', flavor: 'One of the very few foods in nature that is truly blue.' },
  { id: 'coconut', name: 'Coconut', rarity: 'uncommon', atk: 22, hp: 92, ability: 'smash', flavor: 'Coconuts can float across entire oceans and sprout on far shores.' },
  { id: 'plum', name: 'Plum', rarity: 'uncommon', atk: 27, hp: 70, ability: 'regrow', flavor: 'One of the first fruits ever domesticated by humans.' },
  { id: 'raspberry', name: 'Raspberry', rarity: 'uncommon', atk: 29, hp: 66, ability: 'flurry', flavor: 'Each raspberry is ~100 tiny fruits, each with its own seed.' },
  { id: 'lime', name: 'Lime', rarity: 'uncommon', atk: 32, hp: 58, ability: 'pierce', flavor: 'British sailors ate so many limes they were nicknamed "limeys."' },

  // ── Rare ────────────────────────────────────────────────
  { id: 'dragonfruit', name: 'Dragonfruit', rarity: 'rare', atk: 44, hp: 96, ability: 'smash', flavor: 'Grows on a cactus whose flowers bloom for a single night.' },
  { id: 'pomegranate', name: 'Pomegranate', rarity: 'rare', atk: 40, hp: 105, ability: 'ripen', flavor: 'A single pomegranate can hold more than 600 seeds.' },
  { id: 'passionfruit', name: 'Passionfruit', rarity: 'rare', atk: 46, hp: 88, ability: 'drain', flavor: 'Named by missionaries after the symbolism of the passion flower.' },
  { id: 'lychee', name: 'Lychee', rarity: 'rare', atk: 42, hp: 94, ability: 'regrow', flavor: 'Prized by Chinese emperors for more than 2,000 years.' },
  { id: 'starfruit', name: 'Starfruit', rarity: 'rare', atk: 48, hp: 84, ability: 'pierce', flavor: 'Every slice is a natural five-pointed star.' },
  { id: 'persimmon', name: 'Persimmon', rarity: 'rare', atk: 38, hp: 110, ability: 'regrow', flavor: 'Its genus name Diospyros roughly means "fruit of the gods."' },
  { id: 'guava', name: 'Guava', rarity: 'rare', atk: 41, hp: 92, ability: 'ripen', flavor: 'Contains about four times the vitamin C of an orange.' },
  { id: 'apricot', name: 'Apricot', rarity: 'rare', atk: 45, hp: 86, ability: 'smash', flavor: 'Dried apricots fed traders along the ancient Silk Road.' },
  { id: 'cherimoya', name: 'Cherimoya', rarity: 'rare', atk: 39, hp: 108, ability: 'regrow', flavor: 'Mark Twain called it "the most delicious fruit known to men."' },

  // ── Epic ────────────────────────────────────────────────
  { id: 'avocado', name: 'Avocado', rarity: 'epic', atk: 54, hp: 138, ability: 'smash', flavor: 'Botanically a giant berry with a single enormous seed.' },
  { id: 'mangosteen', name: 'Mangosteen', rarity: 'epic', atk: 58, hp: 118, ability: 'regrow', flavor: 'Queen Victoria reportedly offered a reward for a fresh one.' },
  { id: 'rambutan', name: 'Rambutan', rarity: 'epic', atk: 62, hp: 110, ability: 'flurry', flavor: 'Its name comes from "rambut" — the Malay word for hair.' },
  { id: 'salak', name: 'Salak', rarity: 'epic', atk: 52, hp: 145, ability: 'pierce', flavor: 'Called snake fruit for its reddish, scaly skin.' },

  // ── Legendary ───────────────────────────────────────────
  { id: 'kiwano', name: 'Kiwano', rarity: 'legendary', atk: 78, hp: 172, ability: 'smash', flavor: 'The horned melon — an ancient African relative of the cucumber.' },
  { id: 'buddhas_hand', name: "Buddha's Hand", rarity: 'legendary', atk: 84, hp: 162, ability: 'flurry', flavor: 'A fingered citron with no pulp at all — it is all fragrant peel.' },
  { id: 'blood_orange', name: 'Blood Orange', rarity: 'legendary', atk: 80, hp: 168, ability: 'drain', flavor: 'Its crimson flesh comes from anthocyanins, rare in citrus.' },
  { id: 'kumquat', name: 'Kumquat', rarity: 'legendary', atk: 86, hp: 158, ability: 'ripen', flavor: 'The only citrus fruit you eat whole — peel and all.' },

  // ── Mythic ──────────────────────────────────────────────
  // Within-tier weights: lower = rarer. The Apple stays the rarest card in the game.
  { id: 'apple', name: 'Apple', rarity: 'mythic', atk: 95, hp: 210, weight: 1, ability: 'smash', flavor: 'Over 7,500 apple varieties are grown across the world.' },
  { id: 'finger_lime', name: 'Finger Lime', rarity: 'mythic', atk: 93, hp: 195, weight: 2, ability: 'flurry', flavor: 'An Australian citrus filled with caviar-like juice pearls.' },
  { id: 'pineberry', name: 'Pineberry', rarity: 'mythic', atk: 90, hp: 205, weight: 2, ability: 'drain', flavor: 'A white strawberry that tastes faintly of pineapple.' },
];

const byId = new Map(FRUITS.map((f) => [f.id, f]));

function getFruit(id) {
  return byId.get(id) || null;
}

function fruitsByRarity(rarity) {
  return FRUITS.filter((f) => f.rarity === rarity);
}

module.exports = { FRUITS, RARITIES, getFruit, fruitsByRarity };
