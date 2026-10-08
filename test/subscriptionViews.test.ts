import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  escapeHtml,
  paginate,
  truncate,
  renderSubscriptionList,
  renderEmptyList,
  renderSubscriptionDetails,
  renderDeleteConfirm,
  editProviderKeyboard,
  editResolutionKeyboard,
  subscriptionStatus,
  latestDownloadedEpisode,
  isDuplicate,
  PAGE_SIZE,
} from "../src/bot/views/subscriptions";
import type { Settings, Subscription } from "../src/store/types";

const configured: Settings = { downloader: { baseUrl: "http://x", downloadDirIndex: 0 }, pollIntervalMinutes: 15 };
const unconfigured: Settings = { downloader: null, pollIntervalMinutes: 10 };

function sub(n: number, over: Partial<Subscription> = {}): Subscription {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    animeName: `Show ${n}`,
    provider: "subsplease",
    resolution: "1080p",
    createdAt: "2026-07-04T18:00:00.000Z",
    seenHashes: [],
    downloadedEpisodes: [],
    pendingAsks: [],
    ...over,
  };
}

function callbacks(kb: { inline_keyboard: { callback_data?: string; text: string }[][] }) {
  return kb.inline_keyboard.flat().map((b) => b.callback_data ?? "");
}

describe("escapeHtml", () => {
  it("escapes &, <, > (ampersand first)", () => {
    assert.equal(escapeHtml("<Oshi no Ko> & <b>"), "&lt;Oshi no Ko&gt; &amp; &lt;b&gt;");
    assert.equal(escapeHtml("&lt;"), "&amp;lt;");
  });
  it("leaves quotes and plain text alone", () => {
    assert.equal(escapeHtml(`Re:Zero "S4" it's`), `Re:Zero "S4" it's`);
  });
});

describe("truncate", () => {
  it("keeps short text and cuts long text with an ellipsis, code-point safe", () => {
    assert.equal(truncate("abc", 5), "abc");
    assert.equal(truncate("abcdefgh", 5), "abcd…");
    assert.equal([...truncate("🎌🎌🎌🎌🎌🎌", 4)].length, 4);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 12 }, (_, i) => i);
  it("splits into pages of PAGE_SIZE", () => {
    const p = paginate(items, 1);
    assert.equal(p.totalPages, Math.ceil(12 / PAGE_SIZE));
    assert.deepEqual(p.items, items.slice(PAGE_SIZE, PAGE_SIZE * 2));
    assert.equal(p.start, PAGE_SIZE);
  });
  it("clamps out-of-range and junk pages", () => {
    assert.equal(paginate(items, 99).page, 2);
    assert.equal(paginate(items, -3).page, 0);
    assert.equal(paginate(items, Number.NaN).page, 0);
  });
  it("has one page when empty", () => {
    assert.deepEqual(paginate([], 0), { items: [], page: 0, totalPages: 1, start: 0 });
  });
});

describe("status", () => {
  it("is paused without a downloader, even with pending asks", () => {
    const s = sub(1, { pendingAsks: [{ torrentId: "1", infoHash: "h", title: "t", episode: "01", magnet: "m" }] });
    assert.equal(subscriptionStatus(s, unconfigured), "paused");
    assert.equal(subscriptionStatus(s, configured), "needs-you");
    assert.equal(subscriptionStatus(sub(2), configured), "watching");
  });
  it("finds the numerically latest episode", () => {
    assert.equal(latestDownloadedEpisode(sub(1, { downloadedEpisodes: ["10", "02", "9"] })), "10");
    assert.equal(latestDownloadedEpisode(sub(1)), undefined);
  });
});

describe("renderSubscriptionList", () => {
  const subs = Array.from({ length: 7 }, (_, i) => sub(i + 1));

  it("shows only one page of items and a pager", () => {
    const { text, keyboard } = renderSubscriptionList(subs, configured, 0);
    assert.match(text, /Show 1\b/);
    assert.doesNotMatch(text, /Show 6\b/);
    const cbs = callbacks(keyboard);
    assert.ok(cbs.includes("s:l:1"));
    assert.ok(!cbs.includes("s:l:-1"));
    assert.equal(cbs.filter((c) => c.startsWith("s:v:")).length, PAGE_SIZE);
  });

  it("last page links back and numbers continue", () => {
    const { text, keyboard } = renderSubscriptionList(subs, configured, 1);
    assert.match(text, /<b>6\. Show 6<\/b>/);
    assert.ok(callbacks(keyboard).includes("s:l:0"));
    assert.ok(!callbacks(keyboard).includes("s:l:2"));
  });

  it("no pager for a single page", () => {
    const { keyboard } = renderSubscriptionList(subs.slice(0, 3), configured, 0);
    assert.ok(!callbacks(keyboard).some((c) => c.startsWith("s:l:") || c === "s:noop"));
  });

  it("escapes titles in text but not in button labels", () => {
    const { text, keyboard } = renderSubscriptionList([sub(1, { animeName: "<Oshi no Ko> & co" })], configured, 0);
    assert.match(text, /&lt;Oshi no Ko&gt; &amp; co/);
    assert.doesNotMatch(text, /<Oshi/);
    assert.equal(keyboard.inline_keyboard[0][0].text, "1. <Oshi no Ko> & co");
  });

  it("warns and offers setup when downloader missing", () => {
    const { text, keyboard } = renderSubscriptionList(subs, unconfigured, 0);
    assert.match(text, /No downloader configured/);
    assert.ok(callbacks(keyboard).includes("settings:downloader"));
  });

  it("every button has non-empty text and callback_data within 64 bytes", () => {
    const long = sub(1, { animeName: "x".repeat(300) });
    const { keyboard } = renderSubscriptionList([long, ...subs], configured, 0);
    for (const b of keyboard.inline_keyboard.flat()) {
      assert.ok(b.text.trim().length > 0);
      assert.ok(Buffer.byteLength((b as { callback_data: string }).callback_data) <= 64);
    }
  });

  it("empty state has add + menu", () => {
    const { keyboard } = renderEmptyList();
    assert.deepEqual(callbacks(keyboard), ["menu:add", "menu:main"]);
  });
});

describe("renderSubscriptionDetails", () => {
  it("shows the real search query (AnoZu prefix, year stripped) and anonymous scope", () => {
    const s = sub(1, { animeName: "Love Unseen 2026", provider: "anozu" });
    const { text } = renderSubscriptionDetails(s, configured, 0);
    assert.match(text, /Query: <code>AnoZu Love Unseen<\/code>/);
    assert.match(text, /all of nyaa/);
  });

  it("shows uploader scope for account-based providers", () => {
    const { text } = renderSubscriptionDetails(sub(1, { provider: "tsundere-raws" }), configured, 0);
    assert.match(text, /uploads by <code>Tsundere-Raws<\/code>/);
  });

  it("shows latest pending match escaped, never a fabricated timestamp", () => {
    const s = sub(1, {
      pendingAsks: [
        { torrentId: "1", infoHash: "a", title: "old", episode: "01", magnet: "m" },
        { torrentId: "2", infoHash: "b", title: "[Erai-raws] <New> & 02", episode: "02", magnet: "m" },
      ],
    });
    const { text } = renderSubscriptionDetails(s, configured, 0);
    assert.match(text, /Latest saved pending match: ep 02/);
    assert.match(text, /&lt;New&gt; &amp; 02/);
    assert.doesNotMatch(text, /Last (checked|matched)/i);
  });

  it("has edit/delete/back actions that carry the page", () => {
    const s = sub(1);
    const cbs = callbacks(renderSubscriptionDetails(s, configured, 3).keyboard);
    for (const c of [`dlexisting:${s.id}`, `s:et:${s.id}`, `s:ep:${s.id}:3`, `s:er:${s.id}:3`, `s:d:${s.id}:3`, "s:l:3"]) {
      assert.ok(cbs.includes(c), c);
    }
  });

  it("delete confirm offers yes and cancel back to details", () => {
    const s = sub(1);
    assert.deepEqual(callbacks(renderDeleteConfirm(s, 2).keyboard), [`s:dy:${s.id}:2`, `s:v:${s.id}:2`]);
  });

  it("edit keyboards tick the current value and fit 64 bytes", () => {
    const s = sub(1, { provider: "tsundere-raws", resolution: "720p" });
    const pk = editProviderKeyboard(s, 12);
    assert.ok(pk.inline_keyboard.flat().some((b) => b.text === "✓ Tsundere-Raws"));
    const rk = editResolutionKeyboard(s, 12);
    assert.ok(rk.inline_keyboard.flat().some((b) => b.text === "✓ 720p"));
    for (const c of [...callbacks(pk), ...callbacks(rk)]) assert.ok(Buffer.byteLength(c) <= 64, c);
  });
});

describe("isDuplicate", () => {
  it("ignores itself and compares case-insensitively", () => {
    const a = sub(1, { animeName: "Frieren" });
    const b = sub(2, { animeName: "Other" });
    assert.equal(isDuplicate([a, b], { ...a }), false);
    assert.equal(isDuplicate([a, b], { ...b, animeName: "FRIEREN" }), true);
    assert.equal(isDuplicate([a, b], { ...b, animeName: "FRIEREN", resolution: "720p" }), false);
  });
});
