import { Bot, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import type { BotContext } from "./context";
import type { Store } from "../store/db";
import { addSubscriptionConversation } from "./conversations/addSubscription";
import { configureDownloaderConversation } from "./conversations/configureDownloader";
import { registerStartHandlers } from "./handlers/start";
import { registerSubscriptionHandlers } from "./handlers/subscriptions";
import { registerSettingsHandlers } from "./handlers/settings";
import { registerHelpHandlers } from "./handlers/help";
import { registerEpisodeAskHandlers } from "./handlers/episodeAsk";

export function createBot(token: string, adminId: number, store: Store): Bot<BotContext> {
  const bot = new Bot<BotContext>(token);

  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== adminId) return;
    await next();
  });

  bot.use(session({ initial: () => ({}) }));
  bot.use(conversations());
  bot.use(createConversation(addSubscriptionConversation(store), "addSubscription"));
  bot.use(createConversation(configureDownloaderConversation(store), "configureDownloader"));

  registerStartHandlers(bot);
  registerSubscriptionHandlers(bot, store);
  registerSettingsHandlers(bot, store);
  registerHelpHandlers(bot);
  registerEpisodeAskHandlers(bot, store);

  bot.catch((err) => {
    console.error("Bot error:", err.error);
  });

  return bot;
}
