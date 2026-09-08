const MAX_MESSAGE_CHARS = 3500;

// Telegram messages cap out at 4096 chars; split a long header + line list
// across multiple sends instead of truncating or erroring.
export async function sendChunkedText(
  header: string,
  lines: string[],
  send: (text: string) => Promise<unknown>,
): Promise<void> {
  let chunk = header;
  for (const line of lines) {
    if (chunk.length + line.length + 1 > MAX_MESSAGE_CHARS) {
      await send(chunk);
      chunk = line;
    } else {
      chunk += "\n" + line;
    }
  }
  if (chunk) await send(chunk);
}
