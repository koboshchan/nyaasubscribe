import type { Bot } from "grammy";
import type { InlineKeyboard } from "grammy";
import type { BotContext } from "../context";
import type { Store } from "../../store/db";
import { isProvider, isResolution } from "../../store/validation";
import {
  editProviderKeyboard,
  editResolutionKeyboard,
  isDuplicate,
  titleHtml,
  truncate,
  renderDeleteConfirm,
  renderEmptyList,
  renderSubscriptionDetails,
  renderSubscriptionList,
} from "../views/subscriptions";

// Edit the tapped message in place when we can (keeps the chat from filling up
// with one message per tap), otherwise send a fresh one.
async function show(ctx: BotContext, text: string, keyboard: InlineKeyboard): Promise<void> {
  const opts = { parse_mode: "HTML" as const, reply_markup: keyboard, link_preview_options: { is_disabled: true } };
  if (ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, opts);
      return;
    } catch (err) {
      if (String((err as Error)?.message ?? err).includes("message is not modified")) return;
    }
  }
  await ctx.reply(text, opts);
}

export async function sendSubscriptions(ctx: BotContext, store: Store, page = 0): Promise<void> {
  const subs = store.listSubscriptions();
  if (subs.length === 0) {
    const { text, keyboard } = renderEmptyList();
    await show(ctx, text, keyboard);
    return;
  }
  const { text, keyboard } = renderSubscriptionList(subs, store.getSettings(), page);
  await show(ctx, text, keyboard);
}

export async function sendSubscriptionDetails(ctx: BotContext, store: Store, id: string, page: number): Promise<void> {
  const sub = store.getSubscription(id);
  if (!sub) {
    await sendSubscriptions(ctx, store, page);
    return;
  }
  const { text, keyboard } = renderSubscriptionDetails(sub, store.getSettings(), page);
  await show(ctx, text, keyboard);
}

async function gone(ctx: BotContext, store: Store, page: number): Promise<void> {
  await ctx.answerCallbackQuery({ text: "That subscription no longer exists." }).catch(() => {});
  await sendSubscriptions(ctx, store, page);
}

export function registerSubscriptionHandlers(bot: Bot<BotContext>, store: Store): void {
  bot.command("subscriptions", (ctx) => sendSubscriptions(ctx, store));

  bot.callbackQuery("menu:subscriptions", async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendSubscriptions(ctx, store);
  });

  bot.callbackQuery("s:noop", (ctx) => ctx.answerCallbackQuery().catch(() => {}));

  bot.callbackQuery(/^s:l:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await sendSubscriptions(ctx, store, Number(ctx.match[1]));
  });

  bot.callbackQuery(/^s:v:([^:]+):(\d+)$/, async (ctx) => {
    const [, id, page] = ctx.match;
    if (!store.getSubscription(id)) return gone(ctx, store, Number(page));
    await ctx.answerCallbackQuery().catch(() => {});
    await sendSubscriptionDetails(ctx, store, id, Number(page));
  });

  // ----- delete (always confirmed) -----
  bot.callbackQuery(/^s:d:([^:]+):(\d+)$/, async (ctx) => {
    const [, id, page] = ctx.match;
    const sub = store.getSubscription(id);
    if (!sub) return gone(ctx, store, Number(page));
    await ctx.answerCallbackQuery().catch(() => {});
    const { text, keyboard } = renderDeleteConfirm(sub, Number(page));
    await show(ctx, text, keyboard);
  });

  bot.callbackQuery(/^s:dy:([^:]+):(\d+)$/, async (ctx) => {
    const [, id, page] = ctx.match;
    const sub = store.getSubscription(id);
    if (!sub) return gone(ctx, store, Number(page));
    store.removeSubscription(id);
    await ctx.answerCallbackQuery({ text: truncate(`Deleted ${sub.animeName}`, 190) }).catch(() => {});
    await sendSubscriptions(ctx, store, Number(page));
  });

  // Buttons on cards sent by older versions still say "Remove"; route them
  // through the same confirmation instead of deleting on a single tap.
  bot.callbackQuery(/^remove-sub:(.+)/, async (ctx) => {
    const id = ctx.match[1];
    const sub = store.getSubscription(id);
    if (!sub) return gone(ctx, store, 0);
    await ctx.answerCallbackQuery().catch(() => {});
    const { text, keyboard } = renderDeleteConfirm(sub, 0);
    await show(ctx, text, keyboard);
  });

  // ----- edit provider / resolution -----
  bot.callbackQuery(/^s:ep:([^:]+):(\d+)$/, async (ctx) => {
    const [, id, page] = ctx.match;
    const sub = store.getSubscription(id);
    if (!sub) return gone(ctx, store, Number(page));
    await ctx.answerCallbackQuery().catch(() => {});
    await show(ctx, `<b>${titleHtml(sub.animeName)}</b>\nChoose a provider:`, editProviderKeyboard(sub, Number(page)));
  });

  bot.callbackQuery(/^s:er:([^:]+):(\d+)$/, async (ctx) => {
    const [, id, page] = ctx.match;
    const sub = store.getSubscription(id);
    if (!sub) return gone(ctx, store, Number(page));
    await ctx.answerCallbackQuery().catch(() => {});
    await show(ctx, `<b>${titleHtml(sub.animeName)}</b>\nChoose a resolution:`, editResolutionKeyboard(sub, Number(page)));
  });

  bot.callbackQuery(/^s:(sp|sr):([^:]+):([^:]+):(\d+)$/, async (ctx) => {
    const [, kind, id, value, pageStr] = ctx.match;
    const page = Number(pageStr);
    const sub = store.getSubscription(id);
    if (!sub) return gone(ctx, store, page);
    const patch =
      kind === "sp"
        ? isProvider(value) ? { provider: value } : null
        : isResolution(value) ? { resolution: value } : null;
    if (!patch) {
      await ctx.answerCallbackQuery({ text: "Unknown option." }).catch(() => {});
      return;
    }
    if (isDuplicate(store.listSubscriptions(), { ...sub, ...patch })) {
      await ctx.answerCallbackQuery({ text: "You already have a subscription with those settings.", show_alert: true }).catch(() => {});
      return;
    }
    // Re-check: the subscription may have been deleted while the alert was up.
    if (!store.updateSubscription(id, patch)) return gone(ctx, store, page);
    await ctx.answerCallbackQuery({ text: "Saved" }).catch(() => {});
    await sendSubscriptionDetails(ctx, store, id, page);
  });

  // ----- edit title (needs free text, so it goes through a conversation) -----
  bot.callbackQuery(/^s:et:(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    if (!store.getSubscription(id)) return gone(ctx, store, 0);
    await ctx.answerCallbackQuery().catch(() => {});
    ctx.session.pendingEditTitleId = id;
    await ctx.conversation.enter("editSubscriptionTitle");
  });

  bot.callbackQuery(/^dlexisting:(.+)/, async (ctx) => {
    const id = ctx.match?.[1];
    if (!id) return;
    await ctx.answerCallbackQuery();
    ctx.session.pendingDownloadExistingId = id;
    await ctx.conversation.enter("downloadExisting");
  });
}
