export type DownloaderClientType = "ubit" | "qbit";
export type QBitAuthMethod = "password" | "token";

export interface DownloadDir {
  path: string;
  available: number;
}

export class DownloaderError extends Error {}


export interface IDownloaderClient {
  getToken(): Promise<string>;
  listDirs(token: string): Promise<DownloadDir[]>;
  addUrl(token: string, magnet: string, dirIndex: number, dirPath?: string): Promise<void>;
}
