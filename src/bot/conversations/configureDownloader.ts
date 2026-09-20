import { InlineKeyboard } from "grammy";
import type { Conversation } from "@grammyjs/conversations";
import type { BotContext } from "../context";
import type { Store } from "../../store/db";
import { DownloaderClient } from "../../downloader/client";
import { parseDownloaderType } from "../../config/env";
import { backToMainKeyboard } from "../keyboards";

export function configureDownloaderConversation(store: Store) {
  return async function configureDownloader(
    conversation: Conversation<BotContext>,
    ctx: BotContext,
  ): Promise<void> {
    const downloaderType = parseDownloaderType(process.env.TORRENT_DOWNLOADER);
    const isQbit = downloaderType === "q";
    const clientName = isQbit ? "qBittorrent" : "uTorrent";
    const exampleUrl = isQbit ? "http://192.168.1.162:8080" : "http://192.168.1.162:9178";

    await ctx.reply(`Send the ${clientName} base URL, for example: ${exampleUrl}`);
    const baseCtx = await conversation.waitFor("message:text");
    const baseUrl = baseCtx.message.text.trim();

    await ctx.reply(`Send the ${clientName} username.`);
    const userCtx = await conversation.waitFor("message:text");
    const username = userCtx.message.text.trim();

    await ctx.reply(`Send the ${clientName} password.`);
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
          store.updateSettings({
            downloader: {
              baseUrl,
              username,
              password,
              downloadDirIndex: 0,
              downloadDirPath: dirs[0].path,
            },
          }),
        );
        await ctx.reply(`Connected to ${clientName}. Using the only available directory: ${dirs[0].path}`, {
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
        store.updateSettings({
          downloader: {
            baseUrl,
            username,
            password,
            downloadDirIndex: dirIndex,
            downloadDirPath: dirs[dirIndex]?.path,
          },
        }),
      );
      await ctx.reply(`Downloader (${clientName}) configured. Using directory: ${dirs[dirIndex].path}`, {
        reply_markup: backToMainKeyboard(),
      });
    } catch (err) {
      await ctx.reply(`Connection test failed: ${(err as Error).message}`, {
        reply_markup: backToMainKeyboard(),
      });
    }
  };
}

