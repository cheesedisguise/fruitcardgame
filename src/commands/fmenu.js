const ui = require('../ui');

module.exports = {
  name: 'fmenu',
  aliases: ['fhub', 'fapp'],
  description: 'Open the FruitCards app — shop, packs, collection & more with buttons',
  usage: 'fmenu',
  async execute(message, args, ctx) {
    const payload = await ui.homeScreen(ctx, message.author);
    await message.reply(payload);
  },
};
