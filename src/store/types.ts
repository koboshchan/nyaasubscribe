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

export interface Subscription {
  id: string;
  animeName: string;
  provider: Provider;
  resolution: Resolution;
  createdAt: string;
  seenHashes: string[];
}

export interface Db {
  settings: Settings;
  subscriptions: Subscription[];
}
