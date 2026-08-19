import type { Conversation } from "@grammyjs/conversations";
import type { BotContext } from "../context";
import type { Store } from "../../store/db";
import type { Provider, Resolution } from "../../nyaa/types";
import type { PendingAsk } from "../../store/types";
import { fetchProviderFeed } from "../../nyaa/rss";
import { matchesSubscription, parseReleaseTitle } from "../../nyaa/titleParser";
import { providerKeyboard, resolutionKeyboard, backToMainKeyboard } from "../keyboards";

export function addSubscriptionConversation(store: Store) {
  return async function addSubscription(
    conversation: Conversation<BotContext>,
    ctx: BotContext,
  ): Promise<void> {
    await ctx.reply(
      "Send the exact release title, for example: Mushoku Tensei S3\n\nSend /cancel to abort.",
    );
    const nameCtx = await conversation.waitFor("message:text");
    const text = nameCtx.message.text.trim();
    if (!text || text === "/cancel") {
      await ctx.reply("Cancelled.", { reply_markup: backToMainKeyboard() });
      return;
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
      `Subscribed:\n${animeName}\nProvider: ${provider}\nResolution: ${resolution}\n\nChecking for existing matches...`,
    );

    try {
      const items = await conversation.external(() => fetchProviderFeed(provider, animeName));
      const matches = items.filter(
        (item) => item.trusted && matchesSubscription(provider, item.title, animeName, resolution),
      );
      if (matches.length > 0) {
        await conversation.external(() => {
          for (const item of matches) {
            store.markSeen(subscription.id, item.infoHash);
            const parsed = parseReleaseTitle(provider, item.title);
            if (parsed) {
              store.addDownloadedEpisode(subscription.id, parsed.episode);
            }
          }
        });
        await ctx.reply(
          `Found ${matches.length} existing matching release(s). Those will not be downloaded automatically; only new episodes going forward will be.`,
          { reply_markup: backToMainKeyboard() },
        );
      } else {
        await ctx.reply("No matching releases yet. You'll be notified when a new episode appears.", {
          reply_markup: backToMainKeyboard(),
        });
      }
    } catch (err) {
      await ctx.reply(`Subscription saved, but the initial feed check failed: ${(err as Error).message}`, {
        reply_markup: backToMainKeyboard(),
      });
    }
  };
}
