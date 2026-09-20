import type { Bot } from "grammy";
import type { BotContext } from "../context";
import { backToMainKeyboard } from "../keyboards";

const HELP_TEXT = [
  "Commands:",
  "/start - main menu",
  "/subscriptions - list your subscriptions",
  "/settings - configure the downloader and poll interval",
  "/help - this message",
  "",
  "How it works: add a subscription with the exact release title (for example Mushoku Tensei S3), pick a provider (SubsPlease, Erai-raws, Tsundere-Raws, or AnoZu) and a resolution (480p, 720p, or 1080p). The bot polls nyaa.si in the background and automatically sends new matching episodes to your configured downloader.",
  "",
  "AnoZu titles often carry both an English name and the original name (for example \"Love Unseen Beneath the Clear Night Sky 2026\" and \"Toumei na Yoru ni Kakeru Kimi to, Me ni Mienai Koi wo Shita\") - either one works as the subscription name. Note AnoZu uploads anonymously (no verified account), so matching relies on the [AnoZu] tag in the title rather than an uploader account.",
  "",
  "Use Download Existing from the main menu to bulk-download a show's existing episodes without creating a subscription - useful for shows that already finished airing.",
].join("\n");

export function registerHelpHandlers(bot: Bot<BotContext>): void {
  bot.command("help", async (ctx) => {
    await ctx.reply(HELP_TEXT, { reply_markup: backToMainKeyboard() });
  });

  bot.callbackQuery("menu:help", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(HELP_TEXT, { reply_markup: backToMainKeyboard() });
  });
}
