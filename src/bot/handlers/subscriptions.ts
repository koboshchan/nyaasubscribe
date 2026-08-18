import type { Bot } from "grammy";
import type { BotContext } from "../context";
import type { Store } from "../../store/db";
import { subscriptionCardKeyboard, backToMainKeyboard } from "../keyboards";

export function registerSubscriptionHandlers(bot: Bot<BotContext>, store: Store): void {
  bot.command("subscriptions", (ctx) => sendSubscriptions(ctx, store));

  bot.callbackQuery("menu:subscriptions", async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendSubscriptions(ctx, store);
  });

  bot.callbackQuery(/^remove-sub:(.+)/, async (ctx) => {
    const id = ctx.match?.[1];
    if (!id) return;
    store.removeSubscription(id);
    await ctx.answerCallbackQuery({ text: "Removed" });
    await ctx.editMessageText("Subscription removed.");
  });
}

async function sendSubscriptions(ctx: BotContext, store: Store): Promise<void> {
  const subs = store.listSubscriptions();
  if (subs.length === 0) {
    await ctx.reply("No subscriptions yet. Use Add Subscription to create one.", {
      reply_markup: backToMainKeyboard(),
    });
    return;
  }

  for (const sub of subs) {
    const text = [
      sub.animeName,
      `Provider: ${sub.provider}`,
      `Resolution: ${sub.resolution}`,
      `Added: ${new Date(sub.createdAt).toLocaleDateString()}`,
    ].join("\n");
    await ctx.reply(text, { reply_markup: subscriptionCardKeyboard(sub) });
  }
  await ctx.reply("Use the menu to add more or go back.", { reply_markup: backToMainKeyboard() });
}
