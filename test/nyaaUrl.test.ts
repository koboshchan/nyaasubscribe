import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractNyaaTorrentIds,
  decodeHtmlEntities,
  parseNyaaViewHtml,
  fetchNyaaView,
} from "../src/nyaa/view";
import {
  handleNyaaUrls,
  extractTorrentIdsFromContext,
  syncSubscriptionsWithDownloadedTorrent,
} from "../src/bot/handlers/nyaaUrl";
import type { Store } from "../src/store/db";
import type { Subscription, Settings } from "../src/store/types";
import type { BotContext } from "../src/bot/context";

describe("extractNyaaTorrentIds", () => {
  it("extracts ID from standard https URL", () => {
    const ids = extractNyaaTorrentIds("https://nyaa.si/view/1800000");
    assert.deepEqual(ids, ["1800000"]);
  });

  it("extracts ID from http and www URLs", () => {
    assert.deepEqual(extractNyaaTorrentIds("http://nyaa.si/view/12345"), ["12345"]);
    assert.deepEqual(extractNyaaTorrentIds("https://www.nyaa.si/view/67890"), ["67890"]);
  });

  it("extracts ID from URL without protocol scheme", () => {
    assert.deepEqual(extractNyaaTorrentIds("Check this: nyaa.si/view/99999"), ["99999"]);
  });

  it("extracts ID from URL with trailing slash, query params, and hash", () => {
    assert.deepEqual(
      extractNyaaTorrentIds("https://nyaa.si/view/112233/?param=test#comments"),
      ["112233"],
    );
  });

  it("extracts multiple unique IDs from a multiline or multi-link message", () => {
    const text = `
Here are two links:
https://nyaa.si/view/100001
https://nyaa.si/view/100002
and duplicate:
https://nyaa.si/view/100001
`;
    assert.deepEqual(extractNyaaTorrentIds(text), ["100001", "100002"]);
  });

  it("returns empty array when text contains no nyaa view URLs", () => {
    assert.deepEqual(extractNyaaTorrentIds("hello world"), []);
    assert.deepEqual(extractNyaaTorrentIds("https://nyaa.si/user/subsplease"), []);
    assert.deepEqual(extractNyaaTorrentIds("https://nyaa.si/?q=frieren"), []);
    assert.deepEqual(extractNyaaTorrentIds(""), []);
  });
});

describe("extractTorrentIdsFromContext", () => {
  it("extracts IDs from text, captions, and text_link entities", () => {
    const mockCtx = {
      message: {
        text: "Direct URL: https://nyaa.si/view/111111",
        caption: "Caption URL: https://nyaa.si/view/222222",
        entities: [
          { type: "text_link", url: "https://nyaa.si/view/333333" },
        ],
      },
    } as unknown as BotContext;

    const ids = extractTorrentIdsFromContext(mockCtx);
    assert.deepEqual(ids, ["111111", "222222", "333333"]);
  });

  it("returns empty array when no message or URLs present", () => {
    assert.deepEqual(extractTorrentIdsFromContext({} as unknown as BotContext), []);
    assert.deepEqual(
      extractTorrentIdsFromContext({ message: { text: "just chatting" } } as unknown as BotContext),
      [],
    );
  });
});

describe("decodeHtmlEntities", () => {
  it("decodes named entities", () => {
    assert.equal(
      decodeHtmlEntities("&lt;tag&gt; &quot;quote&quot; &amp; &#39;apostrophe&#39;"),
      `<tag> "quote" & 'apostrophe'`,
    );
  });

  it("decodes decimal and hex entities", () => {
    assert.equal(decodeHtmlEntities("&#65;&#66;&#x43;"), "ABC");
  });
});

describe("parseNyaaViewHtml", () => {
  const sampleHtml = `
<!DOCTYPE html>
<html>
<head><title>Nyaa</title></head>
<body>
  <div class="panel panel-default">
    <div class="panel-heading">
      <h3 class="panel-title">
        [SubsPlease] Sousou no Frieren - 28 (1080p) [B40A56E2].mkv
      </h3>
    </div>
    <div class="panel-footer clearfix">
      <a href="magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&amp;dn=Frieren&amp;tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce" class="card-footer-item">
        Magnet Download
      </a>
    </div>
  </div>
  <div class="panel panel-default">
    <div class="panel-heading">
      <h3 class="panel-title">File list</h3>
    </div>
  </div>
</body>
</html>
`;

  it("correctly extracts title, clean magnet, and lowercase infohash", () => {
    const parsed = parseNyaaViewHtml(sampleHtml, "1800000");
    assert.ok(parsed);
    assert.equal(parsed.torrentId, "1800000");
    assert.equal(parsed.title, "[SubsPlease] Sousou no Frieren - 28 (1080p) [B40A56E2].mkv");
    assert.equal(
      parsed.magnet,
      "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Frieren&tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce",
    );
    assert.equal(parsed.infoHash, "0123456789abcdef0123456789abcdef01234567");
  });

  it("returns null when title or magnet is missing", () => {
    assert.equal(parseNyaaViewHtml("<div>No torrent here</div>", "1800000"), null);
  });
});

describe("fetchNyaaView", () => {
  it("fetches directly from nyaa.si when available", async () => {
    const mockFetch: typeof fetch = async (url) => {
      if (String(url).includes("nyaa.si/view/12345")) {
        return new Response(
          `<h3 class="panel-title">Test Show - 01 (1080p)</h3><a href="magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567">`,
          { status: 200 },
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const details = await fetchNyaaView("12345", mockFetch);
    assert.equal(details.title, "Test Show - 01 (1080p)");
    assert.equal(details.infoHash, "0123456789abcdef0123456789abcdef01234567");
  });

  it("falls back to nyaaapi if nyaa.si returns an error", async () => {
    const mockFetch: typeof fetch = async (url) => {
      if (String(url).includes("nyaa.si/view/12345")) {
        return new Response("Cloudflare blocked", { status: 403 });
      }
      if (String(url).includes("nyaaapi.onrender.com/nyaa/id/12345")) {
        return new Response(
          JSON.stringify({
            data: {
              title: "Fallback Show - 01 (1080p)",
              magnet: "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567",
              infohash: "0123456789abcdef0123456789abcdef01234567",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const details = await fetchNyaaView("12345", mockFetch);
    assert.equal(details.title, "Fallback Show - 01 (1080p)");
    assert.equal(details.infoHash, "0123456789abcdef0123456789abcdef01234567");
  });

  it("throws when torrent does not exist on either source", async () => {
    const mockFetch: typeof fetch = async () => new Response("Not found", { status: 404 });
    await assert.rejects(
      async () => fetchNyaaView("99999", mockFetch),
      /not found/i,
    );
  });
});

describe("syncSubscriptionsWithDownloadedTorrent", () => {
  it("marks seen and adds episode to matching subscription", () => {
    const sub: Subscription = {
      id: "sub-1",
      animeName: "Sousou no Frieren",
      provider: "subsplease",
      resolution: "1080p",
      createdAt: new Date().toISOString(),
      seenHashes: [],
      downloadedEpisodes: ["27"],
      pendingAsks: [{
        torrentId: "999",
        infoHash: "0123456789abcdef0123456789abcdef01234567",
        title: "[SubsPlease] Sousou no Frieren - 28 (1080p)",
        episode: "28",
        magnet: "magnet:?",
      }],
    };

    const store = {
      listSubscriptions: () => [sub],
      markSeen: (id: string, hash: string) => {
        if (!sub.seenHashes.includes(hash)) sub.seenHashes.push(hash);
      },
      addDownloadedEpisode: (id: string, ep: string) => {
        if (!sub.downloadedEpisodes.includes(ep)) sub.downloadedEpisodes.push(ep);
      },
      clearPendingAsksForEpisode: (id: string, ep: string) => {
        sub.pendingAsks = sub.pendingAsks.filter((p) => p.episode !== ep);
      },
    } as unknown as Store;

    syncSubscriptionsWithDownloadedTorrent(store, {
      title: "[SubsPlease] Sousou no Frieren - 28 (1080p) [B40A56E2].mkv",
      infoHash: "0123456789abcdef0123456789abcdef01234567",
    });

    assert.ok(sub.seenHashes.includes("0123456789abcdef0123456789abcdef01234567"));
    assert.ok(sub.downloadedEpisodes.includes("28"));
    assert.equal(sub.pendingAsks.length, 0);
  });
});

describe("handleNyaaUrls", () => {
  it("prompts user to configure downloader when downloader is null", async () => {
    const replies: string[] = [];
    const mockCtx = {
      reply: async (text: string) => {
        replies.push(text);
      },
    } as unknown as BotContext;

    const mockStore = {
      getSettings: (): Settings => ({ downloader: null, pollIntervalMinutes: 10 }),
    } as unknown as Store;

    await handleNyaaUrls(mockCtx, mockStore, ["123456"]);
    assert.equal(replies.length, 1);
    assert.match(replies[0], /Downloader is not configured/);
  });
});
