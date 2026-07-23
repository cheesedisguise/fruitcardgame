// Game balance and economy tuning. All coin amounts in one place.
module.exports = {
  CURRENCY_NAME: 'coins',
  CURRENCY_EMOJI: '🪙',

  STARTING_BALANCE: 500,

  DAILY_BASE: 250,
  DAILY_STREAK_BONUS: 25, // extra per consecutive day
  DAILY_STREAK_BONUS_CAP: 250, // max extra from streaks
  DAILY_COOLDOWN_MS: 24 * 60 * 60 * 1000,
  DAILY_STREAK_WINDOW_MS: 48 * 60 * 60 * 1000, // claim within this window to keep the streak

  // fdrop: quick coin grabs. 50% chance each extra +10 keeps the chain going.
  DROP_AMOUNT: 10,
  DROP_CHAIN_CHANCE: 0.5,
  DROP_COOLDOWN_MS: 2 * 60 * 1000,

  // Card variants (beyond normal). Rolled per card, rarest first; odds vary
  // per pack. Sell price = rarity value × the variant's sellMult.
  VARIANTS: {
    foil: { name: 'Foil', fallbackEmoji: '✨', sellMult: 4 },
    gold: { name: 'Gold', fallbackEmoji: '🥇', sellMult: 10 },
    prism: { name: 'Prism', fallbackEmoji: '🌈', sellMult: 25 },
  },

  // Pack shop. odds are per-mille (out of 1000) per card; pity guarantees at
  // least one card at that rarity or better per pack; variantChances is the
  // per-card chance of each special variant.
  PACKS: {
    standard: {
      id: 'standard',
      name: 'Standard Pack',
      emoji: '📦',
      price: 100,
      size: 5,
      variantChances: { prism: 0.001, gold: 0.004, foil: 0.02 },
      pity: 'uncommon',
      odds: { common: 599, uncommon: 250, rare: 100, epic: 40, legendary: 10, mythic: 1 },
    },
    juicy: {
      id: 'juicy',
      name: 'Juicy Pack',
      emoji: '🧃',
      price: 250,
      size: 5,
      variantChances: { prism: 0.0025, gold: 0.01, foil: 0.04 },
      pity: 'rare',
      odds: { common: 400, uncommon: 300, rare: 180, epic: 80, legendary: 32, mythic: 8 },
    },
    exotic: {
      id: 'exotic',
      name: 'Exotic Pack',
      emoji: '🌺',
      price: 600,
      size: 5,
      variantChances: { prism: 0.005, gold: 0.02, foil: 0.08 },
      pity: 'epic',
      odds: { common: 150, uncommon: 300, rare: 300, epic: 150, legendary: 80, mythic: 20 },
    },
  },
  MAX_PACKS_PER_BUY: 10,

  // Auctions
  AUCTION_DURATION_MS: 10 * 60 * 1000,
  AUCTION_MIN_INCREMENT: 10,
  AUCTION_SWEEP_INTERVAL_MS: 30 * 1000,

  // Trading
  TRADE_TIMEOUT_MS: 3 * 60 * 1000,

  BATTLE_WIN_REWARD: 100,
  BATTLE_LOSS_REWARD: 20,

  // Battle feel
  TEAM_SIZE: 3,
  // Fair drafting: each card costs points by rarity; teams fit the budget.
  TEAM_POINTS: 9,
  RARITY_COST: { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5, mythic: 6 },
  // Underdog boost: +1 starting energy per this much team-power gap (capped).
  UNDERDOG_STEP: 0.15,
  UNDERDOG_MAX: 3,
  POWER_CAP: 10,
  DAMAGE_VARIANCE: 0.15, // damage rolls between 85% and 115% of ATK
  CRIT_CHANCE: 0.1,
  CRIT_MULTIPLIER: 1.5,
  BLOCK_SHIELD_RATIO: 0.75, // shield gained = ratio * ATK
  ABILITY_COST: 3,

  // Component timeouts (ms)
  INVITE_TIMEOUT_MS: 2 * 60 * 1000,
  PICK_TIMEOUT_MS: 3 * 60 * 1000,
  TURN_TIMEOUT_MS: 2 * 60 * 1000,
};
