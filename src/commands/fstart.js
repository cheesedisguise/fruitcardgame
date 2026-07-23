const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { FRUITS } = require('../fruits');
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
          `**▶️ Type \`fmenu\` to open the FruitCards app** — shop, packs, collection, auctions, all with buttons!\n\n` +
          `Or play by command:\n` +
          `🪙 \`fdaily\` + \`fdrop\` — free coins (daily streaks & 2-min drop chains)\n` +
          `📦 \`fshop\` then \`fopen\` — packs hold **5 cards** each; fancier packs = better odds & ✨ foils\n` +
          `⚔️ \`fbattle @friend\` or \`fqueue\` — draft a team of ${config.TEAM_SIZE}, manage your ⚡ power, use abilities!\n` +
          `🤝 \`ftrade\` · 🏛️ \`fauction\` — trade and auction cards across servers\n` +
          `💰 \`fsell\` duplicates · \`ftop\` — leaderboard · \`fhelp\` — everything else`
      )
      .setFooter({ text: `Collect all ${FRUITS.length} fruits — the Apple 🌟 is the rarest of them all` });
    await message.reply({ embeds: [embed] });
  },
};
