const ui = require('../ui');

module.exports = {
  name: 'fdaily',
  aliases: [],
  description: 'Claim your daily coins (streak bonus!)',
  usage: 'fdaily',
  async execute(message, args, ctx) {
    await message.reply(await ui.dailyScreen(ctx, message.author));
  },
};
