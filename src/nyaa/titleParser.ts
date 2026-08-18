import type { ParsedRelease, Provider, Resolution } from "./types";

const RESOLUTIONS: Resolution[] = ["480p", "720p", "1080p"];

// [SubsPlease] Mushoku Tensei S3 - 08 (1080p) [0161AAEA].mkv
const SUBSPLEASE_RE = /^\[SubsPlease\] (.+?) - (\d+) \((\d+p)\) \[[0-9A-Fa-f]{8}\]/;

// [Erai-raws] Liar Game - 20 [1080p CR WEB-DL AVC AAC][MultiSub][4B83888F]
const ERAI_RAWS_RE = /^\[Erai-raws\] (.+?) - (\d+) \[(\d+p)[^\]]*\]\[[^\]]*\]\[[0-9A-Fa-f]{8}\]/;

export function parseReleaseTitle(provider: Provider, title: string): ParsedRelease | null {
  const re = provider === "subsplease" ? SUBSPLEASE_RE : ERAI_RAWS_RE;
  const match = title.match(re);
  if (!match) return null;

  const [, show, episode, resolution] = match;
  if (!RESOLUTIONS.includes(resolution as Resolution)) return null;

  return { show: show.trim(), episode, resolution: resolution as Resolution };
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
