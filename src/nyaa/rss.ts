import Parser from "rss-parser";
import type { NyaaItem, Provider } from "./types";

interface NyaaFeedFields {
  infoHash?: string;
  trusted?: string;
  seeders?: string;
  size?: string;
}

const parser: Parser<Record<string, never>, NyaaFeedFields> = new Parser({
  customFields: {
    item: [
      ["nyaa:infoHash", "infoHash"],
      ["nyaa:trusted", "trusted"],
      ["nyaa:seeders", "seeders"],
      ["nyaa:size", "size"],
    ],
  },
});

const PROVIDER_USER: Record<Provider, string> = {
  subsplease: "subsplease",
  "erai-raws": "erai-raws",
  "tsundere-raws": "Tsundere-Raws",
};

// Scoped to a single uploader account (u=), so the uploader's identity is
// the trust signal, not the nyaa "trusted" badge or a fixed category - some
// providers (e.g. Tsundere-Raws) publish outside the English-translated
// category.
export function feedUrl(provider: Provider, animeName: string): string {
  const user = PROVIDER_USER[provider];
  return `https://nyaa.si/?page=rss&u=${encodeURIComponent(user)}&q=${encodeURIComponent(animeName)}`;
}

export async function fetchProviderFeed(provider: Provider, animeName: string): Promise<NyaaItem[]> {
  const feed = await parser.parseURL(feedUrl(provider, animeName));
  const items: NyaaItem[] = [];

  for (const item of feed.items ?? []) {
    const guid = item.guid ?? item.link ?? "";
    const torrentIdMatch = guid.match(/\/view\/(\d+)/);
    if (!torrentIdMatch || !item.title || !item.infoHash) continue;

    items.push({
      title: item.title,
      guid,
      torrentId: torrentIdMatch[1],
      pubDate: item.pubDate ?? "",
      infoHash: item.infoHash.toLowerCase(),
      trusted: (item.trusted ?? "").toLowerCase() === "yes",
      seeders: Number(item.seeders ?? 0),
      size: item.size ?? "",
    });
  }

  return items;
}
