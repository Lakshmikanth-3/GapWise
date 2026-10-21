export type Chain = 'ethereum' | 'solana' | 'cardano';

export type Reserve = {
  chain: Chain;
  /** Ticker when known (ADA, ETH, SOL, USDC…), else the on-chain unit/mint. */
  asset: string;
  amount: number;
  raw?: string;
  decimals?: number;
  contract?: string;
  /** Pricing hint: true for USD stablecoins valued at 1.00. */
  stable?: boolean;
  /** Address actually holding the funds (for explorer links). */
  holder?: string;
};
