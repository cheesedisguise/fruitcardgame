const ui = require('../ui');

module.exports = {
  name: 'fhelp',
  aliases: ['fcommands'],
  description: 'Show all commands',
  usage: 'fhelp',
  async execute(message, args, ctx) {
    // Brand-new players get pointed at fstart instead of a wall of commands.
    const existing = await ctx.db.pool.query('SELECT 1 FROM players WHERE user_id = $1', [message.author.id]);
    if (existing.rowCount === 0) {
      return message.reply('🍎 Welcome to **FruitCards**! Use `fstart` to start!');
    }
    await message.reply(await ui.helpScreen(ctx, message.author));
  },
};
