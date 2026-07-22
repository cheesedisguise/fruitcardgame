const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getFruit, RARITIES, FRUITS } = require('../fruits');
const { sortByRarity } = require('../util');

const PAGE_SIZE = 10;

async function buildPage(ctx, viewedUser, page, invokerId) {
  const rows = await ctx.db.getCollection(viewedUser.id);
  const owned = rows
    .map((r) => ({ fruit: getFruit(r.fruit_id), qty: r.quantity }))
    .filter((o) => o.fruit)
    .sort((a, b) => sortByRarity(a.fruit, b.fruit));

  const pages = Math.max(1, Math.ceil(owned.length / PAGE_SIZE));
  const p = Math.min(Math.max(1, page), pages);
  const slice = owned.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);

  const lines =
    slice.length > 0
      ? slice.map(
          (o) =>
            `${RARITIES[o.fruit.rarity].emoji} **${o.fruit.name}** ×${o.qty} · ATK ${o.fruit.atk} / HP ${o.fruit.hp}`
        )
      : ['*No cards yet — grab a pack with `fbuy` and `fopen`!*'];

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`🃏 ${viewedUser.displayName}'s Collection`)
    .setDescription(lines.join('\n'))
    .setFooter({
      text: `Page ${p}/${pages} · ${owned.length}/${FRUITS.length} unique fruits · fcard <name> for a closer look`,
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`col:${viewedUser.id}:${p - 1}:${invokerId}`)
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(p <= 1),
    new ButtonBuilder()
      .setCustomId(`col:${viewedUser.id}:${p + 1}:${invokerId}`)
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(p >= pages)
  );
  return { embeds: [embed], components: pages > 1 ? [row] : [] };
}

module.exports = {
  name: 'fcollection',
  aliases: ['fcards', 'fcol'],
  description: 'Browse your (or a friend’s) card collection',
  usage: 'fcards [@user] [page]',
  buildPage,
  async execute(message, args, ctx) {
    const viewedUser = message.mentions.users.first() || message.author;
    const pageArg = parseInt(args.find((a) => /^\d+$/.test(a)), 10) || 1;
    const payload = await buildPage(ctx, viewedUser, pageArg, message.author.id);
    await message.reply(payload);
  },
  async handleComponent(interaction, ctx) {
    const [, viewedId, pageStr, invokerId] = interaction.customId.split(':');
    if (interaction.user.id !== invokerId) {
      return interaction.reply({ content: 'Use `fcards` to browse a collection yourself!', ephemeral: true });
    }
    const viewedUser = await interaction.client.users.fetch(viewedId);
    const payload = await buildPage(ctx, viewedUser, parseInt(pageStr, 10) || 1, invokerId);
    await interaction.update(payload);
  },
};
