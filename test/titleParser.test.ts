import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseReleaseTitle, matchesSubscription, isWebRip } from "../src/nyaa/titleParser";

describe("titleParser - ToonsHub", () => {
  it("parses ToonsHub title with season, episode, year, resolution, alt title, and audio/sub tags", () => {
    const title =
      "[ToonsHub] Love Unseen Beneath the Clear Night Sky 2026 S01E02 1080p CR WEB-DL AAC2.0 H.264 (Toumei na Yoru ni Kakeru Kimi to, Me ni Mienai Koi wo Shita., Multi-Subs)";
    const parsed = parseReleaseTitle("toonshub", title);

    assert.ok(parsed);
    assert.equal(parsed.show, "Love Unseen Beneath the Clear Night Sky 2026");
    assert.equal(parsed.episode, "S01E02");
    assert.equal(parsed.resolution, "1080p");
    assert.equal(parsed.altShow, "Toumei na Yoru ni Kakeru Kimi to, Me ni Mienai Koi wo Shita");
  });

  it("parses ToonsHub title with only subtitle tag in parentheses (no alt title)", () => {
    const title = "[ToonsHub] LIAR GAME S01E25 1080p CR WEB-DL AAC2.0 H.264 (Multi-Subs)";
    const parsed = parseReleaseTitle("toonshub", title);

    assert.ok(parsed);
    assert.equal(parsed.show, "LIAR GAME");
    assert.equal(parsed.episode, "S01E25");
    assert.equal(parsed.resolution, "1080p");
    assert.equal(parsed.altShow, undefined);
  });

  it("parses ToonsHub title with no parentheses at all", () => {
    const title = "[ToonsHub] LIAR GAME S01E25 1080p AMZN WEB-DL DDP2.0 H.264";
    const parsed = parseReleaseTitle("toonshub", title);

    assert.ok(parsed);
    assert.equal(parsed.show, "LIAR GAME");
    assert.equal(parsed.episode, "S01E25");
    assert.equal(parsed.resolution, "1080p");
    assert.equal(parsed.altShow, undefined);
  });

  it("parses ToonsHub title with EP episode format without season", () => {
    const title = "[ToonsHub] One Piece EP1179 1080p CR WEB-DL AAC2.0 H.264 (English-Sub)";
    const parsed = parseReleaseTitle("toonshub", title);

    assert.ok(parsed);
    assert.equal(parsed.show, "One Piece");
    assert.equal(parsed.episode, "1179");
    assert.equal(parsed.resolution, "1080p");
    assert.equal(parsed.altShow, undefined);
  });

  it("parses ToonsHub title with dual audio and multi-subs tags after alt title", () => {
    const title =
      "[ToonsHub] Skeleton Knight in Another World S02E12 1080p CR WEB-DL DUAL AAC2.0 H.264 (Gaikotsu Kishi-sama, Tadaima Isekai e Odekakechuu, Dual-Audio, Multi-Subs)";
    const parsed = parseReleaseTitle("toonshub", title);

    assert.ok(parsed);
    assert.equal(parsed.show, "Skeleton Knight in Another World");
    assert.equal(parsed.episode, "S02E12");
    assert.equal(parsed.resolution, "1080p");
    assert.equal(parsed.altShow, "Gaikotsu Kishi-sama, Tadaima Isekai e Odekakechuu");
  });

  it("parses ToonsHub title with only alt title in parentheses (no sub tags)", () => {
    const title = "[ToonsHub] World Is Dancing S01E13 1080p AMZN WEB-DL DDP2.0 H.264 (The World Is Dancing)";
    const parsed = parseReleaseTitle("toonshub", title);

    assert.ok(parsed);
    assert.equal(parsed.show, "World Is Dancing");
    assert.equal(parsed.episode, "S01E13");
    assert.equal(parsed.resolution, "1080p");
    assert.equal(parsed.altShow, "The World Is Dancing");
  });

  it("returns null for non-ToonsHub titles", () => {
    const title = "[SubsPlease] Mushoku Tensei S3 - 08 (1080p) [0161AAEA].mkv";
    assert.equal(parseReleaseTitle("toonshub", title), null);
  });

  it("matches subscription across various name formats", () => {
    const title =
      "[ToonsHub] Love Unseen Beneath the Clear Night Sky 2026 S01E02 1080p CR WEB-DL AAC2.0 H.264 (Toumei na Yoru ni Kakeru Kimi to, Me ni Mienai Koi wo Shita., Multi-Subs)";

    // Full title with year
    assert.ok(matchesSubscription("toonshub", title, "Love Unseen Beneath the Clear Night Sky 2026", "1080p"));

    // Title without year
    assert.ok(matchesSubscription("toonshub", title, "Love Unseen Beneath the Clear Night Sky", "1080p"));

    // Case-insensitive
    assert.ok(matchesSubscription("toonshub", title, "love unseen beneath the clear night sky", "1080p"));

    // Romaji alt title
    assert.ok(matchesSubscription("toonshub", title, "Toumei na Yoru ni Kakeru Kimi to, Me ni Mienai Koi wo Shita", "1080p"));

    // Romaji alt title with trailing period
    assert.ok(matchesSubscription("toonshub", title, "Toumei na Yoru ni Kakeru Kimi to, Me ni Mienai Koi wo Shita.", "1080p"));

    // Wrong resolution
    assert.equal(matchesSubscription("toonshub", title, "Love Unseen Beneath the Clear Night Sky", "720p"), false);

    // Wrong anime
    assert.equal(matchesSubscription("toonshub", title, "Mushoku Tensei", "1080p"), false);
  });

  it("matches release without year when subscription has year", () => {
    const ep1Title =
      "[ToonsHub] Love Unseen Beneath the Clear Night Sky S01E01 1080p CR WEB-DL AAC2.0 H.264 (Toumei na Yoru ni Kakeru Kimi to, Me ni Mienai Koi wo Shita., Multi-Subs)";

    assert.ok(matchesSubscription("toonshub", ep1Title, "Love Unseen Beneath the Clear Night Sky 2026", "1080p"));
    assert.ok(matchesSubscription("toonshub", ep1Title, "Love Unseen Beneath the Clear Night Sky", "1080p"));
    assert.ok(matchesSubscription("toonshub", ep1Title, "Toumei na Yoru ni Kakeru Kimi to, Me ni Mienai Koi wo Shita", "1080p"));
  });
});

describe("titleParser - Other Providers", () => {
  it("parses SubsPlease titles", () => {
    const title = "[SubsPlease] Mushoku Tensei S3 - 08 (1080p) [0161AAEA].mkv";
    const parsed = parseReleaseTitle("subsplease", title);
    assert.ok(parsed);
    assert.equal(parsed.show, "Mushoku Tensei S3");
    assert.equal(parsed.episode, "08");
    assert.equal(parsed.resolution, "1080p");
    assert.ok(matchesSubscription("subsplease", title, "Mushoku Tensei S3", "1080p"));
  });

  it("parses Erai-raws titles", () => {
    const title = "[Erai-raws] Liar Game - 20 [1080p CR WEB-DL AVC AAC][MultiSub][4B83888F].mkv";
    const parsed = parseReleaseTitle("erai-raws", title);
    assert.ok(parsed);
    assert.equal(parsed.show, "Liar Game");
    assert.equal(parsed.episode, "20");
    assert.equal(parsed.resolution, "1080p");
    assert.ok(matchesSubscription("erai-raws", title, "Liar Game", "1080p"));
  });

  it("parses Tsundere-Raws titles", () => {
    const title = "Tomb Raider King S01E07 SUBFRENCH 1080p CR WEB-DL AAC2.0 H.264-Tsundere-Raws (VOSTFR, ...)";
    const parsed = parseReleaseTitle("tsundere-raws", title);
    assert.ok(parsed);
    assert.equal(parsed.show, "Tomb Raider King");
    assert.equal(parsed.episode, "S01E07");
    assert.equal(parsed.resolution, "1080p");
    assert.ok(matchesSubscription("tsundere-raws", title, "Tomb Raider King", "1080p"));
  });

  it("parses AnoZu titles", () => {
    const title =
      "[AnoZu] Love Unseen Beneath the Clear Night Sky 2026 S01E11 1080p CR WEB-DL AAC 2.0 H.264 | Toumei na Yoru ni Kakeru Kimi to, Me ni Mienai Koi wo Shita.";
    const parsed = parseReleaseTitle("anozu", title);
    assert.ok(parsed);
    assert.equal(parsed.show, "Love Unseen Beneath the Clear Night Sky 2026");
    assert.equal(parsed.episode, "S01E11");
    assert.equal(parsed.resolution, "1080p");
    assert.equal(parsed.altShow, "Toumei na Yoru ni Kakeru Kimi to, Me ni Mienai Koi wo Shita");
    assert.ok(matchesSubscription("anozu", title, "Love Unseen Beneath the Clear Night Sky", "1080p"));
    assert.ok(matchesSubscription("anozu", title, "Toumei na Yoru ni Kakeru Kimi to, Me ni Mienai Koi wo Shita", "1080p"));
  });

  it("detects web rip releases", () => {
    assert.equal(isWebRip("[Erai-raws] Show - 01 [1080p WEBRip AVC AAC]"), true);
    assert.equal(isWebRip("[Erai-raws] Show - 01 [1080p WEB-DL AVC AAC]"), false);
  });
});
