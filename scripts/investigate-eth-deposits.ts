// Investigation (P1 coverage check): dump every Deposit event of the Ethereum locker.
// Usage: npx tsx scripts/investigate-eth-deposits.ts out.json
import { createPublicClient, http, parseAbiItem } from 'viem';
import { mainnet } from 'viem/chains';
import { writeFileSync } from 'fs';
const c = createPublicClient({ chain: mainnet, transport: http(process.env.LOGS_RPC_URL ?? 'https://eth.drpc.org', { retryCount: 5 }) });
const address = '0xbF4cFccd11257e568A936a7867D138f54A43cffa';
const ev = parseAbiItem('event Deposit(bytes32 indexed requestID, bytes32 indexed userID, address indexed token, address user, uint256 amount)');
const head = await c.getBlockNumber();
// First Strike transfer day is 2026-03-19 (stats API); ~7,150 blocks/day. No archive RPC needed for logs.
const days = BigInt(Math.ceil((Date.now() - Date.UTC(2026, 2, 12)) / 86_400_000));
let lo = head - days * 7_200n;
console.log('scanning from', lo, 'to', head);
const out: any[] = []; const step = 5_000n;
for (let from = lo; from <= head; from += step) {
  const to = from + step - 1n > head ? head : from + step - 1n;
  const logs = await c.getLogs({ address, event: ev, fromBlock: from, toBlock: to });
  for (const l of logs) out.push({ block: String(l.blockNumber), tx: l.transactionHash, userID: l.args.userID, user: l.args.user, token: l.args.token, amount: String(l.args.amount) });
}
console.log('deposits', out.length);
writeFileSync(process.argv[2], JSON.stringify(out));
