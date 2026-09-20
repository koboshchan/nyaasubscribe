export type TorrentDownloaderType = "u" | "q";

export interface Env {
  botToken: string;
  adminId: number;
  torrentDownloader: TorrentDownloaderType;
}

export function parseDownloaderType(raw?: string | null): TorrentDownloaderType {
  const val = raw?.trim().toLowerCase();
  if (val === "q" || val === "qbit" || val === "qbittorrent") {
    return "q";
  }
  return "u";
}

export function loadEnv(): Env {
  const botToken = process.env.BOT_TOKEN;
  const adminIdRaw = process.env.ADMIN_ID;

  if (!botToken) {
    throw new Error("BOT_TOKEN is not set");
  }
  if (!adminIdRaw) {
    throw new Error("ADMIN_ID is not set");
  }

  const adminId = Number(adminIdRaw);
  if (!Number.isInteger(adminId)) {
    throw new Error("ADMIN_ID must be an integer");
  }

  const torrentDownloader = parseDownloaderType(process.env.TORRENT_DOWNLOADER);

  return { botToken, adminId, torrentDownloader };
}

