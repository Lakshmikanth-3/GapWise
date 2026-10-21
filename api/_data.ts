// Vercel functions serve the state published by the scheduled engine (.github/workflows/scan.yml)
// to the `zerogap-data` branch. Nothing here computes or invents numbers.
const DATA_URL = process.env.ZEROGAP_DATA_URL ?? 'https://raw.githubusercontent.com/Lakshmikanth-3/ZeroGap/zerogap-data';

export async function published(file: string): Promise<Response> {
  // Minute-granular cache-buster so the GitHub raw CDN never serves data older than ~1 min.
  const res = await fetch(`${DATA_URL}/${file}?t=${Math.floor(Date.now() / 60_000)}`);
  if (!res.ok) return Response.json({ error: `published ${file} unavailable (${res.status})` }, { status: 503 });
  return new Response(await res.text(), { headers: { 'content-type': 'application/json', 'cache-control': 'public, s-maxage=30, stale-while-revalidate=300' } });
}
