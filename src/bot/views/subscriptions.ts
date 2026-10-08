import { InlineKeyboard } from "grammy";
import type { Provider, Resolution } from "../../nyaa/types";
import type { Settings, Subscription } from "../../store/types";
import { buildSearchQuery } from "../../nyaa/search";
import { RESOLUTION_IDS, isProvider } from "../../store/validation";

export const TELEGRAM_TEXT_LIMIT = 4096;
// Display caps for legacy data that predates title validation.
export const DISPLAY_TITLE_CHARS = 200;
export const LIST_TITLE_CHARS = 100;
export const DISPLAY_QUERY_CHARS = 250;
export const DISPLAY_EPISODE_CHARS = 20;
export const DISPLAY_ASK_TITLE_CHARS = 120;

export const PAGE_SIZE = 5;

export const PROVIDER_LABELS: Record<Provider, string> = {
  subsplease: "SubsPlease",
  "erai-raws": "Erai-raws",
  "tsundere-raws": "Tsundere-Raws",
  anozu: "AnoZu",
  toonshub: "ToonsHub",
};

export const RESOLUTIONS: Resolution[] = [...RESOLUTION_IDS];

export function providerLabel(provider: string): string {
  return isProvider(provider) ? PROVIDER_LABELS[provider] : escapeHtml(truncate(provider, 40));
}

// Length of the text Telegram counts after HTML entity parsing (UTF-16 units).
export function parsedLength(html: string): number {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&").length;
}

// Escaped, length-bounded title for message bodies.
export function titleHtml(title: string, max = DISPLAY_TITLE_CHARS): string {
  return escapeHtml(truncate(title, max));
}

// Telegram HTML parse mode only needs these three escaped.
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function truncate(text: string, max: number): string {
  const chars = [...text];
  return chars.length <= max ? text : chars.slice(0, max - 1).join("") + "…";
}

export interface Page<T> {
  items: T[];
  page: number;
  totalPages: number;
  start: number;
}

export function paginate<T>(all: T[], page: number, size = PAGE_SIZE): Page<T> {
  const totalPages = Math.max(1, Math.ceil(all.length / size));
  const safe = Number.isFinite(page) ? Math.min(Math.max(0, Math.floor(page)), totalPages - 1) : 0;
  const start = safe * size;
  return { items: all.slice(start, start + size), page: safe, totalPages, start };
}

function episodeSortKey(ep: string): number {
  const n = parseFloat(ep);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

export function latestDownloadedEpisode(sub: Subscription): string | undefined {
  if (sub.downloadedEpisodes.length === 0) return undefined;
  return [...sub.downloadedEpisodes].sort((a, b) => episodeSortKey(a) - episodeSortKey(b)).at(-1);
}

export type SubStatus = "paused" | "needs-you" | "watching";

export function subscriptionStatus(sub: Subscription, settings: Settings): SubStatus {
  // The poller skips every subscription while no downloader is configured.
  if (!settings.downloader) return "paused";
  if (sub.pendingAsks.length > 0) return "needs-you";
  return "watching";
}

const STATUS_SHORT: Record<SubStatus, string> = {
  paused: "⏸ paused",
  "needs-you": "🔔 needs you",
  watching: "🟢 watching",
};

function statusLine(sub: Subscription, settings: Settings): string {
  switch (subscriptionStatus(sub, settings)) {
    case "paused":
      return "⏸ Paused - no downloader configured, so nothing is polled";
    case "needs-you": {
      const n = sub.pendingAsks.length;
      return `🔔 ${n} release${n === 1 ? "" : "s"} waiting for your decision`;
    }
    case "watching":
      return `🟢 Watching - scheduled every ${settings.pollIntervalMinutes} min`;
  }
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return "unknown";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(d);
}

function countLine(sub: Subscription): string {
  const dl = sub.downloadedEpisodes.length;
  const latest = latestDownloadedEpisode(sub);
  const parts = [`${dl} downloaded${latest ? ` (latest ep ${escapeHtml(truncate(latest, DISPLAY_EPISODE_CHARS))})` : ""}`];
  if (sub.pendingAsks.length) parts.push(`${sub.pendingAsks.length} pending`);
  return parts.join(" · ");
}

// ---------- list ----------

export function renderSubscriptionList(subs: Subscription[], settings: Settings, page: number): { text: string; keyboard: InlineKeyboard; page: number } {
  const p = paginate(subs, page);
  const lines: string[] = [`<b>📺 Subscriptions</b> · ${subs.length}`];
  if (!settings.downloader) {
    lines.push("", "⚠️ <b>No downloader configured.</b> Nothing is checked or downloaded until you set one up.");
  }
  p.items.forEach((sub, i) => {
    lines.push(
      "",
      `<b>${p.start + i + 1}. ${titleHtml(sub.animeName, LIST_TITLE_CHARS)}</b>`,
      `${providerLabel(sub.provider)} · ${escapeHtml(sub.resolution)} · ${STATUS_SHORT[subscriptionStatus(sub, settings)]}`,
      countLine(sub),
    );
  });
  if (p.totalPages > 1) lines.push("", `<i>Page ${p.page + 1} of ${p.totalPages}</i>`);

  const kb = new InlineKeyboard();
  p.items.forEach((sub, i) => {
    kb.text(`${p.start + i + 1}. ${truncate(sub.animeName, 28)}`, `s:v:${sub.id}:${p.page}`).row();
  });
  if (p.totalPages > 1) {
    kb.text(p.page > 0 ? "‹ Prev" : "·", p.page > 0 ? `s:l:${p.page - 1}` : "s:noop");
    kb.text(`${p.page + 1}/${p.totalPages}`, "s:noop");
    kb.text(p.page < p.totalPages - 1 ? "Next ›" : "·", p.page < p.totalPages - 1 ? `s:l:${p.page + 1}` : "s:noop");
    kb.row();
  }
  if (!settings.downloader) kb.text("⚙️ Set up downloader", "settings:downloader").row();
  kb.text("➕ Add", "menu:add").text("‹ Menu", "menu:main");
  return { text: lines.join("\n"), keyboard: kb, page: p.page };
}

export function renderEmptyList(): { text: string; keyboard: InlineKeyboard } {
  return {
    text: [
      "<b>📺 Subscriptions</b> · 0",
      "",
      "Nothing tracked yet. Add a show and pick a provider + resolution; new episodes get sent to your downloader automatically.",
    ].join("\n"),
    keyboard: new InlineKeyboard().text("➕ Add subscription", "menu:add").row().text("‹ Menu", "menu:main"),
  };
}

// ---------- details ----------

export function renderSubscriptionDetails(sub: Subscription, settings: Settings, page: number): { text: string; keyboard: InlineKeyboard } {
  const { query, uploader } = buildSearchQuery(sub.provider, sub.animeName);
  const label = providerLabel(sub.provider);
  const scope = uploader
    ? `uploads by <code>${escapeHtml(uploader)}</code> on nyaa`
    : `all of nyaa (${label} uploads anonymously)`;
  // pendingAsks is append-only, so the last entry is the latest one saved.
  const latestAsk = sub.pendingAsks.at(-1);
  const queryTruncated = [...query].length > DISPLAY_QUERY_CHARS;
  const latestEp = latestDownloadedEpisode(sub);

  const lines = [
    `<b>${titleHtml(sub.animeName)}</b>`,
    statusLine(sub, settings),
    "",
    "<b>Search</b>",
    `Query: <code>${escapeHtml(truncate(query, DISPLAY_QUERY_CHARS))}</code>${queryTruncated ? " <i>(query truncated)</i>" : ""}`,
    `Scope: ${scope}`,
    `Filters: ${label} release format · ${escapeHtml(sub.resolution)} · title matches`,
    "",
    "<b>Progress</b>",
    `Downloaded: ${sub.downloadedEpisodes.length} episode${sub.downloadedEpisodes.length === 1 ? "" : "s"}${latestEp ? ` (latest ep ${escapeHtml(truncate(latestEp, DISPLAY_EPISODE_CHARS))})` : ""}`,
    `Pending: ${sub.pendingAsks.length}`,
  ];
  if (latestAsk) {
    lines.push(`Latest saved pending match: ep ${escapeHtml(truncate(latestAsk.episode, DISPLAY_EPISODE_CHARS))}`, `<i>${escapeHtml(truncate(latestAsk.title, DISPLAY_ASK_TITLE_CHARS))}</i>`);
  }
  lines.push("", `Added ${formatDate(sub.createdAt)}`);

  const kb = new InlineKeyboard()
    .text("⬇️ Download existing", `dlexisting:${sub.id}`)
    .row()
    .text("✏️ Rename", `s:et:${sub.id}`)
    .text("🏷 Provider", `s:ep:${sub.id}:${page}`)
    .text("📐 Quality", `s:er:${sub.id}:${page}`)
    .row()
    .text("🗑 Delete", `s:d:${sub.id}:${page}`)
    .text("‹ Back", `s:l:${page}`);
  return { text: lines.join("\n"), keyboard: kb };
}

export function renderDeleteConfirm(sub: Subscription, page: number): { text: string; keyboard: InlineKeyboard } {
  return {
    text: [
      `<b>Delete ${titleHtml(sub.animeName)}?</b>`,
      "",
      `Stops tracking new ${providerLabel(sub.provider)} ${escapeHtml(truncate(sub.resolution, 20))} releases and forgets its download history (${sub.downloadedEpisodes.length} episodes). Files already downloaded are not touched.`,
    ].join("\n"),
    keyboard: new InlineKeyboard().text("🗑 Yes, delete", `s:dy:${sub.id}:${page}`).text("Cancel", `s:v:${sub.id}:${page}`),
  };
}

export function editProviderKeyboard(sub: Subscription, page: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  (Object.keys(PROVIDER_LABELS) as Provider[]).forEach((p, i) => {
    kb.text(`${p === sub.provider ? "✓ " : ""}${PROVIDER_LABELS[p]}`, `s:sp:${sub.id}:${p}:${page}`);
    if (i % 2 === 1) kb.row();
  });
  return kb.row().text("‹ Back", `s:v:${sub.id}:${page}`);
}

export function editResolutionKeyboard(sub: Subscription, page: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const r of RESOLUTIONS) kb.text(`${r === sub.resolution ? "✓ " : ""}${r}`, `s:sr:${sub.id}:${r}:${page}`);
  return kb.row().text("‹ Back", `s:v:${sub.id}:${page}`);
}

export function isDuplicate(subs: Subscription[], candidate: Pick<Subscription, "id" | "animeName" | "provider" | "resolution">): boolean {
  return subs.some(
    (s) =>
      s.id !== candidate.id &&
      s.provider === candidate.provider &&
      s.resolution === candidate.resolution &&
      s.animeName.toLowerCase() === candidate.animeName.toLowerCase(),
  );
}
