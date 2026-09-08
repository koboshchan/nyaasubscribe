import type { NyaaItem, Provider } from "./types";

const PROVIDER_USER: Record<Provider, string> = {
  subsplease: "subsplease",
  "erai-raws": "erai-raws",
  "tsundere-raws": "Tsundere-Raws",
};

const PAGE_SIZE = 75;
const MAX_PAGES = 20;

interface NyaaApiSearchItem {
  title?: string;
  link?: string;
  magnet?: string;
  size?: string;
  seeders?: number;
}

interface NyaaApiSearchResponse {
  count?: number;
  data?: NyaaApiSearchItem[];
}

// nyaaapi.onrender.com wraps nyaa.si's search with real pagination via the
// per-uploader endpoint. nyaa's own RSS feed has no pagination at all and is
// hard-capped to the ~75 most recent items, which silently drops older
// episodes once a show's total releases (episodes x resolutions) exceed
// that cap.
function searchUrl(provider: Provider, animeName: string, page: number): string {
  const user = PROVIDER_USER[provider];
  return `https://nyaaapi.onrender.com/nyaa/user/${encodeURIComponent(user)}?q=${encodeURIComponent(animeName)}&page=${page}`;
}

function parseItem(raw: NyaaApiSearchItem): NyaaItem | null {
  const { title, link, magnet } = raw;
  if (!title || !link || !magnet) return null;

  const torrentIdMatch = link.match(/\/view\/(\d+)/);
  const infoHashMatch = magnet.match(/btih:([0-9A-Fa-f]{40})/);
  if (!torrentIdMatch || !infoHashMatch) return null;

  return {
    title,
    guid: link,
    torrentId: torrentIdMatch[1],
    infoHash: infoHashMatch[1].toLowerCase(),
    magnet,
    seeders: Number(raw.seeders ?? 0),
    size: raw.size ?? "",
  };
}

export async function fetchProviderFeed(provider: Provider, animeName: string): Promise<NyaaItem[]> {
  const items: NyaaItem[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(searchUrl(provider, animeName, page));
    if (!res.ok) {
      throw new Error(`nyaaapi search failed: ${res.status}`);
    }
    const json = (await res.json()) as NyaaApiSearchResponse;
    const pageItems = json.data ?? [];

    for (const raw of pageItems) {
      const item = parseItem(raw);
      if (item) items.push(item);
    }

    if (pageItems.length < PAGE_SIZE) break;
  }

  return items;
}
