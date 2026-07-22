const { EmbedBuilder } = require('discord.js');
const { coins } = require('../util');

const MEDALS = ['🥇', '🥈', '🥉'];

module.exports = {
  name: 'ftop',
  aliases: ['fleaderboard', 'flb'],
  description: 'The richest fruit collectors',
  usage: 'ftop',
  async execute(message, args, ctx) {
    const rows = await ctx.db.getLeaderboard(10);
    if (rows.length === 0) return message.reply('Nobody is on the leaderboard yet — be the first with `fstart`!');

    const lines = await Promise.all(
      rows.map(async (row, i) => {
        const user = await message.client.users.fetch(row.user_id).catch(() => null);
        const name = user ? user.displayName : 'Unknown Farmer';
        const medal = MEDALS[i] || `**${i + 1}.**`;
        return `${medal} **${name}** — ${coins(row.balance)} · 🏆 ${row.wins}W`;
      })
    );

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('🏆 FruitCards Leaderboard')
      .setDescription(lines.join('\n'));
    await message.reply({ embeds: [embed] });
  },
};
