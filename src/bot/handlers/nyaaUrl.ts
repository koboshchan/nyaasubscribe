import type { Bot } from "grammy";
import type { BotContext } from "../context";
import type { Store } from "../../store/db";
import { extractNyaaTorrentIds, fetchNyaaView } from "../../nyaa/view";
import { DownloaderClient, TorrentAlreadyExistsError } from "../../downloader/client";
import { matchesSubscription, parseReleaseTitle } from "../../nyaa/titleParser";

export function syncSubscriptionsWithDownloadedTorrent(
  store: Store,
  details: { title: string; infoHash: string },
): void {
  for (const sub of store.listSubscriptions()) {
    const parsed = parseReleaseTitle(sub.provider, details.title);
    if (!parsed) continue;

    if (matchesSubscription(sub.provider, details.title, sub.animeName, parsed.resolution)) {
      store.markSeen(sub.id, details.infoHash);
      store.addDownloadedEpisode(sub.id, parsed.episode);
      store.clearPendingAsksForEpisode(sub.id, parsed.episode);
    }
  }
}

export async function handleNyaaUrls(ctx: BotContext, store: Store, text: string): Promise<void> {
  const ids = extractNyaaTorrentIds(text);
  if (ids.length === 0) return;

  const settings = store.getSettings();
  const downloader = settings.downloader;
  if (!downloader) {
    await ctx.reply("Downloader is not configured. Use /settings to configure your torrent client first.");
    return;
  }

  const client = new DownloaderClient(downloader);

  for (const id of ids) {
    let details;
    try {
      details = await fetchNyaaView(id);
    } catch (err) {
      console.error(`Failed to fetch Nyaa torrent #${id}:`, err);
      await ctx.reply(`Failed to fetch torrent #${id}: ${(err as Error).message}`);
      continue;
    }

    try {
      const token = await client.getToken();
      const inLibrary = await client.hasTorrent(token, details.infoHash).catch(() => false);
      if (inLibrary) {
        syncSubscriptionsWithDownloadedTorrent(store, details);
        await ctx.reply(`Torrent already exists in client library, skipping download:\n${details.title}`);
        continue;
      }

      await client.addUrl(token, details.magnet, downloader.downloadDirIndex, downloader.downloadDirPath);
      syncSubscriptionsWithDownloadedTorrent(store, details);
      await ctx.reply(`Added to downloads:\n${details.title}`);
    } catch (err) {
      if (err instanceof TorrentAlreadyExistsError) {
        syncSubscriptionsWithDownloadedTorrent(store, details);
        await ctx.reply(`Torrent already exists in client library, skipping download:\n${details.title}`);
      } else {
        console.error(`Failed to download "${details.title}":`, err);
        await ctx.reply(`Failed to download "${details.title}": ${(err as Error).message}`);
      }
    }
  }
}

export function registerNyaaUrlHandlers(bot: Bot<BotContext>, store: Store): void {
  const NYAA_URL_REGEX = /(?:https?:\/\/)?(?:www\.)?nyaa\.si\/view\/(\d+)/i;

  bot.hears(NYAA_URL_REGEX, async (ctx) => {
    if (!ctx.message?.text) return;
    await handleNyaaUrls(ctx, store, ctx.message.text);
  });

  bot.on("message:caption", async (ctx, next) => {
    if (ctx.message.caption && NYAA_URL_REGEX.test(ctx.message.caption)) {
      await handleNyaaUrls(ctx, store, ctx.message.caption);
      return;
    }
    await next();
  });
}
