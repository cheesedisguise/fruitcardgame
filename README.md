# 🍎 FruitCards

A fruit trading card game Discord bot — like Pokémon TCG, but every card is a fruit.
Collect all 37 fruits, open packs, trade, auction, and battle across servers!

- 🃏 **37 collectible fruit cards** — all real fruits — across 6 rarities (Common → Mythic), each with **ATK**, **HP**, an **ability**, and real fruit photography on a clean white background (openly licensed images, see [ATTRIBUTIONS.md](ATTRIBUTIONS.md)). Card text is a real fact about the fruit.
- 🌟 **Rarer = stronger.** Every rarity tier is a clear power jump — and the **Apple** is the rarest card in the game
- ✨ **Foil variants** — every card can drop as a holographic foil worth 4× on sale
- 📦 **Three pack tiers** — Standard (100🪙), Juicy (250🪙), Exotic (600🪙): pricier packs mean better odds, better pity guarantees, and higher foil chances. 5 cards per pack
- 🪙 **Coin economy** — `fdaily` streaks, `fdrop` chain drops every 2 minutes (50% to keep chaining +10, forever), selling, and a leaderboard
- ⚔️ **Team battles in private threads** — draft a team of 3, gain 1⚡ power per turn, spend it on **Attack / Block / per-fruit Abilities / Switch / Charge**. Challenge friends (`fbattle`) or use **cross-server matchmaking** (`fqueue`); cross-server matches sync one private thread per player, and threads self-delete when the match ends
- 🤝 **Trading** and a 🏛️ **cross-server auction house** with escrowed bids

## The app

Type **`fmenu`** for the full button-driven GUI — a single message that
navigates like an app: 🏪 shop with pack art and one-click buying, 📦 pack
opening with instant reveals, 🃏 collection browser with a card inspector
(normal/foil views), 🏛️ auction house with bid pop-ups, plus daily/drop
claims and matchmaking, all without typing a command.

## Commands

Everything also works as plain text commands:

| Command | What it does |
|---|---|
| `fmenu` | **Open the FruitCards app (GUI for everything)** |
| `fstart` | Create your account & learn the ropes |
| `fdaily` | Claim daily coins (🔥 streak bonus) |
| `fdrop` | Coin drop every 2 min — 50% chance to chain +10 infinitely |
| `fcode <code>` | Redeem a code (try `fcode release` 👀) |
| `fopen [pack]` | Pack opening GUI — rip packs with buttons |
| `fcards [@user] [page]` | Browse a collection (foils marked ✨) |
| `fcard <fruit> [foil]` | View a card up close, its ability & fact |
| `fdex` | FruitDex — track all 37 fruits |
| `fqueue` | Cross-server matchmaking (`fqueue leave` to exit) |
| `fbattle @user` | Challenge someone directly |
| `ftrade @user give <fruit> [foil] [xN] get <fruit> [foil] [xN]` | Trade cards |
| `fauction <fruit> [foil] [minBid]` | Auction a card (10 min, cross-server) |
| `fauctions` | Browse the auction house |
| `fbid <id> <amount>` | Bid (coins escrowed, refunded if outbid) |
| `fsell <fruit> [foil] [n\|all]` | Sell cards for coins |
| `fbalance` | Your profile & stats |
| `fshop` | The pack shop — browse & buy with buttons |
| `ftop` | Leaderboard |
| `fhelp` | All commands |

## Battle system

Draft **3 fruits** from your collection. One fights, two wait on the bench.
You gain **1⚡ each turn** (cap 10) and spend it:

| Action | Cost | Effect |
|---|---|---|
| ⚔️ Attack | 1⚡ | Deal ATK damage (±15%, 10% crit ×1.5) |
| 🛡️ Block | 1⚡ | Gain shield = 75% of ATK (stacks, absorbs damage) |
| ✨ Ability | 3⚡ | Your fruit's signature move (below) |
| 🔄 Switch | 1⚡ | Swap in a bench fruit |
| ⚡ Charge | free | Bank +1⚡ |

Abilities by fruit: 💥 **Smash** (1.8× ATK) · 💚 **Regrow** (heal 45%) · 🗡️ **Pierce**
(1.2×, ignores shield) · 🧛 **Drain** (0.9×, heals half) · 🌪️ **Flurry** (2 hits of
0.75×) · 📈 **Ripen** (+5 ATK permanently). Knock out all three enemy fruits to win.

## Setup

### 1. Create the Discord application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** → name it (e.g. *FruitCards*).
2. **Bot** tab → **Reset Token** → copy the token (you'll need it for Railway).
3. Still on the **Bot** tab, under *Privileged Gateway Intents*, enable **MESSAGE CONTENT INTENT** (required — the bot reads text commands like `fbattle`).
4. Invite the bot with the `bot` scope and these permissions: **View Channels, Send Messages, Send Messages in Threads, Create Public/Private Threads, Manage Threads, Embed Links, Attach Files, Read Message History, Use External Emojis**. Ready-made URL (replace `YOUR_APP_ID` with General Information → Application ID):
   ```
   https://discord.com/oauth2/authorize?client_id=YOUR_APP_ID&scope=bot&permissions=395137371136
   ```
   Invite it to multiple servers to enable cross-server matchmaking and auctions.

### 2. Deploy on Railway

1. Push this repo to GitHub (already done if you're reading this there).
2. On [Railway](https://railway.com): **New Project** → **Deploy from GitHub repo** → pick this repo.
3. In the same project: **Create** → **Database** → **Add PostgreSQL**.
4. Open the bot service → **Variables** → add:
   - `DISCORD_TOKEN` = your bot token from step 1
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (Railway resolves this reference to the Postgres service automatically)
5. Deploy. The bot creates and migrates its own database tables on boot.

When the logs show `🍎 FruitCards is ready!`, type `fstart` in your server.

### 3. Custom rarity emojis (optional but pretty)

Upload the six images in `assets/emoji/` as custom emojis in any server the bot
is in, named exactly:
`:common:` `:uncommon:` `:rare:` `:epic:` `:legendary:` `:mythic:`

The bot detects them by name automatically and uses them everywhere (rarity
lists, pack pulls, battle menus). No emoji? It falls back to colored circles.
Regenerate the images anytime with `node scripts/make-emoji.js`.

## Project layout

```
src/
  index.js       entrypoint — commands, components, auction sweeper
  ui.js          the fmenu app: screens, navigation, bid modals
  economy.js     shared claim/buy/open logic (commands + GUI)
  fruits.js      the card catalog (stats, rarities, abilities, fruit facts)
  config.js      economy, packs & battle tuning knobs
  db.js          Postgres layer (auto-migrating schema, trades, auctions)
  render.js      card compositing: photo + frame + foil + pack art (sharp)
  battle.js      team battle engine (power, abilities, synced thread views)
  matchmaking.js cross-server matchmaking queue
  commands/      one file per command
  art/           37 real fruit photos (512x512 PNG, white background)
assets/fonts/    bundled fonts (SIL OFL): Finger Paint (card text), Nunito
assets/emoji/    rarity emoji images to upload as :common: etc.
ATTRIBUTIONS.md  photo credits & licenses
```

## Redeem codes

Codes live in [`assets/listofcodes.json`](assets/listofcodes.json). Each entry
can grant `coins` and/or `packs`, with an optional `expires` date; every player
can redeem each code once. Add a code to the file, redeploy, and it's live.
The launch code **`release`** grants 5,000 🪙.

## Game balance

Tune everything in `src/config.js` (prices, pack odds, rewards, battle math) and
`src/fruits.js` (card stats & abilities). Standard-pack pull rates: Common 59.9%,
Uncommon 25%, Rare 10%, Epic 4%, Legendary 1%, Mythic 0.1% — and within Mythic,
the Apple is the rarest of all.
