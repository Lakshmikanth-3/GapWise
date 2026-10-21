// Serves the snapshot published by the scheduled engine (.github/workflows/scan.yml) to the `zerogap-data` branch.
// Self-contained on purpose: Vercel runs functions as native ESM. Nothing here computes or invents numbers.
const DATA_URL = process.env.ZEROGAP_DATA_URL ?? 'https://raw.githubusercontent.com/Lakshmikanth-3/ZeroGap/zerogap-data';

export async function GET() {
  const res = await fetch(`${DATA_URL}/snapshot.json?t=${Math.floor(Date.now() / 60_000)}`); // ≤1 min CDN staleness
  if (!res.ok) return Response.json({ error: `published snapshot unavailable (${res.status})` }, { status: 503 });
  return new Response(await res.text(), { headers: { 'content-type': 'application/json', 'cache-control': 'public, s-maxage=30, stale-while-revalidate=300' } });
}
