// Turn-based battle engine with private-thread venues.
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

const RARITY_ORDER = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
const THREAD_DELETE_DELAY_MS = 20 * 1000;

function hpBar(current, max) {
  const pct = current / max;
  const filled = Math.max(0, Math.round(pct * 10));
  const block = pct > 0.5 ? '🟩' : pct > 0.25 ? '🟨' : '🟥';
  return block.repeat(filled) + '⬛'.repeat(10 - filled);
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

  // Create a private thread (with public + no-thread fallbacks).
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
      announcements: [], // { channel, message } — origin-channel messages to update with the result
      phase: 'pick',
      turn: null,
      turnCount: 0,
      log: [],
      timer: null,
      pickOptions: {},
    };
    for (const e of entries) {
      battle.players[e.user.id] = { user: e.user, fruit: null, hp: 0, maxHp: 0 };
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
    battle.phase = 'invite';
    battle.challengeChannel = message.channel;

    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle('⚔️ Fruit Battle Challenge!')
      .setThumbnail(avatarOf(challenger))
      .setDescription(
        `**${challenger.displayName}** challenges **${opponent.displayName}** to a fruit battle!\n\n` +
          `${opponent}, do you accept? A private battle thread will open for you two.`
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

    // Announce the match in each origin channel.
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
      if (battle.views.length === 1) break; // one shared view → announce once
    }

    await this.beginPickPhase(battle);
  }

  // ── Pick phase ───────────────────────────────────────────────────

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
        .map((o) => ({
          label: `${o.fruit.name} — ATK ${o.fruit.atk} · HP ${o.fruit.hp}`,
          description: `${RARITIES[o.fruit.rarity].name} · you own ${o.qty}`,
          value: o.fruit.id,
          emoji: RARITIES[o.fruit.rarity].emoji,
        }));
    }
    // A player with no cards can't fight — auto-forfeit before menus go out.
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
      return p.fruit ? `✅ **${p.user.displayName}** locked in!` : `⏳ **${p.user.displayName}** is choosing...`;
    });
    return new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle('⚔️ Choose Your Fighters!')
      .setDescription(lines.join('\n'))
      .setFooter({ text: 'Pick a fruit from your menu below · 3 minutes' });
  }

  pickComponents(battle, view) {
    const rows = [];
    for (const uid of view.localIds) {
      const p = battle.players[uid];
      if (p.fruit) continue;
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`battle:${battle.id}:pick:${uid}`)
            .setPlaceholder(`${p.user.displayName} — choose your fighter!`)
            .addOptions(battle.pickOptions[uid])
        )
      );
    }
    return rows;
  }

  // ── Fight phase ──────────────────────────────────────────────────

  fightEmbed(battle) {
    const current = battle.players[battle.turn];
    const lines = battle.order.map((uid) => {
      const p = battle.players[uid];
      const mark = battle.turn === uid ? ' ⬅️' : '';
      return (
        `${RARITIES[p.fruit.rarity].emoji} **${p.user.displayName}** — *${p.fruit.name}*${mark}\n` +
        `${hpBar(p.hp, p.maxHp)} **${p.hp}** / ${p.maxHp} HP`
      );
    });
    return new EmbedBuilder()
      .setColor(RARITIES[current.fruit.rarity].color)
      .setTitle(`⚔️ ${battle.order.map((uid) => battle.players[uid].fruit.name).join('  vs  ')}`)
      .setThumbnail(avatarOf(current.user))
      .setDescription(lines.join('\n\n'))
      .addFields({ name: '📜 Battle Log', value: battle.log.slice(-5).join('\n') || '*The battle begins!*' })
      .setFooter({ text: `Turn ${battle.turnCount + 1} · ${current.user.displayName} is up` })
      .setImage('attachment://battle.png');
  }

  fightComponents(battle, view) {
    const current = battle.players[battle.turn];
    const local = view.localIds.includes(battle.turn);
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`battle:${battle.id}:attack`)
          .setLabel(local ? `Attack with ${current.fruit.name}!` : `⏳ Waiting for ${current.user.displayName}...`)
          .setStyle(local ? ButtonStyle.Danger : ButtonStyle.Secondary)
          .setDisabled(!local)
          .setEmoji(local ? '⚔️' : '⌛')
      ),
    ];
  }

  // Render current phase into every view (send or edit each view's message).
  async renderAllViews(battle, { files = undefined } = {}) {
    for (const view of battle.views) {
      const payload = {};
      if (battle.phase === 'pick') {
        payload.embeds = [this.pickEmbed(battle)];
        payload.components = this.pickComponents(battle, view);
      } else if (battle.phase === 'fight') {
        payload.embeds = [this.fightEmbed(battle)];
        payload.components = this.fightComponents(battle, view);
      }
      if (files) payload.files = files;
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
      else if (action === 'attack') await this.handleAttack(interaction, battle);
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
      return interaction.reply({ content: "That's your opponent's menu!", ephemeral: true });
    }
    const player = battle.players[forUserId];
    if (player.fruit) return interaction.deferUpdate();

    const fruit = getFruit(interaction.values[0]);
    player.fruit = fruit;
    player.hp = fruit.hp;
    player.maxHp = fruit.hp;
    await interaction.deferUpdate();

    const bothPicked = Object.values(battle.players).every((p) => p.fruit);
    if (!bothPicked) {
      return this.renderAllViews(battle);
    }

    battle.phase = 'fight';
    battle.turn = battle.order[crypto.randomInt(2)];
    battle.log.push(`🎲 **${battle.players[battle.turn].user.displayName}** won the coin flip and goes first!`);
    const image = await this.render.renderBattle(
      battle.players[battle.order[0]].fruit.id,
      battle.players[battle.order[1]].fruit.id
    );
    await this.renderAllViews(battle, { files: [new AttachmentBuilder(image, { name: 'battle.png' })] });
    this.setTimer(battle, config.TURN_TIMEOUT_MS, () => this.handleTurnTimeout(battle));
  }

  rollDamage(atk) {
    const variance = 1 - config.DAMAGE_VARIANCE + (crypto.randomInt(1001) / 1000) * config.DAMAGE_VARIANCE * 2;
    const crit = crypto.randomInt(100) < config.CRIT_CHANCE * 100;
    const dmg = Math.max(1, Math.round(atk * variance * (crit ? config.CRIT_MULTIPLIER : 1)));
    return { dmg, crit };
  }

  async handleAttack(interaction, battle) {
    if (battle.phase !== 'fight') return interaction.deferUpdate();
    if (interaction.user.id !== battle.turn) {
      return interaction.reply({ content: "It's not your turn!", ephemeral: true });
    }
    const attacker = battle.players[battle.turn];
    const defenderId = battle.order.find((uid) => uid !== battle.turn);
    const defender = battle.players[defenderId];

    const { dmg, crit } = this.rollDamage(attacker.fruit.atk);
    defender.hp = Math.max(0, defender.hp - dmg);
    battle.turnCount++;
    battle.log.push(
      `${crit ? '💥 **CRIT!**' : '⚔️'} **${attacker.fruit.name}** hits **${defender.fruit.name}** for **${dmg}**!`
    );
    await interaction.deferUpdate();

    if (defender.hp <= 0) {
      return this.finish(battle, attacker, defender, `💀 **${defender.fruit.name}** is squashed!`);
    }
    battle.turn = defenderId;
    await this.renderAllViews(battle);
    this.setTimer(battle, config.TURN_TIMEOUT_MS, () => this.handleTurnTimeout(battle));
  }

  // ── Timeouts & endings ───────────────────────────────────────────

  async handlePickTimeout(battle) {
    if (battle.phase !== 'pick') return;
    const picked = Object.values(battle.players).filter((p) => p.fruit);
    if (picked.length === 1) {
      const loser = Object.values(battle.players).find((p) => !p.fruit);
      await this.finish(battle, picked[0], loser, `⏰ **${loser.user.displayName}** never picked a fighter — forfeit!`);
    } else {
      await this.expire(battle, 'Nobody picked a fighter in time. 🍂');
    }
  }

  async handleTurnTimeout(battle) {
    if (battle.phase !== 'fight') return;
    const loser = battle.players[battle.turn];
    const winner = Object.values(battle.players).find((p) => p.user.id !== battle.turn);
    await this.finish(battle, winner, loser, `⏰ **${loser.user.displayName}** took too long — forfeit!`);
  }

  resultEmbed(battle, winner, loser) {
    return new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(`🏆 ${winner.user.displayName} wins!`)
      .setThumbnail(avatarOf(winner.user))
      .setDescription(
        (winner.fruit && loser.fruit ? `**${winner.fruit.name}** defeats **${loser.fruit.name}**!\n\n` : '') +
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
    // Leave a record in the origin channels (threads get deleted).
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

module.exports = { BattleManager };
