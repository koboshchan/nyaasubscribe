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
  "How it works: add a subscription with the exact release title (for example Mushoku Tensei S3), pick a provider (SubsPlease, Erai-raws, or Tsundere-Raws) and a resolution (480p, 720p, or 1080p). The bot polls nyaa.si in the background and automatically sends new matching episodes to your configured downloader.",
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
