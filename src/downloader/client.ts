import type { DownloaderConfig } from "../store/types";
import {
  type DownloadDir,
  DownloaderError,
  TorrentAlreadyExistsError,
  type IDownloaderClient,
  type DownloaderClientType,
  type QBitAuthMethod,
} from "./types";
import { UBitDownloaderClient } from "./ubit";
import { QBitDownloaderClient, type QBitClientOptions } from "./qbit";

export {
  type DownloadDir,
  DownloaderError,
  TorrentAlreadyExistsError,
  type IDownloaderClient,
  type DownloaderClientType,
  type QBitAuthMethod,
  UBitDownloaderClient,
  QBitDownloaderClient,
  type QBitClientOptions,
};

export function createDownloaderClient(
  configOrBaseUrl: DownloaderConfig | string,
  username?: string,
  password?: string,
  clientType?: DownloaderClientType,
  apiToken?: string,
): IDownloaderClient {
  if (typeof configOrBaseUrl === "string") {
    const type = clientType ?? "ubit";
    if (type === "qbit") {
      return new QBitDownloaderClient({
        baseUrl: configOrBaseUrl,
        username,
        password,
        apiToken,
      });
    }
    return new UBitDownloaderClient(configOrBaseUrl, username ?? "", password ?? "");
  }

  const config = configOrBaseUrl;
  const type = config.clientType ?? "ubit";
  if (type === "qbit") {
    return new QBitDownloaderClient({
      baseUrl: config.baseUrl,
      username: config.username,
      password: config.password,
      apiToken: config.apiToken,
    });
  }
  return new UBitDownloaderClient(config.baseUrl, config.username ?? "", config.password ?? "");
}

export class DownloaderClient implements IDownloaderClient {
  private readonly delegate: IDownloaderClient;

  constructor(
    configOrBaseUrl: DownloaderConfig | string,
    username?: string,
    password?: string,
    clientType?: DownloaderClientType,
    apiToken?: string,
  ) {
    this.delegate = createDownloaderClient(configOrBaseUrl, username, password, clientType, apiToken);
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

  hasTorrent(token: string, hashOrMagnet: string): Promise<boolean> {
    return this.delegate.hasTorrent(token, hashOrMagnet);
  }
}
