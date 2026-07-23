const { EmbedBuilder } = require('discord.js');
const economy = require('../economy');
const { coins } = require('../util');

module.exports = {
  name: 'fcode',
  aliases: ['fredeem'],
  description: 'Redeem a code for rewards',
  usage: 'fcode <code>',
  async execute(message, args, ctx) {
    if (args.length === 0) {
      return message.reply('🎁 Got a code? Redeem it with `fcode <code>` — each code works once per player!');
    }
    const result = await economy.redeemCode(ctx.db, message.author.id, args[0]);

    if (!result.ok) {
      const msgs = {
        unknown: "❓ That code doesn't exist. Codes are case-insensitive — double-check the spelling!",
        expired: '⌛ That code has expired!',
        used: '❌ You already redeemed that code!',
      };
      return message.reply(msgs[result.reason] || '❌ That code didn\'t work.');
    }

    const rewards = [];
    if (result.coins > 0) rewards.push(coins(result.coins));
    for (const { pack, count } of result.packs) rewards.push(`${pack.emoji} ${count}× ${pack.name}`);

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('🎁 Code Redeemed!')
      .setDescription(
        `Code \`${result.code}\` unlocked: ${rewards.join(' + ')}\n` +
          (result.coins > 0 ? `💰 Balance: ${coins(result.balance)}` : '')
      )
      .setFooter({ text: 'Each code can be redeemed once per player' });
    await message.reply({ embeds: [embed] });
  },
};
