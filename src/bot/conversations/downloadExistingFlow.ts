import type { Conversation } from "@grammyjs/conversations";
import type { BotContext } from "../context";
import type { Store } from "../../store/db";
import type { NyaaItem, Provider, Resolution } from "../../nyaa/types";
import { fetchProviderFeed } from "../../nyaa/search";
import { matchesSubscription, parseReleaseTitle, isWebRip } from "../../nyaa/titleParser";
import { DownloaderClient } from "../../downloader/client";
import { backToMainKeyboard, confirmDownloadAllKeyboard } from "../keyboards";
import { sendChunkedText } from "../../util/chunkedText";

export async function runDownloadExistingFlow(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
  store: Store,
  provider: Provider,
  animeName: string,
  resolution: Resolution,
  // Omit when this is a one-off download with no subscription behind it
  // (e.g. a show that already finished airing) - in that case there's no
  // seen/downloaded state to check or update, since there's no future poll
  // to protect from re-downloading.
  subscriptionId?: string,
): Promise<void> {
  let items: NyaaItem[];
  try {
    items = await conversation.external(() => fetchProviderFeed(provider, animeName));
  } catch (err) {
    await ctx.reply(`Feed check failed: ${(err as Error).message}`, { reply_markup: backToMainKeyboard() });
    return;
  }

  const sub = subscriptionId
    ? await conversation.external(() => store.getSubscription(subscriptionId))
    : undefined;
  const seenHashes = sub?.seenHashes ?? [];
  const downloadedEpisodes = sub?.downloadedEpisodes ?? [];

  const matches = items.filter(
    (item) => !seenHashes.includes(item.infoHash) && matchesSubscription(provider, item.title, animeName, resolution),
  );

  const noneFoundMessage = subscriptionId
    ? "No existing releases found. You'll be notified when a new episode appears."
    : "No existing releases found.";

  if (matches.length === 0) {
    await ctx.reply(noneFoundMessage, { reply_markup: backToMainKeyboard() });
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

  if (subscriptionId) {
    await conversation.external(() => {
      for (const item of superseded) {
        store.markSeen(subscriptionId, item.infoHash);
      }
    });
  }

  const toDownload = [...byEpisode.values()].sort((a, b) => a.title.localeCompare(b.title));

  if (toDownload.length === 0) {
    await ctx.reply(noneFoundMessage, { reply_markup: backToMainKeyboard() });
    return;
  }

  await sendChunkedText(
    `Found ${toDownload.length} existing episode(s) for ${animeName}:`,
    toDownload.map((item) => `- ${item.title}`),
    (text) => ctx.reply(text),
  );
  await ctx.reply("Download all of these now?", { reply_markup: confirmDownloadAllKeyboard() });

  const confirmCtx = await conversation.waitForCallbackQuery(/^dlall:(yes|no)$/);
  const wantsDownload = confirmCtx.callbackQuery.data === "dlall:yes";
  await confirmCtx.answerCallbackQuery();

  if (!wantsDownload) {
    if (subscriptionId) {
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
    } else {
      await ctx.reply("Skipped.", { reply_markup: backToMainKeyboard() });
    }
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
      const token = await conversation.external(() => client.getToken());
      await conversation.external(() => client.addUrl(token, item.magnet, downloader.downloadDirIndex));

      if (subscriptionId) {
        const episode = parseReleaseTitle(provider, item.title)?.episode;
        await conversation.external(() => {
          store.markSeen(subscriptionId, item.infoHash);
          if (episode) store.addDownloadedEpisode(subscriptionId, episode);
        });
      }
      succeeded++;
    } catch (err) {
      failures.push(`${item.title}: ${(err as Error).message}`);
    }
  }

  await sendChunkedText(
    `Downloaded ${succeeded}/${toDownload.length} episode(s).`,
    failures.map((f) => `- ${f}`),
    (text) => ctx.reply(text),
  );
  await ctx.reply("Done.", { reply_markup: backToMainKeyboard() });
}
