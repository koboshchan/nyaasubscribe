import { type DownloadDir, DownloaderError, TorrentAlreadyExistsError, type IDownloaderClient } from "./types";
import { extractInfoHash } from "./hash";

interface QBitCategory {
  name?: string;
  savePath?: string;
}

interface QBitPreferences {
  save_path?: string;
}

export interface QBitClientOptions {
  baseUrl: string;
  username?: string;
  password?: string;
  apiToken?: string;
}

export class QBitDownloaderClient implements IDownloaderClient {
  private cookie: string | null = null;
  private readonly baseUrl: string;
  private readonly username?: string;
  private readonly password?: string;
  private readonly apiToken?: string;

  constructor(
    optionsOrBaseUrl: QBitClientOptions | string,
    username?: string,
    password?: string,
    apiToken?: string,
  ) {
    if (typeof optionsOrBaseUrl === "string") {
      this.baseUrl = optionsOrBaseUrl;
      this.username = username;
      this.password = password;
      this.apiToken = apiToken;
    } else {
      this.baseUrl = optionsOrBaseUrl.baseUrl;
      this.username = optionsOrBaseUrl.username;
      this.password = optionsOrBaseUrl.password;
      this.apiToken = optionsOrBaseUrl.apiToken;
    }
  }

  private normalizedBase(): string {
    return this.baseUrl.endsWith("/") ? this.baseUrl.slice(0, -1) : this.baseUrl;
  }

  private requestHeaders(): Record<string, string> {
    const base = this.normalizedBase();
    const headers: Record<string, string> = {
      Referer: `${base}/`,
      Origin: base,
    };
    if (this.apiToken) {
      headers.Authorization = `Bearer ${this.apiToken}`;
    } else if (this.cookie) {
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

    if (this.apiToken) {
      // For token auth, verify that the token works
      const res = await fetch(`${base}/api/v2/app/version`, {
        headers: this.requestHeaders(),
      });
      if (res.status === 401 || res.status === 403) {
        const errMsg = `API token authentication failed: unauthorized (HTTP ${res.status})`;
        console.error(`[qBittorrent] ${errMsg}`);
        throw new DownloaderError(errMsg);
      }
      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        const errMsg = `API token verification failed: ${res.status}${errorText ? ` - ${errorText.trim()}` : ""}`;
        console.error(`[qBittorrent] ${errMsg}`);
        throw new DownloaderError(errMsg);
      }
      return this.apiToken;
    }

    if (!this.username || !this.password) {
      const errMsg = "Username and password are required for cookie authentication";
      console.error(`[qBittorrent] ${errMsg}`);
      throw new DownloaderError(errMsg);
    }

    const body = new URLSearchParams({
      username: this.username,
      password: this.password,
    });

    const res = await fetch(`${base}/api/v2/auth/login`, {
      method: "POST",
      headers: {
        ...this.requestHeaders(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (res.status === 403) {
      const errMsg = "Login failed: IP banned for too many failed login attempts";
      console.error(`[qBittorrent] ${errMsg}`);
      throw new DownloaderError(errMsg);
    }
    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      const errMsg = `Login request failed: ${res.status}${errorText ? ` - ${errorText.trim()}` : ""}`;
      console.error(`[qBittorrent] ${errMsg}`);
      throw new DownloaderError(errMsg);
    }

    this.captureCookie(res);
    const text = await res.text();
    if (text.trim() === "Fails." || !this.cookie) {
      const errMsg = "Login failed: invalid username or password";
      console.error(`[qBittorrent] ${errMsg}`);
      throw new DownloaderError(errMsg);
    }

    return this.cookie;
  }


  private async fetchWithAuth(url: string, init?: RequestInit): Promise<Response> {
    if (this.apiToken) {
      const res = await fetch(url, {
        ...init,
        headers: {
          ...this.requestHeaders(),
          ...(init?.headers as Record<string, string> | undefined),
        },
      });
      if (res.status === 401 || res.status === 403) {
        throw new DownloaderError("Unauthorized: invalid API token");
      }
      return res;
    }

    if (!this.cookie) {
      await this.getToken();
    }
    let res = await fetch(url, {
      ...init,
      headers: {
        ...this.requestHeaders(),
        ...(init?.headers as Record<string, string> | undefined),
      },
    });

    if (res.status === 403) {
      // Re-authenticate and retry once if session expired
      await this.getToken();
      res = await fetch(url, {
        ...init,
        headers: {
          ...this.requestHeaders(),
          ...(init?.headers as Record<string, string> | undefined),
        },
      });
    }

    return res;
  }

  async listDirs(_token?: string): Promise<DownloadDir[]> {
    const base = this.normalizedBase();

    // 1. Fetch default save path
    let defaultPath = "";
    const savePathRes = await this.fetchWithAuth(`${base}/api/v2/app/defaultSavePath`);
    if (savePathRes.ok) {
      defaultPath = (await savePathRes.text()).trim();
    } else {
      // Fallback to preferences if defaultSavePath is unavailable
      const prefRes = await this.fetchWithAuth(`${base}/api/v2/app/preferences`);
      if (prefRes.ok) {
        const prefs = (await prefRes.json()) as QBitPreferences;
        defaultPath = (prefs.save_path ?? "").trim();
      }
    }

    // 2. Fetch categories
    let categories: Record<string, QBitCategory> = {};
    const catRes = await this.fetchWithAuth(`${base}/api/v2/torrents/categories`);
    if (catRes.ok) {
      categories = (await catRes.json()) as Record<string, QBitCategory>;
    }

    const dirs: DownloadDir[] = [];
    const seen = new Set<string>();

    if (defaultPath) {
      dirs.push({ path: defaultPath, available: 0 });
      seen.add(defaultPath);
    }

    for (const cat of Object.values(categories)) {
      const p = cat.savePath?.trim();
      if (p && !seen.has(p)) {
        dirs.push({ path: p, available: 0 });
        seen.add(p);
      }
    }

    if (dirs.length === 0) {
      throw new DownloaderError("No download directories found in qBittorrent");
    }

    return dirs;
  }

  async addUrl(_token: string, magnet: string, dirIndex: number, dirPath?: string): Promise<void> {
    const base = this.normalizedBase();

    let targetPath = dirPath?.trim();
    if (!targetPath && dirIndex !== undefined && dirIndex > 0) {
      const dirs = await this.listDirs();
      targetPath = dirs[dirIndex]?.path;
    }

    const formData = new FormData();
    formData.append("urls", magnet);
    if (targetPath) {
      formData.append("savepath", targetPath);
    }

    const res = await this.fetchWithAuth(`${base}/api/v2/torrents/add`, {
      method: "POST",
      body: formData,
    });

    if (res.status === 409) {
      const inLibrary = await this.hasTorrent(_token, magnet).catch((err) => {
        console.error("[qBittorrent] Failed to check library for torrent:", err);
        return false;
      });
      throw new TorrentAlreadyExistsError(
        inLibrary
          ? "Torrent already exists in client library"
          : "Torrent already exists in client (409 Conflict)",
      );
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      const errMsg = `add-url failed: ${res.status}${errorText ? ` - ${errorText.trim()}` : ""}`;
      console.error(`[qBittorrent] ${errMsg} for magnet: ${magnet}`);
      throw new DownloaderError(errMsg);
    }

    const text = await res.text();
    if (text.trim() === "Fails.") {
      const errMsg = "Failed to add torrent: qBittorrent rejected the request ('Fails.')";
      console.error(`[qBittorrent] ${errMsg} for magnet: ${magnet}`);
      throw new DownloaderError(errMsg);
    }
  }

  async hasTorrent(_token: string, hashOrMagnet: string): Promise<boolean> {
    const hash = extractInfoHash(hashOrMagnet);
    const base = this.normalizedBase();
    const url = hash
      ? `${base}/api/v2/torrents/info?hashes=${encodeURIComponent(hash)}`
      : `${base}/api/v2/torrents/info`;

    const res = await this.fetchWithAuth(url);
    if (!res.ok) {
      throw new DownloaderError(`Failed to fetch torrent list from qBittorrent: ${res.status}`);
    }
    const data = (await res.json()) as Array<{ hash?: string; name?: string }>;
    if (!Array.isArray(data)) return false;
    if (hash) {
      return data.some((t) => t.hash?.toLowerCase() === hash.toLowerCase());
    }
    return data.length > 0;
  }
}

