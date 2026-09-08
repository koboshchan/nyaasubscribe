import type { Bot } from "grammy";
import type { BotContext } from "../bot/context";
import type { Store } from "../store/db";
import { fetchProviderFeed } from "../nyaa/search";
import { matchesSubscription, parseReleaseTitle, isWebRip } from "../nyaa/titleParser";
import { DownloaderClient } from "../downloader/client";
import { episodeAskKeyboard, bulkAskKeyboard } from "../bot/keyboards";
import { sendChunkedText } from "../util/chunkedText";
import type { DownloaderConfig, Subscription } from "../store/types";
import type { NyaaItem } from "../nyaa/types";

// If more matches show up in a single poll than this, it's more likely a
// backlog just becoming visible (e.g. a subscription that sat unpolled, or a
// data-source change that surfaces older releases) than genuinely new
// episodes airing at once - confirm before downloading instead of assuming.
const BULK_CATCH_UP_THRESHOLD = 3;

export function startPoller(bot: Bot<BotContext>, store: Store, adminId: number): void {
  let running = false;

  async function downloadItem(client: DownloaderClient, downloader: DownloaderConfig, item: NyaaItem): Promise<void> {
    const token = await client.getToken();
    await client.addUrl(token, item.magnet, downloader.downloadDirIndex);
  }

  async function sendBulkCatchUpPrompt(sub: Subscription, batchId: string, items: NyaaItem[]): Promise<void> {
    await sendChunkedText(
      `Found ${items.length} new matches at once for ${sub.animeName} - this looks like a backlog catch-up rather than a single new episode, so confirming before downloading:`,
      items.map((item) => `- ${item.title}`),
      (text) => bot.api.sendMessage(adminId, text),
    );
    await bot.api.sendMessage(adminId, "Download all of these now?", {
      reply_markup: bulkAskKeyboard(sub.id, batchId),
    });
  }

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
          const candidates = items.filter(
            (item) =>
              !sub.seenHashes.includes(item.infoHash) &&
              matchesSubscription(sub.provider, item.title, sub.animeName, sub.resolution),
          );

          // Erai-raws sometimes dual-releases an episode as WEB-DL (preferred) and
          // WEBRip (fallback). If a WEB-DL/plain release for the episode is present
          // in this same poll, prefer it and ignore the WEBRip entirely.
          const nonRipEpisodes = new Set(
            candidates
              .filter((item) => !isWebRip(item.title))
              .map((item) => parseReleaseTitle(sub.provider, item.title)?.episode)
              .filter((ep): ep is string => Boolean(ep)),
          );

          const downloadEligible: { item: NyaaItem; episode: string }[] = [];

          for (const item of candidates) {
            const episode = parseReleaseTitle(sub.provider, item.title)?.episode;
            if (!episode) continue;

            if (sub.downloadedEpisodes.includes(episode)) {
              // Already fulfilled (auto-picked or manually chosen) by another
              // release of this episode; ignore this variant.
              store.markSeen(sub.id, item.infoHash);
              continue;
            }

            if (isWebRip(item.title)) {
              if (nonRipEpisodes.has(episode)) {
                store.markSeen(sub.id, item.infoHash);
                continue;
              }
              if (store.hasPendingAsk(sub.id, item.infoHash)) continue;
              store.addPendingAsk(sub.id, {
                torrentId: item.torrentId,
                infoHash: item.infoHash,
                title: item.title,
                episode,
                magnet: item.magnet,
              });
              await bot.api.sendMessage(
                adminId,
                `Only a WEBRip release is available for episode ${episode}:\n${item.title}\n\nDownload it now, or wait for a WEB-DL release?`,
                { reply_markup: episodeAskKeyboard(sub.id, item.torrentId) },
              );
              continue;
            }

            downloadEligible.push({ item, episode });
          }

          if (downloadEligible.length > BULK_CATCH_UP_THRESHOLD) {
            const batchId = crypto.randomUUID();
            for (const { item, episode } of downloadEligible) {
              store.addPendingAsk(sub.id, {
                torrentId: item.torrentId,
                infoHash: item.infoHash,
                title: item.title,
                episode,
                magnet: item.magnet,
                batchId,
              });
            }
            await sendBulkCatchUpPrompt(
              sub,
              batchId,
              downloadEligible.map((d) => d.item),
            );
            continue;
          }

          for (const { item, episode } of downloadEligible) {
            try {
              await downloadItem(client, downloader, item);
              store.markSeen(sub.id, item.infoHash);
              store.addDownloadedEpisode(sub.id, episode);
              store.clearPendingAsksForEpisode(sub.id, episode);
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
