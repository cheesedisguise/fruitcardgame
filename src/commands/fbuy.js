const config = require('../config');
const { coins, findPack } = require('../util');

module.exports = {
  name: 'fbuy',
  aliases: [],
  description: 'Buy card packs (see fshop for the lineup)',
  usage: 'fbuy [pack] [amount]',
  async execute(message, args, ctx) {
    let pack = config.PACKS.standard;
    let rest = [...args];
    if (rest[0] && !/^\d+$/.test(rest[0])) {
      const found = findPack(rest[0]);
      if (!found) {
        return message.reply(
          `❓ Unknown pack "${rest[0]}". The shop carries: ${Object.values(config.PACKS)
            .map((p) => `${p.emoji} ${p.name}`)
            .join(' · ')}`
        );
      }
      pack = found;
      rest.shift();
    }
    let amount = parseInt(rest[0], 10);
    if (!Number.isFinite(amount) || amount < 1) amount = 1;
    amount = Math.min(amount, config.MAX_PACKS_PER_BUY);
    const cost = amount * pack.price;

    const result = await ctx.db.withPlayerLock(message.author.id, async (client, player) => {
      if (Number(player.balance) < cost) {
        return { ok: false, balance: Number(player.balance) };
      }
      await client.query(`UPDATE players SET balance = balance - $2 WHERE user_id = $1`, [
        message.author.id,
        cost,
      ]);
      const { rows } = await client.query(
        `INSERT INTO packs (user_id, pack_id, quantity) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, pack_id) DO UPDATE SET quantity = packs.quantity + $3
         RETURNING quantity`,
        [message.author.id, pack.id, amount]
      );
      return { ok: true, balance: Number(player.balance) - cost, owned: rows[0].quantity };
    });

    if (!result.ok) {
      return message.reply(
        `❌ Not enough coins! ${amount}× ${pack.emoji} **${pack.name}** costs ${coins(cost)} but you only have ${coins(result.balance)}. Try \`fdaily\` or \`fdrop\`!`
      );
    }
    await message.reply(
      `${pack.emoji} Bought **${amount}× ${pack.name}** for ${coins(cost)}! You now hold **${result.owned}** — rip one open with \`fopen${pack.id === 'standard' ? '' : ' ' + pack.id}\`!\n💰 Balance: ${coins(result.balance)}`
    );
  },
};
