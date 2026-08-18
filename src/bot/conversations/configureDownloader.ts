import { InlineKeyboard } from "grammy";
import type { Conversation } from "@grammyjs/conversations";
import type { BotContext } from "../context";
import type { Store } from "../../store/db";
import { DownloaderClient } from "../../downloader/client";
import { backToMainKeyboard } from "../keyboards";

export function configureDownloaderConversation(store: Store) {
  return async function configureDownloader(
    conversation: Conversation<BotContext>,
    ctx: BotContext,
  ): Promise<void> {
    await ctx.reply("Send the downloader base URL, for example: http://192.168.1.162:9178");
    const baseCtx = await conversation.waitFor("message:text");
    const baseUrl = baseCtx.message.text.trim();

    await ctx.reply("Send the downloader username.");
    const userCtx = await conversation.waitFor("message:text");
    const username = userCtx.message.text.trim();

    await ctx.reply("Send the downloader password.");
    const passCtx = await conversation.waitFor("message:text");
    const password = passCtx.message.text.trim();

    await ctx.reply("Testing connection...");

    const client = new DownloaderClient(baseUrl, username, password);
    try {
      const token = await conversation.external(() => client.getToken());
      const dirs = await conversation.external(() => client.listDirs(token));

      if (dirs.length === 0) {
        await ctx.reply("Connected, but no download directories were returned. Cannot continue.", {
          reply_markup: backToMainKeyboard(),
        });
        return;
      }

      if (dirs.length === 1) {
        await conversation.external(() =>
          store.updateSettings({ downloader: { baseUrl, username, password, downloadDirIndex: 0 } }),
        );
        await ctx.reply(`Connected. Using the only available directory: ${dirs[0].path}`, {
          reply_markup: backToMainKeyboard(),
        });
        return;
      }

      const keyboard = new InlineKeyboard();
      dirs.forEach((dir, idx) => {
        keyboard.text(dir.path, `dir:${idx}`).row();
      });
      await ctx.reply("Choose the default download directory:", { reply_markup: keyboard });

      const dirCtx = await conversation.waitForCallbackQuery(/^dir:/);
      const dirIndex = Number(dirCtx.callbackQuery.data.split(":")[1]);
      await dirCtx.answerCallbackQuery();

      await conversation.external(() =>
        store.updateSettings({ downloader: { baseUrl, username, password, downloadDirIndex: dirIndex } }),
      );
      await ctx.reply(`Downloader configured. Using directory: ${dirs[dirIndex].path}`, {
        reply_markup: backToMainKeyboard(),
      });
    } catch (err) {
      await ctx.reply(`Connection test failed: ${(err as Error).message}`, {
        reply_markup: backToMainKeyboard(),
      });
    }
  };
}
