const { EmbedBuilder } = require('discord.js');
const { FRUITS } = require('../fruits');
const { coins } = require('../util');

module.exports = {
  name: 'fbalance',
  aliases: ['fbal', 'fprofile'],
  description: 'Show your coins, packs, and stats',
  usage: 'fbalance',
  async execute(message, args, ctx) {
    const player = await ctx.db.getPlayer(message.author.id);
    const dexCount = await ctx.db.countDistinctFruits(message.author.id);
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(`${message.author.displayName}'s Profile`)
      .setThumbnail(message.author.displayAvatarURL())
      .addFields(
        { name: 'Balance', value: coins(player.balance), inline: true },
        { name: 'Unopened Packs', value: `📦 **${player.packs}**`, inline: true },
        { name: 'FruitDex', value: `📖 **${dexCount}**/${FRUITS.length}`, inline: true },
        { name: 'Battles', value: `🏆 ${player.wins}W · 💀 ${player.losses}L`, inline: true },
        { name: 'Packs Opened', value: `✨ ${player.packs_opened}`, inline: true },
        { name: 'Daily Streak', value: `🔥 ${player.daily_streak}`, inline: true }
      );
    await message.reply({ embeds: [embed] });
  },
};
