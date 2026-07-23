const ui = require('../ui');

module.exports = {
  name: 'fshop',
  aliases: [],
  description: 'The pack shop — browse and buy with buttons',
  usage: 'fshop',
  async execute(message, args, ctx) {
    const payload = await ui.shopScreen(ctx, message.author);
    await message.reply(payload);
  },
};
