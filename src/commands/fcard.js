const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { RARITIES } = require('../fruits');
const { findFruit } = require('../util');

module.exports = {
  name: 'fcard',
  aliases: ['finfo'],
  description: 'View a card up close',
  usage: 'fcard <fruit>',
  async execute(message, args, ctx) {
    if (args.length === 0) return message.reply('Which card? Try `fcard apple`');
    const fruit = findFruit(args.join(' '));
    if (!fruit) return message.reply(`❓ No fruit matches "${args.join(' ')}". See them all with \`fdex\`.`);

    const { rows } = await ctx.db.pool.query(
      `SELECT quantity FROM collections WHERE user_id = $1 AND fruit_id = $2`,
      [message.author.id, fruit.id]
    );
    const owned = rows[0]?.quantity || 0;
    const rarity = RARITIES[fruit.rarity];

    const image = await ctx.render.renderCard(fruit.id);
    const embed = new EmbedBuilder()
      .setColor(rarity.color)
      .setTitle(`${rarity.emoji} ${fruit.name}`)
      .setDescription(`*${fruit.flavor}*`)
      .addFields(
        { name: 'Rarity', value: rarity.name, inline: true },
        { name: 'ATK', value: `⚔️ ${fruit.atk}`, inline: true },
        { name: 'HP', value: `❤️ ${fruit.hp}`, inline: true },
        { name: 'You own', value: owned > 0 ? `🃏 ${owned}` : '❌ Not yet!', inline: true },
        { name: 'Sell value', value: `${rarity.sellValue} 🪙`, inline: true }
      )
      .setImage('attachment://card.png');
    await message.reply({ embeds: [embed], files: [new AttachmentBuilder(image, { name: 'card.png' })] });
  },
};
