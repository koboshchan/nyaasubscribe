import type { Conversation } from "@grammyjs/conversations";
import type { BotContext } from "../context";
import type { Store } from "../../store/db";
import { runDownloadExistingFlow } from "./downloadExistingFlow";
import { backToMainKeyboard } from "../keyboards";

export function downloadExistingConversation(store: Store) {
  return async function downloadExisting(conversation: Conversation<BotContext>, ctx: BotContext): Promise<void> {
    const subscriptionId = ctx.session.pendingDownloadExistingId;
    ctx.session.pendingDownloadExistingId = undefined;
    if (!subscriptionId) {
      await ctx.reply("No subscription selected.", { reply_markup: backToMainKeyboard() });
      return;
    }

    const sub = await conversation.external(() => store.getSubscription(subscriptionId));
    if (!sub) {
      await ctx.reply("That subscription no longer exists.", { reply_markup: backToMainKeyboard() });
      return;
    }
    await runDownloadExistingFlow(conversation, ctx, store, sub.provider, sub.animeName, sub.resolution, sub.id);
  };
}
