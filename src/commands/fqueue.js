module.exports = {
  name: 'fqueue',
  aliases: ['fmatch', 'fplay'],
  description: 'Join cross-server matchmaking — battle in a private thread',
  usage: 'fqueue [leave]',
  async execute(message, args, ctx) {
    if ((args[0] || '').toLowerCase() === 'leave') {
      return ctx.matchmaking.leave(message);
    }
    const collection = await ctx.db.getCollection(message.author.id);
    if (collection.length === 0) {
      return message.reply('❌ You need at least one card to battle! `fbuy` then `fopen` first.');
    }
    await ctx.matchmaking.join(message);
  },
};
