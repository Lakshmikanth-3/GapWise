import { published } from './_data';
export async function GET() {
  const r = await published('snapshot.json');
  if (!r.ok) return r;
  const s = await r.json() as { now: number; errors: unknown };
  return Response.json({ ok: Date.now() - s.now < 20 * 60_000, publishedAt: s.now, ageSecs: Math.round((Date.now() - s.now) / 1000), errors: s.errors });
}
