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

// Fruit types form a weakness cycle (each type is super-effective ×1.5
// against the next, and resists ×0.75 the type it beats):
// Citrus → Vine → Stone → Berry → Tropical → Orchard → Citrus
const TYPES = {
  citrus: { name: 'Citrus', emoji: '🍋', color: '#fbc02d', beats: 'vine' },
  vine: { name: 'Vine', emoji: '🍈', color: '#7cb342', beats: 'stone' },
  stone: { name: 'Stone', emoji: '🍑', color: '#f4511e', beats: 'berry' },
  berry: { name: 'Berry', emoji: '🫐', color: '#5e35b1', beats: 'tropical' },
  tropical: { name: 'Tropical', emoji: '🌴', color: '#00897b', beats: 'orchard' },
  orchard: { name: 'Orchard', emoji: '🍎', color: '#c62828', beats: 'citrus' },
};
for (const [key, t] of Object.entries(TYPES)) {
  TYPES[t.beats].weakTo = key; // the type that beats you is your weakness
  t.resists = t.beats; // you resist the type you beat
}

// Signature-move archetypes: varied energy costs and Pokémon-style mechanics.
const ABILITIES = {
  smash: { name: 'Smash', emoji: '💥', cost: 3, desc: 'A crushing blow — 1.8× damage' },
  regrow: { name: 'Regrow', emoji: '💚', cost: 2, desc: 'Heal 50% of max HP' },
  pierce: { name: 'Pierce', emoji: '🗡️', cost: 3, desc: '1.2× damage that ignores shields and type matchups' },
  drain: { name: 'Drain', emoji: '🧛', cost: 3, desc: '0.9× damage, then heal half the damage dealt' },
  flurry: { name: 'Flurry', emoji: '🪙', cost: 2, desc: 'Flip 2 coins — 0.9× damage for each heads' },
  ripen: { name: 'Ripen', emoji: '📈', cost: 2, desc: 'Your team gains +10 ATK for the battle' },
  gamble: { name: 'Gamble', emoji: '🎲', cost: 4, desc: 'Flip a coin — heads: 2.6× damage; tails: hurt yourself for 0.5×' },
  cascade: { name: 'Cascade', emoji: '♾️', cost: 4, desc: 'Flip coins until tails — 0.8× damage per heads' },
};

// Light-move archetypes. 'jab' takes its name from the fruit's type.
const QUICK_ARCHETYPES = {
  jab: { cost: 1, mult: 0.7, label: 'DMG' },
  power: { name: 'Power Strike', cost: 2, mult: 0.95, label: 'DMG' },
  lucky: { name: 'Lucky Strike', cost: 1, mult: 1.3, flips: 1, label: 'FLIP' },
  twin: { name: 'Twin Tap', cost: 1, mult: 0.5, flips: 2, label: 'PER HEADS' },
  guard: { name: 'Guard Strike', cost: 2, mult: 0.55, shieldMult: 0.35, label: '+SHIELD' },
  leech: { name: 'Leech Bite', cost: 2, mult: 0.55, drain: true, label: 'DRAIN' },
  lance: { name: 'Piercing Lance', cost: 2, mult: 0.65, pierce: true, label: 'PIERCE' },
};

// Per-type plain jab names.
const QUICK_MOVES = {
  citrus: 'Zest Jab',
  vine: 'Vine Whip',
  stone: 'Pit Punch',
  berry: 'Berry Bash',
  tropical: 'Palm Strike',
  orchard: 'Branch Bonk',
};

function round5(n) {
  return Math.max(5, Math.round(n / 5) * 5);
}

// The printed move list for a fruit (used by the card renderer and battles).
function movesFor(fruit) {
  const qa = QUICK_ARCHETYPES[fruit.quick || 'jab'];
  const quick = {
    kind: fruit.quick || 'jab',
    name: qa.name || QUICK_MOVES[fruit.type],
    cost: qa.cost,
    dmg: round5(fruit.atk * qa.mult),
    flips: qa.flips || 0,
    pierce: !!qa.pierce,
    drain: !!qa.drain,
    shieldMult: qa.shieldMult || 0,
    label: qa.label,
  };
  const ability = ABILITIES[fruit.ability];
  const signature = { name: fruit.move, cost: ability.cost, kind: fruit.ability, emoji: ability.emoji };
  if (fruit.ability === 'smash') signature.dmg = round5(fruit.atk * 1.8);
  else if (fruit.ability === 'pierce') signature.dmg = round5(fruit.atk * 1.2);
  else if (fruit.ability === 'drain') signature.dmg = round5(fruit.atk * 0.9);
  else if (fruit.ability === 'flurry') signature.dmg = round5(fruit.atk * 0.9); // per heads
  else if (fruit.ability === 'gamble') signature.dmg = round5(fruit.atk * 2.6); // or recoil
  else if (fruit.ability === 'cascade') signature.dmg = round5(fruit.atk * 0.8); // per heads
  else if (fruit.ability === 'regrow') signature.heal = round5(fruit.hp * 0.5);
  else if (fruit.ability === 'ripen') signature.buff = 10;
  return { quick, signature };
}

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
  { id: 'banana', name: 'Banana', rarity: 'common', type: 'tropical', atk: 16, hp: 48, quick: 'lucky', ability: 'flurry', move: 'Boomerang Peel', flavor: 'Botanically a berry — and the banana plant is a giant herb, not a tree.' },
  { id: 'orange', name: 'Orange', rarity: 'common', type: 'citrus', atk: 13, hp: 58, ability: 'drain', move: 'Citrus Sap', flavor: 'An ancient hybrid of pomelo and mandarin, first grown in China.' },
  { id: 'lemon', name: 'Lemon', rarity: 'common', type: 'citrus', atk: 18, hp: 45, quick: 'lance', ability: 'pierce', move: 'Sour Strike', flavor: 'Sailors carried lemons on long voyages to fight off scurvy.' },
  { id: 'pear', name: 'Pear', rarity: 'common', type: 'orchard', atk: 12, hp: 62, quick: 'guard', ability: 'regrow', move: 'Orchard Renewal', flavor: 'Pear wood is so fine it is used to build instruments and furniture.' },
  { id: 'grape', name: 'Grape', rarity: 'common', type: 'vine', atk: 15, hp: 50, quick: 'twin', ability: 'flurry', move: 'Grapeshot', flavor: 'Humans have been growing grapes for more than 8,000 years.' },
  { id: 'strawberry', name: 'Strawberry', rarity: 'common', type: 'berry', atk: 17, hp: 47, ability: 'ripen', move: 'Summer Ripening', flavor: 'The only fruit that wears its seeds on the outside — about 200 of them.' },
  { id: 'watermelon', name: 'Watermelon', rarity: 'common', type: 'vine', atk: 10, hp: 70, quick: 'power', ability: 'smash', move: 'Melon Crush', flavor: 'About 92% water. Ancient Egyptians placed them in royal tombs.' },
  { id: 'peach', name: 'Peach', rarity: 'common', type: 'stone', atk: 15, hp: 52, ability: 'regrow', move: 'Immortal Bloom', flavor: 'Originated in China, where the peach is a symbol of immortality.' },
  { id: 'cherry', name: 'Cherry', rarity: 'common', type: 'stone', atk: 20, hp: 40, quick: 'lucky', ability: 'flurry', move: 'Twin Cherry Bomb', flavor: 'A single mature cherry tree can carry about 7,000 cherries.' },
  { id: 'tomato', name: 'Tomato', rarity: 'common', type: 'vine', atk: 14, hp: 56, quick: 'leech', ability: 'drain', move: 'Sauce Splash', flavor: 'Botanically a fruit — but legally declared a vegetable by the US Supreme Court in 1893.' },
  { id: 'clementine', name: 'Clementine', rarity: 'common', type: 'citrus', atk: 16, hp: 50, quick: 'lucky', ability: 'flurry', move: 'Easy Peeler', flavor: 'A seedless mandarin cross first found in an Algerian orphanage garden.' },
  { id: 'blackberry', name: 'Blackberry', rarity: 'common', type: 'berry', atk: 19, hp: 42, quick: 'twin', ability: 'pierce', move: 'Bramble Stab', flavor: 'Grows on thorny brambles — each berry is dozens of tiny drupelets.' },

  // ── Uncommon ────────────────────────────────────────────
  { id: 'pineapple', name: 'Pineapple', rarity: 'uncommon', type: 'tropical', atk: 26, hp: 78, quick: 'lance', ability: 'pierce', move: 'Crown Spike', flavor: 'One plant takes up to two years to grow a single pineapple.' },
  { id: 'mango', name: 'Mango', rarity: 'uncommon', type: 'tropical', atk: 28, hp: 70, quick: 'power', ability: 'smash', move: "King's Verdict", flavor: 'The most eaten fruit on Earth, cultivated for over 4,000 years.' },
  { id: 'kiwi', name: 'Kiwi', rarity: 'uncommon', type: 'vine', atk: 24, hp: 76, quick: 'leech', ability: 'drain', move: 'Emerald Leech', flavor: 'Gram for gram, kiwifruit packs more vitamin C than an orange.' },
  { id: 'blueberry', name: 'Blueberry', rarity: 'uncommon', type: 'berry', atk: 30, hp: 62, quick: 'twin', ability: 'ripen', move: 'Antioxidant Surge', flavor: 'One of the very few foods in nature that is truly blue.' },
  { id: 'coconut', name: 'Coconut', rarity: 'uncommon', type: 'tropical', atk: 22, hp: 92, quick: 'power', ability: 'gamble', move: 'Cannonball Drop', flavor: 'Coconuts can float across entire oceans and sprout on far shores.' },
  { id: 'plum', name: 'Plum', rarity: 'uncommon', type: 'stone', atk: 27, hp: 70, ability: 'regrow', move: 'Deep Purple Mend', flavor: 'One of the first fruits ever domesticated by humans.' },
  { id: 'raspberry', name: 'Raspberry', rarity: 'uncommon', type: 'berry', atk: 29, hp: 66, quick: 'twin', ability: 'flurry', move: 'Hundred Fists', flavor: 'Each raspberry is ~100 tiny fruits, each with its own seed.' },
  { id: 'lime', name: 'Lime', rarity: 'uncommon', type: 'citrus', atk: 32, hp: 58, quick: 'lance', ability: 'pierce', move: 'Zest Lancer', flavor: 'British sailors ate so many limes they were nicknamed "limeys."' },
  { id: 'cranberry', name: 'Cranberry', rarity: 'uncommon', type: 'berry', atk: 25, hp: 68, quick: 'lance', ability: 'ripen', move: 'Bog Bounce', flavor: 'Ripe cranberries bounce — early farmers sorted them by bouncing.' },
  { id: 'grapefruit', name: 'Grapefruit', rarity: 'uncommon', type: 'citrus', atk: 31, hp: 60, ability: 'gamble', move: 'Bitter Broadside', flavor: 'Named for growing in grape-like clusters on the tree.' },
  { id: 'cantaloupe', name: 'Cantaloupe', rarity: 'uncommon', type: 'vine', atk: 23, hp: 88, quick: 'guard', ability: 'regrow', move: 'Netted Mend', flavor: 'Named after Cantalupo, the papal estate where Europe first grew it.' },

  // ── Rare ────────────────────────────────────────────────
  { id: 'dragonfruit', name: 'Dragonfruit', rarity: 'rare', type: 'vine', atk: 44, hp: 96, ability: 'cascade', move: 'Dragon Claw', flavor: 'Grows on a cactus whose flowers bloom for a single night.' },
  { id: 'pomegranate', name: 'Pomegranate', rarity: 'rare', type: 'berry', atk: 40, hp: 105, ability: 'ripen', move: 'Ruby Legion', flavor: 'A single pomegranate can hold more than 600 seeds.' },
  { id: 'passionfruit', name: 'Passionfruit', rarity: 'rare', type: 'vine', atk: 46, hp: 88, quick: 'leech', ability: 'drain', move: 'Passion Drain', flavor: 'Named by missionaries after the symbolism of the passion flower.' },
  { id: 'lychee', name: 'Lychee', rarity: 'rare', type: 'berry', atk: 42, hp: 94, ability: 'regrow', move: 'Pearl Restoration', flavor: 'Prized by Chinese emperors for more than 2,000 years.' },
  { id: 'starfruit', name: 'Starfruit', rarity: 'rare', type: 'tropical', atk: 48, hp: 84, quick: 'lucky', ability: 'pierce', move: 'Falling Star', flavor: 'Every slice is a natural five-pointed star.' },
  { id: 'persimmon', name: 'Persimmon', rarity: 'rare', type: 'orchard', atk: 38, hp: 110, quick: 'guard', ability: 'regrow', move: 'Divine Harvest', flavor: 'Its genus name Diospyros roughly means "fruit of the gods."' },
  { id: 'guava', name: 'Guava', rarity: 'rare', type: 'tropical', atk: 41, hp: 92, ability: 'ripen', move: 'Vitamin Rush', flavor: 'Contains about four times the vitamin C of an orange.' },
  { id: 'apricot', name: 'Apricot', rarity: 'rare', type: 'stone', atk: 45, hp: 86, ability: 'smash', move: 'Silk Road Slam', flavor: 'Dried apricots fed traders along the ancient Silk Road.' },
  { id: 'cherimoya', name: 'Cherimoya', rarity: 'rare', type: 'stone', atk: 39, hp: 108, ability: 'regrow', move: 'Custard Cloud', flavor: 'Mark Twain called it "the most delicious fruit known to men."' },
  { id: 'nectarine', name: 'Nectarine', rarity: 'rare', type: 'stone', atk: 43, hp: 90, quick: 'leech', ability: 'drain', move: 'Smooth Operator', flavor: 'A peach with a single gene switched off — the one that makes fuzz.' },
  { id: 'honeydew', name: 'Honeydew', rarity: 'rare', type: 'vine', atk: 36, hp: 112, quick: 'guard', ability: 'regrow', move: 'Morning Dew', flavor: 'One of the sweetest melons — it only ripens on the vine, never after picking.' },

  // ── Epic ────────────────────────────────────────────────
  { id: 'avocado', name: 'Avocado', rarity: 'epic', type: 'stone', atk: 54, hp: 138, quick: 'power', ability: 'smash', move: 'Stone Core Slam', flavor: 'Botanically a giant berry with a single enormous seed.' },
  { id: 'pomelo', name: 'Pomelo', rarity: 'epic', type: 'citrus', atk: 50, hp: 148, quick: 'power', ability: 'smash', move: 'Citrus Colossus', flavor: 'The largest citrus fruit on Earth, and an ancestor of the grapefruit.' },
  { id: 'tamarind', name: 'Tamarind', rarity: 'epic', type: 'tropical', atk: 56, hp: 124, quick: 'leech', ability: 'drain', move: 'Sticky Grip', flavor: 'A tropical pod whose tangy pulp flavors Worcestershire sauce.' },
  { id: 'mangosteen', name: 'Mangosteen', rarity: 'epic', type: 'stone', atk: 58, hp: 118, ability: 'regrow', move: "Queen's Grace", flavor: 'Queen Victoria reportedly offered a reward for a fresh one.' },
  { id: 'rambutan', name: 'Rambutan', rarity: 'epic', type: 'tropical', atk: 62, hp: 110, ability: 'flurry', move: 'Hair Trigger', flavor: 'Its name comes from "rambut" — the Malay word for hair.' },
  { id: 'salak', name: 'Salak', rarity: 'epic', type: 'tropical', atk: 52, hp: 145, quick: 'guard', ability: 'pierce', move: 'Snakebite', flavor: 'Called snake fruit for its reddish, scaly skin.' },

  // ── Legendary ───────────────────────────────────────────
  { id: 'kiwano', name: 'Kiwano', rarity: 'legendary', type: 'vine', atk: 78, hp: 172, quick: 'power', ability: 'gamble', move: 'Horn Charge', flavor: 'The horned melon — an ancient African relative of the cucumber.' },
  { id: 'buddhas_hand', name: "Buddha's Hand", rarity: 'legendary', type: 'citrus', atk: 84, hp: 162, quick: 'lance', ability: 'cascade', move: 'Thousand Palms', flavor: 'A fingered citron with no pulp at all — it is all fragrant peel.' },
  { id: 'blood_orange', name: 'Blood Orange', rarity: 'legendary', type: 'citrus', atk: 80, hp: 168, quick: 'leech', ability: 'drain', move: 'Crimson Pact', flavor: 'Its crimson flesh comes from anthocyanins, rare in citrus.' },
  { id: 'kumquat', name: 'Kumquat', rarity: 'legendary', type: 'citrus', atk: 86, hp: 158, ability: 'ripen', move: 'Small But Mighty', flavor: 'The only citrus fruit you eat whole — peel and all.' },

  // ── Mythic ──────────────────────────────────────────────
  // Within-tier weights: lower = rarer. The Apple stays the rarest card in the game.
  { id: 'apple', name: 'Apple', rarity: 'mythic', type: 'orchard', atk: 95, hp: 210, weight: 1, ability: 'smash', move: "Newton's Wrath", flavor: 'Over 7,500 apple varieties are grown across the world.' },
  { id: 'finger_lime', name: 'Finger Lime', rarity: 'mythic', type: 'citrus', atk: 93, hp: 195, weight: 2, quick: 'twin', ability: 'cascade', move: 'Pearl Burst', flavor: 'An Australian citrus filled with caviar-like juice pearls.' },
  { id: 'pineberry', name: 'Pineberry', rarity: 'mythic', type: 'berry', atk: 90, hp: 205, weight: 2, quick: 'lucky', ability: 'drain', move: 'Ghost Harvest', flavor: 'A white strawberry that tastes faintly of pineapple.' },
];

const byId = new Map(FRUITS.map((f) => [f.id, f]));

function getFruit(id) {
  return byId.get(id) || null;
}

function fruitsByRarity(rarity) {
  return FRUITS.filter((f) => f.rarity === rarity);
}

module.exports = { FRUITS, RARITIES, TYPES, ABILITIES, QUICK_ARCHETYPES, QUICK_MOVES, movesFor, getFruit, fruitsByRarity };
