const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { RARITIES } = require('../fruits');
const { findPack, remoji, variantLabel } = require('../util');
const economy = require('../economy');
const config = require('../config');

module.exports = {
  name: 'fopen',
  aliases: ['fpack'],
  description: 'Open one of your card packs',
  usage: 'fopen [pack]',
  async execute(message, args, ctx) {
    const requested = args[0] ? findPack(args[0]) : null;
    if (args[0] && !requested) {
      return message.reply(`❓ Unknown pack "${args[0]}". Check \`fshop\`.`);
    }

    const result = await economy.openPack(ctx.db, message.author.id, requested);
    if (!result.ok) {
      if (result.reason === 'notype') {
        return message.reply(`❌ You don't have any ${result.pack.emoji} **${result.pack.name}**s! Buy one: \`fbuy ${result.pack.id}\``);
      }
      return message.reply(`❌ You have no unopened packs! Grab one with \`fbuy\` (${config.PACKS.standard.price} ${config.CURRENCY_EMOJI}) or \`fmenu\`.`);
    }

    const opening = await message.reply(`${result.pack.emoji} *Ripping open the ${result.pack.name}...*`);
    const image = await ctx.render.renderPackSpread(
      result.cards.map((c) => ({ id: c.fruit.id, variant: c.variant }))
    );

    const seen = new Set();
    const lines = result.cards.map((c) => {
      const isNew = !result.ownedBefore.has(c.fruit.id) && !seen.has(c.fruit.id);
      seen.add(c.fruit.id);
      return `${remoji(c.fruit.rarity)} **${c.fruit.name}**${variantLabel(c.variant)} · ATK ${c.fruit.atk} / HP ${c.fruit.hp}${isNew ? ' 🆕' : ''}`;
    });

    const rarityKeys = Object.keys(RARITIES);
    const best = result.cards.reduce((a, b) =>
      rarityKeys.indexOf(b.fruit.rarity) > rarityKeys.indexOf(a.fruit.rarity) ? b : a
    );
    const embed = new EmbedBuilder()
      .setColor(RARITIES[best.fruit.rarity].color)
      .setTitle(`✨ ${result.pack.name} Opened!`)
      .setDescription(lines.join('\n'))
      .setImage('attachment://pack.png')
      .setFooter({ text: `${result.packsLeft} ${result.pack.name}(s) left · fopen to open another` });
    await opening.edit({
      content: '',
      embeds: [embed],
      files: [new AttachmentBuilder(image, { name: 'pack.png' })],
    });
  },
};
