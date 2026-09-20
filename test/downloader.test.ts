import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { parseDownloaderType } from "../src/config/env";
import { UBitDownloaderClient } from "../src/downloader/ubit";
import { QBitDownloaderClient } from "../src/downloader/qbit";
import { DownloaderClient, DownloaderError } from "../src/downloader/client";

describe("Downloader Configuration & Types", () => {
  it("defaults to 'u' when env variable is missing, empty, or 'u'", () => {
    assert.equal(parseDownloaderType(undefined), "u");
    assert.equal(parseDownloaderType(null), "u");
    assert.equal(parseDownloaderType(""), "u");
    assert.equal(parseDownloaderType("   "), "u");
    assert.equal(parseDownloaderType("u"), "u");
    assert.equal(parseDownloaderType("U"), "u");
    assert.equal(parseDownloaderType("ubit"), "u");
    assert.equal(parseDownloaderType("utorrent"), "u");
    assert.equal(parseDownloaderType("anything_else"), "u");
  });

  it("resolves to 'q' when env variable is 'q', 'Q', 'qbit', or 'qbittorrent'", () => {
    assert.equal(parseDownloaderType("q"), "q");
    assert.equal(parseDownloaderType("Q"), "q");
    assert.equal(parseDownloaderType(" q "), "q");
    assert.equal(parseDownloaderType("qbit"), "q");
    assert.equal(parseDownloaderType("qbittorrent"), "q");
  });
});

describe("UBitDownloaderClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("authenticates and retrieves token and cookie", async () => {
    globalThis.fetch = async (url, init) => {
      const u = String(url);
      if (u.includes("/gui/token.html")) {
        return new Response("<div id='token'>fake-ubit-token</div>", {
          status: 200,
          headers: {
            "set-cookie": "GUID=guid123; path=/",
          },
        });
      }
      throw new Error(`Unexpected request: ${u}`);
    };

    const client = new UBitDownloaderClient("http://127.0.0.1:9178", "admin", "secret");
    const token = await client.getToken();
    assert.equal(token, "fake-ubit-token");
  });

  it("throws error if token is not found in response", async () => {
    globalThis.fetch = async () => new Response("<div>No token here</div>", { status: 200 });
    const client = new UBitDownloaderClient("http://127.0.0.1:9178", "admin", "secret");
    await assert.rejects(() => client.getToken(), DownloaderError);
  });

  it("lists directories", async () => {
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("action=list-dirs")) {
        return new Response(
          JSON.stringify({
            "download-dirs": [
              { path: "/downloads/1", available: 1000 },
              { path: "/downloads/2", available: 2000 },
            ],
          }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected request: ${u}`);
    };

    const client = new UBitDownloaderClient("http://127.0.0.1:9178", "admin", "secret");
    const dirs = await client.listDirs("fake-token");
    assert.equal(dirs.length, 2);
    assert.equal(dirs[0].path, "/downloads/1");
  });

  it("adds torrent url with dirIndex and path", async () => {
    let requestedUrl = "";
    globalThis.fetch = async (url) => {
      requestedUrl = String(url);
      return new Response("OK", { status: 200 });
    };

    const client = new UBitDownloaderClient("http://127.0.0.1:9178", "admin", "secret");
    await client.addUrl("fake-token", "magnet:?xt=test", 1, "/custom/path");
    assert.ok(requestedUrl.includes("action=add-url"));
    assert.ok(requestedUrl.includes("download_dir=1"));
    assert.ok(requestedUrl.includes("path=%2Fcustom%2Fpath"));
  });
});

describe("QBitDownloaderClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("authenticates successfully with SID cookie and Referer headers", async () => {
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody: string | undefined;

    globalThis.fetch = async (url, init) => {
      const u = String(url);
      if (u.includes("/api/v2/auth/login")) {
        capturedHeaders = init?.headers;
        capturedBody = String(init?.body);
        return new Response("Ok.", {
          status: 200,
          headers: {
            "set-cookie": "SID=session-id-12345; Path=/; HttpOnly",
          },
        });
      }
      throw new Error(`Unexpected url: ${u}`);
    };

    const client = new QBitDownloaderClient("http://127.0.0.1:8080", "admin", "adminadmin");
    const token = await client.getToken();
    assert.equal(token, "SID=session-id-12345");

    assert.ok(capturedBody?.includes("username=admin"));
    assert.ok(capturedBody?.includes("password=adminadmin"));
    const headersRecord = capturedHeaders as Record<string, string>;
    assert.equal(headersRecord.Referer, "http://127.0.0.1:8080/");
    assert.equal(headersRecord.Origin, "http://127.0.0.1:8080");
  });

  it("throws DownloaderError on invalid credentials ('Fails.')", async () => {
    globalThis.fetch = async () => {
      return new Response("Fails.", { status: 200 });
    };

    const client = new QBitDownloaderClient("http://127.0.0.1:8080", "admin", "wrongpassword");
    await assert.rejects(() => client.getToken(), /invalid username or password/);
  });

  it("throws DownloaderError when IP is banned (403)", async () => {
    globalThis.fetch = async () => {
      return new Response("Forbidden", { status: 403 });
    };

    const client = new QBitDownloaderClient("http://127.0.0.1:8080", "admin", "wrongpassword");
    await assert.rejects(() => client.getToken(), /IP banned/);
  });

  it("lists directories from defaultSavePath and categories", async () => {
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/api/v2/auth/login")) {
        return new Response("Ok.", {
          status: 200,
          headers: { "set-cookie": "SID=test-sid; path=/" },
        });
      }
      if (u.includes("/api/v2/app/defaultSavePath")) {
        return new Response("/downloads/default\n", { status: 200 });
      }
      if (u.includes("/api/v2/torrents/categories")) {
        return new Response(
          JSON.stringify({
            Anime: { name: "Anime", savePath: "/downloads/anime" },
            DuplicateDefault: { name: "Dup", savePath: "/downloads/default" },
            NoSavePath: { name: "NoPath" },
          }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected url: ${u}`);
    };

    const client = new QBitDownloaderClient("http://127.0.0.1:8080", "admin", "pass");
    const dirs = await client.listDirs();

    assert.equal(dirs.length, 2);
    assert.equal(dirs[0].path, "/downloads/default");
    assert.equal(dirs[1].path, "/downloads/anime");
  });

  it("falls back to app/preferences if defaultSavePath is unavailable", async () => {
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/api/v2/auth/login")) {
        return new Response("Ok.", {
          status: 200,
          headers: { "set-cookie": "SID=test-sid; path=/" },
        });
      }
      if (u.includes("/api/v2/app/defaultSavePath")) {
        return new Response("Not found", { status: 404 });
      }
      if (u.includes("/api/v2/app/preferences")) {
        return new Response(JSON.stringify({ save_path: "/pref/downloads" }), { status: 200 });
      }
      if (u.includes("/api/v2/torrents/categories")) {
        return new Response("{}", { status: 200 });
      }
      throw new Error(`Unexpected url: ${u}`);
    };

    const client = new QBitDownloaderClient("http://127.0.0.1:8080", "admin", "pass");
    const dirs = await client.listDirs();
    assert.equal(dirs.length, 1);
    assert.equal(dirs[0].path, "/pref/downloads");
  });

  it("adds torrent with FormData body and savepath", async () => {
    let capturedBody: FormData | undefined;
    let capturedHeaders: HeadersInit | undefined;

    globalThis.fetch = async (url, init) => {
      const u = String(url);
      if (u.includes("/api/v2/auth/login")) {
        return new Response("Ok.", {
          status: 200,
          headers: { "set-cookie": "SID=test-sid; path=/" },
        });
      }
      if (u.includes("/api/v2/torrents/add")) {
        capturedHeaders = init?.headers;
        capturedBody = init?.body as FormData;
        return new Response("Ok.", { status: 200 });
      }
      throw new Error(`Unexpected url: ${u}`);
    };

    const client = new QBitDownloaderClient("http://127.0.0.1:8080", "admin", "pass");
    await client.addUrl("fake-token", "magnet:?xt=urn:btih:xyz", 0, "/downloads/anime");

    assert.ok(capturedBody instanceof FormData);
    assert.equal(capturedBody.get("urls"), "magnet:?xt=urn:btih:xyz");
    assert.equal(capturedBody.get("savepath"), "/downloads/anime");

    const headersRecord = capturedHeaders as Record<string, string>;
    assert.equal(headersRecord.Cookie, "SID=test-sid");
  });

  it("re-authenticates and retries if session expired with 403 on addUrl", async () => {
    let loginCount = 0;
    let addAttempts = 0;

    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/api/v2/auth/login")) {
        loginCount++;
        return new Response("Ok.", {
          status: 200,
          headers: { "set-cookie": `SID=sid-${loginCount}; path=/` },
        });
      }
      if (u.includes("/api/v2/torrents/add")) {
        addAttempts++;
        if (addAttempts === 1) {
          // First attempt returns 403 (expired session)
          return new Response("Forbidden", { status: 403 });
        }
        // Second attempt succeeds
        return new Response("Ok.", { status: 200 });
      }
      throw new Error(`Unexpected url: ${u}`);
    };

    const client = new QBitDownloaderClient("http://127.0.0.1:8080", "admin", "pass");
    // Initial login
    await client.getToken();
    assert.equal(loginCount, 1);

    // addUrl should catch 403, re-authenticate, and succeed
    await client.addUrl("token", "magnet:?xt=test", 0);
    assert.equal(loginCount, 2);
    assert.equal(addAttempts, 2);
  });
});

describe("DownloaderClient factory delegation", () => {
  const originalEnv = process.env.TORRENT_DOWNLOADER;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.TORRENT_DOWNLOADER;
    } else {
      process.env.TORRENT_DOWNLOADER = originalEnv;
    }
  });

  it("instantiates UBitDownloaderClient when TORRENT_DOWNLOADER is 'u'", () => {
    process.env.TORRENT_DOWNLOADER = "u";
    const client = new DownloaderClient("http://127.0.0.1:9178", "user", "pass");
    assert.equal((client as any).delegate instanceof UBitDownloaderClient, true);
  });

  it("instantiates UBitDownloaderClient when TORRENT_DOWNLOADER is not set", () => {
    delete process.env.TORRENT_DOWNLOADER;
    const client = new DownloaderClient("http://127.0.0.1:9178", "user", "pass");
    assert.equal((client as any).delegate instanceof UBitDownloaderClient, true);
  });

  it("instantiates QBitDownloaderClient when TORRENT_DOWNLOADER is 'q'", () => {
    process.env.TORRENT_DOWNLOADER = "q";
    const client = new DownloaderClient("http://127.0.0.1:8080", "user", "pass");
    assert.equal((client as any).delegate instanceof QBitDownloaderClient, true);
  });

  it("respects explicit constructor type parameter", () => {
    process.env.TORRENT_DOWNLOADER = "u";
    const client = new DownloaderClient("http://127.0.0.1:8080", "user", "pass", "q");
    assert.equal((client as any).delegate instanceof QBitDownloaderClient, true);
  });
});
