const sol = async (rpc, method, params) => (await (await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json()).result;
for (const user of ['53J925N6CwFUFo4ru8s3jgUcswhR4pzQP3s4jUDsZt76', '4UK7e3vkPyojFjn43ygxx2QNrVZFJjfnhopmffUBUHoU']) {
  const sigs = await sol('https://api.devnet.solana.com', 'getSignaturesForAddress', [user, { limit: 15 }]);
  const programs = {};
  for (const s of sigs ?? []) {
    const tx = await sol('https://api.devnet.solana.com', 'getTransaction', [s.signature, { encoding: 'json', maxSupportedTransactionVersion: 0 }]);
    if (!tx) continue;
    const keys = tx.transaction.message.accountKeys;
    for (const ix of tx.transaction.message.instructions) { const p = keys[ix.programIdIndex]; programs[p] = (programs[p] ?? 0) + 1; }
    await new Promise(r => setTimeout(r, 200));
  }
  console.log('solana devnet user', user.slice(0, 6), 'txs', sigs?.length ?? 0, 'programs', programs);
}
for (const [name, base] of [['preprod', 'https://preprod.koios.rest/api/v1'], ['preview', 'https://preview.koios.rest/api/v1']]) {
  const addr = 'addr_test1qr8qrf3mj6mnzfmyfcvc9xxrx69u7kk2etly2qprd3c4cg03rtmm5mhrm9u4elelv58qj5308d5lcs278jzyrv3pcfhsphp8dj';
  const txs = await (await fetch(`${base}/address_txs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ _addresses: [addr] }) })).json().catch(() => []);
  if (!Array.isArray(txs) || !txs.length) { console.log('cardano', name, 'no txs'); continue; }
  const utx = await (await fetch(`${base}/tx_utxos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ _tx_hashes: txs.slice(0, 10).map(t => t.tx_hash) }) })).json();
  const scripts = {};
  for (const t of utx) for (const o of t.outputs) { const a = o.payment_addr.bech32; if (a.startsWith('addr_test1w') || a.startsWith('addr_test1z') || a.startsWith('addr_test1x')) scripts[a] = (scripts[a] ?? 0) + 1; }
  console.log('cardano', name, 'txs', txs.length, 'script outputs', scripts);
}
