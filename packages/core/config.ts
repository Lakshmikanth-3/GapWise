import 'dotenv/config';

/**
 * The same engine runs against Strike's mainnet (the published result) or Strike's testnet (a second, clearly
 * labelled deployment of the same code). Select with GAPWISE_NETWORK=mainnet|testnet (ZEROGAP_NETWORK still accepted);
 * every address, RPC, explorer and the Strike API base follow from it. Testnet lockers were located on-chain from real
 * testnet deposits (docs/DECISIONS.md #46).
 */
export type Network = 'mainnet' | 'testnet';
export const NETWORK: Network = (process.env.GAPWISE_NETWORK ?? process.env.ZEROGAP_NETWORK) === 'testnet' ? 'testnet' : 'mainnet';

const NETWORKS = {
  mainnet: {
    strikeApi: 'https://api.strikefinance.org',
    lockers: {
      ethereum: '0xbF4cFccd11257e568A936a7867D138f54A43cffa',
      // `Vault` account of program 7XASQ24f… ("strike_vault", IDL confirmed 22 Oct). SOL sits in the treasury PDA
      // ["treasury", vault]; SPL tokens in token accounts owned by this account (see docs/DECISIONS.md #37).
      solana: 'Dj9NkHyMMLyQGnYz2necVuHF6ELXqxUa3EsRZNHiPrrt',
      solanaProgram: '7XASQ24fiwoNHmTnQdi3k3WXMUXRaj7MdcHvkSducrB8',
      // USDC token account named by the founder (22 Oct); owned by the vault account above.
      solanaTokenAccounts: ['BT85fgyhyZhCtaNdciKEGoj7mU8E3EeFijPy6XCmCAA6'] as string[],
      // Both scripts count (confirmed by Shan): deposit script + protocol script holding batched funds.
      cardano: [
        'addr1w9ygqdx9law3waqgm6eamf2xhxs5x83r0pfka928jmydkuc6ykls3',
        'addr1w9m5m4v8vfpq74n6cd0z33r3jlatfkfsykpcjaxze8af33qxh7jf2',
      ] as string[],
    },
    ethChain: 'mainnet' as const,
    ethRpc: 'https://ethereum-rpc.publicnode.com',
    solRpc: 'https://api.mainnet-beta.solana.com',
    koios: 'https://api.koios.rest/api/v1',
    blockfrost: 'https://cardano-mainnet.blockfrost.io/api/v0',
    explorers: { ethereum: 'https://etherscan.io', solanaSuffix: '', cardano: 'https://cardanoscan.io' },
  },
  testnet: {
    strikeApi: 'https://api-v2-testnet.strikefinance.org',
    lockers: {
      // Sepolia vault (StrikeFinanceVaultV2 behind a proxy; same ABI) that received a real testnet deposit.
      ethereum: '0x879e450F2482a2DEcbd27176A4c177e69Bd7A0E6',
      // Solana devnet: older vault program (no VaultState account); Vault account found by IDL discriminator.
      solana: 'Di862rQJwGgMLtrchoBfkcehEKXPpYnppeA9Gmxtasin',
      solanaProgram: 'FSNjjtrZP2BiuPfyRjTWQUybN8QNnEQgUogho79SMzXt',
      solanaTokenAccounts: [] as string[],
      // Cardano preprod script that received real testnet deposits.
      cardano: ['addr_test1wpuakhm8ftcwy2t00vhxp3rmqev90cs5xqf6ynu7f7rxrrg4rlm70'] as string[],
    },
    ethChain: 'sepolia' as const,
    ethRpc: 'https://ethereum-sepolia-rpc.publicnode.com',
    solRpc: 'https://api.devnet.solana.com',
    koios: 'https://preprod.koios.rest/api/v1',
    blockfrost: 'https://cardano-preprod.blockfrost.io/api/v0',
    explorers: { ethereum: 'https://sepolia.etherscan.io', solanaSuffix: '?cluster=devnet', cardano: 'https://preprod.cardanoscan.io' },
  },
} as const;

export const NET = NETWORKS[NETWORK];
export const LOCKERS = NET.lockers;

export const EXPLORERS = {
  ethereum: (a: string) => `${NET.explorers.ethereum}/address/${a}`,
  solana: (a: string) => `https://solscan.io/account/${a}${NET.explorers.solanaSuffix}`,
  cardano: (a: string) => `${NET.explorers.cardano}/address/${a}`,
};

/** Throws a clear error when a required env var is missing (T0.2). */
export function need(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const v = env[name];
  if (!v) throw new Error(`Missing env var ${name}. Copy .env.example to .env and fill it.`);
  return v;
}

const isPlaceholder = (v?: string) => !v || v.includes('YOUR_KEY');
/** Keys in .env are mainnet keys; the testnet deployment reads TESTNET_* overrides or public test endpoints. */
const key = (name: string) => (NETWORK === 'testnet' ? process.env[`TESTNET_${name}`] : process.env[name]);

export const env = {
  network: NETWORK,
  strikeApi: (NETWORK === 'testnet' ? process.env.STRIKE_TESTNET_API : process.env.STRIKE_API) ?? NET.strikeApi,
  // Keyless public endpoints keep it runnable without keys; optional free-tier keys make it faster.
  ethRpc: () => (isPlaceholder(key('ETH_RPC_URL')) ? NET.ethRpc : key('ETH_RPC_URL')!),
  // Event logs need wide block ranges; Alchemy free tier allows only 10 blocks per eth_getLogs, publicnode ~5,000 (recent).
  ethLogsRpc: () => key('ETH_LOGS_RPC_URL') || NET.ethRpc,
  solRpc: () => (isPlaceholder(key('SOLANA_RPC_URL')) ? NET.solRpc : key('SOLANA_RPC_URL')!),
  blockfrost: (): string | undefined => (isPlaceholder(key('BLOCKFROST_PROJECT_ID')) ? undefined : key('BLOCKFROST_PROJECT_ID')),
  rps: Number(process.env.STRIKE_RPS ?? 40),
};
