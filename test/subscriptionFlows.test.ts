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

  function lastConfirm(h: Awaited<ReturnType<typeof harness>>) {
    const m = h.sent().filter((c) => /Save rename\?/.test(c.payload.text)).at(-1)!;
    const btns = m.payload.reply_markup.inline_keyboard.flat().map((b: any) => b.callback_data as string);
    return { yes: btns.find((d: string) => d.endsWith(":y"))!, no: btns.find((d: string) => d.endsWith(":n"))! };
  }

  it("rename warns first, needs explicit Save, keeps history", async () => {
    const h = await harness(2);
    h.store.addDownloadedEpisode(id(2), "01");
    h.store.markSeen(id(2), "abc");
    await h.tap(`s:et:${id(2)}`);
    const warn = h.sent().at(-1)!.payload.text;
    assert.match(warn, /same show/);
    assert.match(warn, /Add instead/);
    await h.text("Frieren & <Friends>");
    assert.equal(h.store.getSubscription(id(2))!.animeName, "Show 2", "not saved before confirming");
    const { yes } = lastConfirm(h);
    assert.match(h.sent().at(-1)!.payload.text, /Frieren &amp; &lt;Friends&gt;/);
    await h.tap(yes);
    const s = h.store.getSubscription(id(2))!;
    assert.equal(s.animeName, "Frieren & <Friends>");
    assert.deepEqual(s.downloadedEpisodes, ["01"]);
    assert.deepEqual(s.seenHashes, ["abc"]);
    assert.match(h.sent().at(-1)!.payload.text, /Renamed/);
  });

  it("rename /cancel before text, and Cancel button / stray input at confirmation", async () => {
    const h = await harness(2);
    await h.tap(`s:et:${id(2)}`);
    await h.text("/cancel");
    assert.match(h.sent().at(-1)!.payload.text, /cancelled/);
    await h.tap(`s:et:${id(2)}`);
    await h.text("New Name");
    const { no } = lastConfirm(h);
    await h.tap("s:v:whatever:0"); // swallowed with a hint while confirming
    await h.text("another title");
    assert.match(h.sent().at(-1)!.payload.text, /Save rename or Cancel/);
    await h.tap(no);
    assert.equal(h.store.getSubscription(id(2))!.animeName, "Show 2");
    await h.tap(`s:et:${id(2)}`);
    await h.text("Again");
    await h.text("/cancel");
    assert.equal(h.store.getSubscription(id(2))!.animeName, "Show 2");
  });

  it("rename rejects commands, overlong, duplicate titles with limited retries", async () => {
    const h = await harness(2);
    await h.tap(`s:et:${id(2)}`);
    await h.text("/start");
    assert.match(h.sent().at(-1)!.payload.text, /Commands don't work here.*2 left/);
    await h.text("🎌".repeat(201));
    assert.match(h.sent().at(-1)!.payload.text, /longer than 200.*1 left/);
    await h.text("<oshi no ko>"); // case-insensitive duplicate of sub 1
    assert.match(h.sent().at(-1)!.payload.text, /Too many tries/);
    assert.equal(h.store.getSubscription(id(2))!.animeName, "Show 2");
    // exactly 200 code points is accepted
    await h.tap(`s:et:${id(2)}`);
    await h.text("🎌".repeat(200));
    await h.tap(lastConfirm(h).yes);
    assert.equal([...h.store.getSubscription(id(2))!.animeName].length, 200);
  });

  it("rename handles the subscription disappearing or a duplicate appearing before Save", async () => {
    const h = await harness(3);
    await h.tap(`s:et:${id(2)}`);
    await h.text("Fresh");
    h.store.removeSubscription(id(2));
    await h.tap(lastConfirm(h).yes);
    assert.match(h.sent().at(-1)!.payload.text, /no longer exists/);
    assert.equal(h.store.listSubscriptions().length, 2);

    await h.tap(`s:et:${id(3)}`);
    await h.text("Dupe");
    h.store.updateSubscription(id(1), { animeName: "dupe" });
    await h.tap(lastConfirm(h).yes);
    assert.match(h.sent().at(-1)!.payload.text, /appeared meanwhile/);
    assert.equal(h.store.getSubscription(id(3))!.animeName, "Show 3");

    await h.tap(`s:et:${id(9)}`);
    assert.match(h.calls.filter((c) => c.method === "answerCallbackQuery").at(-1)!.payload.text, /no longer exists/);
  });

  it("provider callbacks reject prototype keys", async () => {
    const h = await harness(1);
    for (const bad of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      await h.tap(`s:sp:${id(1)}:${bad}:0`);
      assert.equal(h.store.getSubscription(id(1))!.provider, "subsplease");
      assert.match(h.calls.filter((c) => c.method === "answerCallbackQuery").at(-1)!.payload.text, /Unknown option/);
    }
    await h.tap(`s:sr:${id(1)}:constructor:0`);
    assert.equal(h.store.getSubscription(id(1))!.resolution, "1080p");
  });

  it("Store.updateSubscription only allows validated title/provider/resolution", async () => {
    const h = await harness(1);
    const s = h.store;
    assert.throws(() => s.updateSubscription(id(1), { downloadedEpisodes: [] } as any), /not editable/);
    assert.throws(() => s.updateSubscription(id(1), { id: "x" } as any), /not editable/);
    assert.throws(() => s.updateSubscription(id(1), JSON.parse('{"__proto__":{"x":1}}')), /not editable/);
    assert.throws(() => s.updateSubscription(id(1), { provider: "__proto__" as any }), /invalid provider/);
    assert.throws(() => s.updateSubscription(id(1), { resolution: "4k" as any }), /invalid resolution/);
    assert.throws(() => s.updateSubscription(id(1), { animeName: "   " }), /invalid title/);
    assert.throws(() => s.updateSubscription(id(1), { animeName: "/start" }), /invalid title/);
    assert.throws(() => s.updateSubscription(id(1), { animeName: "x".repeat(201) }), /invalid title/);
    assert.equal(s.updateSubscription(id(1), { animeName: "  Spaced   Out " })!.animeName, "Spaced Out");
    assert.equal(s.updateSubscription(id(99), { resolution: "720p" }), undefined);
    assert.equal(s.getSubscription(id(1))!.provider, "subsplease");
  });

  it("menus render as HTML; settings escapes the downloader URL", async () => {
    const h = await harness(1);
    h.store.updateSettings({ downloader: { clientType: "qbit", baseUrl: "http://h/?a=1&b=<2>", downloadDirIndex: 0 } });
    await h.text("/start");
    await h.text("/settings");
    await h.text("/help");
    const [start, settings, help] = h.sent();
    for (const m of [start, settings, help]) assert.equal(m.payload.parse_mode, "HTML");
    assert.match(settings.payload.text, /a=1&amp;b=&lt;2&gt;/);
    h.store.updateSettings({ downloader: null });
    await h.text("/settings");
    assert.match(h.sent().at(-1)!.payload.text, /not configured/);
    // only the tags we emit may appear in help
    assert.doesNotMatch(help.payload.text.replace(/<\/?(b|i|code)>/g, ""), /[<>]/);
  });

  it("tapping a deleted subscription falls back to the list", async () => {
    const h = await harness(2);
    await h.tap(`s:v:${id(9)}:0`);
    assert.match(h.sent().at(-1)!.payload.text, /Subscriptions<\/b> · 2/);
  });
});
