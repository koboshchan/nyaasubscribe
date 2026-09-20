import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { UBitDownloaderClient } from "../src/downloader/ubit";
import { QBitDownloaderClient } from "../src/downloader/qbit";
import { DownloaderClient, DownloaderError, TorrentAlreadyExistsError } from "../src/downloader/client";
import { extractInfoHash } from "../src/downloader/hash";

describe("extractInfoHash", () => {
  it("extracts lowercase hex hash from hex btih magnet", () => {
    const magnet = "magnet:?xt=urn:btih:245EF029AABBCCDDEEFF00112233445566778899&dn=test";
    assert.equal(extractInfoHash(magnet), "245ef029aabbccddeeff00112233445566778899");
  });

  it("extracts lowercase hex hash from base32 btih magnet", () => {
    const magnet = "magnet:?xt=urn:btih:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&dn=test";
    assert.equal(extractInfoHash(magnet), "0".repeat(40));
  });

  it("extracts lowercase hex hash from raw 40-char hex string", () => {
    assert.equal(
      extractInfoHash("245EF029AABBCCDDEEFF00112233445566778899"),
      "245ef029aabbccddeeff00112233445566778899",
    );
  });

  it("returns null for invalid inputs", () => {
    assert.equal(extractInfoHash(""), null);
    assert.equal(extractInfoHash("not-a-magnet"), null);
    assert.equal(extractInfoHash("magnet:?xt=urn:unknown:1234"), null);
  });
});

describe("UBitDownloaderClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("authenticates and retrieves token and cookie", async () => {
    globalThis.fetch = async (url) => {
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

  it("checks if torrent exists in list via hasTorrent", async () => {
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("action=list-dirs")) return new Response(JSON.stringify({}), { status: 200 });
      if (u.includes("list=1")) {
        return new Response(
          JSON.stringify({
            torrents: [
              ["245ef029aabbccddeeff00112233445566778899", 1, "Torrent 1", 1000, 100],
              ["0000000000000000000000000000000000000000", 1, "Torrent 2", 1000, 100],
            ],
          }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected request: ${u}`);
    };

    const client = new UBitDownloaderClient("http://127.0.0.1:9178", "admin", "secret");
    const exists = await client.hasTorrent(
      "fake-token",
      "magnet:?xt=urn:btih:245EF029AABBCCDDEEFF00112233445566778899",
    );
    assert.equal(exists, true);

    const notExists = await client.hasTorrent(
      "fake-token",
      "magnet:?xt=urn:btih:1111111111111111111111111111111111111111",
    );
    assert.equal(notExists, false);
  });
});

describe("QBitDownloaderClient - Password Auth", () => {
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

    const client = new QBitDownloaderClient({
      baseUrl: "http://127.0.0.1:8080",
      username: "admin",
      password: "adminpassword",
    });
    const token = await client.getToken();
    assert.equal(token, "SID=session-id-12345");

    assert.ok(capturedBody?.includes("username=admin"));
    assert.ok(capturedBody?.includes("password=adminpassword"));
    const headersRecord = capturedHeaders as Record<string, string>;
    assert.equal(headersRecord.Referer, "http://127.0.0.1:8080/");
    assert.equal(headersRecord.Origin, "http://127.0.0.1:8080");
  });

  it("throws DownloaderError on invalid credentials ('Fails.')", async () => {
    globalThis.fetch = async () => {
      return new Response("Fails.", { status: 200 });
    };

    const client = new QBitDownloaderClient({
      baseUrl: "http://127.0.0.1:8080",
      username: "admin",
      password: "wrongpassword",
    });
    await assert.rejects(() => client.getToken(), /invalid username or password/);
  });

  it("throws DownloaderError when IP is banned (403)", async () => {
    globalThis.fetch = async () => {
      return new Response("Forbidden", { status: 403 });
    };

    const client = new QBitDownloaderClient({
      baseUrl: "http://127.0.0.1:8080",
      username: "admin",
      password: "wrongpassword",
    });
    await assert.rejects(() => client.getToken(), /IP banned/);
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
          return new Response("Forbidden", { status: 403 });
        }
        return new Response("Ok.", { status: 200 });
      }
      throw new Error(`Unexpected url: ${u}`);
    };

    const client = new QBitDownloaderClient({
      baseUrl: "http://127.0.0.1:8080",
      username: "admin",
      password: "pass",
    });
    await client.getToken();
    assert.equal(loginCount, 1);

    await client.addUrl("token", "magnet:?xt=test", 0);
    assert.equal(loginCount, 2);
    assert.equal(addAttempts, 2);
  });

  it("checks if torrent exists in library via hasTorrent", async () => {
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/api/v2/auth/login")) {
        return new Response("Ok.", {
          status: 200,
          headers: { "set-cookie": "SID=test-sid; path=/" },
        });
      }
      if (u.includes("/api/v2/torrents/info")) {
        if (u.includes("245ef029aabbccddeeff00112233445566778899")) {
          return new Response(
            JSON.stringify([{ hash: "245ef029aabbccddeeff00112233445566778899", name: "Test Torrent" }]),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify([]), { status: 200 });
      }
      throw new Error(`Unexpected url: ${u}`);
    };

    const client = new QBitDownloaderClient({
      baseUrl: "http://127.0.0.1:8080",
      username: "admin",
      password: "pass",
    });

    const exists = await client.hasTorrent(
      "token",
      "magnet:?xt=urn:btih:245EF029AABBCCDDEEFF00112233445566778899",
    );
    assert.equal(exists, true);

    const notExists = await client.hasTorrent(
      "token",
      "magnet:?xt=urn:btih:9999999999999999999999999999999999999999",
    );
    assert.equal(notExists, false);
  });

  it("throws TorrentAlreadyExistsError on 409 and verifies library presence", async () => {
    let checkedLibrary = false;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/api/v2/auth/login")) {
        return new Response("Ok.", {
          status: 200,
          headers: { "set-cookie": "SID=test-sid; path=/" },
        });
      }
      if (u.includes("/api/v2/torrents/add")) {
        return new Response("Torrent already in list", { status: 409 });
      }
      if (u.includes("/api/v2/torrents/info")) {
        checkedLibrary = true;
        return new Response(
          JSON.stringify([{ hash: "245ef029aabbccddeeff00112233445566778899", name: "Test" }]),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected url: ${u}`);
    };

    const client = new QBitDownloaderClient({
      baseUrl: "http://127.0.0.1:8080",
      username: "admin",
      password: "pass",
    });

    await assert.rejects(
      () => client.addUrl("token", "magnet:?xt=urn:btih:245ef029aabbccddeeff00112233445566778899", 0),
      (err: unknown) => {
        assert.ok(err instanceof TorrentAlreadyExistsError);
        assert.match((err as Error).message, /already exists in client library/);
        return true;
      },
    );
    assert.equal(checkedLibrary, true);
  });
});

describe("QBitDownloaderClient - API Token Auth", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("verifies API token via app/version and returns token", async () => {
    let capturedAuth: string | undefined;

    globalThis.fetch = async (url, init) => {
      const u = String(url);
      if (u.includes("/api/v2/app/version")) {
        capturedAuth = (init?.headers as Record<string, string>)?.Authorization;
        return new Response("v5.2.0", { status: 200 });
      }
      throw new Error(`Unexpected url: ${u}`);
    };

    const client = new QBitDownloaderClient({
      baseUrl: "http://127.0.0.1:8080",
      apiToken: "qbt_abc1234567890abcdef",
    });

    const token = await client.getToken();
    assert.equal(token, "qbt_abc1234567890abcdef");
    assert.equal(capturedAuth, "Bearer qbt_abc1234567890abcdef");
  });

  it("throws DownloaderError if API token is rejected (401 or 403)", async () => {
    globalThis.fetch = async () => new Response("Unauthorized", { status: 401 });

    const client = new QBitDownloaderClient({
      baseUrl: "http://127.0.0.1:8080",
      apiToken: "qbt_invalid_token",
    });

    await assert.rejects(() => client.getToken(), /unauthorized/i);
  });

  it("adds torrent with Authorization: Bearer header and FormData", async () => {
    let capturedBody: FormData | undefined;
    let capturedAuth: string | undefined;

    globalThis.fetch = async (url, init) => {
      const u = String(url);
      if (u.includes("/api/v2/torrents/add")) {
        capturedAuth = (init?.headers as Record<string, string>)?.Authorization;
        capturedBody = init?.body as FormData;
        return new Response("Ok.", { status: 200 });
      }
      throw new Error(`Unexpected url: ${u}`);
    };

    const client = new QBitDownloaderClient({
      baseUrl: "http://127.0.0.1:8080",
      apiToken: "qbt_secret_token",
    });

    await client.addUrl("token", "magnet:?xt=test_magnet", 0, "/downloads/anime");
    assert.equal(capturedAuth, "Bearer qbt_secret_token");
    assert.ok(capturedBody instanceof FormData);
    assert.equal(capturedBody.get("urls"), "magnet:?xt=test_magnet");
    assert.equal(capturedBody.get("savepath"), "/downloads/anime");
  });
});

describe("QBitDownloaderClient - Directories", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
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

    const client = new QBitDownloaderClient({
      baseUrl: "http://127.0.0.1:8080",
      username: "admin",
      password: "pass",
    });
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

    const client = new QBitDownloaderClient({
      baseUrl: "http://127.0.0.1:8080",
      username: "admin",
      password: "pass",
    });
    const dirs = await client.listDirs();
    assert.equal(dirs.length, 1);
    assert.equal(dirs[0].path, "/pref/downloads");
  });
});

describe("DownloaderClient factory delegation", () => {
  it("instantiates UBitDownloaderClient when clientType is 'ubit'", () => {
    const client = new DownloaderClient({
      clientType: "ubit",
      baseUrl: "http://127.0.0.1:9178",
      username: "user",
      password: "pass",
      downloadDirIndex: 0,
    });
    assert.equal((client as any).delegate instanceof UBitDownloaderClient, true);
  });

  it("instantiates UBitDownloaderClient when clientType is not set (backwards compatibility)", () => {
    const client = new DownloaderClient({
      baseUrl: "http://127.0.0.1:9178",
      username: "user",
      password: "pass",
      downloadDirIndex: 0,
    });
    assert.equal((client as any).delegate instanceof UBitDownloaderClient, true);
  });

  it("instantiates QBitDownloaderClient when clientType is 'qbit' with password", () => {
    const client = new DownloaderClient({
      clientType: "qbit",
      baseUrl: "http://127.0.0.1:8080",
      username: "user",
      password: "pass",
      downloadDirIndex: 0,
    });
    assert.equal((client as any).delegate instanceof QBitDownloaderClient, true);
  });

  it("instantiates QBitDownloaderClient when clientType is 'qbit' with apiToken", () => {
    const client = new DownloaderClient({
      clientType: "qbit",
      baseUrl: "http://127.0.0.1:8080",
      apiToken: "qbt_xyz",
      authMethod: "token",
      downloadDirIndex: 0,
    });
    assert.equal((client as any).delegate instanceof QBitDownloaderClient, true);
  });

  it("supports legacy string constructor arguments", () => {
    const ubitClient = new DownloaderClient("http://127.0.0.1:9178", "user", "pass", "ubit");
    assert.equal((ubitClient as any).delegate instanceof UBitDownloaderClient, true);

    const qbitClient = new DownloaderClient("http://127.0.0.1:8080", "user", "pass", "qbit");
    assert.equal((qbitClient as any).delegate instanceof QBitDownloaderClient, true);
  });
});
