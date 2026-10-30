// Run with --experimental-vm-modules. The linker exists only in tests; production has no overrides.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import * as core from './released-context-core.mjs';
import { fixture, configFor, changed, resign } from './test-fixture.mjs';

async function harness() {
  const { snapshot } = fixture(), state = { snapshot, wallMs: snapshot.wallMs, reads: 0 };
  class Clock extends Date { static now() { return state.wallMs; } }
  const context = createContext({ process: { platform: 'linux', getuid: () => 1000, pid: 123 }, Date: Clock });
  const filesystem = new SyntheticModule(['readFixedSnapshot'], function () {
    this.setExport('readFixedSnapshot', facts => {
      assert.deepEqual(JSON.parse(JSON.stringify(facts)), { platform: 'linux', uid: 1000, pid: 123, wallMs: state.wallMs });
      state.reads++; return { ...state.snapshot };
    });
  }, { context });
  const validation = new SyntheticModule(Object.keys(core), function () {
    for (const [name, value] of Object.entries(core)) this.setExport(name, value);
  }, { context });
  const source = readFileSync(new URL('./released-context.mjs', import.meta.url), 'utf8');
  const entry = new SourceTextModule(source, { context, identifier: 'fixed-production-reader-under-test' });
  await entry.link(specifier => {
    if (specifier === './release-filesystem.mjs') return filesystem;
    if (specifier === './released-context-core.mjs') return validation;
    throw new Error('Unexpected production import');
  });
  await entry.evaluate();
  return { state, api: entry.namespace };
}
test('factory returns the exact private dependencies only after two fresh valid gate reads', async () => {
  const { state, api } = await harness(); let calls = 0;
  const dependencies = { config: configFor(core.validateReleasedSnapshot(state.snapshot, 'office')), db: { synthetic: true } };
  const get = api.createReleasedDependenciesFactory('office', provenance => {
    calls++; assert.ok(Object.isFrozen(provenance)); assert.equal(provenance.admitted, undefined); return dependencies;
  });
  assert.equal(get(), dependencies); assert.equal(calls, 1); assert.equal(state.reads, 2);
  state.snapshot.latchAbsent = false;
  assert.equal(get(), null); assert.equal(calls, 1, 'No cached dependencies after a new fence');
  assert.equal(api.getReleasedDependencies(), null);
});
for (const [name, mutate] of [
  ['fence appears', s => { s.snapshot.latchAbsent = false; }],
  ['lease expires', s => { s.wallMs += 220000; s.snapshot.monotonicMs += 220000; }],
  ['mode closes', s => changed(s.snapshot, 'descriptor', d => { d.modes.office = false; })],
  ['operative release changes', s => changed(s.snapshot, 'descriptor', d => { d.releaseComponentDigest = '9'.repeat(64); })],
  ['schema root attestation changes', s => changed(s.snapshot, 'descriptor', d => { d.schemaSha256 = '9'.repeat(64); })],
  ['key changes', s => changed(s.snapshot, 'descriptor', d => { d.signingKeyFingerprint = '9'.repeat(64); })],
  ['Stripe key pin changes', s => changed(s.snapshot, 'descriptor', d => { d.stripeKeyFingerprint = '9'.repeat(64); })],
  ['registered overlay pin changes', s => changed(s.snapshot, 'descriptor', d => { d.installationOverlaySha256 = '9'.repeat(64); })],
]) test('factory closes when ' + name + ' during supplier access', async () => {
  const { state, api } = await harness();
  const config = configFor(core.validateReleasedSnapshot(state.snapshot, 'office'));
  const get = api.createReleasedDependenciesFactory('office', () => { mutate(state); return { config, db: {} }; });
  assert.equal(get(), null); assert.equal(state.reads, 2);
});
test('fresh valid receipt rotation preserves the exact unchanged release but never caches it', async () => {
  const { state, api } = await harness(); let calls = 0;
  const config = configFor(core.validateReleasedSnapshot(state.snapshot, 'status'));
  const dependencies = { config, db: {} };
  const get = api.createReleasedDependenciesFactory('status', () => {
    calls++; resign(state.snapshot, c => { c.sequence += 1; }); return dependencies;
  });
  assert.equal(get(), dependencies); assert.equal(get(), dependencies); assert.equal(calls, 2); assert.equal(state.reads, 4);
});
for (const [name, supplier] of [
  ['missing configuration', () => ({ db: {} })], ['wrong HMAC key', c => ({ config: { ...c, signingSecret: 'wrong'.repeat(10) } })],
  ['weak spaced HMAC string', c => ({ config: { ...c, signingSecret: ' '.repeat(40) } })],
  ['asynchronous supplier', c => Promise.resolve({ config: c })], ['throwing supplier', () => { throw new Error('synthetic'); }],
]) test('factory rejects ' + name, async () => {
  const { state, api } = await harness();
  const config = configFor(core.validateReleasedSnapshot(state.snapshot, 'office'));
  assert.equal(api.createReleasedDependenciesFactory('office', () => supplier(config))(), null);
});
