// Global matchmaking queue. Players from ANY server the bot is in share one
// queue — first two waiting players get matched into private battle threads.
const { EmbedBuilder } = require('discord.js');

const QUEUE_TIMEOUT_MS = 10 * 60 * 1000;

class Matchmaking {
  constructor(battles) {
    this.battles = battles;
    this.queue = new Map(); // userId -> { user, channel, message, timer }
  }

  size() {
    return this.queue.size;
  }

  async join(message) {
    const user = message.author;
    if (this.battles.inBattle(user.id)) {
      return message.reply("⚔️ You're already in a battle!");
    }
    if (this.queue.has(user.id)) {
      return message.reply('⏳ You are already in the queue! `fqueue leave` to exit.');
    }

    // Match with the longest-waiting player, wherever they are.
    const waiting = this.queue.values().next().value;
    if (waiting && waiting.user.id !== user.id) {
      this.remove(waiting.user.id);
      await this.battles.startMatched([
        { user: waiting.user, channel: waiting.channel },
        { user, channel: message.channel },
      ]);
      return;
    }

    const entry = {
      user,
      channel: message.channel,
      message: null,
      timer: setTimeout(() => this.timeout(user.id), QUEUE_TIMEOUT_MS),
    };
    this.queue.set(user.id, entry);
    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('🔎 Searching for an opponent...')
      .setDescription(
        `**${user.displayName}** joined the matchmaking queue!\n` +
          `Matchmaking is **cross-server** — your opponent can come from any server FruitCards is in.\n\n` +
          `When a match is found, a private battle thread opens right here. \`fqueue leave\` to exit.`
      )
      .setFooter({ text: 'Queue expires after 10 minutes' });
    entry.message = await message.reply({ embeds: [embed] });
  }

  remove(userId) {
    const entry = this.queue.get(userId);
    if (!entry) return null;
    clearTimeout(entry.timer);
    this.queue.delete(userId);
    return entry;
  }

  async leave(message) {
    const entry = this.remove(message.author.id);
    if (!entry) return message.reply("You're not in the queue.");
    await message.reply('👋 Left the matchmaking queue.');
    if (entry.message) {
      const embed = new EmbedBuilder().setColor(0x95a5a6).setDescription('🍂 Left the queue.');
      await entry.message.edit({ embeds: [embed] }).catch(() => {});
    }
  }

  async timeout(userId) {
    const entry = this.remove(userId);
    if (!entry) return;
    const embed = new EmbedBuilder()
      .setColor(0x95a5a6)
      .setDescription(`🍂 No opponent found for **${entry.user.displayName}** — try \`fqueue\` again later!`);
    if (entry.message) await entry.message.edit({ embeds: [embed] }).catch(() => {});
  }
}

module.exports = { Matchmaking };
