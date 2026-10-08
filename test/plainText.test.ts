import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as keyboards from "../src/bot/keyboards";
import {
  renderSubscriptionList, renderEmptyList, renderSubscriptionDetails,
  renderDeleteConfirm, editProviderKeyboard, editResolutionKeyboard,
} from "../src/bot/views/subscriptions";
import type { Settings, Subscription } from "../src/store/types";

// Includes text-presentation emoji, modifiers, flags, variation selectors and
// keycap combiners, without rejecting ordinary digits or punctuation.
const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier}\uFE0F\u20E3]/u;
const sub: Subscription = {
  id: "00000000-0000-4000-8000-000000000001",
  animeName: "Test Show", provider: "subsplease", resolution: "1080p",
  createdAt: "2026-10-08T00:00:00.000Z",
  seenHashes: [], downloadedEpisodes: [], pendingAsks: [],
};

function assertPlainKeyboard(kb: ReturnType<typeof keyboards.mainMenuKeyboard>) {
  for (const button of kb.inline_keyboard.flat()) {
    assert.ok(button.text.trim(), "buttons keep a readable label");
    assert.doesNotMatch(button.text, EMOJI);
  }
}

describe("plain-text bot UI", () => {
  it("has no emoji literals anywhere in the bot source, including notifications", () => {
    const root = fileURLToPath(new URL("../src/", import.meta.url));
    function scan(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) scan(file);
        else if (file.endsWith(".ts")) assert.doesNotMatch(fs.readFileSync(file, "utf8"), EMOJI, file);
      }
    }
    scan(root);
  });

  it("keeps every static keyboard readable and emoji-free", () => {
    for (const kb of [
      keyboards.mainMenuKeyboard(), keyboards.providerKeyboard(), keyboards.resolutionKeyboard(),
      keyboards.subscriptionCardKeyboard(sub), keyboards.confirmDownloadAllKeyboard(),
      keyboards.pollIntervalKeyboard(), keyboards.settingsKeyboard(),
      keyboards.downloaderClientChoiceKeyboard(), keyboards.qbitAuthChoiceKeyboard(),
      keyboards.backToMainKeyboard(), keyboards.episodeAskKeyboard(sub.id, "123"),
      keyboards.bulkAskKeyboard(sub.id, "batch"),
    ]) assertPlainKeyboard(kb);
    assert.deepEqual(keyboards.mainMenuKeyboard().inline_keyboard.flat().map((b) => b.text),
      ["Subscriptions", "Add", "Download existing", "Settings", "Help"]);
  });

  it("renders plain-text lists, status messages, details and edit/delete buttons", () => {
    const settings: Settings = { downloader: null, pollIntervalMinutes: 10 };
    const configured: Settings = { ...settings, downloader: { baseUrl: "http://localhost", downloadDirIndex: 0 } };
    const pending = { ...sub, pendingAsks: [{ torrentId: "1", infoHash: "h", title: "Release", episode: "01", magnet: "m" }] };
    const views = [renderEmptyList(), renderDeleteConfirm(sub, 0)];
    for (const config of [settings, configured]) {
      for (const show of [sub, pending]) {
        views.push(renderSubscriptionList([show], config, 0), renderSubscriptionDetails(show, config, 0));
      }
    }
    for (const view of views) {
      assert.doesNotMatch(view.text, EMOJI);
      assertPlainKeyboard(view.keyboard);
    }
    assertPlainKeyboard(editProviderKeyboard(sub, 0));
    assertPlainKeyboard(editResolutionKeyboard(sub, 0));
    assert.equal(editProviderKeyboard(sub, 0).inline_keyboard[0][0].text, "Current: SubsPlease");
    assert.equal(editResolutionKeyboard(sub, 0).inline_keyboard[0][2].text, "Current: 1080p");
  });
});
