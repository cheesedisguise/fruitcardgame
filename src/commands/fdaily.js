const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { coins, timeUntil } = require('../util');

module.exports = {
  name: 'fdaily',
  aliases: [],
  description: 'Claim your daily coins (streak bonus!)',
  usage: 'fdaily',
  async execute(message, args, ctx) {
    const result = await ctx.db.withPlayerLock(message.author.id, async (client, player) => {
      const now = Date.now();
      const last = player.last_daily ? new Date(player.last_daily).getTime() : 0;
      const elapsed = now - last;

      if (elapsed < config.DAILY_COOLDOWN_MS) {
        return { claimed: false, wait: config.DAILY_COOLDOWN_MS - elapsed };
      }
      const keepStreak = last > 0 && elapsed < config.DAILY_STREAK_WINDOW_MS;
      const streak = keepStreak ? player.daily_streak + 1 : 1;
      const bonus = Math.min((streak - 1) * config.DAILY_STREAK_BONUS, config.DAILY_STREAK_BONUS_CAP);
      const amount = config.DAILY_BASE + bonus;
      await client.query(
        `UPDATE players SET balance = balance + $2, last_daily = now(), daily_streak = $3 WHERE user_id = $1`,
        [message.author.id, amount, streak]
      );
      return { claimed: true, amount, bonus, streak, balance: Number(player.balance) + amount };
    });

    if (!result.claimed) {
      return message.reply(`⏰ You already claimed today! Come back in **${timeUntil(result.wait)}**.`);
    }
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🪙 Daily Claimed!')
      .setDescription(
        `You received ${coins(result.amount)}${result.bonus > 0 ? ` *(includes 🔥 streak bonus +${result.bonus})*` : ''}\n` +
          `🔥 Streak: **${result.streak}** day${result.streak === 1 ? '' : 's'}\n` +
          `💰 New balance: ${coins(result.balance)}`
      );
    await message.reply({ embeds: [embed] });
  },
};
