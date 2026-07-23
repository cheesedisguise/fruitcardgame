const ui = require('../ui');

module.exports = {
  name: 'fbalance',
  aliases: ['fbal', 'fprofile'],
  description: 'Your profile dashboard (the app home screen)',
  usage: 'fbalance',
  async execute(message, args, ctx) {
    await message.reply(await ui.homeScreen(ctx, message.author));
  },
};
