const ui = require('../ui');
const { findFruit, extractVariant } = require('../util');

module.exports = {
  name: 'fcard',
  aliases: ['finfo'],
  description: 'View a card up close (add foil/gold/prism for variants)',
  usage: 'fcard <fruit> [foil/gold/prism]',
  async execute(message, args, ctx) {
    if (args.length === 0) return message.reply('Which card? Try `fcard apple` or `fcard apple foil`');
    const rest = [...args];
    const variant = extractVariant(rest);

    const fruit = findFruit(rest.join(' '));
    if (!fruit) return message.reply(`❓ No fruit matches "${rest.join(' ')}". See them all with \`fdex\`.`);
    await message.reply(await ui.cardScreen(ctx, message.author, fruit.id, variant, 'd'));
  },
};
