const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'fhelp',
  aliases: ['fcommands'],
  description: 'Show all commands',
  usage: 'fhelp',
  async execute(message, args, ctx) {
    const lines = [...new Set(ctx.commands.values())]
      .map((c) => `\`${c.usage}\` — ${c.description}`)
      .join('\n');
    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('🍇 FruitCards Commands')
      .setDescription(lines);
    await message.reply({ embeds: [embed] });
  },
};
