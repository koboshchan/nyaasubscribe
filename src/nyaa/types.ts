export type Provider = "subsplease" | "erai-raws" | "tsundere-raws" | "anozu" | "toonshub";
export type Resolution = "480p" | "720p" | "1080p";

export interface NyaaItem {
  title: string;
  guid: string;
  torrentId: string;
  infoHash: string;
  magnet: string;
  seeders: number;
  size: string;
}

export interface ParsedRelease {
  show: string;
  // AnoZu titles carry both an English name and the original romaji/JP name
  // (e.g. "... | Toumei na Yoru ni Kakeru Kimi to..."), and either should be
  // usable as the subscription name.
  altShow?: string;
  episode: string;
  resolution: Resolution;
}
