const ui = require('../ui');

module.exports = {
  name: 'fdrop',
  aliases: [],
  description: 'Grab a coin drop every 2 min — 50% chance it chains +10, forever',
  usage: 'fdrop',
  async execute(message, args, ctx) {
    await message.reply(await ui.dropScreen(ctx, message.author));
  },
};
