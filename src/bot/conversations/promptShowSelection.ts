import type { Conversation } from "@grammyjs/conversations";
import type { BotContext } from "../context";
import type { Provider, Resolution } from "../../nyaa/types";
import { providerKeyboard, resolutionKeyboard } from "../keyboards";

export interface ShowSelection {
  animeName: string;
  provider: Provider;
  resolution: Resolution;
}

export async function promptShowSelection(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
): Promise<ShowSelection | null> {
  await ctx.reply("Send the exact release title, for example: Mushoku Tensei S3\n\nSend /cancel to abort.");
  const nameCtx = await conversation.waitFor("message:text");
  const text = nameCtx.message.text.trim();
  if (!text || text === "/cancel") {
    return null;
  }
  const animeName = text;

  await ctx.reply("Choose a provider:", { reply_markup: providerKeyboard() });
  const providerCtx = await conversation.waitForCallbackQuery(/^provider:/);
  const provider = providerCtx.callbackQuery.data.split(":")[1] as Provider;
  await providerCtx.answerCallbackQuery();

  await ctx.reply("Choose a resolution:", { reply_markup: resolutionKeyboard() });
  const resolutionCtx = await conversation.waitForCallbackQuery(/^resolution:/);
  const resolution = resolutionCtx.callbackQuery.data.split(":")[1] as Resolution;
  await resolutionCtx.answerCallbackQuery();

  return { animeName, provider, resolution };
}
