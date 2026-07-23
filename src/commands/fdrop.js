const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { coins } = require('../util');

module.exports = {
  name: 'fdrop',
  aliases: [],
  description: 'Grab a coin drop every 2 min — 50% chance it chains +10, forever',
  usage: 'fdrop',
  async execute(message, args, ctx) {
    const result = await ctx.db.withPlayerLock(message.author.id, async (client, player) => {
      const now = Date.now();
      const last = player.last_drop ? new Date(player.last_drop).getTime() : 0;
      const remaining = config.DROP_COOLDOWN_MS - (now - last);
      if (remaining > 0) return { claimed: false, wait: remaining };

      let chain = 1;
      while (crypto.randomInt(2) === 0) chain++; // 50% to keep going, uncapped
      const amount = chain * config.DROP_AMOUNT;
      await client.query(
        `UPDATE players SET balance = balance + $2, last_drop = now() WHERE user_id = $1`,
        [message.author.id, amount]
      );
      return { claimed: true, chain, amount, balance: Number(player.balance) + amount };
    });

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
