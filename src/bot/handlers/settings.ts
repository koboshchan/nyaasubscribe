import type { Bot } from "grammy";
import type { BotContext } from "../context";
import type { Store } from "../../store/db";
import { escapeHtml } from "../views/subscriptions";
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
  const downloader = settings.downloader;
  const lines = ["<b>Settings</b>", ""];
  if (downloader) {
    const clientName = downloader.clientType === "qbit" ? "qBittorrent" : "uTorrent";
    const authType = downloader.apiToken ? "API token" : "password";
    lines.push(
      `Downloader: ${clientName}`,
      `URL: <code>${escapeHtml(downloader.baseUrl)}</code>`,
      `Auth: ${authType}`,
    );
  } else {
    lines.push("Downloader: not configured", "<i>Subscriptions are paused until you set one up.</i>");
  }
  lines.push("", `Poll interval: every ${settings.pollIntervalMinutes} min`);
  await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: settingsKeyboard() });
}
