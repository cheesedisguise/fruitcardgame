module.exports = {
  name: 'fbattle',
  aliases: ['fduel', 'ffight'],
  description: 'Challenge someone to a battle in a private thread',
  usage: 'fbattle @user',
  async execute(message, args, ctx) {
    const opponent = message.mentions.users.first();
    if (!opponent) return message.reply('Challenge who? Try `fbattle @friend` — or `fqueue` for cross-server matchmaking!');
    if (opponent.bot) return message.reply("🤖 Bots don't fight fair. Pick a human!");
    if (opponent.id === message.author.id) return message.reply("You can't battle yourself!");
    if (ctx.battles.inBattle(message.author.id)) return message.reply("⚔️ You're already in a battle!");
    if (ctx.battles.inBattle(opponent.id)) return message.reply(`⚔️ ${opponent.displayName} is already in a battle!`);

    const [mine, theirs] = await Promise.all([
      ctx.db.getCollection(message.author.id),
      ctx.db.getCollection(opponent.id),
    ]);
    if (mine.length === 0) return message.reply('❌ You need at least one card to battle! `fbuy` then `fopen` first.');
    if (theirs.length === 0) return message.reply(`❌ ${opponent.displayName} has no cards yet!`);

    await ctx.battles.startChallenge(message, message.author, opponent);
  },
};
