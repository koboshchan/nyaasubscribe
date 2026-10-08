import type { Conversation } from "@grammyjs/conversations";
import type { BotContext } from "../context";
import type { Store } from "../../store/db";
import { backToMainKeyboard } from "../keyboards";
import { escapeHtml, isDuplicate, renderSubscriptionDetails } from "../views/subscriptions";

export function editSubscriptionTitleConversation(store: Store) {
  return async function editSubscriptionTitle(conversation: Conversation<BotContext>, ctx: BotContext): Promise<void> {
    const id = await conversation.external(() => {
      const value = ctx.session.pendingEditTitleId;
      ctx.session.pendingEditTitleId = undefined;
      return value;
    });
    const sub = id ? await conversation.external(() => store.getSubscription(id)) : undefined;
    if (!id || !sub) {
      await ctx.reply("That subscription no longer exists.", { reply_markup: backToMainKeyboard() });
      return;
    }

    await ctx.reply(
      `Current title: <code>${escapeHtml(sub.animeName)}</code>\n\nSend the new exact release title, or /cancel to keep it.`,
      { parse_mode: "HTML" },
    );
    const msg = await conversation.waitFor("message:text");
    const text = msg.message.text.trim();
    if (!text || text === "/cancel") {
      const view = await conversation.external(() => {
        const s = store.getSubscription(id);
        return s ? renderSubscriptionDetails(s, store.getSettings(), 0) : null;
      });
      await ctx.reply(view ? "Title unchanged.\n\n" + view.text : "Title unchanged.", {
        parse_mode: "HTML",
        reply_markup: view?.keyboard ?? backToMainKeyboard(),
      });
      return;
    }

    const result = await conversation.external(() => {
      const current = store.getSubscription(id);
      if (!current) return { kind: "gone" as const };
      if (isDuplicate(store.listSubscriptions(), { ...current, animeName: text })) return { kind: "dup" as const };
      const updated = store.updateSubscription(id, { animeName: text })!;
      return { kind: "ok" as const, view: renderSubscriptionDetails(updated, store.getSettings(), 0) };
    });

    if (result.kind === "gone") {
      await ctx.reply("That subscription no longer exists.", { reply_markup: backToMainKeyboard() });
    } else if (result.kind === "dup") {
      await ctx.reply(`You already have a subscription for "${text}" with the same provider and resolution. Title unchanged.`, {
        reply_markup: backToMainKeyboard(),
      });
    } else {
      await ctx.reply("✅ Title updated. Download history is kept.\n\n" + result.view.text, {
        parse_mode: "HTML",
        reply_markup: result.view.keyboard,
      });
    }
  };
}
