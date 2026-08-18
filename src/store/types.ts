import type { Provider, Resolution } from "../nyaa/types";

export interface DownloaderConfig {
  baseUrl: string;
  username: string;
  password: string;
  downloadDirIndex: number;
}

export interface Settings {
  downloader: DownloaderConfig | null;
  pollIntervalMinutes: number;
}

export interface PendingAsk {
  torrentId: string;
  infoHash: string;
  title: string;
  episode: string;
}

export interface Subscription {
  id: string;
  animeName: string;
  provider: Provider;
  resolution: Resolution;
  createdAt: string;
  seenHashes: string[];
  downloadedEpisodes: string[];
  pendingAsks: PendingAsk[];
}

export interface Db {
  settings: Settings;
  subscriptions: Subscription[];
}
