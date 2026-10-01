import { loadEnv } from "./config/env";
import { Store } from "./store/db";
import { createBot } from "./bot/index";
import { startPoller } from "./poller/index";

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

async function main(): Promise<void> {
  console.log("Starting NyaaSubscribe...");
  const env = loadEnv();
  const store = new Store();
  const bot = createBot(env.botToken, env.adminId, store);

  console.log("Connecting to Telegram API...");
  const me = await bot.api.getMe();
  console.log(`Logged in as @${me.username} (ID: ${me.id})`);
  bot.botInfo = me;

  try {
    await bot.api.deleteWebhook({ drop_pending_updates: false });
  } catch (err) {
    console.error("Warning: deleteWebhook failed:", err);
  }

  startPoller(bot, store, env.adminId);

  await bot.start({
    onStart: (botInfo) => {
      console.log(`Bot updates active as @${botInfo.username}`);
    },
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
