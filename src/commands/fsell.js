const { RARITIES } = require('../fruits');
const economy = require('../economy');
const { findFruit, coins, sellValue, variantLabel, extractVariant, normalize } = require('../util');

module.exports = {
  name: 'fsell',
  aliases: [],
  description: 'Sell cards — one, several, all dupes, or a whole rarity',
  usage: 'fsell <fruit> [variant] [n|all] · fsell dupes [rarity] · fsell all <rarity>',
  async execute(message, args, ctx) {
    if (args.length === 0) {
      return message.reply(
        '💰 Selling made easy:\n' +
          '• `fsell apple 2` / `fsell apple all` / `fsell apple foil`\n' +
          '• `fsell dupes` — sell every duplicate, keeping one of each (variants kept separately)\n' +
          '• `fsell dupes common` — only common duplicates\n' +
          '• `fsell all common` — sell ALL commons (keeps shiny variants safe)\n' +
          '*Tip: the Collection screen in `fmenu` has a one-click Sell dupes button!*'
      );
    }

    const first = args[0].toLowerCase();
    const findRarity = (token) =>
      Object.keys(RARITIES).find((r) => token && normalize(r) === normalize(token)) || null;

    // fsell dupes [rarity] — keep one of each, sell the rest
    if (first === 'dupes' || first === 'dupe' || first === 'duplicates') {
      const rarity = findRarity(args[1]);
      const result = await economy.sellDuplicates(ctx.db, message.author.id, rarity);
      if (result.cards === 0) {
        return message.reply(`No ${rarity ? RARITIES[rarity].name.toLowerCase() + ' ' : ''}duplicates to sell!`);
      }
      return message.reply(
        `💰 Sold **${result.cards}** duplicate${result.cards === 1 ? '' : 's'}${rarity ? ` (${RARITIES[rarity].name})` : ''} for ${coins(result.payout)} — one of each kept!\n💰 Balance: ${coins(result.balance)}`
      );
    }

    // fsell all <rarity> — clear out a whole rarity (normal variants only)
    if (first === 'all' && findRarity(args[1])) {
      const rarity = findRarity(args[1]);
      const result = await economy.sellRarity(ctx.db, message.author.id, rarity);
      if (result.cards === 0) {
        return message.reply(`You don't own any ${RARITIES[rarity].name.toLowerCase()} cards to sell!`);
      }
      return message.reply(
        `💰 Sold **${result.cards}** ${RARITIES[rarity].name.toLowerCase()} card${result.cards === 1 ? '' : 's'} for ${coins(result.payout)} *(shiny variants kept safe)*.\n💰 Balance: ${coins(result.balance)}`
      );
    }

    // Classic: fsell <fruit> [variant] [n|all]
    const rest = [...args];
    let qtyArg = null;
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
