interface NyaaApiIdResponse {
  data?: {
    magnet?: string;
  };
}

export async function resolveMagnet(torrentId: string): Promise<string> {
  const res = await fetch(`https://nyaaapi.onrender.com/nyaa/id/${torrentId}`);
  if (!res.ok) {
    throw new Error(`nyaaapi request failed: ${res.status}`);
  }
  const json = (await res.json()) as NyaaApiIdResponse;
  const magnet = json.data?.magnet;
  if (!magnet) {
    throw new Error("No magnet field in nyaaapi response");
  }
  return magnet;
}
