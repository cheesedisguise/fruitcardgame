const config = require('../config');
const economy = require('../economy');
const { coins, findPack } = require('../util');

module.exports = {
  name: 'fbuy',
  aliases: [],
  description: 'Buy card packs (see fshop for the lineup)',
  usage: 'fbuy [pack] [amount]',
  async execute(message, args, ctx) {
    let pack = config.PACKS.standard;
    const rest = [...args];
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

    const result = await economy.buyPacks(ctx.db, message.author.id, pack, amount);
    if (!result.ok) {
      return message.reply(
        `❌ Not enough coins! ${amount}× ${pack.emoji} **${pack.name}** costs ${coins(result.cost)} but you only have ${coins(result.balance)}. Try \`fdaily\` or \`fdrop\`!`
      );
    }
    await message.reply(
      `${pack.emoji} Bought **${amount}× ${pack.name}** for ${coins(result.cost)}! You now hold **${result.owned}** — rip one open with \`fopen${pack.id === 'standard' ? '' : ' ' + pack.id}\` or \`fmenu\`!\n💰 Balance: ${coins(result.balance)}`
    );
  },
};
