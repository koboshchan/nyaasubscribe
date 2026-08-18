import type { Bot } from "grammy";
import type { BotContext } from "../context";
import { mainMenuKeyboard } from "../keyboards";

const WELCOME =
  "Nyaa Subscribe\n\nTrack anime releases from SubsPlease and Erai-raws on nyaa.si and automatically send new episodes to your torrent downloader.";

export function registerStartHandlers(bot: Bot<BotContext>): void {
  bot.command("start", async (ctx) => {
    await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard() });
  });

  bot.callbackQuery("menu:main", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard() });
  });

  bot.callbackQuery("menu:add", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("addSubscription");
  });
}
