import type { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import type { BotContext } from "../context";
import type { Store } from "../../store/db";
import { MAX_TITLE_CHARS, checkTitle } from "../../store/validation";
import { backToMainKeyboard } from "../keyboards";
import { isDuplicate, renderSubscriptionDetails, titleHtml } from "../views/subscriptions";

export const MAX_TITLE_ATTEMPTS = 3;

// Rename = same show, new search title. History (downloaded episodes, seen
// hashes, pending matches) is kept on purpose; a different show belongs in Add.
export function editSubscriptionTitleConversation(store: Store) {
  return async function editSubscriptionTitle(conversation: Conversation<BotContext>, ctx: BotContext): Promise<void> {
    const id = await conversation.external(() => {
      const value = ctx.session.pendingEditTitleId;
      ctx.session.pendingEditTitleId = undefined;
      return value;
    });
    const sub = id ? await conversation.external(() => store.getSubscription(id)) : undefined;
    const goneReply = () => ctx.reply("That subscription no longer exists. Nothing was renamed.", { reply_markup: backToMainKeyboard() });
    if (!id || !sub) {
      await goneReply();
      return;
    }

    const detailsReply = async (prefix: string) => {
      const view = await conversation.external(() => {
        const s = store.getSubscription(id);
        return s ? renderSubscriptionDetails(s, store.getSettings(), 0) : null;
      });
      await ctx.reply(view ? prefix + "\n\n" + view.text : prefix, {
        parse_mode: "HTML",
        reply_markup: view?.keyboard ?? backToMainKeyboard(),
      });
    };

    const eps = sub.downloadedEpisodes.length;
    await ctx.reply(
      [
        "<b>Rename this subscription</b>",
        `Current title: <code>${titleHtml(sub.animeName)}</code>`,
        "",
        `⚠️ Renaming keeps this as the <b>same show</b>: its download history (${eps} episode${eps === 1 ? "" : "s"}) and pending matches stay attached. Only use it to fix or change the search title.`,
        "Tracking a <b>different show</b>? Use ➕ Add instead.",
        "",
        `Send the new title (max ${MAX_TITLE_CHARS} characters), or /cancel.`,
      ].join("\n"),
      { parse_mode: "HTML" },
    );

    let newTitle: string | undefined;
    for (let attempt = 1; attempt <= MAX_TITLE_ATTEMPTS && !newTitle; attempt++) {
      const msg = await conversation.waitFor("message:text");
      const text = msg.message.text.trim();
      if (text === "/cancel" || text.startsWith("/cancel@")) {
        await detailsReply("Rename cancelled. Title unchanged.");
        return;
      }
      const check = checkTitle(text);
      let problem: string | undefined;
      if (!check.ok) {
        problem =
          check.reason === "too-long"
            ? `That's longer than ${MAX_TITLE_CHARS} characters.`
            : check.reason === "command"
              ? "Commands don't work here. Send a plain title, or /cancel."
              : "The title can't be empty.";
      } else {
        const verdict = await conversation.external(() => {
          const current = store.getSubscription(id);
          if (!current) return "gone" as const;
          if (current.animeName === check.value) return "same" as const;
          if (isDuplicate(store.listSubscriptions(), { ...current, animeName: check.value })) return "dup" as const;
          return "ok" as const;
        });
        if (verdict === "gone") {
          await goneReply();
          return;
        }
        if (verdict === "same") problem = "That's already the current title.";
        else if (verdict === "dup") problem = "You already have a subscription with that title, provider and resolution.";
        else newTitle = check.value;
      }
      if (problem) {
        const left = MAX_TITLE_ATTEMPTS - attempt;
        if (left === 0) {
          await detailsReply(`${problem} Too many tries, title unchanged.`);
          return;
        }
        await ctx.reply(`${problem} Try again (${left} left), or /cancel.`);
      }
    }
    if (!newTitle) return;

    const nonce = await conversation.external(() => Math.random().toString(36).slice(2, 10));
    await ctx.reply(
      [
        "<b>Save rename?</b>",
        `From: <code>${titleHtml(sub.animeName)}</code>`,
        `To: <code>${titleHtml(newTitle)}</code>`,
        "",
        "History is kept. Nothing changes until you tap Save.",
      ].join("\n"),
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text("✅ Save rename", `s:rn:${nonce}:y`).text("Cancel", `s:rn:${nonce}:n`),
      },
    );

    let confirmed: boolean | undefined;
    while (confirmed === undefined) {
      const next = await conversation.wait();
      const data = next.callbackQuery?.data;
      if (data === `s:rn:${nonce}:y` || data === `s:rn:${nonce}:n`) {
        await next.answerCallbackQuery().catch(() => {});
        confirmed = data.endsWith(":y");
      } else if (next.message?.text?.trim().startsWith("/cancel")) {
        confirmed = false;
      } else if (next.callbackQuery) {
        await next.answerCallbackQuery({ text: "Tap Save rename or Cancel first (or send /cancel)." }).catch(() => {});
      } else {
        await next.reply("Tap ✅ Save rename or Cancel above, or send /cancel.");
      }
    }
    if (!confirmed) {
      await detailsReply("Rename cancelled. Title unchanged.");
      return;
    }

    const title = newTitle;
    const result = await conversation.external(() => {
      const current = store.getSubscription(id);
      if (!current) return "gone" as const;
      if (isDuplicate(store.listSubscriptions(), { ...current, animeName: title })) return "dup" as const;
      return store.updateSubscription(id, { animeName: title }) ? ("ok" as const) : ("gone" as const);
    });
    if (result === "gone") await goneReply();
    else if (result === "dup") await detailsReply("A matching subscription appeared meanwhile. Title unchanged.");
    else await detailsReply("✅ Renamed. Download history is kept.");
  };
}
