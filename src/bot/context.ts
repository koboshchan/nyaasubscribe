import type { Context, SessionFlavor } from "grammy";
import type { ConversationFlavor } from "@grammyjs/conversations";

export interface SessionData {
  // Set right before entering the "downloadExisting" conversation, since
  // grammy's conversations plugin doesn't support passing extra arguments
  // to enter() directly.
  pendingDownloadExistingId?: string;
}

export type BotContext = Context & SessionFlavor<SessionData> & ConversationFlavor;
