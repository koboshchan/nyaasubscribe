import type { Provider, Resolution } from "../nyaa/types";

// Single source of truth for values a subscription may hold. Lookups use own
// properties only, so keys like "__proto__" or "constructor" are never valid.
export const PROVIDER_IDS: readonly Provider[] = ["subsplease", "erai-raws", "tsundere-raws", "anozu", "toonshub"];
export const RESOLUTION_IDS: readonly Resolution[] = ["480p", "720p", "1080p"];
export const MAX_TITLE_CHARS = 200;

export function isProvider(value: unknown): value is Provider {
  return typeof value === "string" && (PROVIDER_IDS as readonly string[]).includes(value);
}

export function isResolution(value: unknown): value is Resolution {
  return typeof value === "string" && (RESOLUTION_IDS as readonly string[]).includes(value);
}

export type TitleCheck = { ok: true; value: string } | { ok: false; reason: "empty" | "too-long" | "command" };

// Titles are counted in Unicode code points, not UTF-16 units.
export function checkTitle(raw: unknown): TitleCheck {
  if (typeof raw !== "string") return { ok: false, reason: "empty" };
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return { ok: false, reason: "empty" };
  if (value.startsWith("/")) return { ok: false, reason: "command" };
  if ([...value].length > MAX_TITLE_CHARS) return { ok: false, reason: "too-long" };
  return { ok: true, value };
}
