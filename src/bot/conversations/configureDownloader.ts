import { InlineKeyboard } from "grammy";
import type { Conversation } from "@grammyjs/conversations";
import type { BotContext } from "../context";
import type { Store } from "../../store/db";
import type { DownloaderClientType, QBitAuthMethod } from "../../store/types";
import { DownloaderClient } from "../../downloader/client";
import {
  downloaderClientChoiceKeyboard,
  qbitAuthChoiceKeyboard,
  backToMainKeyboard,
} from "../keyboards";

export function configureDownloaderConversation(store: Store) {
  return async function configureDownloader(
    conversation: Conversation<BotContext>,
    ctx: BotContext,
  ): Promise<void> {
    await ctx.reply("Choose your torrent client:", {
      reply_markup: downloaderClientChoiceKeyboard(),
    });
    const clientCtx = await conversation.waitForCallbackQuery(/^client:(ubit|qbit)$/);
    const clientType = clientCtx.callbackQuery.data.split(":")[1] as DownloaderClientType;
    await clientCtx.answerCallbackQuery();

    let baseUrl = "";
    let username: string | undefined;
    let password: string | undefined;
    let apiToken: string | undefined;
    let authMethod: QBitAuthMethod | undefined;

    if (clientType === "ubit") {
      await ctx.reply("Send the uTorrent base URL, for example: http://192.168.1.162:9178");
      const baseCtx = await conversation.waitFor("message:text");
      baseUrl = baseCtx.message.text.trim();

      await ctx.reply("Send the uTorrent username.");
      const userCtx = await conversation.waitFor("message:text");
      username = userCtx.message.text.trim();

      await ctx.reply("Send the uTorrent password.");
      const passCtx = await conversation.waitFor("message:text");
      password = passCtx.message.text.trim();
    } else {
      await ctx.reply("Choose qBittorrent authentication method:", {
        reply_markup: qbitAuthChoiceKeyboard(),
      });
      const authCtx = await conversation.waitForCallbackQuery(/^qbitauth:(password|token)$/);
      authMethod = authCtx.callbackQuery.data.split(":")[1] as QBitAuthMethod;
      await authCtx.answerCallbackQuery();

      if (authMethod === "token") {
        await ctx.reply("Send the qBittorrent base URL, for example: http://192.168.1.162:8080");
        const baseCtx = await conversation.waitFor("message:text");
        baseUrl = baseCtx.message.text.trim();

        await ctx.reply("Send your qBittorrent API token (from Web UI settings):");
        const tokenCtx = await conversation.waitFor("message:text");
        apiToken = tokenCtx.message.text.trim();
      } else {
        await ctx.reply("Send the qBittorrent base URL, for example: http://192.168.1.162:8080");
        const baseCtx = await conversation.waitFor("message:text");
        baseUrl = baseCtx.message.text.trim();

        await ctx.reply("Send the qBittorrent username.");
        const userCtx = await conversation.waitFor("message:text");
        username = userCtx.message.text.trim();

        await ctx.reply("Send the qBittorrent password.");
        const passCtx = await conversation.waitFor("message:text");
        password = passCtx.message.text.trim();
      }
    }

    await ctx.reply("Testing connection...");

    const client = new DownloaderClient({
      clientType,
      baseUrl,
      username,
      password,
      apiToken,
      authMethod,
      downloadDirIndex: 0,
    });

    const clientName = clientType === "qbit" ? "qBittorrent" : "uTorrent";

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
              clientType,
              baseUrl,
              username,
              password,
              apiToken,
              authMethod,
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
            clientType,
            baseUrl,
            username,
            password,
            apiToken,
            authMethod,
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
