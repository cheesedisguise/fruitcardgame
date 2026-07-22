// The FruitCards catalog. Every card in the game lives here.
// Art for each fruit is an SVG in src/art/<id>.svg (512x512, white background).
//
// Rarity = power: each tier is a clear step up in ATK/HP. The Apple is the
// rarest card in the game — a 1-in-1000 pull.

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
  { id: 'banana', name: 'Banana', rarity: 'common', atk: 16, hp: 48, flavor: 'Slips into battle when you least expect it.' },
  { id: 'orange', name: 'Orange', rarity: 'common', atk: 13, hp: 58, flavor: 'Squeezes every drop out of its opponents.' },
  { id: 'lemon', name: 'Lemon', rarity: 'common', atk: 18, hp: 45, flavor: 'When life gives you lemons, run.' },
  { id: 'pear', name: 'Pear', rarity: 'common', atk: 12, hp: 62, flavor: 'A well-rounded fighter. Bottom-heavy, too.' },
  { id: 'grape', name: 'Grape', rarity: 'common', atk: 15, hp: 50, flavor: 'Never fights alone — always brings the bunch.' },
  { id: 'strawberry', name: 'Strawberry', rarity: 'common', atk: 17, hp: 47, flavor: 'Wears its seeds on the outside to look tough.' },
  { id: 'watermelon', name: 'Watermelon', rarity: 'common', atk: 10, hp: 70, flavor: '92% water, 8% pure stubbornness.' },
  { id: 'peach', name: 'Peach', rarity: 'common', atk: 15, hp: 52, flavor: 'Soft on the outside. Stone cold inside.' },
  { id: 'cherry', name: 'Cherry', rarity: 'common', atk: 20, hp: 40, flavor: 'Small, fast, and always picked first.' },

  // ── Uncommon ────────────────────────────────────────────
  { id: 'pineapple', name: 'Pineapple', rarity: 'uncommon', atk: 26, hp: 78, flavor: 'Wears armor and a crown. Respect it.' },
  { id: 'mango', name: 'Mango', rarity: 'uncommon', atk: 28, hp: 70, flavor: 'The undisputed king of the smoothie ring.' },
  { id: 'kiwi', name: 'Kiwi', rarity: 'uncommon', atk: 24, hp: 76, flavor: 'Fuzzy exterior, emerald core, zero fear.' },
  { id: 'blueberry', name: 'Blueberry', rarity: 'uncommon', atk: 30, hp: 62, flavor: 'Tiny berry. Massive antioxidant energy.' },
  { id: 'coconut', name: 'Coconut', rarity: 'uncommon', atk: 22, hp: 92, flavor: 'Technically a drupe. Practically a cannonball.' },
  { id: 'plum', name: 'Plum', rarity: 'uncommon', atk: 27, hp: 70, flavor: 'Deceptively juicy. Devastatingly plum.' },
  { id: 'raspberry', name: 'Raspberry', rarity: 'uncommon', atk: 29, hp: 66, flavor: 'A hundred tiny fists in one berry.' },
  { id: 'lime', name: 'Lime', rarity: 'uncommon', atk: 32, hp: 58, flavor: "Lemon's cooler, angrier cousin." },

  // ── Rare ────────────────────────────────────────────────
  { id: 'dragonfruit', name: 'Dragonfruit', rarity: 'rare', atk: 44, hp: 96, flavor: 'Bred from dragons. Tastes surprisingly mild.' },
  { id: 'pomegranate', name: 'Pomegranate', rarity: 'rare', atk: 40, hp: 105, flavor: 'A fortress holding hundreds of ruby soldiers.' },
  { id: 'passionfruit', name: 'Passionfruit', rarity: 'rare', atk: 46, hp: 88, flavor: 'Fights with passion. Obviously.' },
  { id: 'lychee', name: 'Lychee', rarity: 'rare', atk: 42, hp: 94, flavor: 'Dragon scales outside, pearl within.' },
  { id: 'starfruit', name: 'Starfruit', rarity: 'rare', atk: 48, hp: 84, flavor: 'Fell from the night sky. Landed in a salad.' },
  { id: 'persimmon', name: 'Persimmon', rarity: 'rare', atk: 38, hp: 110, flavor: 'The fruit of the gods. They have good taste.' },

  // ── Epic ────────────────────────────────────────────────
  { id: 'avocado', name: 'Avocado', rarity: 'epic', atk: 54, hp: 138, flavor: 'Technically a berry. Spiritually a boulder.' },
  { id: 'mangosteen', name: 'Mangosteen', rarity: 'epic', atk: 58, hp: 118, flavor: 'The Queen of Fruits. Royalty hits different.' },
  { id: 'rambutan', name: 'Rambutan', rarity: 'epic', atk: 62, hp: 110, flavor: 'Hair-raising attack power.' },
  { id: 'salak', name: 'Salak', rarity: 'epic', atk: 52, hp: 145, flavor: 'The snake fruit. Wrapped in scales. Bites back.' },

  // ── Legendary ───────────────────────────────────────────
  { id: 'kiwano', name: 'Kiwano', rarity: 'legendary', atk: 78, hp: 172, flavor: 'The horned melon. Armored, ancient, furious.' },
  { id: 'buddhas_hand', name: "Buddha's Hand", rarity: 'legendary', atk: 84, hp: 162, flavor: 'A dozen golden fingers. Zero mercy.' },

  // ── Mythic ──────────────────────────────────────────────
  { id: 'apple', name: 'Apple', rarity: 'mythic', atk: 95, hp: 210, flavor: 'The rarest fruit of all. It was hiding in plain sight.' },
];

const byId = new Map(FRUITS.map((f) => [f.id, f]));

function getFruit(id) {
  return byId.get(id) || null;
}

function fruitsByRarity(rarity) {
  return FRUITS.filter((f) => f.rarity === rarity);
}

module.exports = { FRUITS, RARITIES, getFruit, fruitsByRarity };
