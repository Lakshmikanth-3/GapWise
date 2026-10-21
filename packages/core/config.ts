import 'dotenv/config';

export const LOCKERS = {
  ethereum: '0xbF4cFccd11257e568A936a7867D138f54A43cffa',
  // Vault config account of program 7XASQ24f… (discriminator matches `Vault`). Funds sit in the
  // treasury PDA ["treasury", vault] — see docs/DECISIONS.md. TODO: re-confirm with corrected IDL.
  solana: 'Dj9NkHyMMLyQGnYz2necVuHF6ELXqxUa3EsRZNHiPrrt',
  solanaProgram: '7XASQ24fiwoNHmTnQdi3k3WXMUXRaj7MdcHvkSducrB8',
  // Both scripts count (confirmed by Shan): deposit script + protocol script holding batched funds.
  cardano: [
    'addr1w9ygqdx9law3waqgm6eamf2xhxs5x83r0pfka928jmydkuc6ykls3',
    'addr1w9m5m4v8vfpq74n6cd0z33r3jlatfkfsykpcjaxze8af33qxh7jf2',
  ],
} as const;

export const EXPLORERS = {
  ethereum: (a: string) => `https://etherscan.io/address/${a}`,
  solana: (a: string) => `https://solscan.io/account/${a}`,
  cardano: (a: string) => `https://cardanoscan.io/address/${a}`,
} as const;

/** Throws a clear error when a required env var is missing (T0.2). */
export function need(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const v = env[name];
  if (!v) throw new Error(`Missing env var ${name}. Copy .env.example to .env and fill it.`);
  return v;
}

const isPlaceholder = (v?: string) => !v || v.includes('YOUR_KEY');

export const env = {
  strikeApi: process.env.STRIKE_API ?? 'https://api.strikefinance.org',
  // Keyless public endpoints keep P0 runnable without keys; set real keys for production.
  ethRpc: () => (isPlaceholder(process.env.ETH_RPC_URL) ? 'https://ethereum-rpc.publicnode.com' : process.env.ETH_RPC_URL!),
  solRpc: () => (isPlaceholder(process.env.SOLANA_RPC_URL) ? 'https://api.mainnet-beta.solana.com' : process.env.SOLANA_RPC_URL!),
  blockfrost: (): string | undefined => (isPlaceholder(process.env.BLOCKFROST_PROJECT_ID) ? undefined : process.env.BLOCKFROST_PROJECT_ID),
  rps: Number(process.env.STRIKE_RPS ?? 40),
};
