const ui = require('../ui');
const { findFruit } = require('../util');

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
    await message.reply(await ui.cardScreen(ctx, message.author, fruit.id, variant, 'd'));
  },
};
