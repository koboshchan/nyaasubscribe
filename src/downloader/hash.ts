/**
 * Extracts a lowercase 40-character hex info hash from a magnet link or hash string.
 * Supports hex BTIH, RFC 4648 base32 BTIH, and plain 40-character hex strings.
 */
export function extractInfoHash(magnetOrHash: string): string | null {
  if (!magnetOrHash) return null;
  const str = magnetOrHash.trim();

  // Case 1: Plain 40-hex hash (SHA-1)
  if (/^[0-9a-fA-F]{40}$/.test(str)) {
    return str.toLowerCase();
  }

  // Case 2: xt=urn:btih: followed by 40 hex characters
  const hexMatch = str.match(/urn:btih:([0-9a-fA-F]{40})/i);
  if (hexMatch) {
    return hexMatch[1].toLowerCase();
  }

  // Case 3: xt=urn:btih: followed by 32 base32 characters
  const b32Match = str.match(/urn:btih:([2-7a-zA-Z]{32})/i);
  if (b32Match) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    for (const c of b32Match[1].toUpperCase()) {
      const val = alphabet.indexOf(c);
      if (val === -1) return null;
      bits += val.toString(2).padStart(5, "0");
    }
    let hex = "";
    for (let i = 0; i + 4 <= bits.length; i += 4) {
      hex += parseInt(bits.substring(i, i + 4), 2).toString(16);
    }
    return hex.toLowerCase();
  }

  return null;
}
