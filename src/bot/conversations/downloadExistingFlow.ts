import type { Conversation } from "@grammyjs/conversations";
import type { BotContext } from "../context";
import type { Store } from "../../store/db";
import type { NyaaItem, Provider, Resolution } from "../../nyaa/types";
import { fetchProviderFeed } from "../../nyaa/rss";
import { matchesSubscription, parseReleaseTitle, isWebRip } from "../../nyaa/titleParser";
import { resolveMagnet } from "../../nyaa/nyaaApi";
import { DownloaderClient } from "../../downloader/client";
import { backToMainKeyboard, confirmDownloadAllKeyboard } from "../keyboards";

const MAX_MESSAGE_CHARS = 3500;

async function sendChunked(ctx: BotContext, header: string, lines: string[]): Promise<void> {
  let chunk = header;
  for (const line of lines) {
    if (chunk.length + line.length + 1 > MAX_MESSAGE_CHARS) {
      await ctx.reply(chunk);
      chunk = line;
    } else {
      chunk += "\n" + line;
    }
  }
  if (chunk) await ctx.reply(chunk);
}

export async function runDownloadExistingFlow(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
  store: Store,
  subscriptionId: string,
  provider: Provider,
  animeName: string,
  resolution: Resolution,
): Promise<void> {
  let items: NyaaItem[];
  try {
    items = await conversation.external(() => fetchProviderFeed(provider, animeName));
  } catch (err) {
    await ctx.reply(`Feed check failed: ${(err as Error).message}`, { reply_markup: backToMainKeyboard() });
    return;
  }

  const sub = await conversation.external(() => store.getSubscription(subscriptionId));
  const seenHashes = sub?.seenHashes ?? [];
  const downloadedEpisodes = sub?.downloadedEpisodes ?? [];

  const matches = items.filter(
    (item) => !seenHashes.includes(item.infoHash) && matchesSubscription(provider, item.title, animeName, resolution),
  );

  if (matches.length === 0) {
    await ctx.reply("No existing releases found. You'll be notified when a new episode appears.", {
      reply_markup: backToMainKeyboard(),
    });
    return;
  }

  // Keep one release per episode, preferring a non-WEBRip (WEB-DL/plain)
  // encode when both exist. Everything else is a redundant duplicate that
  // never needs the user's attention.
  const byEpisode = new Map<string, NyaaItem>();
  const superseded: NyaaItem[] = [];
  for (const item of matches) {
    const episode = parseReleaseTitle(provider, item.title)?.episode;
    if (!episode || downloadedEpisodes.includes(episode)) {
      superseded.push(item);
      continue;
    }
    const existing = byEpisode.get(episode);
    if (!existing) {
      byEpisode.set(episode, item);
    } else if (isWebRip(existing.title) && !isWebRip(item.title)) {
      superseded.push(existing);
      byEpisode.set(episode, item);
    } else {
      superseded.push(item);
    }
  }

  await conversation.external(() => {
    for (const item of superseded) {
      store.markSeen(subscriptionId, item.infoHash);
    }
  });

  const toDownload = [...byEpisode.values()].sort((a, b) => a.title.localeCompare(b.title));

  if (toDownload.length === 0) {
    await ctx.reply("No existing releases found. You'll be notified when a new episode appears.", {
      reply_markup: backToMainKeyboard(),
    });
    return;
  }

  await sendChunked(
    ctx,
    `Found ${toDownload.length} existing episode(s) for ${animeName}:`,
    toDownload.map((item) => `- ${item.title}`),
  );
  await ctx.reply("Download all of these now?", { reply_markup: confirmDownloadAllKeyboard() });

  const confirmCtx = await conversation.waitForCallbackQuery(/^dlall:(yes|no)$/);
  const wantsDownload = confirmCtx.callbackQuery.data === "dlall:yes";
  await confirmCtx.answerCallbackQuery();

  if (!wantsDownload) {
    await conversation.external(() => {
      for (const item of toDownload) {
        store.markSeen(subscriptionId, item.infoHash);
        const episode = parseReleaseTitle(provider, item.title)?.episode;
        if (episode) store.addDownloadedEpisode(subscriptionId, episode);
      }
    });
    await ctx.reply(
      "Skipped. Those will not be downloaded automatically; only new episodes going forward will be.",
      { reply_markup: backToMainKeyboard() },
    );
    return;
  }

  const settings = await conversation.external(() => store.getSettings());
  if (!settings.downloader) {
    await ctx.reply("Downloader is not configured. Set it up in Settings, then retry from Subscriptions.", {
      reply_markup: backToMainKeyboard(),
    });
    return;
  }
  const downloader = settings.downloader;

  await ctx.reply(`Downloading ${toDownload.length} episode(s)...`);
  const client = new DownloaderClient(downloader.baseUrl, downloader.username, downloader.password);

  let succeeded = 0;
  const failures: string[] = [];
  for (const item of toDownload) {
    try {
      const magnet = await conversation.external(() => resolveMagnet(item.torrentId));
      const token = await conversation.external(() => client.getToken());
      await conversation.external(() => client.addUrl(token, magnet, downloader.downloadDirIndex));

      const episode = parseReleaseTitle(provider, item.title)?.episode;
      await conversation.external(() => {
        store.markSeen(subscriptionId, item.infoHash);
        if (episode) store.addDownloadedEpisode(subscriptionId, episode);
      });
      succeeded++;
    } catch (err) {
      failures.push(`${item.title}: ${(err as Error).message}`);
    }
  }

  await sendChunked(
    ctx,
    `Downloaded ${succeeded}/${toDownload.length} episode(s).`,
    failures.map((f) => `- ${f}`),
  );
  await ctx.reply("Done.", { reply_markup: backToMainKeyboard() });
}
