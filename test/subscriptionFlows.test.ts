import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// db.ts reads DATA_DIR at import time, so set it before importing the bot.
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "nyaasub-test-"));
process.env.DATA_DIR = DATA;

type Call = { method: string; payload: any };
const ADMIN = 4242;
const CHAT = { id: ADMIN, type: "private" as const, first_name: "t" };
const FROM = { id: ADMIN, is_bot: false, first_name: "t" };

let createBot: typeof import("../src/bot/index").createBot;
let Store: typeof import("../src/store/db").Store;

before(async () => {
  ({ createBot } = await import("../src/bot/index"));
  ({ Store } = await import("../src/store/db"));
});

function makeSubs(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    animeName: i === 0 ? "<Oshi no Ko>" : `Show ${i + 1}`,
    provider: "subsplease",
    resolution: "1080p",
    createdAt: "2026-07-04T18:00:00.000Z",
    seenHashes: [],
    downloadedEpisodes: [],
    pendingAsks: [],
  }));
}

async function harness(subCount: number) {
  fs.writeFileSync(
    path.join(DATA, "db.json"),
    JSON.stringify({ settings: { downloader: null, pollIntervalMinutes: 10 }, subscriptions: makeSubs(subCount) }),
  );
  const store = new Store();
  const bot = createBot("0:fake", ADMIN, store);
  const calls: Call[] = [];
  let mid = 100;
  bot.api.config.use(async (_prev, method, payload) => {
    if (method === "getMe") {
      return { ok: true, result: { id: 1, is_bot: true, first_name: "b", username: "b", can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false } } as any;
    }
    calls.push({ method, payload: JSON.parse(JSON.stringify(payload ?? {})) });
    const result = method === "sendMessage" || method === "editMessageText" ? { message_id: ++mid, date: 0, chat: CHAT, text: "" } : true;
    return { ok: true, result } as any;
  });
  await bot.init();
  let uid = 1;
  return {
    store,
    calls,
    async text(t: string) {
      const entities = t.startsWith("/") ? [{ type: "bot_command" as const, offset: 0, length: t.length }] : undefined;
      await bot.handleUpdate({ update_id: uid++, message: { message_id: ++mid, date: 0, chat: CHAT, from: FROM, text: t, entities } } as any);
    },
    async tap(data: string) {
      await bot.handleUpdate({ update_id: uid++, callback_query: { id: String(uid), from: FROM, chat_instance: "c", data, message: { message_id: 1, date: 0, chat: CHAT, text: "" } } } as any);
    },
    sent() {
      return calls.filter((c) => c.method === "sendMessage" || c.method === "editMessageText");
    },
  };
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("subscription flows (mocked Telegram API)", () => {
  it("/subscriptions sends ONE HTML message regardless of count", async () => {
    const h = await harness(12);
    await h.text("/subscriptions");
    const sent = h.sent();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].payload.parse_mode, "HTML");
    assert.match(sent[0].payload.text, /&lt;Oshi no Ko&gt;/);
  });

  it("empty state", async () => {
    const h = await harness(0);
    await h.text("/subscriptions");
    assert.match(h.sent()[0].payload.text, /Nothing tracked yet/);
  });

  it("paging edits the message in place", async () => {
    const h = await harness(12);
    await h.tap("s:l:2");
    const [msg] = h.sent();
    assert.equal(msg.method, "editMessageText");
    assert.match(msg.payload.text, /11\. Show 11/);
  });

  it("delete requires confirmation", async () => {
    const h = await harness(3);
    await h.tap(`s:d:${id(2)}:0`);
    assert.equal(h.store.listSubscriptions().length, 3, "not deleted before confirming");
    assert.match(h.sent().at(-1)!.payload.text, /Delete Show 2\?/);
    await h.tap(`s:dy:${id(2)}:0`);
    assert.deepEqual(h.store.listSubscriptions().map((s) => s.id), [id(1), id(3)]);
  });

  it("legacy remove-sub buttons now confirm instead of deleting", async () => {
    const h = await harness(2);
    await h.tap(`remove-sub:${id(1)}`);
    assert.equal(h.store.listSubscriptions().length, 2);
    assert.match(h.sent().at(-1)!.payload.text, /Delete &lt;Oshi no Ko&gt;\?/);
  });

  it("edit provider and resolution persist, keep history, and reject duplicates", async () => {
    const h = await harness(2);
    h.store.addDownloadedEpisode(id(2), "01");
    await h.tap(`s:sp:${id(2)}:erai-raws:0`);
    await h.tap(`s:sr:${id(2)}:720p:0`);
    const s = h.store.getSubscription(id(2))!;
    assert.equal(s.provider, "erai-raws");
    assert.equal(s.resolution, "720p");
    assert.deepEqual(s.downloadedEpisodes, ["01"]);

    await h.tap(`s:sp:${id(2)}:not-a-provider:0`);
    assert.equal(h.store.getSubscription(id(2))!.provider, "erai-raws");

    h.store.updateSubscription(id(1), { animeName: "Show 2", provider: "erai-raws", resolution: "1080p" });
    await h.tap(`s:sr:${id(1)}:720p:0`);
    assert.equal(h.store.getSubscription(id(1))!.resolution, "1080p", "duplicate rejected");
    const alert = h.calls.filter((c) => c.method === "answerCallbackQuery").at(-1)!;
    assert.equal(alert.payload.show_alert, true);
  });

  it("edit title through the conversation, with /cancel", async () => {
    const h = await harness(2);
    await h.tap(`s:et:${id(2)}`);
    await h.text("/cancel");
    assert.equal(h.store.getSubscription(id(2))!.animeName, "Show 2");

    await h.tap(`s:et:${id(2)}`);
    await h.text("Frieren & <Friends>");
    assert.equal(h.store.getSubscription(id(2))!.animeName, "Frieren & <Friends>");
    assert.match(h.sent().at(-1)!.payload.text, /Frieren &amp; &lt;Friends&gt;/);
  });

  it("tapping a deleted subscription falls back to the list", async () => {
    const h = await harness(2);
    await h.tap(`s:v:${id(9)}:0`);
    assert.match(h.sent().at(-1)!.payload.text, /Subscriptions<\/b> · 2/);
  });
});
