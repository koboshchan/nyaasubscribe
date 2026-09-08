import type { Conversation } from "@grammyjs/conversations";
import type { BotContext } from "../context";
import type { Store } from "../../store/db";
import { backToMainKeyboard } from "../keyboards";
import { promptShowSelection } from "./promptShowSelection";
import { runDownloadExistingFlow } from "./downloadExistingFlow";

export function downloadExistingOneShotConversation(store: Store) {
  return async function downloadExistingOneShot(
    conversation: Conversation<BotContext>,
    ctx: BotContext,
  ): Promise<void> {
    const selection = await promptShowSelection(conversation, ctx);
    if (!selection) {
      await ctx.reply("Cancelled.", { reply_markup: backToMainKeyboard() });
      return;
    }
    const { animeName, provider, resolution } = selection;

    await ctx.reply(
      "Checking for existing releases... (no subscription will be created, so future episodes won't be tracked)",
    );
    await runDownloadExistingFlow(conversation, ctx, store, provider, animeName, resolution);
  };
}
