import type { ParsedRelease, Provider, Resolution } from "./types";

const RESOLUTIONS: Resolution[] = ["480p", "720p", "1080p"];

// [SubsPlease] Mushoku Tensei S3 - 08 (1080p) [0161AAEA].mkv
const SUBSPLEASE_RE = /^\[SubsPlease\] (.+?) - (\d+) \((\d+p)\) \[[0-9A-Fa-f]{8}\]/;

// [Erai-raws] Liar Game - 20 [1080p CR WEB-DL AVC AAC][MultiSub][4B83888F]
const ERAI_RAWS_RE = /^\[Erai-raws\] (.+?) - (\d+) \[(\d+p)[^\]]*\]\[[^\]]*\]\[[0-9A-Fa-f]{8}\]/;

// Tomb Raider King S01E07 SUBFRENCH 1080p CR WEB-DL AAC2.0 H.264-Tsundere-Raws (VOSTFR, ...)
// One Piece EP1174 REPACK SUBFRENCH 1080p ADN WEB-DL AAC2.0 x264-Tsundere-Raws
const TSUNDERE_RAWS_RE = /^(.+?)\s+(?:S(\d+))?(?:E|EP)(\d+)\b.+?\b(\d{3,4}p)\b.+-Tsundere-Raws\b/i;

export function parseReleaseTitle(provider: Provider, title: string): ParsedRelease | null {
  if (provider === "tsundere-raws") {
    const match = title.match(TSUNDERE_RAWS_RE);
    if (!match) return null;

    const [, show, season, episode, resolution] = match;
    if (!RESOLUTIONS.includes(resolution as Resolution)) return null;

    const episodeStr = season ? `S${season}E${episode}` : episode;
    return { show: show.trim(), episode: episodeStr, resolution: resolution as Resolution };
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
  return (
    parsed.show.toLowerCase() === animeName.trim().toLowerCase() && parsed.resolution === resolution
  );
}
