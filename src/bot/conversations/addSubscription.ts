import type { Conversation } from "@grammyjs/conversations";
import type { BotContext } from "../context";
import type { Store } from "../../store/db";
import type { PendingAsk } from "../../store/types";
import { backToMainKeyboard } from "../keyboards";
import { promptShowSelection } from "./promptShowSelection";
import { runDownloadExistingFlow } from "./downloadExistingFlow";

export function addSubscriptionConversation(store: Store) {
  return async function addSubscription(
    conversation: Conversation<BotContext>,
    ctx: BotContext,
  ): Promise<void> {
    const selection = await promptShowSelection(conversation, ctx);
    if (!selection) {
      await ctx.reply("Cancelled.", { reply_markup: backToMainKeyboard() });
      return;
    }
    const { animeName, provider, resolution } = selection;

    const alreadySubscribed = store
      .listSubscriptions()
      .some(
        (sub) =>
          sub.provider === provider &&
          sub.resolution === resolution &&
          sub.animeName.toLowerCase() === animeName.toLowerCase(),
      );
    if (alreadySubscribed) {
      await ctx.reply(
        `You're already subscribed to "${animeName}" (${provider}, ${resolution}).`,
        { reply_markup: backToMainKeyboard() },
      );
      return;
    }

    const subscription = {
      id: crypto.randomUUID(),
      animeName,
      provider,
      resolution,
      createdAt: new Date().toISOString(),
      seenHashes: [] as string[],
      downloadedEpisodes: [] as string[],
      pendingAsks: [] as PendingAsk[],
    };

    await conversation.external(() => store.addSubscription(subscription));

    await ctx.reply(
      `Subscribed:\n${animeName}\nProvider: ${provider}\nResolution: ${resolution}\n\nChecking for existing releases...`,
    );

    await runDownloadExistingFlow(conversation, ctx, store, provider, animeName, resolution, subscription.id);
  };
}
