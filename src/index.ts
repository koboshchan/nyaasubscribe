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

  startPoller(bot, store, env.adminId);

  await bot.start({
    onStart: (botInfo) => {
      console.log(`Logged in as @${botInfo.username}`);
    },
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
