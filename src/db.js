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
      daily_streak INT NOT NULL DEFAULT 0,
      packs_opened INT NOT NULL DEFAULT 0,
      wins         INT NOT NULL DEFAULT 0,
      losses       INT NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS collections (
      user_id  TEXT NOT NULL,
      fruit_id TEXT NOT NULL,
      quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      PRIMARY KEY (user_id, fruit_id)
    );
  `);
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

async function getCollection(userId) {
  const { rows } = await pool.query(
    `SELECT fruit_id, quantity FROM collections WHERE user_id = $1 AND quantity > 0`,
    [userId]
  );
  return rows;
}

// Run fn inside a transaction with the player's row locked.
// fn receives (client, playerRow) and its return value is passed through.
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

async function addCards(client, userId, fruitIds) {
  for (const fruitId of fruitIds) {
    await client.query(
      `INSERT INTO collections (user_id, fruit_id, quantity) VALUES ($1, $2, 1)
       ON CONFLICT (user_id, fruit_id) DO UPDATE SET quantity = collections.quantity + 1`,
      [userId, fruitId]
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
    `SELECT COUNT(*)::int AS n FROM collections WHERE user_id = $1 AND quantity > 0`,
    [userId]
  );
  return rows[0].n;
}

module.exports = {
  pool,
  init,
  getPlayer,
  getCollection,
  withPlayerLock,
  addCards,
  addBalance,
  recordBattleResult,
  getLeaderboard,
  countDistinctFruits,
};
