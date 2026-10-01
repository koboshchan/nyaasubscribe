import { Bot, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import type { BotContext, SessionData } from "./context";
import type { Store } from "../store/db";
import { addSubscriptionConversation } from "./conversations/addSubscription";
import { configureDownloaderConversation } from "./conversations/configureDownloader";
import { downloadExistingConversation } from "./conversations/downloadExisting";
import { downloadExistingOneShotConversation } from "./conversations/downloadExistingOneShot";
import { registerStartHandlers } from "./handlers/start";
import { registerSubscriptionHandlers } from "./handlers/subscriptions";
import { registerSettingsHandlers } from "./handlers/settings";
import { registerHelpHandlers } from "./handlers/help";
import { registerEpisodeAskHandlers } from "./handlers/episodeAsk";
import { registerBulkAskHandlers } from "./handlers/bulkAsk";
import { registerNyaaUrlHandlers } from "./handlers/nyaaUrl";

export function createBot(token: string, adminId: number, store: Store): Bot<BotContext> {
  const bot = new Bot<BotContext>(token);

  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== adminId) return;
    await next();
  });

  bot.use(session({ initial: (): SessionData => ({}) }));

  // Register Nyaa URL handler BEFORE conversations so that any URL
  // sent directly to the chat without a command is processed immediately,
  // even if an active conversation is waiting for text input.
  registerNyaaUrlHandlers(bot, store);

  bot.use(conversations());
  bot.use(createConversation(addSubscriptionConversation(store), "addSubscription"));
  bot.use(createConversation(configureDownloaderConversation(store), "configureDownloader"));
  bot.use(createConversation(downloadExistingConversation(store), "downloadExisting"));
  bot.use(createConversation(downloadExistingOneShotConversation(store), "downloadExistingOneShot"));

  registerStartHandlers(bot);
  registerSubscriptionHandlers(bot, store);
  registerSettingsHandlers(bot, store);
  registerHelpHandlers(bot);
  registerEpisodeAskHandlers(bot, store);
  registerBulkAskHandlers(bot, store);

  bot.catch((err) => {
    console.error("Bot error:", err.error ?? err);
    if (err.stack) {
      console.error(err.stack);
    }
  });

  return bot;
}
