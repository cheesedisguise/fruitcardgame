// Shared economy actions used by both text commands and the GUI (src/ui.js).
// Every mutation goes through withPlayerLock so buttons and commands are
// equally race-safe.
const crypto = require('crypto');
const config = require('./config');
const { rollPack } = require('./util');

async function claimDaily(db, userId) {
  return db.withPlayerLock(userId, async (client, player) => {
    const now = Date.now();
    const last = player.last_daily ? new Date(player.last_daily).getTime() : 0;
    const elapsed = now - last;
    if (elapsed < config.DAILY_COOLDOWN_MS) {
      return { claimed: false, wait: config.DAILY_COOLDOWN_MS - elapsed };
    }
    const keepStreak = last > 0 && elapsed < config.DAILY_STREAK_WINDOW_MS;
    const streak = keepStreak ? player.daily_streak + 1 : 1;
    const bonus = Math.min((streak - 1) * config.DAILY_STREAK_BONUS, config.DAILY_STREAK_BONUS_CAP);
    const amount = config.DAILY_BASE + bonus;
    await client.query(
      `UPDATE players SET balance = balance + $2, last_daily = now(), daily_streak = $3 WHERE user_id = $1`,
      [userId, amount, streak]
    );
    return { claimed: true, amount, bonus, streak, balance: Number(player.balance) + amount };
  });
}

async function claimDrop(db, userId) {
  return db.withPlayerLock(userId, async (client, player) => {
    const now = Date.now();
    const last = player.last_drop ? new Date(player.last_drop).getTime() : 0;
    const remaining = config.DROP_COOLDOWN_MS - (now - last);
    if (remaining > 0) return { claimed: false, wait: remaining };

    let chain = 1;
    while (crypto.randomInt(2) === 0) chain++; // 50% to keep going, uncapped
    const amount = chain * config.DROP_AMOUNT;
    await client.query(
      `UPDATE players SET balance = balance + $2, last_drop = now() WHERE user_id = $1`,
      [userId, amount]
    );
    return { claimed: true, chain, amount, balance: Number(player.balance) + amount };
  });
}

async function buyPacks(db, userId, pack, amount) {
  const cost = amount * pack.price;
  return db.withPlayerLock(userId, async (client, player) => {
    if (Number(player.balance) < cost) {
      return { ok: false, cost, balance: Number(player.balance) };
    }
    await client.query(`UPDATE players SET balance = balance - $2 WHERE user_id = $1`, [userId, cost]);
    const { rows } = await client.query(
      `INSERT INTO packs (user_id, pack_id, quantity) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, pack_id) DO UPDATE SET quantity = packs.quantity + $3
       RETURNING quantity`,
      [userId, pack.id, amount]
    );
    return { ok: true, cost, balance: Number(player.balance) - cost, owned: rows[0].quantity };
  });
}

// requestedPack may be null — falls back to standard, then anything owned.
async function openPack(db, userId, requestedPack) {
  return db.withPlayerLock(userId, async (client) => {
    const { rows: owned } = await client.query(
      `SELECT pack_id, quantity FROM packs WHERE user_id = $1 AND quantity > 0 FOR UPDATE`,
      [userId]
    );
    if (owned.length === 0) return { ok: false, reason: 'none' };

    let packRow;
    if (requestedPack) {
      packRow = owned.find((r) => r.pack_id === requestedPack.id);
      if (!packRow) return { ok: false, reason: 'notype', pack: requestedPack };
    } else {
      packRow = owned.find((r) => r.pack_id === 'standard') || owned[0];
    }
    const pack = config.PACKS[packRow.pack_id] || config.PACKS.standard;

    const cards = rollPack(pack);
    const { rows } = await client.query(
      `SELECT DISTINCT fruit_id FROM collections WHERE user_id = $1 AND quantity > 0 AND fruit_id = ANY($2)`,
      [userId, cards.map((c) => c.fruit.id)]
    );
    const ownedBefore = new Set(rows.map((r) => r.fruit_id));
    await client.query(`UPDATE packs SET quantity = quantity - 1 WHERE user_id = $1 AND pack_id = $2`, [
      userId,
      packRow.pack_id,
    ]);
    await client.query(`UPDATE players SET packs_opened = packs_opened + 1 WHERE user_id = $1`, [userId]);
    for (const card of cards) {
      await client.query(
        `INSERT INTO collections (user_id, fruit_id, variant, quantity) VALUES ($1, $2, $3, 1)
         ON CONFLICT (user_id, fruit_id, variant) DO UPDATE SET quantity = collections.quantity + 1`,
        [userId, card.fruit.id, card.variant]
      );
    }
    return { ok: true, pack, cards, ownedBefore, packsLeft: packRow.quantity - 1 };
  });
}

module.exports = { claimDaily, claimDrop, buyPacks, openPack };
