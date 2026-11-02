import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { STATE_KEY } from '../../../pipeline/lib/runner.ts';
import { emptyState, emptySource, type State } from '../../../pipeline/lib/state.ts';
import type { Stores } from '../../../pipeline/lib/store.ts';
import { LEDGER_KEY, loadLedger, weekKey, weeks, baselineFor } from '../../../pipeline/lib/weeks.ts';
import type { WeekData } from '../../../src/lib/week/model.ts';
import { tempStores } from './helpers.ts';

// This week's archive in the snapshots bucket: copies of the sanctions lists and GDACS recorded once a day, a closed week frozen
// once on the Monday or Tuesday after it and never written again, and the old copies dropped.

const csl = (ids: string[]) => JSON.stringify({ results: ids.map((id) => ({ id, source: 'Specially Designated Nationals (SDN) - Treasury Department', addresses: [{ country: 'RU' }] })) });
const gdacs = JSON.stringify({ features: [{ geometry: { coordinates: [0, 0] }, properties: { eventtype: 'FL', eventid: 1, name: 'Flood', alertlevel: 'Orange', iso3: 'NGA', fromdate: '2026-10-27T00:00:00', todate: '2026-10-28T00:00:00' } }] });

/** Saves a source's copy as the runner would (gzipped under its run) and points the state at it. */
async function save(stores: Stores, state: State, source: string, name: string, body: string, at: string) {
  const key = `${source}/${at}/${name}.gz`;
  await stores.raw.put(key, gzipSync(body));
  const st = (state.sources[source] ??= emptySource());
  st.files = { [name]: { key, sha256: createHash('sha256').update(body).digest('hex'), bytes: body.length, contentType: 'application/json' } };
  st.lastSuccess = `${at.slice(0, 10)}T00:00:00.000Z`;
  st.lastChange = st.lastSuccess;
  await stores.raw.put(STATE_KEY, JSON.stringify(state));
}

const get = async (stores: Stores, key: string) => {
  const b = await stores.snapshots.get(key);
  return b ? JSON.parse(new TextDecoder().decode(b)) : null;
};
const quietLog = () => {};

describe('This week archive', () => {
  it('records the lists once a day, freezes the closed week once, and never overwrites it', async () => {
    const stores = tempStores();
    const state = emptyState();
    await save(stores, state, 'gdacs', 'events.json', gdacs, '2026-10-26T0023Z');
    await save(stores, state, 'csl', 'consolidated.json', csl(['a', 'b']), '2026-10-26T0023Z');

    // Monday of week 44: today's copy of the lists, and week 43, which closed yesterday, is frozen.
    const r1 = await weeks(stores, new Date('2026-10-26T00:23:00Z'), quietLog);
    expect(r1.baseline).toBe('2026-10-26');
    expect(r1.frozen).toBe('2026-43');
    // Later the same day: nothing new.
    expect(await weeks(stores, new Date('2026-10-26T05:23:00Z'), quietLog)).toEqual({});

    // The list changes during week 44; the next Monday freezes week 44 against the copy from its Monday.
    await save(stores, state, 'csl', 'consolidated.json', csl(['b', 'c', 'd']), '2026-10-29T0023Z');
    await weeks(stores, new Date('2026-10-30T00:23:00Z'), quietLog);
    const r2 = await weeks(stores, new Date('2026-11-02T00:23:00Z'), quietLog);
    expect(r2.frozen).toBe('2026-44');
    const w44 = (await get(stores, weekKey('2026-44'))) as WeekData;
    expect(w44).toMatchObject({ v: 1, week: '2026-44', period: { from: '2026-10-26', to: '2026-11-01' } });
    expect(w44.cards.find((c) => c.kind === 'sanctions')).toMatchObject({ since: '2026-10-26', lists: [{ list: 'US', added: 2, removed: 1 }] });
    expect(w44.cards.find((c) => c.kind === 'disaster')).toMatchObject({ alerts: [{ id: 'FL1', level: 'orange' }] });

    // A frozen week is never written again, even after the data change.
    const before = JSON.stringify(w44);
    await save(stores, state, 'csl', 'consolidated.json', csl(['z']), '2026-11-02T0123Z');
    await weeks(stores, new Date('2026-11-03T00:23:00Z'), quietLog);
    expect(JSON.stringify(await get(stores, weekKey('2026-44')))).toBe(before);

    const ledger = await loadLedger(stores);
    expect(ledger.weeks).toEqual(['2026-43', '2026-44']);
    expect(Object.keys(ledger.baselines)).toEqual(['2026-10-26', '2026-10-30', '2026-11-02', '2026-11-03']);
    expect(baselineFor(ledger, '2026-10-27', '2026-11-02')?.date).toBe('2026-10-30');
    // GDACS is recorded with the lists, so a frozen week can tell which earlier alerts rose in it.
    expect(Object.keys(ledger.baselines['2026-10-26']).sort()).toEqual(['csl', 'gdacs']);
    expect(await get(stores, LEDGER_KEY)).toBeTruthy();
  });

  it('does not freeze a week closed more than two days ago, and drops old copies of the lists', async () => {
    const stores = tempStores();
    const state = emptyState();
    await save(stores, state, 'csl', 'consolidated.json', csl(['a']), '2026-08-01T0023Z');
    await stores.snapshots.put(LEDGER_KEY, JSON.stringify({ baselines: { '2026-08-01': {} }, weeks: [] }));
    const r = await weeks(stores, new Date('2026-10-29T12:00:00Z'), quietLog);
    expect(r).toMatchObject({ baseline: '2026-10-29', skipped: '2026-43' });
    expect(await get(stores, weekKey('2026-43'))).toBeNull();
    expect(Object.keys((await loadLedger(stores)).baselines)).toEqual(['2026-10-29']);
  });
});
