import type { Bot } from "grammy";
import type { BotContext } from "../context";
import { backToMainKeyboard } from "../keyboards";

const HELP_TEXT = [
  "<b>❓ Help</b>",
  "",
  "<b>Commands</b>",
  "/start - main menu",
  "/subscriptions - list, edit and delete subscriptions",
  "/settings - downloader and poll interval",
  "/help - this message",
  "",
  "<b>How it works</b>",
  "Add a subscription with the exact release title (e.g. <code>Mushoku Tensei S3</code>), then pick a provider (SubsPlease, Erai-raws, Tsundere-Raws, AnoZu or ToonsHub) and a resolution (480p, 720p or 1080p). The bot polls nyaa.si in the background and sends new matching episodes to your downloader.",
  "",
  "Tap a show in /subscriptions to see its exact search query and progress, rename it (same show, history kept; use Add for a different show), change provider or resolution, or delete it.",
  "",
  "<b>AnoZu and ToonsHub</b>",
  "Their titles often carry both an English and an original name (e.g. <code>Love Unseen Beneath the Clear Night Sky 2026</code> and <code>Toumei na Yoru ni Kakeru Kimi to, Me ni Mienai Koi wo Shita</code>); either works as the subscription name. They upload anonymously, so matching relies on their title tags rather than an uploader account.",
  "",
  "<b>Download existing</b>",
  "Bulk-download a show's existing episodes without creating a subscription, handy for shows that already finished airing.",
].join("\n");

export function registerHelpHandlers(bot: Bot<BotContext>): void {
  bot.command("help", async (ctx) => {
    await ctx.reply(HELP_TEXT, { parse_mode: "HTML", reply_markup: backToMainKeyboard() });
  });

  bot.callbackQuery("menu:help", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(HELP_TEXT, { parse_mode: "HTML", reply_markup: backToMainKeyboard() });
  });
}
