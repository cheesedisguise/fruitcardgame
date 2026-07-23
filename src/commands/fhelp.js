const ui = require('../ui');

module.exports = {
  name: 'fhelp',
  aliases: ['fcommands'],
  description: 'Show all commands',
  usage: 'fhelp',
  async execute(message, args, ctx) {
    await message.reply(await ui.helpScreen(ctx, message.author));
  },
};
