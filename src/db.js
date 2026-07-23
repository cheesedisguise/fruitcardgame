// Postgres data layer. On Railway, DATABASE_URL is injected by the Postgres service.
const { Pool } = require('pg');
const config = require('./config');

function buildPool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Add a PostgreSQL database to your Railway project and reference its DATABASE_URL on the bot service.');
  }
  // Railway's internal network (postgres.railway.internal) doesn't use TLS;
  // the public proxy endpoint does, but with a cert we can't verify.
  const needsSsl = !/railway\.internal|localhost|127\.0\.0\.1/.test(url);
  return new Pool({
    connectionString: url,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
    max: 5,
  });
}

const pool = buildPool();

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      user_id      TEXT PRIMARY KEY,
      balance      BIGINT NOT NULL DEFAULT ${config.STARTING_BALANCE},
      packs        INT NOT NULL DEFAULT 0,
      last_daily   TIMESTAMPTZ,
      last_drop    TIMESTAMPTZ,
      daily_streak INT NOT NULL DEFAULT 0,
      packs_opened INT NOT NULL DEFAULT 0,
      wins         INT NOT NULL DEFAULT 0,
      losses       INT NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS collections (
      user_id  TEXT NOT NULL,
      fruit_id TEXT NOT NULL,
      variant  TEXT NOT NULL DEFAULT 'normal',
      quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      PRIMARY KEY (user_id, fruit_id, variant)
    );
    CREATE TABLE IF NOT EXISTS packs (
      user_id  TEXT NOT NULL,
      pack_id  TEXT NOT NULL,
      quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      PRIMARY KEY (user_id, pack_id)
    );
    CREATE TABLE IF NOT EXISTS code_redemptions (
      user_id     TEXT NOT NULL,
      code        TEXT NOT NULL,
      redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, code)
    );
    CREATE TABLE IF NOT EXISTS auctions (
      id          BIGSERIAL PRIMARY KEY,
      seller_id   TEXT NOT NULL,
      fruit_id    TEXT NOT NULL,
      variant     TEXT NOT NULL DEFAULT 'normal',
      min_bid     BIGINT NOT NULL,
      current_bid BIGINT,
      bidder_id   TEXT,
      channel_id  TEXT,
      status      TEXT NOT NULL DEFAULT 'open',
      ends_at     TIMESTAMPTZ NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Migrations for deployments created before variants / typed packs existed.
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS last_drop TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE collections ADD COLUMN IF NOT EXISTS variant TEXT NOT NULL DEFAULT 'normal';`);
  await pool.query(`DO $$ BEGIN
    IF (SELECT count(*) FROM information_schema.key_column_usage
        WHERE table_name = 'collections' AND constraint_name = 'collections_pkey') = 2 THEN
      ALTER TABLE collections DROP CONSTRAINT collections_pkey;
      ALTER TABLE collections ADD PRIMARY KEY (user_id, fruit_id, variant);
    END IF;
  END $$;`);
  await pool.query(`
    INSERT INTO packs (user_id, pack_id, quantity)
    SELECT user_id, 'standard', packs FROM players WHERE packs > 0
    ON CONFLICT (user_id, pack_id) DO UPDATE SET quantity = packs.quantity + EXCLUDED.quantity;
  `);
  await pool.query(`UPDATE players SET packs = 0 WHERE packs > 0;`);
}

// Ensure a player row exists and return it.
async function getPlayer(userId) {
  const { rows } = await pool.query(
    `INSERT INTO players (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING *`,
    [userId]
  );
  return rows[0];
}

// Collection aggregated per fruit (all variants) — used by battles / dex.
async function getCollection(userId) {
  const { rows } = await pool.query(
    `SELECT fruit_id, SUM(quantity)::int AS quantity FROM collections
     WHERE user_id = $1 GROUP BY fruit_id HAVING SUM(quantity) > 0`,
    [userId]
  );
  return rows;
}

// Collection with variants split out — used by fcards / fsell / trading.
async function getCollectionDetailed(userId) {
  const { rows } = await pool.query(
    `SELECT fruit_id, variant, quantity FROM collections
     WHERE user_id = $1 AND quantity > 0`,
    [userId]
  );
  return rows;
}

async function getPacks(userId) {
  const { rows } = await pool.query(
    `SELECT pack_id, quantity FROM packs WHERE user_id = $1 AND quantity > 0`,
    [userId]
  );
  return rows;
}

// Run fn inside a transaction with the player's row locked.
async function withPlayerLock(userId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO players (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
    const { rows } = await client.query(
      `SELECT * FROM players WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    const result = await fn(client, rows[0]);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// cards: [{ id, variant }]
async function addCards(client, userId, cards) {
  for (const card of cards) {
    await client.query(
      `INSERT INTO collections (user_id, fruit_id, variant, quantity) VALUES ($1, $2, $3, 1)
       ON CONFLICT (user_id, fruit_id, variant) DO UPDATE SET quantity = collections.quantity + 1`,
      [userId, card.id, card.variant || 'normal']
    );
  }
}

async function addBalance(userId, amount) {
  await pool.query(`UPDATE players SET balance = balance + $2 WHERE user_id = $1`, [userId, amount]);
}

async function recordBattleResult(winnerId, loserId) {
  await pool.query(
    `UPDATE players SET wins = wins + 1, balance = balance + $2 WHERE user_id = $1`,
    [winnerId, config.BATTLE_WIN_REWARD]
  );
  await pool.query(
    `UPDATE players SET losses = losses + 1, balance = balance + $2 WHERE user_id = $1`,
    [loserId, config.BATTLE_LOSS_REWARD]
  );
}

async function getLeaderboard(limit = 10) {
  const { rows } = await pool.query(
    `SELECT user_id, balance, wins, losses, packs_opened FROM players
     ORDER BY balance DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

async function countDistinctFruits(userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT fruit_id)::int AS n FROM collections WHERE user_id = $1 AND quantity > 0`,
    [userId]
  );
  return rows[0].n;
}

// ── Trading ────────────────────────────────────────────────────────
// Atomically swap cards between two players. Each side: {fruitId, variant, qty}.
// Throws with a friendly message if either side can't cover their offer.
async function executeTrade(userA, giveA, userB, giveB) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock rows in a stable order to avoid deadlocks.
    const sides = [
      { from: userA, to: userB, offer: giveA },
      { from: userB, to: userA, offer: giveB },
    ].sort((a, b) => (a.from < b.from ? -1 : 1));
    for (const side of sides) {
      const { rows } = await client.query(
        `SELECT quantity FROM collections WHERE user_id = $1 AND fruit_id = $2 AND variant = $3 FOR UPDATE`,
        [side.from, side.offer.fruitId, side.offer.variant]
      );
      if ((rows[0]?.quantity || 0) < side.offer.qty) {
        throw Object.assign(new Error(`missing-cards:${side.from}`), { friendly: true });
      }
    }
    for (const side of sides) {
      await client.query(
        `UPDATE collections SET quantity = quantity - $4 WHERE user_id = $1 AND fruit_id = $2 AND variant = $3`,
        [side.from, side.offer.fruitId, side.offer.variant, side.offer.qty]
      );
      await client.query(
        `INSERT INTO collections (user_id, fruit_id, variant, quantity) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, fruit_id, variant) DO UPDATE SET quantity = collections.quantity + $4`,
        [side.to, side.offer.fruitId, side.offer.variant, side.offer.qty]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ── Auctions ───────────────────────────────────────────────────────
// The card is escrowed (removed from the seller) while the auction runs.
async function createAuction(sellerId, fruitId, variant, minBid, channelId, durationMs) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT quantity FROM collections WHERE user_id = $1 AND fruit_id = $2 AND variant = $3 FOR UPDATE`,
      [sellerId, fruitId, variant]
    );
    if ((rows[0]?.quantity || 0) < 1) {
      throw Object.assign(new Error('missing-card'), { friendly: true });
    }
    await client.query(
      `UPDATE collections SET quantity = quantity - 1 WHERE user_id = $1 AND fruit_id = $2 AND variant = $3`,
      [sellerId, fruitId, variant]
    );
    const ins = await client.query(
      `INSERT INTO auctions (seller_id, fruit_id, variant, min_bid, channel_id, ends_at)
       VALUES ($1, $2, $3, $4, $5, now() + ($6 || ' milliseconds')::interval) RETURNING *`,
      [sellerId, fruitId, variant, minBid, channelId, String(durationMs)]
    );
    await client.query('COMMIT');
    return ins.rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function listOpenAuctions(limit = 15) {
  const { rows } = await pool.query(
    `SELECT * FROM auctions WHERE status = 'open' ORDER BY ends_at ASC LIMIT $1`,
    [limit]
  );
  return rows;
}

// Coins are escrowed on bid; the previous bidder is refunded.
async function placeBid(auctionId, bidderId, amount) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT * FROM auctions WHERE id = $1 FOR UPDATE`, [auctionId]);
    const auction = rows[0];
    if (!auction || auction.status !== 'open') throw Object.assign(new Error('not-open'), { friendly: true });
    if (new Date(auction.ends_at).getTime() <= Date.now()) throw Object.assign(new Error('ended'), { friendly: true });
    if (auction.seller_id === bidderId) throw Object.assign(new Error('own-auction'), { friendly: true });
    const minimum = auction.current_bid ? Number(auction.current_bid) + config.AUCTION_MIN_INCREMENT : Number(auction.min_bid);
    if (amount < minimum) throw Object.assign(new Error(`too-low:${minimum}`), { friendly: true });

    const bal = await client.query(`SELECT balance FROM players WHERE user_id = $1 FOR UPDATE`, [bidderId]);
    if (Number(bal.rows[0]?.balance || 0) < amount) throw Object.assign(new Error('poor'), { friendly: true });

    await client.query(`UPDATE players SET balance = balance - $2 WHERE user_id = $1`, [bidderId, amount]);
    if (auction.bidder_id) {
      await client.query(`UPDATE players SET balance = balance + $2 WHERE user_id = $1`, [
        auction.bidder_id,
        auction.current_bid,
      ]);
    }
    await client.query(`UPDATE auctions SET current_bid = $2, bidder_id = $3 WHERE id = $1`, [
      auctionId,
      amount,
      bidderId,
    ]);
    await client.query('COMMIT');
    return { ...auction, current_bid: amount, bidder_id: bidderId };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Settle every auction past its end time. Returns settled auctions for announcements.
async function settleDueAuctions() {
  const client = await pool.connect();
  const settled = [];
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM auctions WHERE status = 'open' AND ends_at <= now() FOR UPDATE SKIP LOCKED`
    );
    for (const auction of rows) {
      if (auction.bidder_id) {
        // Winner takes the card (coins were escrowed at bid time); seller gets paid.
        await client.query(
          `INSERT INTO collections (user_id, fruit_id, variant, quantity) VALUES ($1, $2, $3, 1)
           ON CONFLICT (user_id, fruit_id, variant) DO UPDATE SET quantity = collections.quantity + 1`,
          [auction.bidder_id, auction.fruit_id, auction.variant]
        );
        await client.query(`UPDATE players SET balance = balance + $2 WHERE user_id = $1`, [
          auction.seller_id,
          auction.current_bid,
        ]);
      } else {
        // No bids — the card goes home.
        await client.query(
          `INSERT INTO collections (user_id, fruit_id, variant, quantity) VALUES ($1, $2, $3, 1)
           ON CONFLICT (user_id, fruit_id, variant) DO UPDATE SET quantity = collections.quantity + 1`,
          [auction.seller_id, auction.fruit_id, auction.variant]
        );
      }
      await client.query(`UPDATE auctions SET status = 'settled' WHERE id = $1`, [auction.id]);
      settled.push(auction);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return settled;
}

module.exports = {
  pool,
  init,
  getPlayer,
  getCollection,
  getCollectionDetailed,
  getPacks,
  withPlayerLock,
  addCards,
  addBalance,
  recordBattleResult,
  getLeaderboard,
  countDistinctFruits,
  executeTrade,
  createAuction,
  listOpenAuctions,
  placeBid,
  settleDueAuctions,
};
