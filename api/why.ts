// Latest GapWise Gap Investigator result published by the scheduled engine (scripts/engine-once.ts → investigation.json).
// Read-only: the published deployment shows the last investigation; new runs happen on the GapWise server (POST /api/why/run).
const DATA_ROOT = process.env.ZEROGAP_DATA_URL ?? 'https://raw.githubusercontent.com/Lakshmikanth-3/ZeroGap/zerogap-data';
/** ?network=testnet serves the labelled testnet deployment (data/testnet on the data branch). */
const dataUrl = (request: Request) => (new URL(request.url).searchParams.get('network') === 'testnet' ? `${DATA_ROOT}/testnet` : DATA_ROOT);

export async function GET(request: Request) {
  const res = await fetch(`${dataUrl(request)}/investigation.json?t=${Math.floor(Date.now() / 60_000)}`);
  if (!res.ok) return Response.json({ error: 'no investigation yet' }, { status: 404 });
  return new Response(await res.text(), { headers: { 'content-type': 'application/json', 'cache-control': 'public, s-maxage=60' } });
}
