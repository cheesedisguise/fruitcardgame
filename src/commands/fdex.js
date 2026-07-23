const ui = require('../ui');

module.exports = {
  name: 'fdex',
  aliases: ['ffruitdex'],
  description: 'The FruitDex — browse every fruit and inspect any card',
  usage: 'fdex',
  async execute(message, args, ctx) {
    await message.reply(await ui.dexScreen(ctx, message.author));
  },
};
