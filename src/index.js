require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');

const config = require('./config');
const db = require('./db');
const render = require('./render');
const ui = require('./ui');
const { BattleManager } = require('./battle');
const { Matchmaking } = require('./matchmaking');
const { setEmojiClient, remoji, variantLabel, coins } = require('./util');
const { getFruit } = require('./fruits');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// Load every command in src/commands, keyed by name and each alias.
const commands = new Map();
for (const file of fs.readdirSync(path.join(__dirname, 'commands'))) {
  if (!file.endsWith('.js')) continue;
  const command = require(path.join(__dirname, 'commands', file));
  commands.set(command.name, command);
  for (const alias of command.aliases || []) commands.set(alias, command);
}

const battles = new BattleManager(db, render);
const matchmaking = new Matchmaking(battles);
const ctx = { client, config, db, render, battles, matchmaking, commands };

// Light anti-spam: one command per user per 1.2s.
const cooldowns = new Map();
function onCooldown(userId) {
  const now = Date.now();
  const until = cooldowns.get(userId) || 0;
  if (now < until) return true;
  cooldowns.set(userId, now + 1200);
  return false;
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  const content = message.content.trim();
  if (!/^f[a-z]/i.test(content)) return;

  const [word, ...args] = content.split(/\s+/);
  const command = commands.get(word.toLowerCase());
  if (!command) return;
  if (onCooldown(message.author.id)) return;

  try {
    // Every command implies an account — make sure the row exists.
    await db.getPlayer(message.author.id);
    await command.execute(message, args, ctx);
  } catch (err) {
    console.error(`Error in ${command.name}:`, err);
    await message.reply('🍌 Something slipped! Try again in a moment.').catch(() => {});
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('ui:')) await ui.handleModal(interaction, ctx);
      return;
    }
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
    if (interaction.customId.startsWith('battle:')) {
      await battles.handleComponent(interaction);
    } else if (interaction.customId.startsWith('ui:')) {
      await ui.handleComponent(interaction, ctx);
    } else if (interaction.customId.startsWith('col:')) {
      await commands.get('fcollection').handleComponent(interaction, ctx);
    } else if (interaction.customId.startsWith('trade:')) {
      await commands.get('ftrade').handleComponent(interaction, ctx);
    }
  } catch (err) {
    console.error('Interaction error:', err);
  }
});

// Settle finished auctions and announce results where they were listed.
async function sweepAuctions() {
  let settled;
  try {
    settled = await db.settleDueAuctions();
  } catch (err) {
    console.error('auction sweep error:', err);
    return;
  }
  for (const auction of settled) {
    if (!auction.channel_id) continue;
    const channel = await client.channels.fetch(auction.channel_id).catch(() => null);
    if (!channel) continue;
    const fruit = getFruit(auction.fruit_id);
    const cardName = `${remoji(fruit.rarity)} **${fruit.name}${variantLabel(auction.variant)}**`;
    const embed = new EmbedBuilder()
      .setColor(auction.bidder_id ? 0x2ecc71 : 0x95a5a6)
      .setTitle('🔨 Auction Ended')
      .setDescription(
        auction.bidder_id
          ? `${cardName} sold to <@${auction.bidder_id}> for ${coins(auction.current_bid)}! <@${auction.seller_id}> has been paid.`
          : `${cardName} received no bids — returned to <@${auction.seller_id}>.`
      )
      .setFooter({ text: `Auction #${auction.id}` });
    await channel.send({ embeds: [embed] }).catch(() => {});
  }
}

client.once(Events.ClientReady, (c) => {
  console.log(`🍎 FruitCards is ready! Logged in as ${c.user.tag} in ${c.guilds.cache.size} server(s).`);
  c.user.setActivity('fhelp · collecting fruit');
  setEmojiClient(c); // use custom :common:/:rare:/... emojis when available
  setInterval(() => sweepAuctions().catch(() => {}), config.AUCTION_SWEEP_INTERVAL_MS);
});

async function main() {
  if (!process.env.DISCORD_TOKEN) {
    throw new Error('DISCORD_TOKEN is not set. Add it in your Railway service variables.');
  }
  await db.init();
  console.log('✅ Database ready');
  await client.login(process.env.DISCORD_TOKEN);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
