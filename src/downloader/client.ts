export interface DownloadDir {
  path: string;
  available: number;
}

export class DownloaderError extends Error {}

interface ListDirsResponse {
  "download-dirs"?: DownloadDir[];
}

export class DownloaderClient {
  // The token from /gui/token.html is bound to a GUID session cookie set on
  // that same response; every subsequent /gui/ call must send it back or the
  // server rejects the token with a 400, even though the token itself is valid.
  private cookie: string | null = null;

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

  private requestHeaders(): Record<string, string> {
    const headers: Record<string, string> = { Authorization: this.authHeader() };
    if (this.cookie) {
      headers.Cookie = this.cookie;
    }
    return headers;
  }

  private captureCookie(res: Response): void {
    const setCookie = res.headers.getSetCookie?.() ?? [];
    const cookies = setCookie.length > 0 ? setCookie : [res.headers.get("set-cookie") ?? ""].filter(Boolean);
    if (cookies.length > 0) {
      this.cookie = cookies.map((c) => c.split(";")[0]).join("; ");
    }
  }

  async getToken(): Promise<string> {
    const base = this.normalizedBase();
    const res = await fetch(`${base}/gui/token.html?t=${Date.now()}`, {
      headers: this.requestHeaders(),
    });
    if (!res.ok) {
      throw new DownloaderError(`Token request failed: ${res.status}`);
    }
    this.captureCookie(res);
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
      { headers: this.requestHeaders() },
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
      { headers: this.requestHeaders() },
    );
    if (!res.ok) {
      throw new DownloaderError(`add-url failed: ${res.status}`);
    }
  }
}
