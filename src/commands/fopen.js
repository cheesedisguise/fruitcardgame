const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { RARITIES } = require('../fruits');
const { rollPack, coins } = require('../util');
const config = require('../config');

module.exports = {
  name: 'fopen',
  aliases: ['fpack'],
  description: 'Open one of your card packs',
  usage: 'fopen',
  async execute(message, args, ctx) {
    const result = await ctx.db.withPlayerLock(message.author.id, async (client, player) => {
      if (player.packs < 1) return { ok: false };
      const cards = rollPack();
      // Which of these are new to the collector? Check before inserting.
      const { rows } = await client.query(
        `SELECT fruit_id FROM collections WHERE user_id = $1 AND quantity > 0 AND fruit_id = ANY($2)`,
        [message.author.id, cards.map((c) => c.id)]
      );
      const ownedBefore = new Set(rows.map((r) => r.fruit_id));
      await client.query(
        `UPDATE players SET packs = packs - 1, packs_opened = packs_opened + 1 WHERE user_id = $1`,
        [message.author.id]
      );
      await ctx.db.addCards(client, message.author.id, cards.map((c) => c.id));
      return { ok: true, cards, ownedBefore, packsLeft: player.packs - 1 };
    });

    if (!result.ok) {
      return message.reply(`❌ You have no unopened packs! Buy one with \`fbuy\` (${config.PACK_PRICE} ${config.CURRENCY_EMOJI}).`);
    }

    const opening = await message.reply('📦 *Ripping open the pack...*');
    const image = await ctx.render.renderPackSpread(result.cards.map((c) => c.id));

    const seen = new Set();
    const lines = result.cards.map((c) => {
      const isNew = !result.ownedBefore.has(c.id) && !seen.has(c.id);
      seen.add(c.id);
      return `${RARITIES[c.rarity].emoji} **${c.name}** · ATK ${c.atk} / HP ${c.hp}${isNew ? ' 🆕' : ''}`;
    });

    const best = result.cards.reduce((a, b) =>
      Object.keys(RARITIES).indexOf(b.rarity) > Object.keys(RARITIES).indexOf(a.rarity) ? b : a
    );
    const embed = new EmbedBuilder()
      .setColor(RARITIES[best.rarity].color)
      .setTitle('✨ Pack Opened!')
      .setDescription(lines.join('\n'))
      .setImage('attachment://pack.png')
      .setFooter({ text: `${result.packsLeft} pack(s) left · fopen to open another` });
    await opening.edit({
      content: '',
      embeds: [embed],
      files: [new AttachmentBuilder(image, { name: 'pack.png' })],
    });
  },
};
