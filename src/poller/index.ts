import type { Bot } from "grammy";
import type { BotContext } from "../bot/context";
import type { Store } from "../store/db";
import { fetchProviderFeed } from "../nyaa/rss";
import { matchesSubscription, parseReleaseTitle, isWebRip } from "../nyaa/titleParser";
import { resolveMagnet } from "../nyaa/nyaaApi";
import { DownloaderClient } from "../downloader/client";
import { episodeAskKeyboard } from "../bot/keyboards";
import type { DownloaderConfig } from "../store/types";
import type { NyaaItem } from "../nyaa/types";

export function startPoller(bot: Bot<BotContext>, store: Store, adminId: number): void {
  let running = false;

  async function downloadItem(client: DownloaderClient, downloader: DownloaderConfig, item: NyaaItem): Promise<void> {
    const magnet = await resolveMagnet(item.torrentId);
    const token = await client.getToken();
    await client.addUrl(token, magnet, downloader.downloadDirIndex);
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
              });
              await bot.api.sendMessage(
                adminId,
                `Only a WEBRip release is available for episode ${episode}:\n${item.title}\n\nDownload it now, or wait for a WEB-DL release?`,
                { reply_markup: episodeAskKeyboard(sub.id, item.torrentId) },
              );
              continue;
            }

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
