import type { ParsedRelease, Provider, Resolution } from "./types";

const RESOLUTIONS: Resolution[] = ["480p", "720p", "1080p"];

// [SubsPlease] Mushoku Tensei S3 - 08 (1080p) [0161AAEA].mkv
const SUBSPLEASE_RE = /^\[SubsPlease\] (.+?) - (\d+) \((\d+p)\) \[[0-9A-Fa-f]{8}\]/;

// [Erai-raws] Liar Game - 20 [1080p CR WEB-DL AVC AAC][MultiSub][4B83888F]
const ERAI_RAWS_RE = /^\[Erai-raws\] (.+?) - (\d+) \[(\d+p)[^\]]*\]\[[^\]]*\]\[[0-9A-Fa-f]{8}\]/;

// Tomb Raider King S01E07 SUBFRENCH 1080p CR WEB-DL AAC2.0 H.264-Tsundere-Raws (VOSTFR, ...)
// One Piece EP1174 REPACK SUBFRENCH 1080p ADN WEB-DL AAC2.0 x264-Tsundere-Raws
const TSUNDERE_RAWS_RE = /^(.+?)\s+(?:S(\d+))?(?:E|EP)(\d+)\b.+?\b(\d{3,4}p)\b.+-Tsundere-Raws\b/i;

// [AnoZu] Love Unseen Beneath the Clear Night Sky 2026 S01E11 1080p CR WEB-DL AAC 2.0 H.264 | Toumei na Yoru ni Kakeru Kimi to, Me ni Mienai Koi wo Shita.
// [AnoZu] LIAR GAME 2026 S01E24 1080p CR WEB-DL AAC 2.0 H.264 (no alt name)
const ANOZU_RE = /^\[AnoZu\] (.+?) S(\d+)E(\d+) (\d+p)[^|]*(?:\| (.+))?$/;

// [ToonsHub] Love Unseen Beneath the Clear Night Sky 2026 S01E02 1080p CR WEB-DL AAC2.0 H.264 (Toumei na Yoru ni Kakeru Kimi to, Me ni Mienai Koi wo Shita., Multi-Subs)
// [ToonsHub] LIAR GAME S01E25 1080p CR WEB-DL AAC2.0 H.264 (Multi-Subs)
// [ToonsHub] LIAR GAME S01E25 1080p AMZN WEB-DL DDP2.0 H.264
// [ToonsHub] One Piece EP1179 1080p CR WEB-DL AAC2.0 H.264 (English-Sub)
const TOONSHUB_RE = /^\[ToonsHub\] (.+?)\s+(?:S(\d+))?(?:E|EP)(\d+)\s+(\d{3,4}p)\b.*?(?:\s*\((.+)\))?$/;

const TOONSHUB_KNOWN_TAGS = new Set([
  "multi-subs",
  "multi-sub",
  "english-sub",
  "english-subs",
  "japanese sub",
  "japanese-sub",
  "dual-audio",
  "multi-audio",
  "vostfr",
]);

function parseToonsHubAltShow(insideParens?: string): string | undefined {
  if (!insideParens) return undefined;
  let remaining = insideParens.trim();

  while (true) {
    const lastCommaIdx = remaining.lastIndexOf(",");
    if (lastCommaIdx === -1) {
      if (TOONSHUB_KNOWN_TAGS.has(remaining.toLowerCase())) {
        return undefined;
      }
      break;
    }
    const tail = remaining.slice(lastCommaIdx + 1).trim();
    if (TOONSHUB_KNOWN_TAGS.has(tail.toLowerCase())) {
      remaining = remaining.slice(0, lastCommaIdx).trim();
    } else {
      break;
    }
  }

  const cleaned = stripTrailingPeriod(remaining.trim());
  return cleaned.length > 0 ? cleaned : undefined;
}

function stripTrailingPeriod(s: string): string {
  return s.endsWith(".") ? s.slice(0, -1) : s;
}

export function parseReleaseTitle(provider: Provider, title: string): ParsedRelease | null {
  if (provider === "tsundere-raws") {
    const match = title.match(TSUNDERE_RAWS_RE);
    if (!match) return null;

    const [, show, season, episode, resolution] = match;
    if (!RESOLUTIONS.includes(resolution as Resolution)) return null;

    const episodeStr = season ? `S${season}E${episode}` : episode;
    return { show: show.trim(), episode: episodeStr, resolution: resolution as Resolution };
  }

  if (provider === "anozu") {
    const match = title.match(ANOZU_RE);
    if (!match) return null;

    const [, show, season, episode, resolution, altShow] = match;
    if (!RESOLUTIONS.includes(resolution as Resolution)) return null;

    return {
      show: stripTrailingPeriod(show.trim()),
      altShow: altShow ? stripTrailingPeriod(altShow.trim()) : undefined,
      episode: `S${season}E${episode}`,
      resolution: resolution as Resolution,
    };
  }

  if (provider === "toonshub") {
    const match = title.match(TOONSHUB_RE);
    if (!match) return null;

    const [, show, season, episode, resolution, parens] = match;
    if (!RESOLUTIONS.includes(resolution as Resolution)) return null;

    const episodeStr = season ? `S${season}E${episode}` : episode;
    return {
      show: stripTrailingPeriod(show.trim()),
      altShow: parseToonsHubAltShow(parens),
      episode: episodeStr,
      resolution: resolution as Resolution,
    };
  }

  const re = provider === "subsplease" ? SUBSPLEASE_RE : ERAI_RAWS_RE;
  const match = title.match(re);
  if (!match) return null;

  const [, show, episode, resolution] = match;
  if (!RESOLUTIONS.includes(resolution as Resolution)) return null;

  return { show: show.trim(), episode, resolution: resolution as Resolution };
}

// Erai-raws often dual-releases the same episode/resolution as both a WEB-DL
// (preferred, usually posted first) and a WEBRip (fallback) encode.
export function isWebRip(title: string): boolean {
  return /web-?rip/i.test(title);
}

export function matchesSubscription(
  provider: Provider,
  title: string,
  animeName: string,
  resolution: Resolution,
): boolean {
  const parsed = parseReleaseTitle(provider, title);
  if (!parsed) return false;

  const target = animeName.trim().toLowerCase();
  const targetClean = stripTrailingPeriod(target);
  const targetWithoutYear = targetClean.replace(/\s+\d{4}$/, "");

  const showClean = stripTrailingPeriod(parsed.show.trim().toLowerCase());
  const showWithoutYear = showClean.replace(/\s+\d{4}$/, "");

  const altClean = parsed.altShow
    ? stripTrailingPeriod(parsed.altShow.trim().toLowerCase())
    : undefined;

  const nameMatches =
    showClean === target ||
    showClean === targetClean ||
    showClean === targetWithoutYear ||
    showWithoutYear === target ||
    showWithoutYear === targetClean ||
    showWithoutYear === targetWithoutYear ||
    (altClean !== undefined && (
      altClean === target ||
      altClean === targetClean
    ));

  return nameMatches && parsed.resolution === resolution;
}
