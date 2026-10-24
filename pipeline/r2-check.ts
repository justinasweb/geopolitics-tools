// Checks that the pipeline can write to and read from both R2 buckets with the Cloudflare token:
// node pipeline/r2-check.ts. Writes one small file under ci/ in each bucket. Run on pull requests.
import { openStores } from './lib/store.ts';

const stores = openStores('r2');
const stamp = new Date().toISOString();
for (const bucket of [stores.raw, stores.snapshots]) {
  await bucket.put('ci/check.txt', stamp, 'text/plain');
  const back = await bucket.get('ci/check.txt');
  if (new TextDecoder().decode(back ?? new Uint8Array()) !== stamp) throw new Error(`${bucket.name}: read back something else than was written`);
  if ((await bucket.get('ci/does-not-exist')) !== null) throw new Error(`${bucket.name}: a missing object did not read as missing`);
  console.log(`${bucket.name}: write and read OK`);
}
const state = await stores.raw.get('state/status.json');
console.log(state ? `Pipeline state exists (${state.length} bytes)` : 'No pipeline state yet (the first scheduled run creates it)');
