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

export function extractTorrentIdsFromContext(ctx: BotContext): string[] {
  const msg = ctx.message;
  if (!msg) return [];

  const text = [msg.text, msg.caption].filter(Boolean).join("\n");
  const allEntities = [...(msg.entities ?? []), ...(msg.caption_entities ?? [])];
  const entityUrls = allEntities
    .filter((e): e is typeof e & { url: string } => e.type === "text_link" && "url" in e && typeof e.url === "string")
    .map((e) => e.url)
    .join("\n");

  const combined = `${text}\n${entityUrls}`;
  return extractNyaaTorrentIds(combined);
}

export async function handleNyaaUrls(ctx: BotContext, store: Store, ids: string[]): Promise<void> {
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
  // 1. Explicit /download or /dl command with URL or torrent ID
  bot.command(["download", "dl"], async (ctx) => {
    const text = ctx.message?.text ?? "";
    const arg = text.replace(/^\/(?:download|dl)(?:@\w+)?\s*/i, "").trim();
    let ids = extractTorrentIdsFromContext(ctx);
    if (ids.length === 0 && /^\d+$/.test(arg)) {
      ids = [arg];
    }

    if (ids.length === 0) {
      await ctx.reply("Please provide a Nyaa URL or torrent ID, for example:\n/download https://nyaa.si/view/1800000");
      return;
    }

    await handleNyaaUrls(ctx, store, ids);
  });

  // 2. Direct message handler: if any message (sent without a command, or with caption)
  // contains a nyaa view URL, process and add it immediately
  bot.on("message", async (ctx, next) => {
    const text = ctx.message?.text ?? "";
    if (/^\/(?:download|dl)(?:@\w+)?\b/i.test(text)) {
      // Handled by bot.command above
      await next();
      return;
    }

    const ids = extractTorrentIdsFromContext(ctx);
    if (ids.length > 0) {
      await handleNyaaUrls(ctx, store, ids);
      return;
    }

    await next();
  });
}
