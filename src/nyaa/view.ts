import { extractInfoHash } from "../downloader/hash";

export interface NyaaViewDetails {
  torrentId: string;
  title: string;
  magnet: string;
  infoHash: string;
}

export function extractNyaaTorrentIds(text: string): string[] {
  if (!text) return [];
  const regex = /(?:https?:\/\/)?(?:www\.)?nyaa\.si\/view\/(\d+)/gi;
  const matches = [...text.matchAll(regex)];
  return [...new Set(matches.map((m) => m[1]))];
}

export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function parseNyaaViewHtml(html: string, torrentId: string): NyaaViewDetails | null {
  const titleMatch = html.match(/class="[^"]*panel-title[^"]*"[^>]*>([\s\S]*?)<\/h3>/);
  const magnetMatch = html.match(/href="([^"]*magnet:[^"]*)"/);

  if (!titleMatch || !magnetMatch) {
    return null;
  }

  const rawTitle = titleMatch[1].trim();
  const rawMagnet = magnetMatch[1];
  const title = decodeHtmlEntities(rawTitle);
  const magnet = rawMagnet.replace(/&amp;/g, "&");
  const infoHash = extractInfoHash(magnet);

  if (!infoHash) {
    return null;
  }

  return {
    torrentId,
    title,
    magnet,
    infoHash,
  };
}

export async function fetchNyaaView(
  torrentId: string,
  fetchFn: typeof fetch = fetch,
): Promise<NyaaViewDetails> {
  let primaryError: Error | null = null;

  // 1. Try direct nyaa.si page
  try {
    const res = await fetchFn(`https://nyaa.si/view/${torrentId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 404) {
      throw new Error(`Torrent #${torrentId} not found on nyaa.si`);
    }

    if (res.ok) {
      const html = await res.text();
      const details = parseNyaaViewHtml(html, torrentId);
      if (details) {
        return details;
      }
      primaryError = new Error("Could not parse title or magnet from nyaa.si HTML");
    } else {
      primaryError = new Error(`nyaa.si returned HTTP ${res.status}`);
    }
  } catch (err) {
    primaryError = err as Error;
  }

  // 2. Fallback to nyaaapi.onrender.com
  try {
    const res = await fetchFn(`https://nyaaapi.onrender.com/nyaa/id/${torrentId}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 404) {
      throw new Error(`Torrent #${torrentId} not found`);
    }

    if (!res.ok) {
      throw new Error(`nyaaapi returned HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      data?: {
        title?: string;
        magnet?: string;
        infohash?: string;
      };
    };

    if (json?.data?.title && json.data.magnet) {
      const title = decodeHtmlEntities(json.data.title.trim());
      const magnet = json.data.magnet.replace(/&amp;/g, "&");
      const infoHash = json.data.infohash?.toLowerCase() || extractInfoHash(magnet);

      if (infoHash) {
        return {
          torrentId,
          title,
          magnet,
          infoHash,
        };
      }
    }

    throw new Error(`Invalid response structure from nyaaapi for #${torrentId}`);
  } catch (fallbackError) {
    if (primaryError) {
      throw new Error(
        `Failed to fetch torrent #${torrentId}: ${primaryError.message} (fallback: ${(fallbackError as Error).message})`,
      );
    }
    throw fallbackError;
  }
}
