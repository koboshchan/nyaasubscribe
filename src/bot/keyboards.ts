import { InlineKeyboard } from "grammy";
import type { Subscription } from "../store/types";

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Subscriptions", "menu:subscriptions")
    .row()
    .text("Add Subscription", "menu:add")
    .row()
    .text("Settings", "menu:settings")
    .row()
    .text("Help", "menu:help");
}

export function providerKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("SubsPlease", "provider:subsplease")
    .row()
    .text("Erai-raws", "provider:erai-raws");
}

export function resolutionKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("480p", "resolution:480p")
    .text("720p", "resolution:720p")
    .text("1080p", "resolution:1080p");
}

export function subscriptionCardKeyboard(sub: Subscription): InlineKeyboard {
  return new InlineKeyboard().text("Remove", `remove-sub:${sub.id}`);
}

export function pollIntervalKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("5 min", "poll:5")
    .text("10 min", "poll:10")
    .text("15 min", "poll:15")
    .text("30 min", "poll:30");
}

export function settingsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Configure Downloader", "settings:downloader")
    .row()
    .text("Poll Interval", "settings:poll")
    .row()
    .text("Back", "menu:main");
}

export function backToMainKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("Back", "menu:main");
}

export function episodeAskKeyboard(subId: string, torrentId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("Download this release", `epdl:${subId}:${torrentId}`)
    .text("Skip", `epskip:${subId}:${torrentId}`);
}
