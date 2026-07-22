# 🍎 FruitCards

A fruit trading card game Discord bot — like Pokémon TCG, but every card is a fruit.
Collect all 30 fruits, open packs, and battle across servers!

- 🃏 **30 collectible fruit cards** — all real fruits — across 6 rarities (Common → Mythic), each with **ATK** and **HP** stats and real fruit photography on a clean white background (openly licensed images, see [ATTRIBUTIONS.md](ATTRIBUTIONS.md))
- 🌟 **Rarer = stronger.** Every rarity tier is a clear power jump — and the **Apple** is the rarest card in the game (0.1%, 1-in-1000)
- 📦 **Packs** — 5 cards each, rarity-weighted pulls with a guaranteed Uncommon+
- 🪙 **Coin economy** — daily rewards with streak bonuses, buy packs, sell duplicates
- ⚔️ **Battles in private threads** — challenge a friend (`fbattle`) or use **cross-server matchmaking** (`fqueue`). Each match opens a private thread (one per player when the players are in different servers, kept in sync by the bot) and the thread is deleted when the match ends
- 🏆 Leaderboard, FruitDex completion tracking, and a full card browser

## Commands

Just type them in chat — no slash needed:

| Command | What it does |
|---|---|
| `fstart` | Create your account & learn the ropes |
| `fdaily` | Claim daily coins (🔥 streak bonus) |
| `fbuy [n]` | Buy card packs (100 🪙 each) |
| `fopen` | Open a pack — 5 cards revealed |
| `fcards [@user] [page]` | Browse a collection |
| `fcard <fruit>` | View a card up close |
| `fdex` | FruitDex — track all 30 fruits |
| `fqueue` | Cross-server matchmaking (`fqueue leave` to exit) |
| `fbattle @user` | Challenge someone directly |
| `fsell <fruit> [n\|all]` | Sell cards for coins |
| `fbalance` | Your profile & stats |
| `fshop` | Prices, pull rates, sell values |
| `ftop` | Leaderboard |
| `fhelp` | All commands |

## Setup

### 1. Create the Discord application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** → name it (e.g. *FruitCards*).
2. **Bot** tab → **Reset Token** → copy the token (you'll need it for Railway).
3. Still on the **Bot** tab, under *Privileged Gateway Intents*, enable **MESSAGE CONTENT INTENT** (required — the bot reads text commands like `fbattle`).
4. **OAuth2 → URL Generator**: check the `bot` scope, then these permissions:
   **View Channels, Send Messages, Send Messages in Threads, Create Private Threads, Manage Threads, Embed Links, Attach Files, Read Message History**.
   Open the generated URL and invite the bot to your server(s) — invite it to multiple servers to enable cross-server matchmaking.

### 2. Deploy on Railway

1. Push this repo to GitHub (already done if you're reading this there).
2. On [Railway](https://railway.com): **New Project** → **Deploy from GitHub repo** → pick this repo.
3. In the same project: **Create** → **Database** → **Add PostgreSQL**.
4. Open the bot service → **Variables** → add:
   - `DISCORD_TOKEN` = your bot token from step 1
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (Railway resolves this reference to the Postgres service automatically)
5. Deploy. The bot creates its own database tables on first boot — no migrations to run.

When the logs show `🍎 FruitCards is ready!`, type `fstart` in your server.

> **Note on threads:** battles run in private threads, so the bot needs the
> thread permissions listed above. If it can't create a private thread it
> falls back to a public thread, and failing that, plays the battle directly
> in the channel.

### Run locally (optional)

```bash
npm install
cp .env.example .env   # fill in DISCORD_TOKEN and a Postgres DATABASE_URL
npm start
```

Preview all card renders without running the bot:

```bash
npm run preview        # writes PNGs to preview/
```

## Project layout

```
src/
  index.js       entrypoint — message commands + component routing
  fruits.js      the card catalog (stats, rarities, flavor text)
  config.js      economy & battle tuning knobs
  db.js          Postgres layer (auto-creates schema)
  render.js      SVG → PNG card compositing (sharp)
  battle.js      battle engine (synced private-thread views)
  matchmaking.js cross-server matchmaking queue
  commands/      one file per command
  art/           30 real fruit photos (512x512 PNG, white background)
assets/fonts/    bundled fonts (SIL OFL): Finger Paint (card text), Nunito
ATTRIBUTIONS.md  photo credits & licenses
```

## Game balance

Tune everything in `src/config.js` (prices, rewards, crit chance) and
`src/fruits.js` (card stats). Pull rates per card: Common 59.9%, Uncommon 25%,
Rare 10%, Epic 4%, Legendary 1%, Mythic 0.1% — and only the Apple is Mythic.
