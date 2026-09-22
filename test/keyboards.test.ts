import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bulkAskKeyboard,
  episodeAskKeyboard,
  subscriptionCardKeyboard,
  providerKeyboard,
  resolutionKeyboard,
  pollIntervalKeyboard,
  settingsKeyboard,
  downloaderClientChoiceKeyboard,
  qbitAuthChoiceKeyboard,
  confirmDownloadAllKeyboard,
} from "../src/bot/keyboards";

function assertCallbackDataLength(keyboard: ReturnType<typeof bulkAskKeyboard>, maxLen = 64) {
  for (const row of keyboard.inline_keyboard) {
    for (const button of row) {
      if ("callback_data" in button && button.callback_data) {
        const byteLen = Buffer.byteLength(button.callback_data, "utf8");
        assert.ok(
          byteLen <= maxLen,
          `callback_data "${button.callback_data}" exceeds ${maxLen} bytes (was ${byteLen})`,
        );
      }
    }
  }
}

describe("Keyboards - Telegram 64-byte callback_data limit", () => {
  const sampleSubId = "12345678-1234-1234-1234-123456789012"; // 36-char standard UUID
  const sampleBatchId = "abcdef12"; // 8-char batch ID
  const sampleTorrentId = "1234567";

  it("bulkAskKeyboard callback_data is <= 64 bytes", () => {
    assertCallbackDataLength(bulkAskKeyboard(sampleSubId, sampleBatchId));
  });

  it("episodeAskKeyboard callback_data is <= 64 bytes", () => {
    assertCallbackDataLength(episodeAskKeyboard(sampleSubId, sampleTorrentId));
  });

  it("subscriptionCardKeyboard callback_data is <= 64 bytes", () => {
    assertCallbackDataLength(
      subscriptionCardKeyboard({
        id: sampleSubId,
        animeName: "Test Anime",
        provider: "subsplease",
        resolution: "1080p",
        createdAt: new Date().toISOString(),
        seenHashes: [],
        downloadedEpisodes: [],
        pendingAsks: [],
      }),
    );
  });

  it("confirmDownloadAllKeyboard callback_data is <= 64 bytes", () => {
    assertCallbackDataLength(confirmDownloadAllKeyboard());
  });

  it("all other static keyboards have callback_data <= 64 bytes", () => {
    assertCallbackDataLength(providerKeyboard());
    assertCallbackDataLength(resolutionKeyboard());
    assertCallbackDataLength(pollIntervalKeyboard());
    assertCallbackDataLength(settingsKeyboard());
    assertCallbackDataLength(downloaderClientChoiceKeyboard());
    assertCallbackDataLength(qbitAuthChoiceKeyboard());
  });
});
