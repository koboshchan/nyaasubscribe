import { loadEnv } from "./config/env";
import { Store } from "./store/db";
import { createBot } from "./bot/index";
import { startPoller } from "./poller/index";

async function main(): Promise<void> {
  const env = loadEnv();
  const store = new Store();
  const bot = createBot(env.botToken, env.adminId, store);

  startPoller(bot, store, env.adminId);

  await bot.start({
    onStart: () => console.log("Bot started"),
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
