const ui = require('../ui');

module.exports = {
  name: 'ftutorial',
  aliases: ['fguide', 'fhowto'],
  description: 'Learn the game: basics, packs, battling & types, trading',
  usage: 'ftutorial',
  async execute(message, args, ctx) {
    await message.reply(await ui.tutorialScreen(ctx, message.author, 'basics'));
  },
};
