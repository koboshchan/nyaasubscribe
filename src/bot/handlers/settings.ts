import type { Bot } from "grammy";
import type { BotContext } from "../context";
import type { Store } from "../../store/db";
import { settingsKeyboard, pollIntervalKeyboard, backToMainKeyboard } from "../keyboards";

export function registerSettingsHandlers(bot: Bot<BotContext>, store: Store): void {
  bot.command("settings", (ctx) => sendSettings(ctx, store));

  bot.callbackQuery("menu:settings", async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendSettings(ctx, store);
  });

  bot.callbackQuery("settings:downloader", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("configureDownloader");
  });

  bot.callbackQuery("settings:poll", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Choose a poll interval:", { reply_markup: pollIntervalKeyboard() });
  });

  bot.callbackQuery(/^poll:(\d+)/, async (ctx) => {
    const minutes = Number(ctx.match?.[1]);
    store.updateSettings({ pollIntervalMinutes: minutes });
    await ctx.answerCallbackQuery({ text: `Poll interval set to ${minutes} min` });
    await ctx.reply(`Poll interval set to ${minutes} minutes.`, { reply_markup: backToMainKeyboard() });
  });
}

async function sendSettings(ctx: BotContext, store: Store): Promise<void> {
  const settings = store.getSettings();
  const downloaderStatus = settings.downloader
    ? `Configured (${settings.downloader.baseUrl})`
    : "Not configured";
  const text = [
    "Settings",
    `Downloader: ${downloaderStatus}`,
    `Poll interval: ${settings.pollIntervalMinutes} minutes`,
  ].join("\n");
  await ctx.reply(text, { reply_markup: settingsKeyboard() });
}
