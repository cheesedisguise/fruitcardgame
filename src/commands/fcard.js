const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { RARITIES } = require('../fruits');
const { findFruit, remoji, sellValue } = require('../util');
const { ABILITIES } = require('../battle');
const config = require('../config');

module.exports = {
  name: 'fcard',
  aliases: ['finfo'],
  description: 'View a card up close (add "foil" for the foil version)',
  usage: 'fcard <fruit> [foil]',
  async execute(message, args, ctx) {
    if (args.length === 0) return message.reply('Which card? Try `fcard apple` or `fcard apple foil`');
    const rest = [...args];
    const foilIdx = rest.findIndex((t) => t.toLowerCase() === 'foil');
    const variant = foilIdx !== -1 ? 'foil' : 'normal';
    if (foilIdx !== -1) rest.splice(foilIdx, 1);

    const fruit = findFruit(rest.join(' '));
    if (!fruit) return message.reply(`❓ No fruit matches "${rest.join(' ')}". See them all with \`fdex\`.`);

    const { rows } = await ctx.db.pool.query(
      `SELECT variant, quantity FROM collections WHERE user_id = $1 AND fruit_id = $2 AND quantity > 0`,
      [message.author.id, fruit.id]
    );
    const normalOwned = rows.find((r) => r.variant === 'normal')?.quantity || 0;
    const foilOwned = rows.find((r) => r.variant === 'foil')?.quantity || 0;
    const rarity = RARITIES[fruit.rarity];
    const ability = ABILITIES[fruit.ability];

    const image = await ctx.render.renderCard(fruit.id, variant);
    const embed = new EmbedBuilder()
      .setColor(rarity.color)
      .setTitle(`${remoji(fruit.rarity)} ${fruit.name}${variant === 'foil' ? ' ✨FOIL' : ''}`)
      .setDescription(`*${fruit.flavor}*`)
      .addFields(
        { name: 'Rarity', value: rarity.name, inline: true },
        { name: 'ATK', value: `⚔️ ${fruit.atk}`, inline: true },
        { name: 'HP', value: `❤️ ${fruit.hp}`, inline: true },
        {
          name: `Ability — ${ability.emoji} ${ability.name} (${config.ABILITY_COST}⚡)`,
          value: ability.desc,
          inline: false,
        },
        {
          name: 'You own',
          value: `🃏 ${normalOwned} normal · ✨ ${foilOwned} foil`,
          inline: true,
        },
        { name: 'Sell value', value: `${sellValue(fruit, variant)} 🪙`, inline: true }
      )
      .setImage('attachment://card.png');
    await message.reply({ embeds: [embed], files: [new AttachmentBuilder(image, { name: 'card.png' })] });
  },
};
