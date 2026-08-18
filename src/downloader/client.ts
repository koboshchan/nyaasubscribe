export interface DownloadDir {
  path: string;
  available: number;
}

export class DownloaderError extends Error {}

interface ListDirsResponse {
  "download-dirs"?: DownloadDir[];
}

export class DownloaderClient {
  constructor(
    private readonly baseUrl: string,
    private readonly username: string,
    private readonly password: string,
  ) {}

  private authHeader(): string {
    return "Basic " + Buffer.from(`${this.username}:${this.password}`).toString("base64");
  }

  private normalizedBase(): string {
    return this.baseUrl.endsWith("/") ? this.baseUrl.slice(0, -1) : this.baseUrl;
  }

  async getToken(): Promise<string> {
    const base = this.normalizedBase();
    const res = await fetch(`${base}/gui/token.html?t=${Date.now()}`, {
      headers: { Authorization: this.authHeader() },
    });
    if (!res.ok) {
      throw new DownloaderError(`Token request failed: ${res.status}`);
    }
    const html = await res.text();
    const match = html.match(/id=['"]token['"][^>]*>([^<]+)</i);
    if (!match) {
      throw new DownloaderError("Could not find token in response");
    }
    return match[1].trim();
  }

  async listDirs(token: string): Promise<DownloadDir[]> {
    const base = this.normalizedBase();
    const res = await fetch(
      `${base}/gui/?token=${encodeURIComponent(token)}&action=list-dirs&t=${Date.now()}`,
      { headers: { Authorization: this.authHeader() } },
    );
    if (!res.ok) {
      throw new DownloaderError(`list-dirs failed: ${res.status}`);
    }
    const json = (await res.json()) as ListDirsResponse;
    return json["download-dirs"] ?? [];
  }

  async addUrl(token: string, magnet: string, dirIndex: number): Promise<void> {
    const base = this.normalizedBase();
    const res = await fetch(
      `${base}/gui/?token=${encodeURIComponent(token)}&action=add-url&s=${encodeURIComponent(magnet)}&download_dir=${dirIndex}&path=&t=${Date.now()}`,
      { headers: { Authorization: this.authHeader() } },
    );
    if (!res.ok) {
      throw new DownloaderError(`add-url failed: ${res.status}`);
    }
  }
}
