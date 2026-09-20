import { parseDownloaderType, type TorrentDownloaderType } from "../config/env";
import { type DownloadDir, DownloaderError, type IDownloaderClient } from "./types";
import { UBitDownloaderClient } from "./ubit";
import { QBitDownloaderClient } from "./qbit";

export { type DownloadDir, DownloaderError, type IDownloaderClient, UBitDownloaderClient, QBitDownloaderClient };

export function createDownloaderClient(
  baseUrl: string,
  username: string,
  password: string,
  type?: TorrentDownloaderType,
): IDownloaderClient {
  const downloaderType = type ?? parseDownloaderType(process.env.TORRENT_DOWNLOADER);
  if (downloaderType === "q") {
    return new QBitDownloaderClient(baseUrl, username, password);
  }
  return new UBitDownloaderClient(baseUrl, username, password);
}

export class DownloaderClient implements IDownloaderClient {
  private readonly delegate: IDownloaderClient;

  constructor(
    baseUrl: string,
    username: string,
    password: string,
    type?: TorrentDownloaderType,
  ) {
    this.delegate = createDownloaderClient(baseUrl, username, password, type);
  }

  getToken(): Promise<string> {
    return this.delegate.getToken();
  }

  listDirs(token: string): Promise<DownloadDir[]> {
    return this.delegate.listDirs(token);
  }

  addUrl(token: string, magnet: string, dirIndex: number, dirPath?: string): Promise<void> {
    return this.delegate.addUrl(token, magnet, dirIndex, dirPath);
  }
}
