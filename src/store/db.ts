import fs from "node:fs";
import path from "node:path";
import type { Db, PendingAsk, Settings, Subscription } from "./types";

const DATA_DIR = process.env.DATA_DIR || "/data";
const DB_PATH = path.join(DATA_DIR, "db.json");

function defaultSettings(): Settings {
  return { downloader: null, pollIntervalMinutes: 10 };
}

function defaultDb(): Db {
  return { settings: defaultSettings(), subscriptions: [] };
}

export class Store {
  private db: Db;

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    this.db = this.load();
  }

  private load(): Db {
    if (!fs.existsSync(DB_PATH)) {
      const db = defaultDb();
      this.persist(db);
      return db;
    }
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Db>;
    const rawSubs = (parsed.subscriptions ?? []) as Array<Partial<Subscription>>;
    return {
      settings: { ...defaultSettings(), ...parsed.settings },
      subscriptions: rawSubs.map((sub) => ({
        ...sub,
        seenHashes: sub.seenHashes ?? [],
        downloadedEpisodes: sub.downloadedEpisodes ?? [],
        pendingAsks: sub.pendingAsks ?? [],
      })) as Subscription[],
    };
  }

  private persist(db: Db = this.db): void {
    const tmpPath = `${DB_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), "utf-8");
    fs.renameSync(tmpPath, DB_PATH);
  }

  getSettings(): Settings {
    return this.db.settings;
  }

  updateSettings(patch: Partial<Settings>): Settings {
    this.db.settings = { ...this.db.settings, ...patch };
    this.persist();
    return this.db.settings;
  }

  listSubscriptions(): Subscription[] {
    return this.db.subscriptions;
  }

  getSubscription(id: string): Subscription | undefined {
    return this.db.subscriptions.find((s) => s.id === id);
  }

  addSubscription(sub: Subscription): void {
    this.db.subscriptions.push(sub);
    this.persist();
  }

  removeSubscription(id: string): void {
    this.db.subscriptions = this.db.subscriptions.filter((s) => s.id !== id);
    this.persist();
  }

  markSeen(id: string, infoHash: string): void {
    const sub = this.getSubscription(id);
    if (!sub) return;
    if (!sub.seenHashes.includes(infoHash)) {
      sub.seenHashes.push(infoHash);
      this.persist();
    }
  }

  addDownloadedEpisode(id: string, episode: string): void {
    const sub = this.getSubscription(id);
    if (!sub) return;
    if (!sub.downloadedEpisodes.includes(episode)) {
      sub.downloadedEpisodes.push(episode);
      this.persist();
    }
  }

  hasPendingAsk(id: string, infoHash: string): boolean {
    const sub = this.getSubscription(id);
    return sub?.pendingAsks.some((p) => p.infoHash === infoHash) ?? false;
  }

  addPendingAsk(id: string, ask: PendingAsk): void {
    const sub = this.getSubscription(id);
    if (!sub) return;
    sub.pendingAsks.push(ask);
    this.persist();
  }

  getPendingAsk(id: string, torrentId: string): PendingAsk | undefined {
    return this.getSubscription(id)?.pendingAsks.find((p) => p.torrentId === torrentId);
  }

  removePendingAsk(id: string, torrentId: string): void {
    const sub = this.getSubscription(id);
    if (!sub) return;
    sub.pendingAsks = sub.pendingAsks.filter((p) => p.torrentId !== torrentId);
    this.persist();
  }

  clearPendingAsksForEpisode(id: string, episode: string): void {
    const sub = this.getSubscription(id);
    if (!sub) return;
    const before = sub.pendingAsks.length;
    sub.pendingAsks = sub.pendingAsks.filter((p) => p.episode !== episode);
    if (sub.pendingAsks.length !== before) {
      this.persist();
    }
  }
}
