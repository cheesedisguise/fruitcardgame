// FruitCards battle engine — team-based deck battles in private threads.
//
// Each player fields a team of up to 3 fruits (one active, rest on the bench).
// You gain 1 power (⚡) at the start of each of your turns and spend it on
// actions: Attack, Block, a per-fruit Ability, Switch, or Charge (bank +1⚡).
// Knock out the whole enemy team to win.
//
// A battle renders into one or more "views" — messages the bot keeps in sync.
// Same-channel matches share a single private thread; cross-server matches get
// one private thread per player and every action is mirrored to both threads.
// Threads are deleted shortly after the match ends; results are announced back
// in the channels the battle started from.
const crypto = require('crypto');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  ChannelType,
} = require('discord.js');
const config = require('./config');
const { getFruit, RARITIES, TYPES, ABILITIES, movesFor } = require('./fruits');
const { remoji, gemoji } = require('./util');

const RARITY_ORDER = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
const THREAD_DELETE_DELAY_MS = 20 * 1000;

function round5(n) {
  return Math.max(5, Math.round(n / 5) * 5);
}

function hpBar(current, max, len = 8) {
  const pct = current / max;
  const filled = Math.max(0, Math.round(pct * len));
  const block = pct > 0.5 ? '🟩' : pct > 0.25 ? '🟨' : '🟥';
  return block.repeat(filled) + '⬛'.repeat(len - filled);
}

function avatarOf(user) {
  return typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL({ size: 128 }) : null;
}

class BattleManager {
  constructor(db, render) {
    this.db = db;
    this.render = render;
    this.battles = new Map(); // battleId -> battle
    this.byUser = new Map(); // userId -> battleId
  }

  inBattle(userId) {
    return this.byUser.has(userId);
  }

  // ── Venue helpers ────────────────────────────────────────────────

  async createThread(channel, name, userIds) {
    if (!channel.threads) return null;
    const attempts = [
      { type: ChannelType.PrivateThread, invitable: false },
      { type: ChannelType.PrivateThread },
      { type: ChannelType.PublicThread },
    ];
    for (const opts of attempts) {
      try {
        const thread = await channel.threads.create({
          name,
          autoArchiveDuration: 60,
          reason: 'FruitCards battle',
          ...opts,
        });
        for (const uid of userIds) await thread.members.add(uid).catch(() => {});
        return thread;
      } catch {
        // try the next fallback
      }
    }
    return null;
  }

  // ── Battle creation ──────────────────────────────────────────────

  createBattle(entries) {
    const id = crypto.randomBytes(5).toString('hex');
    const battle = {
      id,
      players: {},
      order: entries.map((e) => e.user.id),
      views: [], // { channel, message, localIds }
      threads: [],
      announcements: [], // origin-channel messages updated with the result
      phase: 'pick',
      round: 0,
      choices: {}, // uid -> { verb, target? } — secret until both are in
      event: null, // active arena event this round
      imagePair: null,
      log: [],
      timer: null,
      pickOptions: {},
    };
    for (const e of entries) {
      battle.players[e.user.id] = {
        user: e.user,
        team: [],
        active: 0,
        power: 0,
        shield: 0,
        atkBonus: 0,
        momentum: 0,
        fired: false,
      };
    }
    this.battles.set(id, battle);
    for (const e of entries) this.byUser.set(e.user.id, id);
    return battle;
  }

  setTimer(battle, ms, fn) {
    if (battle.timer) clearTimeout(battle.timer);
    battle.timer = setTimeout(() => fn().catch((err) => console.error('battle timer error:', err)), ms);
  }

  cleanup(battle) {
    if (battle.timer) clearTimeout(battle.timer);
    this.battles.delete(battle.id);
    for (const uid of Object.keys(battle.players)) {
      if (this.byUser.get(uid) === battle.id) this.byUser.delete(uid);
    }
    if (battle.threads.length > 0) {
      setTimeout(() => {
        for (const thread of battle.threads) thread.delete('FruitCards battle finished').catch(() => {});
      }, THREAD_DELETE_DELAY_MS);
    }
  }

  battleName(battle) {
    const [a, b] = battle.order.map((uid) => battle.players[uid].user.displayName);
    return `🍉│${a}-vs-${b}`.slice(0, 96);
  }

  // Direct challenge: fbattle @user (same channel).
  async startChallenge(message, challenger, opponent) {
    const battle = this.createBattle([
      { user: challenger, channel: message.channel },
      { user: opponent, channel: message.channel },
    ]);
    try {
      await this.runChallenge(message, battle, challenger, opponent);
    } catch (err) {
      this.cleanup(battle); // don't leave players flagged as in-battle
      throw err;
    }
  }

  async runChallenge(message, battle, challenger, opponent) {
    battle.phase = 'invite';
    battle.challengeChannel = message.channel;

    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle('⚔️ Fruit Battle Challenge!')
      .setThumbnail(avatarOf(challenger))
      .setDescription(
        `**${challenger.displayName}** challenges **${opponent.displayName}** to a team battle!\n\n` +
          `${opponent}, do you accept? Each of you picks a team of ${config.TEAM_SIZE} fruits — a private battle thread will open for you two.`
      )
      .addFields({
        name: 'Stakes',
        value: `🏆 Winner **+${config.BATTLE_WIN_REWARD}** ${config.CURRENCY_EMOJI} · 💀 Loser **+${config.BATTLE_LOSS_REWARD}** ${config.CURRENCY_EMOJI}`,
      })
      .setFooter({ text: 'Challenge expires in 2 minutes' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`battle:${battle.id}:accept`).setLabel('Accept').setStyle(ButtonStyle.Success).setEmoji('⚔️'),
      new ButtonBuilder().setCustomId(`battle:${battle.id}:decline`).setLabel('Decline').setStyle(ButtonStyle.Danger)
    );
    const msg = await message.reply({ embeds: [embed], components: [row] });
    battle.announcements.push({ channel: message.channel, message: msg });
    this.setTimer(battle, config.INVITE_TIMEOUT_MS, () => this.expire(battle, 'The challenge went unanswered. 🍂'));
  }

  // Matchmade battle: entries = [{ user, channel }] possibly from different guilds.
  async startMatched(entries) {
    const battle = this.createBattle(entries);
    try {
      await this.runMatched(battle, entries);
    } catch (err) {
      this.cleanup(battle); // don't leave players flagged as in-battle
      throw err;
    }
  }

  async runMatched(battle, entries) {
    const sameChannel = entries[0].channel.id === entries[1].channel.id;
    const name = this.battleName(battle);

    if (sameChannel) {
      const thread = await this.createThread(entries[0].channel, name, battle.order);
      const channel = thread || entries[0].channel;
      if (thread) battle.threads.push(thread);
      battle.views.push({ channel, message: null, localIds: [...battle.order] });
    } else {
      for (const e of entries) {
        const thread = await this.createThread(e.channel, name, [e.user.id]);
        const channel = thread || e.channel;
        if (thread) battle.threads.push(thread);
        battle.views.push({ channel, message: null, localIds: [e.user.id] });
      }
    }

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const other = entries[1 - i];
      const view = battle.views.length === 1 ? battle.views[0] : battle.views[i];
      const isThread = view.channel !== e.channel;
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('🎯 Match Found!')
        .setDescription(
          `**${e.user.displayName}** vs **${other.user.displayName}**` +
            (other.channel.guild?.id !== e.channel.guild?.id
              ? ` *(from **${other.channel.guild?.name || 'another server'}**)*`
              : '') +
            (isThread ? `\n\nYour private battle thread: ${view.channel}` : '\n\nThe battle begins below!')
        );
      try {
        const msg = await e.channel.send({ embeds: [embed] });
        battle.announcements.push({ channel: e.channel, message: msg });
      } catch {
        // origin channel may be unavailable; the battle can still proceed
      }
      if (battle.views.length === 1) break;
    }

    await this.beginPickPhase(battle);
  }

  // ── Pick phase (team select) ─────────────────────────────────────

  async beginPickPhase(battle) {
    battle.phase = 'pick';
    for (const uid of battle.order) {
      const rows = await this.db.getCollection(uid);
      battle.players[uid].draft = [];
      battle.pickOptions[uid] = rows
        .map((r) => ({ fruit: getFruit(r.fruit_id), qty: r.quantity }))
        .filter((o) => o.fruit)
        .sort((a, b) => {
          const ra = RARITY_ORDER.indexOf(a.fruit.rarity) - RARITY_ORDER.indexOf(b.fruit.rarity);
          return ra !== 0 ? ra : b.fruit.atk - a.fruit.atk;
        })
        .map((o) => {
          const type = TYPES[o.fruit.type];
          return {
            cost: config.RARITY_COST[o.fruit.rarity],
            label: `${o.fruit.name} (${config.RARITY_COST[o.fruit.rarity]}pt) — ATK ${o.fruit.atk} · HP ${o.fruit.hp}`,
            description: `${RARITIES[o.fruit.rarity].name} · ${type.emoji} ${type.name} · ${movesFor(o.fruit).signature.name}`,
            value: o.fruit.id,
            emoji: remoji(o.fruit.rarity),
          };
        });
    }
    const cardless = battle.order.filter((uid) => battle.pickOptions[uid].length === 0);
    if (cardless.length > 0) {
      if (cardless.length === 2) return this.expire(battle, 'Neither player has any cards! 🍂');
      const loser = battle.players[cardless[0]];
      const winner = battle.players[battle.order.find((uid) => uid !== cardless[0])];
      return this.finish(battle, winner, loser, `🃏 **${loser.user.displayName}** has no cards — forfeit!`);
    }
    await this.renderAllViews(battle);
    this.setTimer(battle, config.PICK_TIMEOUT_MS, () => this.handlePickTimeout(battle));
  }

  draftCost(battle, uid) {
    return (battle.players[uid].draft || []).reduce(
      (sum, fid) => sum + config.RARITY_COST[getFruit(fid).rarity],
      0
    );
  }

  pickEmbed(battle) {
    const lines = battle.order.map((uid) => {
      const p = battle.players[uid];
      if (p.team.length > 0) return `✅ **${p.user.displayName}** locked in a team of ${p.team.length}!`;
      const picks = (p.draft || []).map((fid) => {
        const f = getFruit(fid);
        return `${remoji(f.rarity)} ${f.name} (${config.RARITY_COST[f.rarity]}pt)`;
      });
      return (
        `🃏 **${p.user.displayName}** — budget **${this.draftCost(battle, uid)}/${config.TEAM_POINTS}pt**\n` +
        (picks.length > 0 ? `> ${picks.join(' · ')}` : '> *nothing drafted yet*')
      );
    });
    return new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle('🃏 Draft Your Team!')
      .setDescription(
        lines.join('\n\n') +
          `\n\nPick fruits **one at a time** from the menus (up to ${config.TEAM_SIZE}, within **${config.TEAM_POINTS} points**), then hit **Lock In**!\n` +
          `Cost by rarity: ${Object.entries(config.RARITY_COST)
            .map(([r, c]) => `${RARITIES[r].name} ${c}`)
            .join(' · ')}. Your first pick is your opener.`
      )
      .setFooter({ text: 'Big cards hit harder — but a full bench wins long fights · 3 minutes' });
  }

  pickComponents(battle, view) {
    const rows = [];
    const buttons = [];
    for (const uid of view.localIds) {
      const p = battle.players[uid];
      if (p.team.length > 0) continue;
      const heavy = battle.pickOptions[uid].filter((o) => o.cost >= 3).slice(0, 25);
      const budget = battle.pickOptions[uid].filter((o) => o.cost <= 2).slice(0, 25);
      const short = view.localIds.length === 1;
      if (heavy.length > 0) {
        rows.push(
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`battle:${battle.id}:padd:${uid}h`)
              .setPlaceholder(`${short ? '' : p.user.displayName + ' — '}💪 Heavy hitters (3-6pt)`)
              .addOptions(heavy.map(({ cost, ...o }) => o))
          )
        );
      }
      if (budget.length > 0) {
        rows.push(
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`battle:${battle.id}:padd:${uid}b`)
              .setPlaceholder(`${short ? '' : p.user.displayName + ' — '}🪙 Budget picks (1-2pt)`)
              .addOptions(budget.map(({ cost, ...o }) => o))
          )
        );
      }
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`battle:${battle.id}:plock:${uid}`)
          .setLabel(`${view.localIds.length === 1 ? 'Lock In' : p.user.displayName + ': Lock'} (${this.draftCost(battle, uid)}pt)`)
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅')
          .setDisabled((p.draft || []).length === 0),
        new ButtonBuilder()
          .setCustomId(`battle:${battle.id}:pclear:${uid}`)
          .setLabel(view.localIds.length === 1 ? 'Clear' : `${p.user.displayName}: Clear`)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('↩️')
          .setDisabled((p.draft || []).length === 0)
      );
    }
    if (buttons.length > 0) rows.push(new ActionRowBuilder().addComponents(buttons.slice(0, 5)));
    return rows.slice(0, 5);
  }

  // ── Fight rendering ──────────────────────────────────────────────

  activeMon(p) {
    return p.team[p.active];
  }

  effectiveAtk(p) {
    return this.activeMon(p).fruit.atk + p.atkBonus;
  }

  // ── Arena events (roll every few rounds, last one round) ─────────

  static CROWD = [
    'The crowd goes bananas! 🍌',
    'Juice flies everywhere! 🧃',
    'The orchard holds its breath...',
    'Seeds rattle in the stands!',
    'A vendor drops their fruit cup! 🥤',
    'Somewhere, a melon thumps approvingly.',
  ];

  static EVENTS = [
    { id: 'storm', text: '🌧 **Juice Storm** — all damage +30% this round!', dmgMult: 1.3 },
    { id: 'gale', text: '🌪 **Wild Gale** — every attack must flip a coin to land!', flipToHit: true },
    { id: 'bloom', text: '🌱 **Super Bloom** — all healing doubled, and everyone mends 10 HP!', healMult: 2, endHeal: 10 },
    { id: 'surge', text: '⚡ **Power Surge** — all energy gains doubled this round!', energyMult: 2 },
    { id: 'aim', text: '🎯 **True Aim** — type matchups count double (weak ×2, resist ×0.5)!', typeBoost: true },
    { id: 'honey', text: '🍯 **Golden Hour** — whoever wins this round pockets 25 bonus coins!', bounty: 25 },
  ];

  playerBlock(battle, uid) {
    const p = battle.players[uid];
    const mon = this.activeMon(p);
    const type = TYPES[mon.fruit.type];
    const locked = battle.phase === 'fight' && battle.choices[uid] ? ' ✅ *locked in*' : battle.phase === 'fight' ? ' 🤔 *choosing...*' : '';
    const lines = [
      `${remoji(mon.fruit.rarity)} **${p.user.displayName}** — *${mon.fruit.name}* ${type.emoji}${locked}`,
      `${hpBar(mon.hp, mon.maxHp)} **${mon.hp}**/${mon.maxHp}` +
        `  ${gemoji('energy', '⚡')}${p.power}` +
        (p.shield > 0 ? `  ${gemoji('shield', '🛡️')}${p.shield}` : '') +
        (p.atkBonus > 0 ? `  ${gemoji('ripen', '📈')}+${p.atkBonus}` : '') +
        (p.fired ? '  🔥**FIRED UP!**' : p.momentum > 0 ? `  🔥${'▮'.repeat(p.momentum)}${'▯'.repeat(config.CLASH.MOMENTUM_MAX - p.momentum)}` : ''),
    ];
    if (battle.phase === 'fight') {
      const moves = movesFor(mon.fruit);
      const atk = mon.fruit.atk + p.atkBonus;
      const scaled = round5((moves.quick.dmg / mon.fruit.atk) * atk);
      lines.push(
        `> ⚔️ ${moves.quick.name} ${scaled}·${moves.quick.cost}⚡ · ${moves.signature.emoji} ${moves.signature.name} ·${moves.signature.cost}⚡`
      );
    }
    const bench = p.team
      .map((m, i) => ({ m, i }))
      .filter(({ i }) => i !== p.active);
    if (bench.length > 0) {
      lines.push(
        'Bench: ' +
          bench
            .map(({ m }) => (m.hp > 0 ? `${m.fruit.name} (${m.hp}/${m.maxHp})` : `~~${m.fruit.name}~~ 💀`))
            .join(' · ')
      );
    }
    return lines.join('\n');
  }

  fightEmbed(battle) {
    const activeA = this.activeMon(battle.players[battle.order[0]]);
    const activeB = this.activeMon(battle.players[battle.order[1]]);
    const embed = new EmbedBuilder()
      .setColor(battle.event ? 0xffc107 : 0xe74c3c)
      .setTitle(`⚔️ Round ${battle.round} — ${activeA.fruit.name} vs ${activeB.fruit.name}`)
      .setDescription(
        (battle.event ? `${battle.event.text}\n\n` : '') +
          battle.order.map((uid) => this.playerBlock(battle, uid)).join('\n\n')
      )
      .addFields({ name: '📜 Battle Log', value: battle.log.slice(-6).join('\n') || '*The battle begins!*' })
      .setFooter({
        text: 'Choose secretly — the round resolves when both lock in! Guard beats Strike · Strike punishes Charge · Special breaks Guard · Retreat dodges Strike',
      })
      .setImage('attachment://battle.png');
    return embed;
  }

  // Both players share the same buttons; presses are validated per player.
  // Single-player views (cross-server threads) get tailored disabled states.
  fightComponents(battle, view) {
    const solo = view.localIds.length === 1 ? battle.players[view.localIds[0]] : null;
    let quickLabel = 'Strike';
    let sigLabel = 'Special';
    let quickDisabled = false;
    let sigDisabled = false;
    let retreatDisabled = false;
    if (solo) {
      const mon = this.activeMon(solo);
      const moves = movesFor(mon.fruit);
      const atk = mon.fruit.atk + solo.atkBonus;
      const scale = (printed) => round5((printed / mon.fruit.atk) * atk);
      const sig = moves.signature;
      const sigInfo =
        sig.dmg != null
          ? `${scale(sig.dmg)}${['flurry', 'cascade'].includes(sig.kind) ? '/heads' : sig.kind === 'gamble' ? '?' : ''}`
          : sig.heal != null
            ? `heal ${sig.heal}`
            : `+${sig.buff} ATK`;
      quickLabel = `${moves.quick.name} ${scale(moves.quick.dmg)}${moves.quick.flips === 2 ? '/heads' : moves.quick.flips === 1 ? '?' : ''} ·${moves.quick.cost}⚡`;
      sigLabel = `${sig.name} ${sigInfo} ·${sig.cost}⚡`;
      quickDisabled = solo.power < moves.quick.cost || !!battle.choices[solo.user.id];
      sigDisabled = solo.power < sig.cost || !!battle.choices[solo.user.id];
      retreatDisabled = !solo.team.some((m, i) => i !== solo.active && m.hp > 0) || !!battle.choices[solo.user.id];
    }
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`battle:${battle.id}:act:quick`)
          .setLabel(quickLabel)
          .setStyle(ButtonStyle.Danger)
          .setEmoji('⚔️')
          .setDisabled(quickDisabled),
        new ButtonBuilder()
          .setCustomId(`battle:${battle.id}:act:sig`)
          .setLabel(sigLabel)
          .setStyle(ButtonStyle.Success)
          .setEmoji('✨')
          .setDisabled(sigDisabled),
        new ButtonBuilder()
          .setCustomId(`battle:${battle.id}:act:guard`)
          .setLabel('Guard')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🛡️')
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`battle:${battle.id}:act:charge`)
          .setLabel(`Charge +${config.CLASH.CHARGE_GAIN}⚡`)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⚡'),
        new ButtonBuilder()
          .setCustomId(`battle:${battle.id}:act:retreat`)
          .setLabel('Retreat')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔄')
          .setDisabled(retreatDisabled)
      ),
    ];
  }

  async renderAllViews(battle, { forceImage = false } = {}) {
    let files;
    if (battle.phase === 'fight') {
      const pair = battle.order.map((uid) => this.activeMon(battle.players[uid]).fruit.id).join(':');
      if (forceImage || pair !== battle.imagePair) {
        battle.imagePair = pair;
        const [a, b] = pair.split(':');
        const img = await this.render.renderBattle(a, b);
        files = [new AttachmentBuilder(img, { name: 'battle.png' })];
      }
    }
    for (const view of battle.views) {
      const payload = {};
      if (battle.phase === 'pick') {
        payload.embeds = [this.pickEmbed(battle)];
        payload.components = this.pickComponents(battle, view);
      } else if (battle.phase === 'fight') {
        payload.embeds = [this.fightEmbed(battle)];
        payload.components = this.fightComponents(battle, view);
        if (files) {
          payload.files = files;
          payload.attachments = []; // drop the previous image when replacing it
        }
      }
      try {
        if (view.message) {
          await view.message.edit(payload);
        } else {
          view.message = await view.channel.send(payload);
        }
      } catch (err) {
        console.error('view render error:', err.message);
      }
    }
  }

  // ── Component handling ───────────────────────────────────────────

  async handleComponent(interaction) {
    const [, id, action, extra] = interaction.customId.split(':');
    const battle = this.battles.get(id);
    if (!battle) {
      await interaction.reply({ content: 'That battle is over.', ephemeral: true }).catch(() => {});
      return;
    }
    try {
      if (action === 'accept' || action === 'decline') await this.handleInvite(interaction, battle, action);
      else if (action === 'padd') await this.handleDraftAdd(interaction, battle, extra);
      else if (action === 'plock') await this.handleDraftLock(interaction, battle, extra);
      else if (action === 'pclear') await this.handleDraftClear(interaction, battle, extra);
      else if (action === 'act') await this.handleAction(interaction, battle, extra);
      else if (action === 'rtgt') await this.handleRetreatTarget(interaction, battle, parseInt(extra, 10));
      else await interaction.deferUpdate().catch(() => {});
    } catch (err) {
      console.error('battle error:', err);
      await this.expire(battle, 'Something went wrong — battle cancelled. 🍌').catch(() => {});
    }
  }

  async handleInvite(interaction, battle, action) {
    if (battle.phase !== 'invite') return interaction.deferUpdate();
    const opponentId = battle.order[1];
    if (interaction.user.id !== opponentId) {
      return interaction.reply({ content: 'Only the challenged player can respond!', ephemeral: true });
    }
    if (action === 'decline') {
      battle.phase = 'done';
      this.cleanup(battle);
      const embed = new EmbedBuilder()
        .setColor(0x95a5a6)
        .setTitle('🏳️ Challenge Declined')
        .setDescription(`**${battle.players[opponentId].user.displayName}** declined the battle.`);
      return interaction.update({ embeds: [embed], components: [] });
    }

    await interaction.deferUpdate();
    const channel = battle.challengeChannel;
    const thread = await this.createThread(channel, this.battleName(battle), battle.order);
    if (thread) {
      battle.threads.push(thread);
      battle.views.push({ channel: thread, message: null, localIds: [...battle.order] });
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('⚔️ Battle Underway!')
        .setDescription(`The battle has moved to a private thread: ${thread}`);
      await battle.announcements[0].message.edit({ embeds: [embed], components: [] }).catch(() => {});
    } else {
      battle.views.push({ channel, message: null, localIds: [...battle.order] });
      await battle.announcements[0].message.edit({ components: [] }).catch(() => {});
    }
    await this.beginPickPhase(battle);
  }

  // Rough team strength for the underdog boost.
  teamScore(team) {
    return team.reduce((s, m) => s + m.fruit.atk + m.fruit.hp / 2, 0);
  }

  async handleDraftAdd(interaction, battle, extra) {
    if (battle.phase !== 'pick') return interaction.deferUpdate();
    const uid = extra.slice(0, -1); // trailing h/b marks which menu
    if (interaction.user.id !== uid) {
      return interaction.reply({ content: "That's your opponent's draft menu!", ephemeral: true });
    }
    const p = battle.players[uid];
    if (!p || p.team.length > 0) return interaction.deferUpdate();
    p.draft = p.draft || [];
    const fruit = getFruit(interaction.values[0]);
    if (!fruit) return interaction.deferUpdate();
    if (p.draft.includes(fruit.id)) {
      return interaction.reply({ content: `❌ ${fruit.name} is already on your team!`, ephemeral: true });
    }
    if (p.draft.length >= config.TEAM_SIZE) {
      return interaction.reply({ content: `❌ Team is full (${config.TEAM_SIZE})! Clear or lock in.`, ephemeral: true });
    }
    const cost = this.draftCost(battle, uid) + config.RARITY_COST[fruit.rarity];
    if (cost > config.TEAM_POINTS) {
      return interaction.reply({
        content: `❌ ${fruit.name} costs ${config.RARITY_COST[fruit.rarity]}pt — that would put you at **${cost}/${config.TEAM_POINTS}**. Pick something cheaper or clear!`,
        ephemeral: true,
      });
    }
    p.draft.push(fruit.id);
    await interaction.deferUpdate();
    await this.renderAllViews(battle);
  }

  async handleDraftClear(interaction, battle, uid) {
    if (battle.phase !== 'pick' || interaction.user.id !== uid) return interaction.deferUpdate();
    const p = battle.players[uid];
    if (!p || p.team.length > 0) return interaction.deferUpdate();
    p.draft = [];
    await interaction.deferUpdate();
    await this.renderAllViews(battle);
  }

  async handleDraftLock(interaction, battle, uid) {
    if (battle.phase !== 'pick' || interaction.user.id !== uid) return interaction.deferUpdate();
    const p = battle.players[uid];
    if (!p || p.team.length > 0 || !(p.draft || []).length) return interaction.deferUpdate();
    p.team = p.draft.map((fid) => {
      const fruit = getFruit(fid);
      return { fruit, hp: fruit.hp, maxHp: fruit.hp };
    });
    p.active = 0;
    await interaction.deferUpdate();

    const bothPicked = Object.values(battle.players).every((pl) => pl.team.length > 0);
    if (!bothPicked) return this.renderAllViews(battle);
    await this.startFight(battle);
  }

  async startFight(battle) {
    // Underdog boost: the weaker team banks bonus starting energy.
    const [a, b] = battle.order.map((uid) => battle.players[uid]);
    const [scoreA, scoreB] = [this.teamScore(a.team), this.teamScore(b.team)];
    const weaker = scoreA < scoreB ? a : b;
    const gap = 1 - Math.min(scoreA, scoreB) / Math.max(scoreA, scoreB);
    const boost = Math.min(config.UNDERDOG_MAX, Math.floor(gap / config.UNDERDOG_STEP));
    if (boost > 0) {
      weaker.power += boost;
      battle.log.push(`🐢 Underdog boost: **${weaker.user.displayName}** starts with **+${boost}⚡**!`);
    }
    battle.phase = 'fight';
    battle.log.push('⚔️ **The clash begins!** Both players choose secretly each round — reveals happen together!');
    await this.beginRound(battle);
  }

  // ── Clash resolution ─────────────────────────────────────────────

  // Type-adjusted damage: weakness ×1.5, resistance ×0.75 (doubled under True
  // Aim), rounded to 5s. Pierce ignores type and shields. mult covers events,
  // punishes, guard breaks, and Fired Up.
  applyDamage(battle, attackerId, defenderId, base, { pierce = false, mult = 1 } = {}) {
    const d = battle.players[defenderId];
    const atkType = this.activeMon(battle.players[attackerId]).fruit.type;
    const defType = TYPES[this.activeMon(d).fruit.type];
    let dmg = base * mult;
    let note = '';
    if (!pierce) {
      const boost = battle.event?.typeBoost;
      if (defType.weakTo === atkType) {
        dmg = dmg * (boost ? 2 : 1.5);
        note = " — super effective! ⤴️";
      } else if (defType.resists === atkType) {
        dmg = dmg * (boost ? 0.5 : 0.75);
        note = ' — resisted ⤵️';
      }
    }
    dmg = round5(dmg);
    let absorbed = 0;
    if (!pierce && d.shield > 0) {
      absorbed = Math.min(d.shield, dmg);
      d.shield -= absorbed;
      dmg -= absorbed;
    }
    const mon = this.activeMon(d);
    mon.hp = Math.max(0, mon.hp - dmg);
    return { dealt: dmg, absorbed, note, fainted: mon.hp === 0 };
  }

  async beginRound(battle) {
    battle.resolving = false;
    battle.round += 1;
    battle.choices = {};
    battle.event = null;
    if (battle.round > 1 && battle.round % config.CLASH.EVENT_EVERY === 0) {
      battle.event = BattleManager.EVENTS[crypto.randomInt(BattleManager.EVENTS.length)];
      battle.log.push(`🎪 ${battle.event.text}`);
    }
    const energyMult = battle.event?.energyMult || 1;
    for (const uid of battle.order) {
      const p = battle.players[uid];
      p.power = Math.min(config.POWER_CAP, p.power + 1 * energyMult);
    }
    await this.renderAllViews(battle);
    this.setTimer(battle, config.ROUND_TIMEOUT_MS, () => this.handleRoundTimeout(battle));
  }

  // A player pressing an action button during the choosing phase.
  async handleAction(interaction, battle, verb) {
    if (battle.phase !== 'fight' || battle.resolving) return interaction.deferUpdate();
    const uid = interaction.user.id;
    const p = battle.players[uid];
    if (!p) return interaction.reply({ content: "You're not in this battle!", ephemeral: true });
    if (battle.choices[uid]) {
      return interaction.reply({ content: "You've already locked in this round!", ephemeral: true });
    }

    const mon = this.activeMon(p);
    const moves = movesFor(mon.fruit);
    if (verb === 'quick' && p.power < moves.quick.cost) {
      return interaction.reply({ content: `❌ ${moves.quick.name} needs ${moves.quick.cost}⚡ — you have ${p.power}. Try Charge or Guard!`, ephemeral: true });
    }
    if (verb === 'sig' && p.power < moves.signature.cost) {
      return interaction.reply({ content: `❌ ${moves.signature.name} needs ${moves.signature.cost}⚡ — you have ${p.power}. Charge up first!`, ephemeral: true });
    }
    if (verb === 'retreat') {
      const bench = p.team
        .map((m, i) => ({ m, i }))
        .filter(({ m, i }) => i !== p.active && m.hp > 0);
      if (bench.length === 0) {
        return interaction.reply({ content: '❌ Nobody left on the bench!', ephemeral: true });
      }
      // Pick the incoming fruit privately so the retreat stays secret.
      const row = new ActionRowBuilder().addComponents(
        bench.slice(0, 5).map(({ m, i }) =>
          new ButtonBuilder()
            .setCustomId(`battle:${battle.id}:rtgt:${i}`)
            .setLabel(`${m.fruit.name} (${m.hp} HP)`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji(remoji(m.fruit.rarity))
        )
      );
      return interaction.reply({ content: '🔄 Who comes in? (Your opponent can\'t see this!)', components: [row], ephemeral: true });
    }
    if (!['quick', 'sig', 'guard', 'charge'].includes(verb)) return interaction.deferUpdate();

    battle.choices[uid] = { verb };
    await interaction.deferUpdate();
    await this.afterChoice(battle);
  }

  async handleRetreatTarget(interaction, battle, idx) {
    const uid = interaction.user.id;
    const p = battle.players[uid];
    if (!p || battle.phase !== 'fight' || battle.choices[uid]) return interaction.deferUpdate().catch(() => {});
    const target = p.team[idx];
    if (!target || target.hp <= 0 || idx === p.active) return interaction.deferUpdate().catch(() => {});
    battle.choices[uid] = { verb: 'retreat', target: idx };
    await interaction.update({ content: `🔄 Locked in — retreating to **${target.fruit.name}**!`, components: [] }).catch(() => {});
    await this.afterChoice(battle);
  }

  async afterChoice(battle) {
    if (battle.resolving || battle.phase !== 'fight') return;
    const bothIn = battle.order.every((uid) => battle.choices[uid]);
    if (bothIn) {
      await this.resolveRound(battle);
    } else {
      await this.renderAllViews(battle); // show the ✅ locked-in status
    }
  }

  // Compute one side's outgoing attack packet (before it is applied).
  buildPacket(battle, uid, oppUid) {
    const p = battle.players[uid];
    const choice = battle.choices[uid];
    const opp = battle.choices[oppUid];
    const mon = this.activeMon(p);
    const moves = movesFor(mon.fruit);
    const atk = mon.fruit.atk + p.atkBonus;
    const scale = (printed, base) => round5((printed / base) * atk);
    const packet = { hits: [], lines: [], heal: 0, selfDamage: 0, energy: 0, verb: choice.verb };
    const eventDmg = battle.event?.dmgMult || 1;
    let mult = eventDmg;
    if (p.fired) mult *= config.CLASH.FIRED_MULT;

    const flipGate = () => !battle.event?.flipToHit || crypto.randomInt(2) === 0;

    if (choice.verb === 'quick') {
      p.power -= moves.quick.cost;
      const q = moves.quick;
      const base = scale(q.dmg, mon.fruit.atk);
      const name = `**${q.name}**`;
      let vsMult = 1;
      if (opp.verb === 'charge') vsMult = config.CLASH.PUNISH_MULT;
      if (opp.verb === 'retreat') {
        packet.lines.push(`⚔️ ${mon.fruit.name}'s ${name} slices thin air — the retreat dodged it!`);
        return packet;
      }
      if (opp.verb === 'guard') vsMult *= 1 - config.CLASH.GUARD_BLOCK;
      const rolls = q.flips === 2 ? 2 : 1;
      for (let i = 0; i < rolls; i++) {
        const landed = q.flips >= 1 ? crypto.randomInt(2) === 0 : true;
        if (landed && flipGate()) {
          packet.hits.push({ base, mult: mult * vsMult, pierce: q.pierce, drain: q.drain, shieldMult: q.shieldMult });
        }
      }
      if (packet.hits.length === 0 && q.flips >= 1) packet.lines.push(`🪙 ${mon.fruit.name}'s ${name} — all tails, a whiff!`);
      else if (opp.verb === 'charge') packet.lines.push(`⚔️ ${mon.fruit.name} catches the charge with ${name} — PUNISH ×${config.CLASH.PUNISH_MULT}!`);
      else if (opp.verb === 'guard') packet.lines.push(`🛡️ ${mon.fruit.name}'s ${name} thuds into the guard...`);
    } else if (choice.verb === 'sig') {
      p.power -= moves.signature.cost;
      const kind = mon.fruit.ability;
      const name = `**${moves.signature.name}**`;
      let vsMult = 1;
      let vsNote = '';
      if (opp.verb === 'guard' && kind !== 'regrow' && kind !== 'ripen') {
        vsMult = config.CLASH.GUARDBREAK_MULT;
        vsNote = ' — GUARD BREAK!';
      }
      const dmgKinds = { smash: 1.8, pierce: 1.2, drain: 0.9, flurry: 0.9, gamble: 2.6, cascade: 0.8 };
      if (kind === 'regrow') {
        packet.heal += round5(mon.maxHp * 0.5) * (battle.event?.healMult || 1);
        packet.lines.push(`💚 ${mon.fruit.name} uses ${name} — regrowing!`);
      } else if (kind === 'ripen') {
        p.atkBonus += 10;
        packet.lines.push(`📈 ${mon.fruit.name} uses ${name} — the team gains +10 ATK (now +${p.atkBonus})!`);
      } else if (kind === 'flurry') {
        const flips = [crypto.randomInt(2) === 0, crypto.randomInt(2) === 0];
        const heads = flips.filter(Boolean).length;
        for (let i = 0; i < heads; i++) if (flipGate()) packet.hits.push({ base: scale(round5(mon.fruit.atk * 0.9), mon.fruit.atk), mult: mult * vsMult, pierce: false });
        packet.lines.push(`🪙 ${mon.fruit.name} uses ${name} — flips *${flips.map((f) => (f ? 'Heads' : 'Tails')).join(', ')}*${vsNote}`);
      } else if (kind === 'cascade') {
        const chain = [];
        while (chain.length < 8 && crypto.randomInt(2) === 0) chain.push('Heads');
        chain.push('Tails');
        for (let i = 0; i < chain.length - 1; i++) if (flipGate()) packet.hits.push({ base: scale(round5(mon.fruit.atk * 0.8), mon.fruit.atk), mult: mult * vsMult, pierce: false });
        packet.lines.push(`♾️ ${mon.fruit.name} uses ${name} — flips *${chain.join(', ')}*${vsNote}`);
      } else if (kind === 'gamble') {
        if (crypto.randomInt(2) === 0) {
          if (flipGate()) packet.hits.push({ base: scale(round5(mon.fruit.atk * 2.6), mon.fruit.atk), mult: mult * vsMult, pierce: false });
          packet.lines.push(`🎲 ${mon.fruit.name} uses ${name} — *Heads!* A colossal blow${vsNote}!`);
        } else {
          packet.selfDamage = round5(atk * 0.5);
          packet.lines.push(`🎲 ${mon.fruit.name} uses ${name} — *Tails...* it hurts itself!`);
        }
      } else {
        if (flipGate()) packet.hits.push({ base: scale(round5(mon.fruit.atk * dmgKinds[kind]), mon.fruit.atk), mult: mult * vsMult, pierce: kind === 'pierce', drain: kind === 'drain' });
        else packet.lines.push(`🌪 ${mon.fruit.name}'s ${name} is blown off course!`);
        if (packet.hits.length > 0) packet.lines.push(`${ABILITIES[kind].emoji} ${mon.fruit.name} unleashes ${name}${vsNote}!`);
      }
    } else if (choice.verb === 'guard') {
      if (opp.verb === 'quick') {
        // Counter with a clean 30% of your light move.
        const counter = round5(scale(moves.quick.dmg, mon.fruit.atk) * config.CLASH.GUARD_COUNTER);
        packet.hits.push({ base: counter, mult: eventDmg, pierce: false, counter: true });
        packet.lines.push(`🛡️ ${mon.fruit.name} guards and counters!`);
      } else {
        packet.energy += config.CLASH.STARE_GAIN;
        packet.lines.push(`🛡️ ${mon.fruit.name} guards... nothing to block (+${config.CLASH.STARE_GAIN}⚡).`);
      }
    } else if (choice.verb === 'charge') {
      packet.energy += config.CLASH.CHARGE_GAIN * (battle.event?.energyMult || 1);
      packet.lines.push(`⚡ ${mon.fruit.name} charges up (+${config.CLASH.CHARGE_GAIN * (battle.event?.energyMult || 1)}⚡)!`);
    } else if (choice.verb === 'retreat') {
      packet.lines.push(`🔄 ${p.user.displayName} swaps to **${p.team[choice.target].fruit.name}**!`);
    }
    return packet;
  }

  async resolveRound(battle) {
    if (battle.resolving || battle.phase !== 'fight') return; // double-click / timeout race guard
    battle.resolving = true;
    if (battle.timer) clearTimeout(battle.timer);
    const [ua, ub] = battle.order;
    const A = battle.players[ua];
    const B = battle.players[ub];
    const verbIcon = { quick: '⚔️ Strike', sig: '✨ Special', guard: '🛡️ Guard', charge: '⚡ Charge', retreat: '🔄 Retreat' };
    battle.log.push(
      `— **Round ${battle.round}** — ${A.user.displayName} ${verbIcon[battle.choices[ua].verb]} vs ${B.user.displayName} ${verbIcon[battle.choices[ub].verb]}`
    );
    if (crypto.randomInt(4) === 0) {
      battle.log.push(`*${BattleManager.CROWD[crypto.randomInt(BattleManager.CROWD.length)]}*`);
    }

    // Retreats swap first (the incoming fruit faces whatever is coming).
    for (const uid of battle.order) {
      const c = battle.choices[uid];
      if (c.verb === 'retreat') {
        const p = battle.players[uid];
        p.active = c.target;
        p.shield = 0;
      }
    }

    // Build both packets from the same pre-damage snapshot, then apply.
    const packetA = this.buildPacket(battle, ua, ub);
    const packetB = this.buildPacket(battle, ub, ua);

    const dealt = { [ua]: 0, [ub]: 0 };
    for (const [uid, oppUid, packet] of [[ua, ub, packetA], [ub, ua, packetB]]) {
      const p = battle.players[uid];
      const mon = this.activeMon(p);
      for (const hit of packet.hits) {
        const res = this.applyDamage(battle, uid, oppUid, hit.base, { pierce: hit.pierce, mult: hit.mult });
        dealt[uid] += res.dealt;
        if (res.note) packet.lines.push(`💢 ${res.dealt} damage${res.note}`);
        else packet.lines.push(`💢 ${res.dealt} damage${res.absorbed > 0 ? ` (🛡️ ${res.absorbed} blocked)` : ''}`);
        if (hit.drain) packet.heal += Math.round(res.dealt / 2);
        if (hit.shieldMult) p.shield += round5((mon.fruit.atk + p.atkBonus) * hit.shieldMult);
      }
      if (packet.selfDamage > 0) mon.hp = Math.max(0, mon.hp - packet.selfDamage);
      if (packet.energy > 0) p.power = Math.min(config.POWER_CAP, p.power + packet.energy);
      if (p.fired && dealt[uid] > 0) {
        p.fired = false;
        packet.lines.push(`🔥 ${p.user.displayName}'s FIRED UP bonus lands!`);
      }
    }
    // Heals apply after damage (drain, regrow, event mends).
    for (const [uid, packet] of [[ua, packetA], [ub, packetB]]) {
      const mon = this.activeMon(battle.players[uid]);
      if (packet.heal > 0 && mon.hp > 0) {
        const healed = Math.min(mon.maxHp - mon.hp, round5(packet.heal));
        mon.hp += healed;
        if (healed > 0) packet.lines.push(`💚 ${mon.fruit.name} recovers ${healed} HP`);
      }
    }
    if (battle.event?.endHeal) {
      for (const uid of battle.order) {
        const mon = this.activeMon(battle.players[uid]);
        if (mon.hp > 0) mon.hp = Math.min(mon.maxHp, mon.hp + battle.event.endHeal);
      }
      battle.log.push(`🌱 The Super Bloom mends both fighters for ${battle.event.endHeal}.`);
    }

    battle.log.push(...packetA.lines, ...packetB.lines);

    // Golden Hour bounty for the round's net winner.
    if (battle.event?.bounty && dealt[ua] !== dealt[ub]) {
      const winnerUid = dealt[ua] > dealt[ub] ? ua : ub;
      await this.db.addBalance(winnerUid, battle.event.bounty).catch(() => {});
      battle.log.push(`🍯 **${battle.players[winnerUid].user.displayName}** pockets the ${battle.event.bounty}-coin bounty!`);
    }

    // Momentum: net round winners build toward FIRED UP.
    for (const [uid, oppUid] of [[ua, ub], [ub, ua]]) {
      const p = battle.players[uid];
      if (dealt[uid] > dealt[oppUid]) {
        p.momentum = Math.min(config.CLASH.MOMENTUM_MAX, p.momentum + 1);
        if (p.momentum >= config.CLASH.MOMENTUM_MAX && !p.fired) {
          p.fired = true;
          p.momentum = 0;
          battle.log.push(`🔥 **${p.user.displayName} is FIRED UP** — their next hit strikes ×${config.CLASH.FIRED_MULT}!`);
        }
      } else if (dealt[uid] < dealt[oppUid]) {
        p.momentum = Math.max(0, p.momentum - 1);
      }
    }

    // Faints auto-promote the next fruit in draft order.
    for (const uid of battle.order) {
      const p = battle.players[uid];
      if (this.activeMon(p).hp <= 0) {
        battle.log.push(`💀 **${this.activeMon(p).fruit.name}** is squashed!`);
        const next = p.team.findIndex((m) => m.hp > 0);
        if (next !== -1) {
          p.active = next;
          p.shield = 0;
          battle.log.push(`🃏 **${p.user.displayName}** sends in **${this.activeMon(p).fruit.name}**!`);
        }
      }
    }

    // Win check (simultaneous KOs possible).
    const aliveA = A.team.some((m) => m.hp > 0);
    const aliveB = B.team.some((m) => m.hp > 0);
    if (!aliveA && !aliveB) {
      // Total mutual destruction — higher total damage dealt takes it.
      const winner = dealt[ua] >= dealt[ub] ? A : B;
      const loser = winner === A ? B : A;
      return this.finish(battle, winner, loser, '💥 **DOUBLE KO!** The bigger hitter takes the crown!');
    }
    if (!aliveA) return this.finish(battle, B, A, `🏁 **${A.user.displayName}** is out of fruits!`);
    if (!aliveB) return this.finish(battle, A, B, `🏁 **${B.user.displayName}** is out of fruits!`);

    await this.beginRound(battle);
  }

  // ── Timeouts & endings ───────────────────────────────────────────

  async handlePickTimeout(battle) {
    if (battle.phase !== 'pick') return;
    // Players with a draft in progress get it auto-locked.
    for (const uid of battle.order) {
      const p = battle.players[uid];
      if (p.team.length === 0 && (p.draft || []).length > 0) {
        p.team = p.draft.map((fid) => {
          const fruit = getFruit(fid);
          return { fruit, hp: fruit.hp, maxHp: fruit.hp };
        });
        p.active = 0;
        battle.log.push(`⏰ **${p.user.displayName}**'s draft auto-locked!`);
      }
    }
    const picked = Object.values(battle.players).filter((p) => p.team.length > 0);
    if (picked.length === 2) return this.startFight(battle);
    if (picked.length === 1) {
      const loser = Object.values(battle.players).find((p) => p.team.length === 0);
      await this.finish(battle, picked[0], loser, `⏰ **${loser.user.displayName}** never drafted a team — forfeit!`);
    } else {
      await this.expire(battle, 'Nobody drafted a team in time. 🍂');
    }
  }

  // Slowpokes auto-Guard so the round always resolves.
  async handleRoundTimeout(battle) {
    if (battle.phase !== 'fight' || battle.resolving) return;
    let filled = false;
    for (const uid of battle.order) {
      if (!battle.choices[uid]) {
        battle.choices[uid] = { verb: 'guard' };
        battle.log.push(`⏰ **${battle.players[uid].user.displayName}** dawdled — auto-Guard!`);
        filled = true;
      }
    }
    if (filled) await this.resolveRound(battle);
  }

  resultEmbed(battle, winner, loser) {
    return new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(`🏆 ${winner.user.displayName} wins!`)
      .setThumbnail(avatarOf(winner.user))
      .setDescription(
        `🏆 **${winner.user.displayName}** +${config.BATTLE_WIN_REWARD} ${config.CURRENCY_EMOJI}\n` +
          `💀 **${loser.user.displayName}** +${config.BATTLE_LOSS_REWARD} ${config.CURRENCY_EMOJI}`
      );
  }

  async finish(battle, winner, loser, closingLine) {
    battle.phase = 'done';
    battle.log.push(closingLine);
    await this.db.recordBattleResult(winner.user.id, loser.user.id).catch((err) => console.error('reward error:', err));

    const embed = this.resultEmbed(battle, winner, loser);
    if (battle.log.length > 0) {
      embed.addFields({ name: '📜 Battle Log', value: battle.log.slice(-6).join('\n') });
    }
    const threadNote = battle.threads.length > 0 ? { content: '🧹 *This thread will vanish in 20 seconds...*' } : {};
    for (const view of battle.views) {
      if (view.message) await view.message.edit({ embeds: [embed], components: [], ...threadNote }).catch(() => {});
      else await view.channel.send({ embeds: [embed] }).catch(() => {});
    }
    for (const a of battle.announcements) {
      await a.message.edit({ embeds: [this.resultEmbed(battle, winner, loser)], components: [] }).catch(() => {});
    }
    this.cleanup(battle);
  }

  async expire(battle, reason) {
    battle.phase = 'done';
    const embed = new EmbedBuilder().setColor(0x95a5a6).setTitle('🍂 Battle Over').setDescription(reason);
    for (const view of battle.views) {
      if (view.message) await view.message.edit({ embeds: [embed], components: [] }).catch(() => {});
    }
    for (const a of battle.announcements) {
      await a.message.edit({ embeds: [embed], components: [] }).catch(() => {});
    }
    this.cleanup(battle);
  }
}

module.exports = { BattleManager, ABILITIES };
