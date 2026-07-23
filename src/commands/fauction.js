// Global auction house. Cards are escrowed while listed; coins are escrowed
// while you are the highest bidder. Auctions run 10 minutes and are visible
// from every server the bot is in.
const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { findFruit, coins, sellValue, variantLabel, remoji, extractVariant } = require('../util');
const { getFruit } = require('../fruits');

function describeAuction(a) {
  const fruit = getFruit(a.fruit_id);
  const msLeft = new Date(a.ends_at).getTime() - Date.now();
  const mins = Math.max(0, Math.ceil(msLeft / 60000));
  const bid = a.current_bid
    ? `bid **${Number(a.current_bid).toLocaleString('en-US')}** 🪙`
    : `starting at **${Number(a.min_bid).toLocaleString('en-US')}** 🪙`;
  return `\`#${a.id}\` ${remoji(fruit.rarity)} **${fruit.name}${variantLabel(a.variant)}** — ${bid} · ⏳ ${mins}m left`;
}

module.exports = {
  name: 'fauction',
  aliases: ['fauctions', 'fbid'],
  description: 'Auction house: list cards, browse, and bid',
  usage: 'fauction <fruit> [foil] [minBid] · fauctions · fbid <id> <amount>',
  describeAuction,
  async execute(message, args, ctx) {
    const invoked = message.content.trim().split(/\s+/)[0].toLowerCase();

    // fauctions — browse open listings in the GUI (select a listing to bid)
    if (invoked === 'fauctions' || (invoked === 'fauction' && args.length === 0)) {
      const ui = require('../ui');
      return message.reply(await ui.auctionScreen(ctx, message.author));
    }

    // fbid <id> <amount>
    if (invoked === 'fbid') {
      const auctionId = parseInt((args[0] || '').replace('#', ''), 10);
      const amount = parseInt(args[1], 10);
      if (!Number.isFinite(auctionId) || !Number.isFinite(amount) || amount < 1) {
        return message.reply('Format: `fbid <auction id> <amount>` — browse ids with `fauctions`');
      }
      try {
        const auction = await ctx.db.placeBid(auctionId, message.author.id, amount);
        const fruit = getFruit(auction.fruit_id);
        return message.reply(
          `🔨 Bid placed! You're the top bidder on ${remoji(fruit.rarity)} **${fruit.name}${variantLabel(auction.variant)}** at ${coins(amount)}.\n` +
            `*Coins are held in escrow — you get them back instantly if someone outbids you.*`
        );
      } catch (err) {
        if (!err.friendly) throw err;
        const msgs = {
          'not-open': '❌ That auction is already over (or the id is wrong).',
          ended: '❌ That auction just ended — too slow!',
          'own-auction': "❌ You can't bid on your own auction!",
          poor: "❌ You don't have that many coins!",
        };
        if (err.message.startsWith('too-low:')) {
          return message.reply(`❌ Too low! The minimum bid is **${err.message.split(':')[1]}** 🪙.`);
        }
        return message.reply(msgs[err.message] || '❌ That bid didn\'t go through.');
      }
    }

    // fauction <fruit> [foil] [minBid] — create a listing
    const rest = [...args];
    let minBid = null;
    const last = rest[rest.length - 1]?.toLowerCase();
    if (/^\d+$/.test(last)) minBid = parseInt(rest.pop(), 10);
    const variant = extractVariant(rest);
    const fruit = findFruit(rest.join(' '));
    if (!fruit) return message.reply(`❓ No fruit matches "${rest.join(' ')}".`);
    if (!minBid) minBid = sellValue(fruit, variant);

    try {
      const auction = await ctx.db.createAuction(
        message.author.id,
        fruit.id,
        variant,
        minBid,
        message.channel.id,
        config.AUCTION_DURATION_MS
      );
      const embed = new EmbedBuilder()
        .setColor(0xd35400)
        .setTitle('🏛️ Auction Listed!')
        .setDescription(
          `${remoji(fruit.rarity)} **${fruit.name}${variantLabel(variant)}** is up for auction!\n` +
            `Starting bid: ${coins(minBid)} · Duration: **${Math.round(config.AUCTION_DURATION_MS / 60000)} minutes**\n\n` +
            `Anyone in any server can bid: \`fbid ${auction.id} <amount>\``
        )
        .setFooter({ text: `Auction #${auction.id} · the card is held in escrow until the hammer falls` });
      return message.reply({ embeds: [embed] });
    } catch (err) {
      if (err.friendly) return message.reply(`❌ You don't own a **${fruit.name}${variantLabel(variant)}** to auction!`);
      throw err;
    }
  },
};
