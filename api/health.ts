const DATA_URL = process.env.ZEROGAP_DATA_URL ?? 'https://raw.githubusercontent.com/Lakshmikanth-3/ZeroGap/zerogap-data';

/** Healthy when the engine published a snapshot within the last 20 minutes. */
export async function GET() {
  const res = await fetch(`${DATA_URL}/snapshot.json?t=${Math.floor(Date.now() / 60_000)}`);
  if (!res.ok) return Response.json({ ok: false, error: `snapshot unavailable (${res.status})` }, { status: 503 });
  const s = await res.json() as { now: number; errors: unknown };
  return Response.json({ ok: Date.now() - s.now < 20 * 60_000, publishedAt: s.now, ageSecs: Math.round((Date.now() - s.now) / 1000), errors: s.errors });
}
