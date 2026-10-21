// Public site config (mirrors apps/server/snapshot.ts publicConfig; kept inline because Vercel runs native ESM).
const ETH = '0xbF4cFccd11257e568A936a7867D138f54A43cffa';
const SOL = 'Dj9NkHyMMLyQGnYz2necVuHF6ELXqxUa3EsRZNHiPrrt';
const ADA = ['addr1w9ygqdx9law3waqgm6eamf2xhxs5x83r0pfka928jmydkuc6ykls3', 'addr1w9m5m4v8vfpq74n6cd0z33r3jlatfkfsykpcjaxze8af33qxh7jf2'];

export function GET() {
  const e = process.env;
  return Response.json({
    strikeApi: e.STRIKE_API ?? 'https://api.strikefinance.org',
    strikeTestnetApi: e.STRIKE_TESTNET_API ?? 'https://api-v2-testnet.strikefinance.org',
    builderCode: e.STRIKE_BUILDER_CODE || null,
    builderFeeBps: Number(e.STRIKE_BUILDER_FEE_BPS ?? 0),
    telegramChannel: e.TELEGRAM_CHANNEL_URL || null,
    github: 'https://github.com/Lakshmikanth-3/ZeroGap',
    lockers: {
      ethereum: { address: ETH, url: `https://etherscan.io/address/${ETH}` },
      solana: { address: SOL, url: `https://solscan.io/account/${SOL}` },
      cardano: ADA.map(a => ({ address: a, url: `https://cardanoscan.io/address/${a}` })),
    },
  }, { headers: { 'cache-control': 'public, s-maxage=300' } });
}
