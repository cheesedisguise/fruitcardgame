const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { coins } = require('../util');

module.exports = {
  name: 'fstart',
  aliases: [],
  description: 'Create your account and learn how to play',
  usage: 'fstart',
  async execute(message, args, ctx) {
    const existing = await ctx.db.pool.query('SELECT 1 FROM players WHERE user_id = $1', [message.author.id]);
    const isNew = existing.rowCount === 0;
    await ctx.db.getPlayer(message.author.id);

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(isNew ? '🍎 Welcome to FruitCards!' : '🍎 FruitCards')
      .setDescription(
        (isNew
          ? `Your account is ready — you start with ${coins(config.STARTING_BALANCE)}!\n\n`
          : `You already have an account, ${message.author.displayName}!\n\n`) +
          `**How to play:**\n` +
          `🪙 \`fdaily\` — claim free coins every day\n` +
          `📦 \`fbuy\` then \`fopen\` — buy packs (${config.PACK_PRICE} ${config.CURRENCY_EMOJI}) and open them: **${config.PACK_SIZE} fruit cards** each!\n` +
          `🃏 \`fcards\` — view your collection · \`fcard apple\` — inspect a card\n` +
          `⚔️ \`fbattle @friend\` — duel a friend, or \`fqueue\` — cross-server matchmaking! Battles happen in private threads\n` +
          `💰 \`fsell\` duplicates · \`ftop\` — leaderboard · \`fhelp\` — all commands`
      )
      .setFooter({ text: 'Collect all 30 fruits — the Apple 🌟 is the rarest of them all' });
    await message.reply({ embeds: [embed] });
  },
};
