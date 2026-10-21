// Decode recent Ethereum locker events with the official ABI (live check for M3).
import { client, vaultAbi } from '../packages/collectors/ethereum';
import { LOCKERS } from '../packages/core/config';
const c = client();
const head = await c.getBlockNumber();
const back = BigInt(process.argv[2] ?? 5000);
const logs = await c.getContractEvents({ address: LOCKERS.ethereum as `0x${string}`, abi: vaultAbi, fromBlock: head - back, toBlock: head });
for (const l of logs) console.log(l.blockNumber, (l as any).eventName, JSON.stringify((l as any).args, (_, v) => typeof v === 'bigint' ? v.toString() : v).slice(0, 220));
console.log('total', logs.length, 'blocks', back);
