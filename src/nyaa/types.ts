export type Provider = "subsplease" | "erai-raws" | "tsundere-raws";
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
  episode: string;
  resolution: Resolution;
}
