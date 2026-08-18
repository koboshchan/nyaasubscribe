import type { Bot } from "grammy";
import type { BotContext } from "../context";
import type { Store } from "../../store/db";
import { DownloaderClient } from "../../downloader/client";
import { resolveMagnet } from "../../nyaa/nyaaApi";

export function registerEpisodeAskHandlers(bot: Bot<BotContext>, store: Store): void {
  bot.callbackQuery(/^epdl:([^:]+):(\d+)$/, async (ctx) => {
    const subId = ctx.match?.[1];
    const torrentId = ctx.match?.[2];
    if (!subId || !torrentId) return;

    const pending = store.getPendingAsk(subId, torrentId);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: "This request is no longer pending." });
      return;
    }

    const settings = store.getSettings();
    if (!settings.downloader) {
      await ctx.answerCallbackQuery({ text: "Downloader is not configured." });
      return;
    }

    await ctx.answerCallbackQuery({ text: "Downloading..." });
    try {
      const magnet = await resolveMagnet(pending.torrentId);
      const client = new DownloaderClient(
        settings.downloader.baseUrl,
        settings.downloader.username,
        settings.downloader.password,
      );
      const token = await client.getToken();
      await client.addUrl(token, magnet, settings.downloader.downloadDirIndex);

      store.markSeen(subId, pending.infoHash);
      store.addDownloadedEpisode(subId, pending.episode);
      store.removePendingAsk(subId, torrentId);

      await ctx.editMessageText(`Downloading:\n${pending.title}`);
    } catch (err) {
      await ctx.editMessageText(`Failed to download: ${(err as Error).message}`);
    }
  });

  bot.callbackQuery(/^epskip:([^:]+):(\d+)$/, async (ctx) => {
    const subId = ctx.match?.[1];
    const torrentId = ctx.match?.[2];
    if (!subId || !torrentId) return;

    const pending = store.getPendingAsk(subId, torrentId);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: "This request is no longer pending." });
      return;
    }

    store.markSeen(subId, pending.infoHash);
    store.removePendingAsk(subId, torrentId);
    await ctx.answerCallbackQuery({ text: "Skipped" });
    await ctx.editMessageText(
      `Skipped:\n${pending.title}\n\nA WEB-DL release will still be auto-downloaded if one appears.`,
    );
  });
}
