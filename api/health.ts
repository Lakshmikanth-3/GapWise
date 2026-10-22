const DATA_ROOT = process.env.ZEROGAP_DATA_URL ?? 'https://raw.githubusercontent.com/Lakshmikanth-3/ZeroGap/zerogap-data';
/** ?network=testnet serves the labelled testnet deployment (data/testnet on the data branch). */
const dataUrl = (request: Request) => (new URL(request.url).searchParams.get('network') === 'testnet' ? `${DATA_ROOT}/testnet` : DATA_ROOT);

/** Healthy when the engine published a snapshot within the last 20 minutes. */
export async function GET(request: Request) {
  const res = await fetch(`${dataUrl(request)}/snapshot.json?t=${Math.floor(Date.now() / 60_000)}`);
  if (!res.ok) return Response.json({ ok: false, error: `snapshot unavailable (${res.status})` }, { status: 503 });
  const s = await res.json() as { now: number; errors: unknown };
  return Response.json({ ok: Date.now() - s.now < 20 * 60_000, publishedAt: s.now, ageSecs: Math.round((Date.now() - s.now) / 1000), errors: s.errors });
}
