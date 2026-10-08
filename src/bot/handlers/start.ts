import type { Bot } from "grammy";
import type { BotContext } from "../context";
import { mainMenuKeyboard } from "../keyboards";

const WELCOME = [
  "<b>Nyaa Subscribe</b>",
  "",
  "Tracks anime releases on nyaa.si from SubsPlease, Erai-raws, Tsundere-Raws, AnoZu and ToonsHub, and sends new episodes to your torrent downloader.",
].join("\n");

export function registerStartHandlers(bot: Bot<BotContext>): void {
  bot.command("start", async (ctx) => {
    await ctx.reply(WELCOME, { parse_mode: "HTML", reply_markup: mainMenuKeyboard() });
  });

  bot.callbackQuery("menu:main", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(WELCOME, { parse_mode: "HTML", reply_markup: mainMenuKeyboard() });
  });

  bot.callbackQuery("menu:add", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("addSubscription");
  });

  bot.callbackQuery("menu:downloadexisting", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("downloadExistingOneShot");
  });
}
