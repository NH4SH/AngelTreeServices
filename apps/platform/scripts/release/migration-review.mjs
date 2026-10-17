import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function indexCatalog(rows) {
  const result = new Map();
  for (const row of rows) {
    const key = row.kind + '|' + row.key;
    assert.ok(row.kind && row.key && /^[a-f0-9]{32}$/.test(row.fingerprint), 'Invalid catalog record.');
    assert.ok(!result.has(key), 'Duplicate catalog identity.'); result.set(key, row.fingerprint);
  }
  return result;
}
export function compareCatalogs(expectedRows, observedRows) {
  const expected = indexCatalog(expectedRows), observed = indexCatalog(observedRows);
  return {
    missing: [...expected.keys()].filter(k => !observed.has(k)),
    different: [...expected.keys()].filter(k => observed.has(k) && observed.get(k) !== expected.get(k)),
    extra: [...observed.keys()].filter(k => !expected.has(k)),
    exact: [...expected.keys()].filter(k => observed.get(k) === expected.get(k)),
  };
}
export function reviewMigrations(files, remoteVersions, deltas, finalRows, hostedRows) {
  const versions = files.map(f => f.file.split('_')[0]);
  assert.equal(new Set(versions).size, versions.length, 'Duplicate migration versions.');
  assert.ok(remoteVersions.every((v, i) => versions[i] === v), 'Hosted history is not an exact repository prefix; stop and review.');
  const final = indexCatalog(finalRows), hosted = indexCatalog(hostedRows);
  return deltas.map(d => {
    assert.ok(versions.includes(d.file.split('_')[0]) && !remoteVersions.includes(d.file.split('_')[0]), 'Unexpected pending migration.');
    const keys = [...new Set([...d.added, ...d.changed, ...d.removed])];
    const count = state => keys.filter(k => state(k)).length;
    return { file: d.file, added: d.added.length, changed: d.changed.length, removed: d.removed.length,
      finalObjectsAbsent: count(k => final.has(k) && !hosted.has(k)),
      finalObjectsDifferent: count(k => final.has(k) && hosted.has(k) && final.get(k) !== hosted.get(k)),
      finalObjectsMatching: count(k => final.has(k) && hosted.get(k) === final.get(k)),
      supersededObjects: count(k => !final.has(k)),
      classification: 'review-required', automaticRepairAllowed: false,
    };
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flag = process.argv.indexOf('--evidence'); assert.ok(flag >= 0 && process.argv[flag + 1], 'Supply --evidence directory.');
  const directory = resolve(process.argv[flag + 1]); const read = f => JSON.parse(readFileSync(join(directory, f), 'utf8'));
  const migrationDirectory = new URL('../../../../supabase/migrations/', import.meta.url);
  const files = readdirSync(migrationDirectory).filter(f => f.endsWith('.sql')).sort().map(file => ({ file, sha256: createHash('sha256').update(readFileSync(new URL(file, migrationDirectory))).digest('hex') }));
  const remoteVersions = read('hosted-migrations.json').map(x => x.version), deltas = [];
  for (let i = remoteVersions.length + 1; i <= files.length; i++) deltas.push(read('delta-' + i + '.json'));
  const hosted = read('hosted-catalog-fingerprints.json'), final = read('final-fingerprints.json');
  console.log(JSON.stringify({ files, baseline: compareCatalogs(read('baseline-fingerprints.json'), hosted), release: compareCatalogs(final, hosted), pending: reviewMigrations(files, remoteVersions, deltas, final, hosted), writesPerformed: false }, null, 2));
}
