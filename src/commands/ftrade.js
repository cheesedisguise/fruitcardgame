// Card-for-card trading with an accept step.
// ftrade @user give <fruit> [foil] [xN] get <fruit> [foil] [xN]
const crypto = require('crypto');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const { findFruit, variantLabel, remoji } = require('../util');

const pending = new Map(); // tradeId -> trade

function parseSide(tokens) {
  const rest = [...tokens];
  let variant = 'normal';
  let qty = 1;
  const foilIdx = rest.findIndex((t) => t.toLowerCase() === 'foil');
  if (foilIdx !== -1) {
    variant = 'foil';
    rest.splice(foilIdx, 1);
  }
  const last = rest[rest.length - 1]?.toLowerCase();
  const m = last?.match(/^x?(\d+)$/);
  if (m) {
    qty = Math.max(1, Math.min(99, parseInt(m[1], 10)));
    rest.pop();
  }
  const fruit = findFruit(rest.join(' '));
  return fruit ? { fruit, variant, qty } : null;
}

function sideText(side) {
  return `${remoji(side.fruit.rarity)} **${side.qty}× ${side.fruit.name}${variantLabel(side.variant)}**`;
}

module.exports = {
  name: 'ftrade',
  aliases: [],
  description: 'Trade cards with another player',
  usage: 'ftrade @user give <fruit> [foil] [xN] get <fruit> [foil] [xN]',
  pending,
  async execute(message, args, ctx) {
    const partner = message.mentions.users.first();
    if (!partner || partner.bot || partner.id === message.author.id) {
      return message.reply('Trade with who? Try `ftrade @friend give apple get banana`');
    }
    const tokens = args.filter((a) => !/^<@!?\d+>$/.test(a));
    const giveIdx = tokens.findIndex((t) => t.toLowerCase() === 'give');
    const getIdx = tokens.findIndex((t) => t.toLowerCase() === 'get');
    if (giveIdx === -1 || getIdx === -1 || getIdx < giveIdx) {
      return message.reply('Format: `ftrade @friend give <your fruit> [foil] [xN] get <their fruit> [foil] [xN]`');
    }
    const give = parseSide(tokens.slice(giveIdx + 1, getIdx));
    const get = parseSide(tokens.slice(getIdx + 1));
    if (!give || !get) return message.reply("❓ I couldn't identify those fruits. Check the names and try again!");

    const id = crypto.randomBytes(5).toString('hex');
    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('🤝 Trade Offer')
      .setDescription(
        `**${message.author.displayName}** offers ${sideText(give)}\n` +
          `**${partner.displayName}** gives ${sideText(get)}\n\n` +
          `${partner}, do you accept?`
      )
      .setFooter({ text: 'Offer expires in 3 minutes' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`trade:${id}:accept`).setLabel('Accept').setStyle(ButtonStyle.Success).setEmoji('🤝'),
      new ButtonBuilder().setCustomId(`trade:${id}:decline`).setLabel('Decline').setStyle(ButtonStyle.Danger)
    );
    const msg = await message.reply({ embeds: [embed], components: [row] });
    const trade = {
      id,
      from: message.author,
      to: partner,
      give,
      get,
      message: msg,
      timer: setTimeout(async () => {
        pending.delete(id);
        const expired = new EmbedBuilder().setColor(0x95a5a6).setDescription('🍂 Trade offer expired.');
        await msg.edit({ embeds: [expired], components: [] }).catch(() => {});
      }, config.TRADE_TIMEOUT_MS),
    };
    pending.set(id, trade);
  },

  async handleComponent(interaction, ctx) {
    const [, id, action] = interaction.customId.split(':');
    const trade = pending.get(id);
    if (!trade) {
      return interaction.reply({ content: 'That trade is no longer active.', ephemeral: true }).catch(() => {});
    }
    if (interaction.user.id !== trade.to.id) {
      return interaction.reply({ content: 'Only the other trader can respond to this offer!', ephemeral: true });
    }
    clearTimeout(trade.timer);
    pending.delete(id);

    if (action === 'decline') {
      const embed = new EmbedBuilder()
        .setColor(0x95a5a6)
        .setDescription(`🏳️ **${trade.to.displayName}** declined the trade.`);
      return interaction.update({ embeds: [embed], components: [] });
    }

    try {
      await ctx.db.executeTrade(
        trade.from.id,
        { fruitId: trade.give.fruit.id, variant: trade.give.variant, qty: trade.give.qty },
        trade.to.id,
        { fruitId: trade.get.fruit.id, variant: trade.get.variant, qty: trade.get.qty }
      );
    } catch (err) {
      if (err.friendly) {
        const who = err.message.includes(trade.from.id) ? trade.from.displayName : trade.to.displayName;
        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setDescription(`❌ Trade failed — **${who}** doesn't have the offered cards anymore.`);
        return interaction.update({ embeds: [embed], components: [] });
      }
      throw err;
    }

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🤝 Trade Complete!')
      .setDescription(
        `**${trade.from.displayName}** traded ${sideText(trade.give)}\n` +
          `for **${trade.to.displayName}**'s ${sideText(trade.get)}`
      );
    await interaction.update({ embeds: [embed], components: [] });
  },
};
