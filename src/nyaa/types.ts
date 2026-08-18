export type Provider = "subsplease" | "erai-raws";
export type Resolution = "480p" | "720p" | "1080p";

export interface NyaaItem {
  title: string;
  guid: string;
  torrentId: string;
  pubDate: string;
  infoHash: string;
  trusted: boolean;
  seeders: number;
  size: string;
}

export interface ParsedRelease {
  show: string;
  episode: string;
  resolution: Resolution;
}
