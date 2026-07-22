const config = require('../config');
const { coins } = require('../util');

module.exports = {
  name: 'fbuy',
  aliases: [],
  description: `Buy card packs (${config.PACK_PRICE} coins each)`,
  usage: 'fbuy [amount]',
  async execute(message, args, ctx) {
    let amount = parseInt(args[0], 10);
    if (!Number.isFinite(amount) || amount < 1) amount = 1;
    amount = Math.min(amount, config.MAX_PACKS_PER_BUY);
    const cost = amount * config.PACK_PRICE;

    const result = await ctx.db.withPlayerLock(message.author.id, async (client, player) => {
      if (Number(player.balance) < cost) {
        return { ok: false, balance: Number(player.balance) };
      }
      await client.query(
        `UPDATE players SET balance = balance - $2, packs = packs + $3 WHERE user_id = $1`,
        [message.author.id, cost, amount]
      );
      return { ok: true, balance: Number(player.balance) - cost, packs: player.packs + amount };
    });

    if (!result.ok) {
      return message.reply(
        `❌ Not enough coins! ${amount} pack${amount === 1 ? '' : 's'} costs ${coins(cost)} but you only have ${coins(result.balance)}. Try \`fdaily\`!`
      );
    }
    await message.reply(
      `📦 Bought **${amount}** pack${amount === 1 ? '' : 's'} for ${coins(cost)}! You now have **${result.packs}** unopened pack${result.packs === 1 ? '' : 's'} — type \`fopen\` to rip one open!\n💰 Balance: ${coins(result.balance)}`
    );
  },
};
