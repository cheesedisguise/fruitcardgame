// fopen opens the pack GUI. With a pack name it rips one open immediately;
// both paths reply with the interactive screens from src/ui.js.
const ui = require('../ui');
const { findPack } = require('../util');

module.exports = {
  name: 'fopen',
  aliases: ['fpack', 'fpacks'],
  description: 'Open your packs (GUI with buttons)',
  usage: 'fopen [pack]',
  async execute(message, args, ctx) {
    if (args[0]) {
      const pack = findPack(args[0]);
      if (!pack) return message.reply(`❓ Unknown pack "${args[0]}". Check \`fshop\`.`);
      const payload = await ui.openScreen(ctx, message.author, pack.id);
      return message.reply(payload);
    }
    const payload = await ui.packsScreen(ctx, message.author);
    await message.reply(payload);
  },
};
