// Full verify-format JSON report of the latest published scan (every address, raw balance, price and account row).
const DATA_URL = process.env.ZEROGAP_DATA_URL ?? 'https://raw.githubusercontent.com/Lakshmikanth-3/ZeroGap/zerogap-data';

export async function GET(request: Request) {
  const res = await fetch(`${DATA_URL}/latest-report.json?t=${Math.floor(Date.now() / 60_000)}`);
  if (!res.ok) return Response.json({ error: `report unavailable (${res.status})` }, { status: 503 });
  const download = new URL(request.url).searchParams.has('download');
  const body = await res.text();
  let name = 'zerogap-scan.json';
  try { const j = JSON.parse(body) as { network: string; generated_at: string }; name = `zerogap-${j.network}-${j.generated_at.replace(/[:.]/g, '-')}.json`; } catch { /* keep default */ }
  return new Response(body, { headers: {
    'content-type': 'application/json', 'cache-control': 'public, s-maxage=60',
    ...(download ? { 'content-disposition': `attachment; filename="${name}"` } : {}),
  } });
}
