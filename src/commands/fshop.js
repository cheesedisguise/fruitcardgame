const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { RARITIES } = require('../fruits');
const { remoji } = require('../util');

module.exports = {
  name: 'fshop',
  aliases: [],
  description: 'The pack lineup, pull rates, and sell values',
  usage: 'fshop',
  async execute(message, args, ctx) {
    const packFields = Object.values(config.PACKS).map((p) => {
      const odds = Object.entries(p.odds)
        .filter(([, w]) => w > 0)
        .map(([rarity, w]) => `${remoji(rarity)} ${(w / 10).toFixed(w % 10 === 0 ? 0 : 1)}%`)
        .join(' · ');
      return {
        name: `${p.emoji} ${p.name} — ${p.price} ${config.CURRENCY_EMOJI}`,
        value:
          `${p.size} cards · guaranteed **${RARITIES[p.pity].name}+** · ✨ foil chance ${Math.round(p.foilChance * 100)}%\n` +
          `${odds}\n\`fbuy ${p.id}\``,
      };
    });
    const sells = Object.entries(RARITIES)
      .map(([key, r]) => `${remoji(key)} ${r.sellValue}`)
      .join(' · ');
    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle('🏪 FruitCards Shop')
      .addFields(...packFields, {
        name: `💰 Sell values (foils ×${config.FOIL_SELL_MULTIPLIER})`,
        value: `${sells} ${config.CURRENCY_EMOJI} · \`fsell <fruit> [foil] [n|all]\``,
      })
      .setFooter({ text: 'Trade with ftrade · auction rare pulls with fauction' });
    await message.reply({ embeds: [embed] });
  },
};
