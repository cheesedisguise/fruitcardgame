const ui = require('../ui');

module.exports = {
  name: 'ftop',
  aliases: ['fleaderboard', 'flb'],
  description: 'The richest fruit collectors',
  usage: 'ftop',
  async execute(message, args, ctx) {
    await message.reply(await ui.topScreen(ctx, message.author));
  },
};
