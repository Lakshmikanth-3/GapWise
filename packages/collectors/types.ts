export type Chain = 'ethereum' | 'solana' | 'cardano';

export type Reserve = {
  chain: Chain;
  /** Ticker when known (ADA, ETH, SOL, USDC…), else the on-chain unit/mint. */
  asset: string;
  amount: number;
  raw?: string;
  decimals?: number;
  /** Token contract / mint / Cardano policy+name. Pricing keys off this, never the display name. */
  contract?: string;
  /** Address actually holding the funds (for explorer links and per-locker totals). */
  holder?: string;
};
