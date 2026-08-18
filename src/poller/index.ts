import type { Bot } from "grammy";
import type { BotContext } from "../bot/context";
import type { Store } from "../store/db";
import { fetchProviderFeed } from "../nyaa/rss";
import { matchesSubscription } from "../nyaa/titleParser";
import { resolveMagnet } from "../nyaa/nyaaApi";
import { DownloaderClient } from "../downloader/client";

export function startPoller(bot: Bot<BotContext>, store: Store, adminId: number): void {
  let running = false;

  async function pollOnce(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const settings = store.getSettings();
      const downloader = settings.downloader;
      if (!downloader) return;

      const client = new DownloaderClient(downloader.baseUrl, downloader.username, downloader.password);

      for (const sub of store.listSubscriptions()) {
        try {
          const items = await fetchProviderFeed(sub.provider, sub.animeName);
          const newMatches = items.filter(
            (item) =>
              item.trusted &&
              !sub.seenHashes.includes(item.infoHash) &&
              matchesSubscription(sub.provider, item.title, sub.animeName, sub.resolution),
          );

          for (const item of newMatches) {
            try {
              const magnet = await resolveMagnet(item.torrentId);
              const token = await client.getToken();
              await client.addUrl(token, magnet, downloader.downloadDirIndex);
              store.markSeen(sub.id, item.infoHash);
              await bot.api.sendMessage(adminId, `New episode: ${item.title}\nAdded to downloads.`);
            } catch (err) {
              await bot.api.sendMessage(
                adminId,
                `Failed to download ${item.title}: ${(err as Error).message}`,
              );
            }
          }
        } catch (err) {
          console.error(`Feed check failed for subscription "${sub.animeName}":`, err);
        }
      }
    } finally {
      running = false;
    }
  }

  function scheduleNext(): void {
    const minutes = store.getSettings().pollIntervalMinutes;
    setTimeout(() => {
      void pollOnce().finally(scheduleNext);
    }, minutes * 60_000);
  }

  void pollOnce().finally(scheduleNext);
}
