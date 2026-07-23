const { EmbedBuilder } = require('discord.js');
const economy = require('../economy');
const { coins } = require('../util');

module.exports = {
  name: 'fdrop',
  aliases: [],
  description: 'Grab a coin drop every 2 min — 50% chance it chains +10, forever',
  usage: 'fdrop',
  async execute(message, args, ctx) {
    const result = await economy.claimDrop(ctx.db, message.author.id);
    if (!result.claimed) {
      const secs = Math.ceil(result.wait / 1000);
      const wait = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
      return message.reply(`⏰ The next drop lands in **${wait}**!`);
    }
    const chainDisplay = result.chain <= 10 ? '🪙'.repeat(result.chain) : `🪙×${result.chain}`;
    const hype =
      result.chain >= 6 ? '🎰 **JACKPOT CHAIN!**' : result.chain >= 3 ? '🍀 **Lucky chain!**' : '';
    const embed = new EmbedBuilder()
      .setColor(result.chain >= 3 ? 0xf1c40f : 0x2ecc71)
      .setTitle('💧 Coin Drop!')
      .setDescription(
        `${chainDisplay}\n${hype ? hype + '\n' : ''}` +
          `The chain hit **×${result.chain}** — you grabbed ${coins(result.amount)}\n` +
          `💰 Balance: ${coins(result.balance)}`
      )
      .setFooter({ text: 'Every +10 has a 50% chance to keep chaining. Next drop in 2 minutes.' });
    await message.reply({ embeds: [embed] });
  },
};
