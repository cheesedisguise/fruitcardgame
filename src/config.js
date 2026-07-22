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

  PACK_PRICE: 100,
  PACK_SIZE: 5,
  MAX_PACKS_PER_BUY: 10,

  BATTLE_WIN_REWARD: 100,
  BATTLE_LOSS_REWARD: 20,

  // Battle feel
  DAMAGE_VARIANCE: 0.15, // damage rolls between 85% and 115% of ATK
  CRIT_CHANCE: 0.1,
  CRIT_MULTIPLIER: 1.5,

  // Component timeouts (ms)
  INVITE_TIMEOUT_MS: 2 * 60 * 1000,
  PICK_TIMEOUT_MS: 3 * 60 * 1000,
  TURN_TIMEOUT_MS: 2 * 60 * 1000,
};
