import type { Provider, Resolution } from "../nyaa/types";

export type DownloaderClientType = "ubit" | "qbit";
export type QBitAuthMethod = "password" | "token";

export interface DownloaderConfig {
  clientType?: DownloaderClientType;
  baseUrl: string;
  username?: string;
  password?: string;
  apiToken?: string;
  authMethod?: QBitAuthMethod;
  downloadDirIndex: number;
  downloadDirPath?: string;
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
