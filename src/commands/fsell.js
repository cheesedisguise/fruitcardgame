const { findFruit, coins, sellValue, variantLabel, extractVariant } = require('../util');

module.exports = {
  name: 'fsell',
  aliases: [],
  description: 'Sell cards for coins (variants are worth more!)',
  usage: 'fsell <fruit> [foil/gold/prism] [amount|all]',
  async execute(message, args, ctx) {
    if (args.length === 0) return message.reply('Sell what? Try `fsell apple 2`, `fsell apple all`, or `fsell apple foil`');

    const rest = [...args];
    let qtyArg = null;
    // qty may be the last token; a variant token can appear anywhere after the name
    const last = rest[rest.length - 1]?.toLowerCase();
    if (/^\d+$/.test(last) || last === 'all') qtyArg = rest.pop().toLowerCase();
    const variant = extractVariant(rest);

    const fruit = findFruit(rest.join(' '));
    if (!fruit) return message.reply(`❓ No fruit matches "${rest.join(' ')}".`);
    const unitPrice = sellValue(fruit, variant);

    const result = await ctx.db.withPlayerLock(message.author.id, async (client, player) => {
      const { rows } = await client.query(
        `SELECT quantity FROM collections WHERE user_id = $1 AND fruit_id = $2 AND variant = $3 FOR UPDATE`,
        [message.author.id, fruit.id, variant]
      );
      const have = rows[0]?.quantity || 0;
      if (have < 1) return { ok: false };

      const qty = qtyArg === 'all' ? have : Math.min(parseInt(qtyArg || '1', 10) || 1, have);
      const payout = qty * unitPrice;
      await client.query(
        `UPDATE collections SET quantity = quantity - $4 WHERE user_id = $1 AND fruit_id = $2 AND variant = $3`,
        [message.author.id, fruit.id, variant, qty]
      );
      await client.query(`UPDATE players SET balance = balance + $2 WHERE user_id = $1`, [
        message.author.id,
        payout,
      ]);
      return { ok: true, qty, payout, left: have - qty, balance: Number(player.balance) + payout };
    });

    if (!result.ok) {
      return message.reply(`❌ You don't own any **${fruit.name}${variantLabel(variant)}**!`);
    }
    await message.reply(
      `💰 Sold **${result.qty}× ${fruit.name}${variantLabel(variant)}** for ${coins(result.payout)} *(${unitPrice} each)*.\n` +
        `You have **${result.left}** left · Balance: ${coins(result.balance)}`
    );
  },
};
