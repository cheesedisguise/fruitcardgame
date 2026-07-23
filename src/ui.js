// The FruitCards app GUI. One message navigates between screens
// (home / shop / packs / collection / card / auctions / daily / drop / dex)
// via buttons, select menus, and modals. Opened with fmenu; every control is
// locked to the user who opened it.
//
// customId layout: ui:<action>:<a>:<b>:<ownerId>
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const config = require('./config');
const economy = require('./economy');
const { FRUITS, RARITIES, TYPES, getFruit, movesFor } = require('./fruits');
const { coins, remoji, temoji, sortByRarity, sellValue, variantLabel, timeUntil } = require('./util');

const BRAND_COLOR = 0x66bb6a;
const PAGE_SIZE = 10;

function cid(action, a = '', b = '', owner = '') {
  return `ui:${action}:${a}:${b}:${owner}`;
}

function btn(action, a, b, owner, label, style = ButtonStyle.Secondary, emoji = null, disabled = false) {
  const builder = new ButtonBuilder().setCustomId(cid(action, a, b, owner)).setLabel(label).setStyle(style).setDisabled(disabled);
  if (emoji) builder.setEmoji(emoji);
  return builder;
}

function backRow(owner, extra = []) {
  return new ActionRowBuilder().addComponents(...extra, btn('home', '', '', owner, 'Home', ButtonStyle.Secondary, '🏠'));
}

// ── Screens ────────────────────────────────────────────────────────

async function homeScreen(ctx, user) {
  const player = await ctx.db.getPlayer(user.id);
  const dexCount = await ctx.db.countDistinctFruits(user.id);
  const packs = await ctx.db.getPacks(user.id);
  const packText =
    packs.length > 0
      ? packs.map((p) => `${config.PACKS[p.pack_id]?.emoji || '📦'} ${p.quantity}`).join(' · ')
      : 'none — visit the shop!';
  const inQueue = ctx.matchmaking.queue.has(user.id);

  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle('🍎 FruitCards')
    .setThumbnail(user.displayAvatarURL())
    .setDescription(
      `Welcome back, **${user.displayName}**!` + (inQueue ? '\n🔎 *Matchmaking: searching for an opponent...*' : '')
    )
    .addFields(
      { name: 'Balance', value: coins(player.balance), inline: true },
      { name: 'Packs', value: packText, inline: true },
      { name: 'FruitDex', value: `📖 ${dexCount}/${FRUITS.length}`, inline: true },
      { name: 'Record', value: `🏆 ${player.wins}W · 💀 ${player.losses}L`, inline: true },
      { name: 'Streak', value: `🔥 ${player.daily_streak} days`, inline: true },
      { name: 'Opened', value: `✨ ${player.packs_opened} packs`, inline: true }
    )
    .setFooter({ text: 'Battles: fbattle @friend · trades: ftrade · this menu: fmenu' });

  return {
    embeds: [embed],
    files: [],
    components: [
      new ActionRowBuilder().addComponents(
        btn('shop', '', '', user.id, 'Shop', ButtonStyle.Success, '🏪'),
        btn('packs', '', '', user.id, 'Open Packs', ButtonStyle.Primary, '📦'),
        btn('col', '1', '', user.id, 'Collection', ButtonStyle.Primary, '🃏'),
        btn('auc', '', '', user.id, 'Auctions', ButtonStyle.Secondary, '🏛️'),
        btn('tut', 'basics', '', user.id, 'Tutorial', ButtonStyle.Secondary, '🎓')
      ),
      new ActionRowBuilder().addComponents(
        btn('daily', '', '', user.id, 'Daily', ButtonStyle.Secondary, '🪙'),
        btn('drop', '', '', user.id, 'Drop', ButtonStyle.Secondary, '💧'),
        btn('queue', '', '', user.id, inQueue ? 'Leave Queue' : 'Find Battle', inQueue ? ButtonStyle.Danger : ButtonStyle.Success, '⚔️'),
        btn('dex', '', '', user.id, 'FruitDex', ButtonStyle.Secondary, '📖'),
        btn('top', '', '', user.id, 'Top', ButtonStyle.Secondary, '🏆')
      ),
    ],
  };
}

async function shopScreen(ctx, user, note = null) {
  const player = await ctx.db.getPlayer(user.id);
  const packs = await ctx.db.getPacks(user.id);
  const ownedOf = (id) => packs.find((p) => p.pack_id === id)?.quantity || 0;

  const banner = await ctx.render.renderShopBanner();
  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('🏪 The Fruit Stand')
    .setDescription((note ? `${note}\n\n` : '') + `Your balance: ${coins(player.balance)}`)
    .setImage('attachment://shop.png');
  for (const pack of Object.values(config.PACKS)) {
    const odds = Object.entries(pack.odds)
      .filter(([, w]) => w > 0)
      .map(([rarity, w]) => `${remoji(rarity)} ${(w / 10).toFixed(w % 10 === 0 ? 0 : 1)}%`)
      .join(' ');
    embed.addFields({
      name: `${pack.emoji} ${pack.name} — ${pack.price} ${config.CURRENCY_EMOJI} (you own ${ownedOf(pack.id)})`,
      value: `${odds}\nGuaranteed **${RARITIES[pack.pity].name}+** · ✨ foil ${Math.round(pack.foilChance * 100)}%`,
    });
  }

  return {
    embeds: [embed],
    files: [new AttachmentBuilder(banner, { name: 'shop.png' })],
    components: [
      new ActionRowBuilder().addComponents(
        ...Object.values(config.PACKS).map((pack) =>
          btn('buy', pack.id, '', user.id, `Buy ${pack.name}`, ButtonStyle.Success, pack.emoji, Number(player.balance) < pack.price)
        )
      ),
      backRow(user.id),
    ],
  };
}

async function packsScreen(ctx, user, note = null) {
  const packs = await ctx.db.getPacks(user.id);
  const lines = Object.values(config.PACKS).map((pack) => {
    const owned = packs.find((p) => p.pack_id === pack.id)?.quantity || 0;
    return `${pack.emoji} **${pack.name}** — you own **${owned}**`;
  });
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('📦 Your Packs')
    .setDescription((note ? `${note}\n\n` : '') + lines.join('\n') + '\n\nPick one to rip open!');

  const buttons = Object.values(config.PACKS).map((pack) => {
    const owned = packs.find((p) => p.pack_id === pack.id)?.quantity || 0;
    return btn('open', pack.id, '', user.id, `Open ${pack.name}`, ButtonStyle.Primary, pack.emoji, owned === 0);
  });
  return {
    embeds: [embed],
    files: [],
    components: [new ActionRowBuilder().addComponents(...buttons), backRow(user.id, [btn('shop', '', '', user.id, 'Shop', ButtonStyle.Success, '🏪')])],
  };
}

async function openScreen(ctx, user, packId) {
  const pack = config.PACKS[packId];
  const result = await economy.openPack(ctx.db, user.id, pack || null);
  if (!result.ok) {
    const note = result.reason === 'notype' ? `❌ You don't have any ${result.pack.name}s!` : '❌ No packs to open — grab one in the shop!';
    return packsScreen(ctx, user, note);
  }

  const image = await ctx.render.renderPackSpread(result.cards.map((c) => ({ id: c.fruit.id, variant: c.variant })));
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
    .setFooter({ text: `${result.packsLeft} ${result.pack.name}(s) left` });

  return {
    embeds: [embed],
    files: [new AttachmentBuilder(image, { name: 'pack.png' })],
    components: [
      new ActionRowBuilder().addComponents(
        btn('open', result.pack.id, '', user.id, `Open another (${result.packsLeft} left)`, ButtonStyle.Primary, result.pack.emoji, result.packsLeft === 0),
        btn('shop', '', '', user.id, 'Shop', ButtonStyle.Success, '🏪')
      ),
      backRow(user.id, [btn('col', '1', '', user.id, 'Collection', ButtonStyle.Secondary, '🃏')]),
    ],
  };
}

async function collectionScreen(ctx, user, page) {
  const rows = await ctx.db.getCollectionDetailed(user.id);
  const owned = rows
    .map((r) => ({ fruit: getFruit(r.fruit_id), variant: r.variant, qty: r.quantity }))
    .filter((o) => o.fruit)
    .sort((a, b) => {
      const r = sortByRarity(a.fruit, b.fruit);
      if (r !== 0) return r;
      return a.variant === b.variant ? 0 : a.variant === 'foil' ? -1 : 1;
    });
  const distinct = new Set(owned.map((o) => o.fruit.id)).size;
  const pages = Math.max(1, Math.ceil(owned.length / PAGE_SIZE));
  const p = Math.min(Math.max(1, page), pages);
  const slice = owned.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);

  const lines =
    slice.length > 0
      ? slice.map(
          (o) => `${remoji(o.fruit.rarity)} **${o.fruit.name}**${variantLabel(o.variant)} ×${o.qty} · ATK ${o.fruit.atk} / HP ${o.fruit.hp}`
        )
      : ['*No cards yet — hit the shop and rip some packs!*'];

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`🃏 ${user.displayName}'s Collection`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Page ${p}/${pages} · ${distinct}/${FRUITS.length} unique fruits · pick a card below to inspect it` });

  const components = [];
  if (slice.length > 0) {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(cid('colsel', p, '', user.id))
          .setPlaceholder('🔍 Inspect a card...')
          .addOptions(
            slice.map((o) => ({
              label: `${o.fruit.name}${o.variant === 'foil' ? ' (FOIL)' : ''}`,
              description: `${RARITIES[o.fruit.rarity].name} · ×${o.qty}`,
              value: `${o.fruit.id}|${o.variant}|${p}`,
              emoji: remoji(o.fruit.rarity),
            }))
          )
      )
    );
  }
  components.push(
    new ActionRowBuilder().addComponents(
      btn('col', p - 1, '', user.id, '◀', ButtonStyle.Secondary, null, p <= 1),
      btn('col', p + 1, '', user.id, '▶', ButtonStyle.Secondary, null, p >= pages),
      btn('home', '', '', user.id, 'Home', ButtonStyle.Secondary, '🏠')
    )
  );
  return { embeds: [embed], files: [], components };
}

// source: a collection page number, or 'd' when opened from the FruitDex.
async function cardScreen(ctx, user, fruitId, variant, source) {
  const fruit = getFruit(fruitId);
  if (!fruit) return collectionScreen(ctx, user, 1);
  const { rows } = await ctx.db.pool.query(
    `SELECT variant, quantity FROM collections WHERE user_id = $1 AND fruit_id = $2 AND quantity > 0`,
    [user.id, fruit.id]
  );
  const ownedOf = (v) => rows.find((r) => r.variant === v)?.quantity || 0;
  const rarity = RARITIES[fruit.rarity];
  const type = TYPES[fruit.type];
  const moves = movesFor(fruit);
  const sig = moves.signature;
  const image = await ctx.render.renderCard(fruit.id, variant);

  const sigEffect =
    sig.dmg != null
      ? `${sig.dmg} damage${sig.kind === 'flurry' ? ' per heads (flip 2 coins)' : sig.kind === 'pierce' ? ', ignores shields & types' : sig.kind === 'drain' ? ', heals half back' : ''}`
      : sig.heal != null
        ? `heal ${sig.heal} HP`
        : `+${sig.buff} team ATK`;
  const ownedText = ['normal', 'foil', 'gold', 'prism']
    .map((v) => `${v === 'normal' ? '🃏' : config.VARIANTS[v].fallbackEmoji} ${ownedOf(v)}`)
    .join(' · ');

  const embed = new EmbedBuilder()
    .setColor(rarity.color)
    .setTitle(`${remoji(fruit.rarity)} ${fruit.name}${variantLabel(variant)}`)
    .setDescription(`🧠 *Fun fact: ${fruit.flavor}*`)
    .addFields(
      { name: 'Type', value: `${temoji(fruit.type)} ${type.name}`, inline: true },
      { name: 'Rarity', value: rarity.name, inline: true },
      { name: 'HP', value: `❤️ ${fruit.hp}`, inline: true },
      {
        name: 'Matchups',
        value: `Weak to ${temoji(type.weakTo)} ${TYPES[type.weakTo].name} (×1.5) · Resists ${temoji(type.resists)} ${TYPES[type.resists].name} (×0.75)`,
        inline: false,
      },
      { name: `⚔️ ${moves.quick.name} (1⚡)`, value: `${moves.quick.dmg} damage`, inline: true },
      { name: `${sig.emoji} ${sig.name} (${config.ABILITY_COST}⚡)`, value: sigEffect, inline: true },
      { name: 'You own', value: ownedText, inline: false },
      { name: 'Sell value', value: `${sellValue(fruit, variant)} 🪙`, inline: true }
    )
    .setImage('attachment://card.png');

  const variantCycle = ['normal', 'foil', 'gold', 'prism'];
  const other = variantCycle[(variantCycle.indexOf(variant) + 1) % variantCycle.length];
  const src = source || 1;
  const backButton =
    src === 'd'
      ? btn('dex', '', '', user.id, 'FruitDex', ButtonStyle.Secondary, '📖')
      : btn('col', src, '', user.id, 'Collection', ButtonStyle.Secondary, '🃏');
  return {
    embeds: [embed],
    files: [new AttachmentBuilder(image, { name: 'card.png' })],
    components: [
      new ActionRowBuilder().addComponents(
        backButton,
        btn('card', fruitId, `${other}|${src}`, user.id, `View ${config.VARIANTS[other]?.name || 'Normal'}`, ButtonStyle.Primary, '✨'),
        btn('home', '', '', user.id, 'Home', ButtonStyle.Secondary, '🏠')
      ),
    ],
  };
}

async function auctionScreen(ctx, user, note = null) {
  const open = await ctx.db.listOpenAuctions(15);
  const fauction = require('./commands/fauction');
  const embed = new EmbedBuilder()
    .setColor(0xd35400)
    .setTitle('🏛️ Auction House')
    .setDescription(
      (note ? `${note}\n\n` : '') +
        (open.length > 0
          ? open.map(fauction.describeAuction).join('\n')
          : '*No open auctions. List one with* `fauction <fruit> [foil] [minBid]`')
    )
    .setFooter({ text: 'Cross-server · bids are escrowed and refunded if outbid' });

  const components = [];
  if (open.length > 0) {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(cid('aucsel', '', '', user.id))
          .setPlaceholder('🔨 Bid on an auction...')
          .addOptions(
            open.map((a) => {
              const fruit = getFruit(a.fruit_id);
              return {
                label: `#${a.id} ${fruit.name}${a.variant === 'foil' ? ' (FOIL)' : ''}`,
                description: a.current_bid ? `Current bid ${a.current_bid}` : `Starting at ${a.min_bid}`,
                value: String(a.id),
                emoji: remoji(fruit.rarity),
              };
            })
          )
      )
    );
  }
  components.push(backRow(user.id, [btn('auc', '', '', user.id, 'Refresh', ButtonStyle.Secondary, '🔄')]));
  return { embeds: [embed], files: [], components };
}

async function dailyScreen(ctx, user) {
  const result = await economy.claimDaily(ctx.db, user.id);
  const embed = result.claimed
    ? new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('🪙 Daily Claimed!')
        .setDescription(
          `You received ${coins(result.amount)}${result.bonus > 0 ? ` *(🔥 streak bonus +${result.bonus})*` : ''}\n` +
            `🔥 Streak: **${result.streak}** · 💰 Balance: ${coins(result.balance)}`
        )
    : new EmbedBuilder()
        .setColor(0x95a5a6)
        .setTitle('🪙 Daily')
        .setDescription(`⏰ Already claimed! Come back in **${timeUntil(result.wait)}**.`);
  return { embeds: [embed], files: [], components: [backRow(user.id, [btn('drop', '', '', user.id, 'Try a Drop', ButtonStyle.Secondary, '💧')])] };
}

async function dropScreen(ctx, user) {
  const result = await economy.claimDrop(ctx.db, user.id);
  let embed;
  if (!result.claimed) {
    const secs = Math.ceil(result.wait / 1000);
    const wait = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
    embed = new EmbedBuilder().setColor(0x95a5a6).setTitle('💧 Coin Drop').setDescription(`⏰ Next drop lands in **${wait}**!`);
  } else {
    const chainDisplay = result.chain <= 10 ? '🪙'.repeat(result.chain) : `🪙×${result.chain}`;
    const hype = result.chain >= 6 ? '🎰 **JACKPOT CHAIN!**' : result.chain >= 3 ? '🍀 **Lucky chain!**' : '';
    embed = new EmbedBuilder()
      .setColor(result.chain >= 3 ? 0xf1c40f : 0x2ecc71)
      .setTitle('💧 Coin Drop!')
      .setDescription(
        `${chainDisplay}\n${hype ? hype + '\n' : ''}Chain hit **×${result.chain}** — you grabbed ${coins(result.amount)}\n💰 Balance: ${coins(result.balance)}`
      )
      .setFooter({ text: 'Every +10 has a 50% chance to keep chaining. Next drop in 2 minutes.' });
  }
  return { embeds: [embed], files: [], components: [backRow(user.id, [btn('drop', '', '', user.id, 'Drop again', ButtonStyle.Secondary, '💧')])] };
}

async function dexScreen(ctx, user) {
  const rows = await ctx.db.getCollection(user.id);
  const owned = new Map(rows.map((r) => [r.fruit_id, r.quantity]));
  const embed = new EmbedBuilder()
    .setColor(0x1abc9c)
    .setTitle(`📖 ${user.displayName}'s FruitDex`)
    .setDescription(
      `Discovered **${FRUITS.filter((f) => owned.has(f.id)).length}/${FRUITS.length}** fruits\n` +
        `*Pick any fruit below to study its card — even ones you haven't caught yet!*`
    );
  for (const [key, rarity] of Object.entries(RARITIES)) {
    const fruits = FRUITS.filter((f) => f.rarity === key);
    embed.addFields({
      name: `${remoji(key)} ${rarity.name}`,
      value: fruits.map((f) => (owned.has(f.id) ? `✅ ${f.name} ×${owned.get(f.id)}` : `❌ ~~${f.name}~~`)).join('\n'),
      inline: true,
    });
  }

  // 37 fruits > 25-option limit, so the inspector is split into two menus.
  const dexOption = (f) => ({
    label: f.name,
    description: owned.has(f.id) ? `Owned ×${owned.get(f.id)}` : 'Not discovered yet',
    value: `${f.id}|normal|d`,
    emoji: remoji(f.rarity),
  });
  const groupA = FRUITS.filter((f) => ['common', 'uncommon'].includes(f.rarity));
  const groupB = FRUITS.filter((f) => !['common', 'uncommon'].includes(f.rarity));
  return {
    embeds: [embed],
    files: [],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(cid('dexsel', 'a', '', user.id))
          .setPlaceholder('🔍 Inspect: Common & Uncommon...')
          .addOptions(groupA.map(dexOption))
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(cid('dexsel', 'b', '', user.id))
          .setPlaceholder('🔍 Inspect: Rare → Mythic...')
          .addOptions(groupB.map(dexOption))
      ),
      backRow(user.id),
    ],
  };
}

async function topScreen(ctx, user) {
  const rows = await ctx.db.getLeaderboard(10);
  const MEDALS = ['🥇', '🥈', '🥉'];
  const lines = await Promise.all(
    rows.map(async (row, i) => {
      const u = await ctx.client.users.fetch(row.user_id).catch(() => null);
      const name = u ? u.displayName : 'Unknown Farmer';
      return `${MEDALS[i] || `**${i + 1}.**`} **${name}** — ${coins(row.balance)} · 🏆 ${row.wins}W`;
    })
  );
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🏆 FruitCards Leaderboard')
    .setDescription(lines.length > 0 ? lines.join('\n') : 'Nobody here yet — be the first with `fstart`!');
  return { embeds: [embed], files: [], components: [backRow(user.id)] };
}

async function helpScreen(ctx, user) {
  const lines = [...new Set(ctx.commands.values())]
    .map((c) => `\`${c.usage}\` — ${c.description}`)
    .join('\n');
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('🍇 FruitCards Commands')
    .setDescription(`🎓 *New here? Hit the Tutorial button below!*\n\n${lines}`);
  return {
    embeds: [embed],
    files: [],
    components: [backRow(user.id, [btn('tut', 'basics', '', user.id, 'Tutorial', ButtonStyle.Success, '🎓')])],
  };
}

// ── Tutorial ───────────────────────────────────────────────────────

const TYPE_CYCLE = ['citrus', 'vine', 'stone', 'berry', 'tropical', 'orchard'];

function tutorialTopics(ctx, user, active) {
  return new ActionRowBuilder().addComponents(
    btn('tut', 'basics', '', user.id, 'Basics', active === 'basics' ? ButtonStyle.Success : ButtonStyle.Secondary, '🌱'),
    btn('tut', 'packs', '', user.id, 'Packs & Cards', active === 'packs' ? ButtonStyle.Success : ButtonStyle.Secondary, '📦'),
    btn('tut', 'battle', '', user.id, 'Battling', active === 'battle' ? ButtonStyle.Success : ButtonStyle.Secondary, '⚔️'),
    btn('tut', 'market', '', user.id, 'Trading', active === 'market' ? ButtonStyle.Success : ButtonStyle.Secondary, '🏛️')
  );
}

async function tutorialScreen(ctx, user, topic = 'basics') {
  const embed = new EmbedBuilder().setColor(0x66bb6a);
  if (topic === 'packs') {
    embed
      .setTitle('🎓 Tutorial — Packs & Cards')
      .setDescription(
        `📦 Buy packs in the **Shop** — every pack holds **5 cards**.\n` +
          `• ${config.PACKS.standard.emoji} Standard (${config.PACKS.standard.price}🪙) · ${config.PACKS.juicy.emoji} Juicy (${config.PACKS.juicy.price}🪙, better odds) · ${config.PACKS.exotic.emoji} Exotic (${config.PACKS.exotic.price}🪙, best odds)\n` +
          `• Pricier packs guarantee rarer cards and roll better ✨ variant chances\n\n` +
          `🌈 **Variants**: cards can drop as ✨ Foil (sell ×4), 🥇 Gold (×10), or 🌈 Prism (×25) — same stats, way cooler card\n` +
          `🆕 marks a fruit you've never pulled before\n` +
          `💰 Sell spares with \`fsell <fruit> [foil/gold/prism] [n|all]\` — rarer cards and variants sell for more\n` +
          `📖 Track your completion in the **FruitDex** — inspect any card, even undiscovered ones`
      );
  } else if (topic === 'battle') {
    const chart = TYPE_CYCLE.map((key, i) => {
      const next = TYPE_CYCLE[(i + 1) % TYPE_CYCLE.length];
      return `${temoji(key)} ${TYPES[key].name} beats ${temoji(next)} ${TYPES[next].name}`;
    }).join('\n');
    embed
      .setTitle('🎓 Tutorial — Battling')
      .setDescription(
        `⚔️ Battle with \`fbattle @friend\` or matchmake with **Find Battle** — matches run in private threads, even across servers!\n\n` +
          `**1.** Draft a team of ${config.TEAM_SIZE} fruits — one fights, the rest wait on the bench\n` +
          `**2.** You gain **1⚡ energy** at the start of each turn (bank up to ${config.POWER_CAP})\n` +
          `**3.** Spend it: quick attack (1⚡), **signature move** (3⚡), Guard (1⚡, shield), Retreat (1⚡, swap fruit), or Charge (bank +1⚡)\n` +
          `**4.** Knock out all ${config.TEAM_SIZE} enemy fruits to win coins!\n\n` +
          `**Type matchups** (×1.5 damage, and each type resists the one it beats ×0.75):\n${chart}\n\n` +
          `*Tip: check a card's Matchups before drafting — a well-typed team wins uphill fights.*`
      );
  } else if (topic === 'market') {
    embed
      .setTitle('🎓 Tutorial — Trading & Auctions')
      .setDescription(
        `🤝 **Trade** cards directly:\n\`ftrade @friend give apple get banana x2\` — they accept with a button, the swap is instant and safe\n\n` +
          `🏛️ **Auction house** (cross-server!):\n` +
          `• List: \`fauction <fruit> [foil] [minBid]\` — the card is held in escrow for 10 minutes\n` +
          `• Bid from the **Auctions** screen or \`fbid <id> <amount>\` — your coins are escrowed and refunded instantly if outbid\n` +
          `• Highest bid when the hammer falls wins the card; the seller gets the coins\n\n` +
          `*Tip: rare pulls and shiny variants often fetch far more at auction than fsell!*`
      );
  } else {
    embed
      .setTitle('🎓 Tutorial — Basics')
      .setDescription(
        `Welcome to **FruitCards** — collect all ${FRUITS.length} real fruits, battle friends, and build the shiniest binder on Discord!\n\n` +
          `🪙 **Earn coins**: \`fdaily\` every 24h (streaks pay extra) and \`fdrop\` every 2 minutes — drops chain +10 with 50% luck, forever\n` +
          `🎁 **Codes**: redeem with \`fcode <code>\` *(psst — try \`fcode release\`)*\n` +
          `📦 **Spend coins** on packs in the Shop, then rip them open\n` +
          `⚔️ **Battle** to win even more coins\n\n` +
          `Everything lives in **\`fmenu\`** — one message, buttons for it all. Flip through the tutorial topics below!`
      );
  }
  return { embeds: [embed], files: [], components: [tutorialTopics(ctx, user, topic), backRow(user.id)] };
}

// ── Router ─────────────────────────────────────────────────────────

async function handleComponent(interaction, ctx) {
  const [, action, a, b, ownerId] = interaction.customId.split(':');
  if (interaction.user.id !== ownerId) {
    return interaction.reply({ content: 'This menu belongs to someone else — open your own with `fmenu`!', ephemeral: true });
  }
  const user = interaction.user;

  // The auction select opens a modal (no update yet).
  if (action === 'aucsel') {
    const auctionId = interaction.values[0];
    const modal = new ModalBuilder()
      .setCustomId(cid('bidmodal', auctionId, '', user.id))
      .setTitle(`Bid on auction #${auctionId}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('amount')
            .setLabel('Your bid (coins)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. 150')
            .setRequired(true)
            .setMaxLength(9)
        )
      );
    return interaction.showModal(modal);
  }

  let payload;
  if (action === 'home') payload = await homeScreen(ctx, user);
  else if (action === 'shop') payload = await shopScreen(ctx, user);
  else if (action === 'buy') {
    const pack = config.PACKS[a];
    const result = pack ? await economy.buyPacks(ctx.db, user.id, pack, 1) : { ok: false };
    payload = await shopScreen(
      ctx,
      user,
      result.ok
        ? `✅ Bought a ${pack.emoji} **${pack.name}** — you now own **${result.owned}**!`
        : `❌ Not enough coins for that pack!`
    );
  } else if (action === 'packs') payload = await packsScreen(ctx, user);
  else if (action === 'open') payload = await openScreen(ctx, user, a);
  else if (action === 'col') payload = await collectionScreen(ctx, user, parseInt(a, 10) || 1);
  else if (action === 'colsel' || action === 'dexsel') {
    const [fruitId, variant, source] = interaction.values[0].split('|');
    payload = await cardScreen(ctx, user, fruitId, variant, source === 'd' ? 'd' : parseInt(source, 10) || 1);
  } else if (action === 'card') {
    const [variant, source] = (b || 'normal|1').split('|');
    payload = await cardScreen(ctx, user, a, variant || 'normal', source === 'd' ? 'd' : parseInt(source, 10) || 1);
  } else if (action === 'auc') payload = await auctionScreen(ctx, user);
  else if (action === 'daily') payload = await dailyScreen(ctx, user);
  else if (action === 'drop') payload = await dropScreen(ctx, user);
  else if (action === 'dex') payload = await dexScreen(ctx, user);
  else if (action === 'top') payload = await topScreen(ctx, user);
  else if (action === 'help') payload = await helpScreen(ctx, user);
  else if (action === 'tut') payload = await tutorialScreen(ctx, user, a || 'basics');
  else if (action === 'queue') {
    if (ctx.matchmaking.queue.has(user.id)) {
      ctx.matchmaking.remove(user.id);
      payload = await homeScreen(ctx, user);
      payload.embeds[0].setDescription(`Welcome back, **${user.displayName}**!\n👋 *Left the matchmaking queue.*`);
    } else if (ctx.battles.inBattle(user.id)) {
      payload = await homeScreen(ctx, user);
      payload.embeds[0].setDescription(`Welcome back, **${user.displayName}**!\n⚔️ *You're already in a battle!*`);
    } else {
      const collection = await ctx.db.getCollection(user.id);
      if (collection.length === 0) {
        payload = await homeScreen(ctx, user);
        payload.embeds[0].setDescription(`Welcome back, **${user.displayName}**!\n❌ *You need at least one card to battle — hit the shop!*`);
      } else {
        // Adapter so the queue can announce matches in this channel.
        await ctx.matchmaking.join({
          author: user,
          channel: interaction.channel,
          reply: (p) => interaction.channel.send(p),
        });
        payload = await homeScreen(ctx, user);
      }
    }
  } else {
    payload = await homeScreen(ctx, user);
  }

  await interaction.update({ ...payload, attachments: [] });
}

async function handleModal(interaction, ctx) {
  const [, action, a, , ownerId] = interaction.customId.split(':');
  if (action !== 'bidmodal' || interaction.user.id !== ownerId) return;
  const auctionId = parseInt(a, 10);
  const amount = parseInt(interaction.fields.getTextInputValue('amount').replace(/[^\d]/g, ''), 10);

  let note;
  if (!Number.isFinite(amount) || amount < 1) {
    note = '❌ That bid wasn\'t a number!';
  } else {
    try {
      const auction = await ctx.db.placeBid(auctionId, interaction.user.id, amount);
      const fruit = getFruit(auction.fruit_id);
      note = `🔨 You're the top bidder on **${fruit.name}${variantLabel(auction.variant)}** at ${coins(amount)}!`;
    } catch (err) {
      if (!err.friendly) throw err;
      if (err.message.startsWith('too-low:')) note = `❌ Too low — minimum bid is **${err.message.split(':')[1]}** 🪙.`;
      else
        note =
          {
            'not-open': '❌ That auction is already over.',
            ended: '❌ That auction just ended — too slow!',
            'own-auction': "❌ You can't bid on your own auction!",
            poor: "❌ You don't have that many coins!",
          }[err.message] || '❌ That bid didn\'t go through.';
    }
  }

  const payload = await auctionScreen(ctx, interaction.user, note);
  if (interaction.isFromMessage()) {
    await interaction.update({ ...payload, attachments: [] });
  } else {
    await interaction.reply({ ...payload, ephemeral: true });
  }
}

module.exports = {
  handleComponent,
  handleModal,
  homeScreen,
  shopScreen,
  packsScreen,
  openScreen,
  collectionScreen,
  cardScreen,
  auctionScreen,
  dailyScreen,
  dropScreen,
  dexScreen,
  topScreen,
  helpScreen,
  tutorialScreen,
};
