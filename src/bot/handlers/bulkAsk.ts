import type { Bot } from "grammy";
import type { BotContext } from "../context";
import type { Store } from "../../store/db";
import { DownloaderClient } from "../../downloader/client";
import { sendChunkedText } from "../../util/chunkedText";

export function registerBulkAskHandlers(bot: Bot<BotContext>, store: Store): void {
  bot.callbackQuery(/^bulkdl:([^:]+):([^:]+)$/, async (ctx) => {
    const subId = ctx.match?.[1];
    const batchId = ctx.match?.[2];
    if (!subId || !batchId) return;

    const items = store.getPendingAsksByBatch(subId, batchId);
    if (items.length === 0) {
      await ctx.answerCallbackQuery({ text: "This batch is no longer pending." });
      return;
    }

    const settings = store.getSettings();
    if (!settings.downloader) {
      await ctx.answerCallbackQuery({ text: "Downloader is not configured." });
      return;
    }
    const downloader = settings.downloader;

    await ctx.answerCallbackQuery({ text: "Downloading..." });
    await ctx.editMessageText(`Downloading ${items.length} episode(s)...`);

    const client = new DownloaderClient(downloader.baseUrl, downloader.username, downloader.password);

    let succeeded = 0;
    const failures: string[] = [];
    for (const item of items) {
      try {
        const token = await client.getToken();
        await client.addUrl(token, item.magnet, downloader.downloadDirIndex);
        store.markSeen(subId, item.infoHash);
        store.addDownloadedEpisode(subId, item.episode);
        succeeded++;
      } catch (err) {
        failures.push(`${item.title}: ${(err as Error).message}`);
      }
    }
    store.removePendingAsksByBatch(subId, batchId);

    await sendChunkedText(
      `Downloaded ${succeeded}/${items.length} episode(s).`,
      failures.map((f) => `- ${f}`),
      (text) => ctx.reply(text),
    );
  });

  bot.callbackQuery(/^bulkskip:([^:]+):([^:]+)$/, async (ctx) => {
    const subId = ctx.match?.[1];
    const batchId = ctx.match?.[2];
    if (!subId || !batchId) return;

    const items = store.getPendingAsksByBatch(subId, batchId);
    if (items.length === 0) {
      await ctx.answerCallbackQuery({ text: "This batch is no longer pending." });
      return;
    }

    for (const item of items) {
      store.markSeen(subId, item.infoHash);
      store.addDownloadedEpisode(subId, item.episode);
    }
    store.removePendingAsksByBatch(subId, batchId);

    await ctx.answerCallbackQuery({ text: "Skipped" });
    await ctx.editMessageText(`Skipped ${items.length} episode(s). They will not be downloaded automatically.`);
  });
}
