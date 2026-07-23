const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { RARITIES } = require('../fruits');
const { rollPack, coins, findPack, remoji, variantLabel } = require('../util');
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

    const result = await ctx.db.withPlayerLock(message.author.id, async (client, player) => {
      const { rows: owned } = await client.query(
        `SELECT pack_id, quantity FROM packs WHERE user_id = $1 AND quantity > 0 FOR UPDATE`,
        [message.author.id]
      );
      if (owned.length === 0) return { ok: false, reason: 'none' };

      let packRow;
      if (requested) {
        packRow = owned.find((r) => r.pack_id === requested.id);
        if (!packRow) return { ok: false, reason: 'notype', pack: requested };
      } else {
        // Default: standard first, then whatever they have.
        packRow = owned.find((r) => r.pack_id === 'standard') || owned[0];
      }
      const pack = config.PACKS[packRow.pack_id] || config.PACKS.standard;

      const cards = rollPack(pack);
      const { rows } = await client.query(
        `SELECT DISTINCT fruit_id FROM collections WHERE user_id = $1 AND quantity > 0 AND fruit_id = ANY($2)`,
        [message.author.id, cards.map((c) => c.fruit.id)]
      );
      const ownedBefore = new Set(rows.map((r) => r.fruit_id));
      await client.query(
        `UPDATE packs SET quantity = quantity - 1 WHERE user_id = $1 AND pack_id = $2`,
        [message.author.id, packRow.pack_id]
      );
      await client.query(
        `UPDATE players SET packs_opened = packs_opened + 1 WHERE user_id = $1`,
        [message.author.id]
      );
      await ctx.db.addCards(client, message.author.id, cards.map((c) => ({ id: c.fruit.id, variant: c.variant })));
      return { ok: true, pack, cards, ownedBefore, packsLeft: packRow.quantity - 1 };
    });

    if (!result.ok) {
      if (result.reason === 'notype') {
        return message.reply(`❌ You don't have any ${result.pack.emoji} **${result.pack.name}**s! Buy one: \`fbuy ${result.pack.id}\``);
      }
      return message.reply(`❌ You have no unopened packs! Grab one with \`fbuy\` (${config.PACKS.standard.price} ${config.CURRENCY_EMOJI}).`);
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
