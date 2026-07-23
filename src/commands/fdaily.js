const { EmbedBuilder } = require('discord.js');
const economy = require('../economy');
const { coins, timeUntil } = require('../util');

module.exports = {
  name: 'fdaily',
  aliases: [],
  description: 'Claim your daily coins (streak bonus!)',
  usage: 'fdaily',
  async execute(message, args, ctx) {
    const result = await economy.claimDaily(ctx.db, message.author.id);
    if (!result.claimed) {
      return message.reply(`⏰ You already claimed today! Come back in **${timeUntil(result.wait)}**.`);
    }
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🪙 Daily Claimed!')
      .setDescription(
        `You received ${coins(result.amount)}${result.bonus > 0 ? ` *(includes 🔥 streak bonus +${result.bonus})*` : ''}\n` +
          `🔥 Streak: **${result.streak}** day${result.streak === 1 ? '' : 's'}\n` +
          `💰 New balance: ${coins(result.balance)}`
      );
    await message.reply({ embeds: [embed] });
  },
};
