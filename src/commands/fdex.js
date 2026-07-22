const { EmbedBuilder } = require('discord.js');
const { FRUITS, RARITIES } = require('../fruits');

module.exports = {
  name: 'fdex',
  aliases: ['ffruitdex'],
  description: 'The FruitDex — every fruit and whether you own it',
  usage: 'fdex',
  async execute(message, args, ctx) {
    const rows = await ctx.db.getCollection(message.author.id);
    const owned = new Map(rows.map((r) => [r.fruit_id, r.quantity]));

    const fields = Object.entries(RARITIES).map(([key, rarity]) => {
      const fruits = FRUITS.filter((f) => f.rarity === key);
      const value = fruits
        .map((f) => (owned.has(f.id) ? `✅ ${f.name} ×${owned.get(f.id)}` : `❌ ~~${f.name}~~`))
        .join('\n');
      return { name: `${rarity.emoji} ${rarity.name}`, value, inline: true };
    });

    const count = FRUITS.filter((f) => owned.has(f.id)).length;
    const embed = new EmbedBuilder()
      .setColor(0x1abc9c)
      .setTitle(`📖 ${message.author.displayName}'s FruitDex`)
      .setDescription(`Discovered **${count}/${FRUITS.length}** fruits`)
      .addFields(fields);
    await message.reply({ embeds: [embed] });
  },
};
