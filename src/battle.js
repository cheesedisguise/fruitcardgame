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
const { getFruit, RARITIES } = require('./fruits');
const { remoji } = require('./util');

const RARITY_ORDER = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
const THREAD_DELETE_DELAY_MS = 20 * 1000;

// Ability archetypes referenced by fruit.ability in the catalog.
const ABILITIES = {
  smash: { name: 'Smash', emoji: '💥', desc: 'A crushing blow for 1.8× ATK' },
  regrow: { name: 'Regrow', emoji: '💚', desc: 'Heal 45% of max HP' },
  pierce: { name: 'Pierce', emoji: '🗡️', desc: '1.2× ATK that ignores shields' },
  drain: { name: 'Drain', emoji: '🧛', desc: '0.9× ATK, heal half the damage dealt' },
  flurry: { name: 'Flurry', emoji: '🌪️', desc: 'Two rapid hits of 0.75× ATK' },
  ripen: { name: 'Ripen', emoji: '📈', desc: 'Your team gains +5 ATK for the battle' },
};

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
      turn: null,
      turnCount: 0,
      pendingReplace: null, // uid that must send in a new fruit
      switching: null, // uid mid-switch (choosing a bench target)
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
      battle.pickOptions[uid] = rows
        .map((r) => ({ fruit: getFruit(r.fruit_id), qty: r.quantity }))
        .filter((o) => o.fruit)
        .sort((a, b) => {
          const ra = RARITY_ORDER.indexOf(a.fruit.rarity) - RARITY_ORDER.indexOf(b.fruit.rarity);
          return ra !== 0 ? ra : b.fruit.atk - a.fruit.atk;
        })
        .slice(0, 25)
        .map((o) => {
          const ab = ABILITIES[o.fruit.ability];
          return {
            label: `${o.fruit.name} — ATK ${o.fruit.atk} · HP ${o.fruit.hp}`,
            description: `${RARITIES[o.fruit.rarity].name} · ${ab.emoji} ${ab.name}`,
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

  pickEmbed(battle) {
    const lines = battle.order.map((uid) => {
      const p = battle.players[uid];
      return p.team.length > 0
        ? `✅ **${p.user.displayName}** locked in a team of ${p.team.length}!`
        : `⏳ **${p.user.displayName}** is drafting...`;
    });
    return new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle('🃏 Draft Your Team!')
      .setDescription(
        lines.join('\n') +
          `\n\nPick **up to ${config.TEAM_SIZE} fruits**. The first is your opener; the rest wait on the bench.\n` +
          `⚡ You gain 1 power per turn: Attack/Block/Switch cost 1, Abilities cost ${config.ABILITY_COST}, Charge banks +1.`
      )
      .setFooter({ text: 'Draft from the menu below · 3 minutes' });
  }

  pickComponents(battle, view) {
    const rows = [];
    for (const uid of view.localIds) {
      const p = battle.players[uid];
      if (p.team.length > 0) continue;
      const options = battle.pickOptions[uid];
      const n = Math.min(config.TEAM_SIZE, options.length);
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`battle:${battle.id}:pick:${uid}`)
            .setPlaceholder(`${p.user.displayName} — draft your team (${n})!`)
            .setMinValues(n)
            .setMaxValues(n)
            .addOptions(options)
        )
      );
    }
    return rows;
  }

  // ── Fight rendering ──────────────────────────────────────────────

  activeMon(p) {
    return p.team[p.active];
  }

  effectiveAtk(p) {
    return this.activeMon(p).fruit.atk + p.atkBonus;
  }

  playerBlock(battle, uid) {
    const p = battle.players[uid];
    const mon = this.activeMon(p);
    const ab = ABILITIES[mon.fruit.ability];
    const turnMark = battle.phase === 'fight' && battle.turn === uid ? ' ⬅️' : '';
    const lines = [
      `${remoji(mon.fruit.rarity)} **${p.user.displayName}** — *${mon.fruit.name}* (${ab.emoji} ${ab.name})${turnMark}`,
      `${hpBar(mon.hp, mon.maxHp)} **${mon.hp}**/${mon.maxHp}` +
        `  ⚡${p.power}` +
        (p.shield > 0 ? `  🛡️${p.shield}` : '') +
        (p.atkBonus > 0 ? `  📈+${p.atkBonus}` : ''),
    ];
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
    const current = battle.players[battle.turn];
    const activeA = this.activeMon(battle.players[battle.order[0]]);
    const activeB = this.activeMon(battle.players[battle.order[1]]);
    return new EmbedBuilder()
      .setColor(RARITIES[this.activeMon(current).fruit.rarity].color)
      .setTitle(`⚔️ ${activeA.fruit.name}  vs  ${activeB.fruit.name}`)
      .setThumbnail(avatarOf(current.user))
      .setDescription(battle.order.map((uid) => this.playerBlock(battle, uid)).join('\n\n'))
      .addFields({ name: '📜 Battle Log', value: battle.log.slice(-5).join('\n') || '*The battle begins!*' })
      .setFooter({ text: `Turn ${battle.turnCount + 1} · ${current.user.displayName} is up` })
      .setImage('attachment://battle.png');
  }

  fightComponents(battle, view) {
    const turnPlayer = battle.players[battle.turn];
    const local = view.localIds.includes(battle.turn);

    // Fainted active: that player must send in a replacement.
    if (battle.pendingReplace) {
      const rp = battle.players[battle.pendingReplace];
      if (view.localIds.includes(battle.pendingReplace)) {
        const buttons = rp.team
          .map((m, i) => ({ m, i }))
          .filter(({ m, i }) => i !== rp.active && m.hp > 0)
          .map(({ m, i }) =>
            new ButtonBuilder()
              .setCustomId(`battle:${battle.id}:replace:${i}`)
              .setLabel(`Send in ${m.fruit.name} (${m.hp} HP)`)
              .setStyle(ButtonStyle.Primary)
              .setEmoji(remoji(m.fruit.rarity))
          );
        return [new ActionRowBuilder().addComponents(buttons.slice(0, 5))];
      }
      return [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`battle:${battle.id}:noop`)
            .setLabel(`⌛ ${rp.user.displayName} is sending in a new fruit...`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        ),
      ];
    }

    if (!local) {
      return [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`battle:${battle.id}:noop`)
            .setLabel(`⌛ Waiting for ${turnPlayer.user.displayName}...`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        ),
      ];
    }

    // Mid-switch: choosing a bench target.
    if (battle.switching === battle.turn) {
      const p = turnPlayer;
      const buttons = p.team
        .map((m, i) => ({ m, i }))
        .filter(({ m, i }) => i !== p.active && m.hp > 0)
        .map(({ m, i }) =>
          new ButtonBuilder()
            .setCustomId(`battle:${battle.id}:switchto:${i}`)
            .setLabel(`${m.fruit.name} (${m.hp} HP)`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji(remoji(m.fruit.rarity))
        );
      buttons.push(
        new ButtonBuilder().setCustomId(`battle:${battle.id}:cancelswitch`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
      );
      return [new ActionRowBuilder().addComponents(buttons.slice(0, 5))];
    }

    const p = turnPlayer;
    const mon = this.activeMon(p);
    const ab = ABILITIES[mon.fruit.ability];
    const benchAlive = p.team.some((m, i) => i !== p.active && m.hp > 0);
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`battle:${battle.id}:act:attack`)
          .setLabel('Attack ·1⚡')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('⚔️')
          .setDisabled(p.power < 1),
        new ButtonBuilder()
          .setCustomId(`battle:${battle.id}:act:block`)
          .setLabel('Block ·1⚡')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🛡️')
          .setDisabled(p.power < 1),
        new ButtonBuilder()
          .setCustomId(`battle:${battle.id}:act:ability`)
          .setLabel(`${ab.name} ·${config.ABILITY_COST}⚡`)
          .setStyle(ButtonStyle.Success)
          .setEmoji(ab.emoji)
          .setDisabled(p.power < config.ABILITY_COST),
        new ButtonBuilder()
          .setCustomId(`battle:${battle.id}:act:charge`)
          .setLabel('Charge +1⚡')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⚡'),
        new ButtonBuilder()
          .setCustomId(`battle:${battle.id}:act:switch`)
          .setLabel('Switch ·1⚡')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔄')
          .setDisabled(p.power < 1 || !benchAlive)
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
      else if (action === 'pick') await this.handlePick(interaction, battle, extra);
      else if (action === 'act') await this.handleAction(interaction, battle, extra);
      else if (action === 'switchto') await this.handleSwitchTo(interaction, battle, parseInt(extra, 10));
      else if (action === 'cancelswitch') await this.handleCancelSwitch(interaction, battle);
      else if (action === 'replace') await this.handleReplace(interaction, battle, parseInt(extra, 10));
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

  async handlePick(interaction, battle, forUserId) {
    if (battle.phase !== 'pick') return interaction.deferUpdate();
    if (interaction.user.id !== forUserId) {
      return interaction.reply({ content: "That's your opponent's draft menu!", ephemeral: true });
    }
    const player = battle.players[forUserId];
    if (player.team.length > 0) return interaction.deferUpdate();

    player.team = interaction.values.map((fid) => {
      const fruit = getFruit(fid);
      return { fruit, hp: fruit.hp, maxHp: fruit.hp };
    });
    player.active = 0;
    await interaction.deferUpdate();

    const bothPicked = Object.values(battle.players).every((p) => p.team.length > 0);
    if (!bothPicked) {
      return this.renderAllViews(battle);
    }

    battle.phase = 'fight';
    battle.turn = battle.order[crypto.randomInt(2)];
    const first = battle.players[battle.turn];
    first.power = Math.min(config.POWER_CAP, first.power + 1);
    battle.log.push(`🎲 **${first.user.displayName}** won the coin flip and goes first! (+1⚡)`);
    await this.renderAllViews(battle);
    this.setTimer(battle, config.TURN_TIMEOUT_MS, () => this.handleTurnTimeout(battle));
  }

  rollDamage(base) {
    const variance = 1 - config.DAMAGE_VARIANCE + (crypto.randomInt(1001) / 1000) * config.DAMAGE_VARIANCE * 2;
    const crit = crypto.randomInt(100) < config.CRIT_CHANCE * 100;
    const dmg = Math.max(1, Math.round(base * variance * (crit ? config.CRIT_MULTIPLIER : 1)));
    return { dmg, crit };
  }

  // Apply damage to the defender (shield soaks first unless piercing).
  // Returns a description fragment.
  dealDamage(battle, defenderId, dmg, { pierce = false } = {}) {
    const d = battle.players[defenderId];
    let absorbed = 0;
    if (!pierce && d.shield > 0) {
      absorbed = Math.min(d.shield, dmg);
      d.shield -= absorbed;
      dmg -= absorbed;
    }
    const mon = this.activeMon(d);
    mon.hp = Math.max(0, mon.hp - dmg);
    return { dealt: dmg, absorbed, fainted: mon.hp === 0 };
  }

  async handleAction(interaction, battle, verb) {
    if (battle.phase !== 'fight' || battle.pendingReplace) return interaction.deferUpdate();
    if (interaction.user.id !== battle.turn) {
      return interaction.reply({ content: "It's not your turn!", ephemeral: true });
    }
    const p = battle.players[battle.turn];
    const defenderId = battle.order.find((uid) => uid !== battle.turn);
    const mon = this.activeMon(p);
    const atk = this.effectiveAtk(p);
    let endTurn = true;

    if (verb === 'attack') {
      if (p.power < 1) return interaction.deferUpdate();
      p.power -= 1;
      const { dmg, crit } = this.rollDamage(atk);
      const res = this.dealDamage(battle, defenderId, dmg);
      battle.log.push(
        `${crit ? '💥 **CRIT!**' : '⚔️'} **${mon.fruit.name}** hits for **${res.dealt}**` +
          (res.absorbed > 0 ? ` (🛡️ blocked ${res.absorbed})` : '') + '!'
      );
    } else if (verb === 'block') {
      if (p.power < 1) return interaction.deferUpdate();
      p.power -= 1;
      const gained = Math.max(1, Math.round(atk * config.BLOCK_SHIELD_RATIO));
      p.shield += gained;
      battle.log.push(`🛡️ **${mon.fruit.name}** braces — +${gained} shield (${p.shield} total)!`);
    } else if (verb === 'charge') {
      p.power = Math.min(config.POWER_CAP, p.power + 1);
      battle.log.push(`⚡ **${mon.fruit.name}** charges up! (${p.power}⚡ banked)`);
    } else if (verb === 'switch') {
      if (p.power < 1) return interaction.deferUpdate();
      battle.switching = battle.turn;
      await interaction.deferUpdate();
      return this.renderAllViews(battle); // show bench choices, turn continues
    } else if (verb === 'ability') {
      if (p.power < config.ABILITY_COST) return interaction.deferUpdate();
      p.power -= config.ABILITY_COST;
      const kind = mon.fruit.ability;
      const ab = ABILITIES[kind];
      if (kind === 'smash') {
        const { dmg, crit } = this.rollDamage(atk * 1.8);
        const res = this.dealDamage(battle, defenderId, dmg);
        battle.log.push(`${ab.emoji} **${mon.fruit.name}** uses ${ab.name}${crit ? ' — **CRIT!**' : ''} — **${res.dealt}** damage!`);
      } else if (kind === 'regrow') {
        const heal = Math.round(mon.maxHp * 0.45);
        mon.hp = Math.min(mon.maxHp, mon.hp + heal);
        battle.log.push(`${ab.emoji} **${mon.fruit.name}** uses ${ab.name} — restores **${heal}** HP!`);
      } else if (kind === 'pierce') {
        const { dmg, crit } = this.rollDamage(atk * 1.2);
        const res = this.dealDamage(battle, defenderId, dmg, { pierce: true });
        battle.log.push(`${ab.emoji} **${mon.fruit.name}** uses ${ab.name}${crit ? ' — **CRIT!**' : ''} — **${res.dealt}** damage, straight through the shield!`);
      } else if (kind === 'drain') {
        const { dmg, crit } = this.rollDamage(atk * 0.9);
        const res = this.dealDamage(battle, defenderId, dmg);
        const heal = Math.round(res.dealt / 2);
        mon.hp = Math.min(mon.maxHp, mon.hp + heal);
        battle.log.push(`${ab.emoji} **${mon.fruit.name}** uses ${ab.name}${crit ? ' — **CRIT!**' : ''} — **${res.dealt}** damage, drinks back **${heal}** HP!`);
      } else if (kind === 'flurry') {
        let total = 0;
        let crits = 0;
        for (let i = 0; i < 2; i++) {
          const { dmg, crit } = this.rollDamage(atk * 0.75);
          const res = this.dealDamage(battle, defenderId, dmg);
          total += res.dealt;
          if (crit) crits++;
          if (res.fainted) break;
        }
        battle.log.push(`${ab.emoji} **${mon.fruit.name}** uses ${ab.name}${crits ? ` — ${crits} CRIT${crits > 1 ? 'S' : ''}!` : ''} — two hits for **${total}**!`);
      } else if (kind === 'ripen') {
        p.atkBonus += 5;
        battle.log.push(`${ab.emoji} **${mon.fruit.name}** uses ${ab.name} — the team gains **+5 ATK** (now +${p.atkBonus})!`);
      }
    } else {
      return interaction.deferUpdate();
    }

    await interaction.deferUpdate();
    if (endTurn) await this.endTurn(battle, defenderId);
  }

  async handleSwitchTo(interaction, battle, idx) {
    if (battle.phase !== 'fight' || battle.switching !== interaction.user.id) return interaction.deferUpdate();
    const p = battle.players[interaction.user.id];
    const target = p.team[idx];
    if (!target || target.hp <= 0 || idx === p.active || p.power < 1) return interaction.deferUpdate();
    p.power -= 1;
    p.shield = 0; // shields belong to the fielded fruit's stance
    battle.switching = null;
    p.active = idx;
    battle.log.push(`🔄 **${p.user.displayName}** sends in **${target.fruit.name}**!`);
    await interaction.deferUpdate();
    const defenderId = battle.order.find((uid) => uid !== battle.turn);
    await this.endTurn(battle, defenderId);
  }

  async handleCancelSwitch(interaction, battle) {
    if (battle.switching !== interaction.user.id) return interaction.deferUpdate();
    battle.switching = null;
    await interaction.deferUpdate();
    await this.renderAllViews(battle);
  }

  async handleReplace(interaction, battle, idx) {
    if (battle.phase !== 'fight' || battle.pendingReplace !== interaction.user.id) return interaction.deferUpdate();
    const p = battle.players[interaction.user.id];
    const target = p.team[idx];
    if (!target || target.hp <= 0 || idx === p.active) return interaction.deferUpdate();
    p.active = idx;
    p.shield = 0;
    battle.pendingReplace = null;
    battle.log.push(`🃏 **${p.user.displayName}** sends in **${target.fruit.name}**!`);
    await interaction.deferUpdate();
    await this.renderAllViews(battle);
    this.setTimer(battle, config.TURN_TIMEOUT_MS, () => this.handleTurnTimeout(battle));
  }

  // Pass the turn to nextId (the defender of the action just taken).
  async endTurn(battle, nextId) {
    const next = battle.players[nextId];
    const prev = battle.players[battle.turn];
    battle.turnCount++;

    // Did the action just faint the defender's active fruit?
    if (this.activeMon(next).hp <= 0) {
      const alive = next.team.filter((m) => m.hp > 0);
      battle.log.push(`💀 **${this.activeMon(next).fruit.name}** is squashed!`);
      if (alive.length === 0) {
        return this.finish(battle, prev, next, `🏁 **${next.user.displayName}** is out of fruits!`);
      }
      battle.turn = nextId;
      next.power = Math.min(config.POWER_CAP, next.power + 1);
      if (alive.length === 1) {
        next.active = next.team.findIndex((m) => m.hp > 0);
        next.shield = 0;
        battle.log.push(`🃏 **${next.user.displayName}** sends in **${this.activeMon(next).fruit.name}**!`);
      } else {
        battle.pendingReplace = nextId;
      }
      await this.renderAllViews(battle);
      this.setTimer(battle, config.TURN_TIMEOUT_MS, () => this.handleTurnTimeout(battle));
      return;
    }

    battle.turn = nextId;
    next.power = Math.min(config.POWER_CAP, next.power + 1);
    await this.renderAllViews(battle);
    this.setTimer(battle, config.TURN_TIMEOUT_MS, () => this.handleTurnTimeout(battle));
  }

  // ── Timeouts & endings ───────────────────────────────────────────

  async handlePickTimeout(battle) {
    if (battle.phase !== 'pick') return;
    const picked = Object.values(battle.players).filter((p) => p.team.length > 0);
    if (picked.length === 1) {
      const loser = Object.values(battle.players).find((p) => p.team.length === 0);
      await this.finish(battle, picked[0], loser, `⏰ **${loser.user.displayName}** never drafted a team — forfeit!`);
    } else {
      await this.expire(battle, 'Nobody drafted a team in time. 🍂');
    }
  }

  async handleTurnTimeout(battle) {
    if (battle.phase !== 'fight') return;
    const loserId = battle.pendingReplace || battle.turn;
    const loser = battle.players[loserId];
    const winner = Object.values(battle.players).find((p) => p.user.id !== loserId);
    await this.finish(battle, winner, loser, `⏰ **${loser.user.displayName}** took too long — forfeit!`);
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
