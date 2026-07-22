const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { RARITIES } = require('../fruits');

module.exports = {
  name: 'fshop',
  aliases: [],
  description: 'See pack prices, pull rates, and sell values',
  usage: 'fshop',
  async execute(message, args, ctx) {
    const rates = Object.values(RARITIES)
      .map((r) => `${r.emoji} ${r.name} — **${r.pct}** · sells for ${r.sellValue} ${config.CURRENCY_EMOJI}`)
      .join('\n');
    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle('🏪 FruitCards Shop')
      .addFields(
        {
          name: `📦 Fruit Pack — ${config.PACK_PRICE} ${config.CURRENCY_EMOJI}`,
          value: `Contains **${config.PACK_SIZE} cards**. Every pack is guaranteed at least one Uncommon or better!\nBuy: \`fbuy [amount]\` · Open: \`fopen\``,
        },
        { name: 'Pull Rates & Sell Values', value: rates }
      );
    await message.reply({ embeds: [embed] });
  },
};
