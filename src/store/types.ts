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
  magnet: string;
  // Set when this ask is part of a bulk catch-up batch (see poller), so a
  // single Download All/Skip All action can resolve every item in it at once.
  batchId?: string;
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
