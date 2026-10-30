import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ClosedAcceptanceContext, ACCEPTANCE_CONTEXT_TARGET as target,
  ACCEPTANCE_CONTEXT_MODES as modes, ACCEPTANCE_CONTEXT_CONTRACT as contract,
  assertExactAcceptanceContextTarget } from './acceptance-context-core.mjs';
const options = overrides => ({ target: structuredClone(target), scope: 'synthetic-acceptance', providerMode: 'test', authority: null, ...overrides });

test('physical pin exactly matches Root actual baseline; it is not admission', async () => {
  const baseline = JSON.parse(await readFile(new URL('../../acceptance-target/ACTUAL_TARGET_BASELINE.json', import.meta.url), 'utf8'));
  assert.equal(baseline.actualPhysicalTarget, true);
  for (const [key, baselineKey] of [['databaseName','databaseName'],['databaseOid','databaseOid'],['systemIdentifier','systemIdentifier'],['databaseStartedAt','databaseBoot'],['comment','databaseComment']])
    assert.equal(target[key], baseline.facts[baselineKey]);
  assert.equal(baseline.nativeProofAssigned, false);
  for (const key of ['authorityRegistered','actualAdmission','nativeProofAssigned','runtimeLoadable','providerReady','activationAuthority']) assert.equal(contract[key], false);
});

test('all five read modes and Website callback convention remain closed without real authority', async () => {
  const boundary = new ClosedAcceptanceContext();
  assert.deepEqual(modes, ['status','preparation','office','collection','sending']);
  const transaction = new Proxy({}, { get() { throw Error('transaction must never be inspected'); } });
  for (const requestedMode of modes) {
    assert.equal(await boundary.readAcceptanceContext(requestedMode), null);
    assert.equal(await boundary.createAdmissionVerifier({mode: requestedMode})(transaction), null);
  }
});

test('every physical field is required and immutable; arbitrary named QA DB is rejected', () => {
  for (const key of Object.keys(target)) {
    const changed = { ...target, [key]: target[key] + 'x' };
    assert.throws(() => assertExactAcceptanceContextTarget(changed), /physical target/);
    const missing = { ...target }; delete missing[key];
    assert.throws(() => assertExactAcceptanceContextTarget(missing), /physical target/);
  }
  assert.throws(() => assertExactAcceptanceContextTarget({...target, extra: true}), /physical target/);
  assert.throws(() => { target.databaseName = 'postgres'; }, TypeError);
});

test('production, HOME, rehearsal and non-synthetic scopes cannot be selected', async () => {
  for (const scope of ['production','HOME','rehearsal','live','synthetic',false,null])
    assert.throws(() => new ClosedAcceptanceContext(options({scope})), /synthetic test/);
  assert.throws(() => new ClosedAcceptanceContext(options({providerMode: 'live'})), /synthetic test/);
  assert.throws(() => new ClosedAcceptanceContext(options({target: {...target,databaseName:'postgres'}})), /physical target/);
  await assert.rejects(new ClosedAcceptanceContext().readAcceptanceContext('collection', options({scope:'production'})), /synthetic test/);
});

test('plain admission JSON, production proof, or a verifying callback never becomes authority', async () => {
  for (const authority of [{admitted:true}, {scope:'production',synthetic:false}, async () => ({admitted:true}), true, undefined]) {
    if (authority === undefined) continue;
    assert.throws(() => new ClosedAcceptanceContext(options({authority})), /not registered/);
    await assert.rejects(new ClosedAcceptanceContext().readAcceptanceContext('status', options({authority})), /not registered/);
  }
  assert.equal(await new ClosedAcceptanceContext().readAcceptanceContext('status'), null);
});

test('unknown modes and unexpected capabilities are rejected instead of ignored', async () => {
  const boundary = new ClosedAcceptanceContext();
  for (const requestedMode of ['', 'live', 'health', 'refund', null, undefined]) {
    await assert.rejects(boundary.readAcceptanceContext(requestedMode), /five explicit modes/);
    assert.throws(() => boundary.createAdmissionVerifier({mode:requestedMode}), /five explicit modes/);
  }
  assert.throws(() => new ClosedAcceptanceContext({authority: () => true}), /constructor shape/);
  await assert.rejects(boundary.readAcceptanceContext('status', {admitted:true}), /read shape/);
});

test('prototype forgery and detached calls cannot acquire closed-instance branding', async () => {
  const fake = Object.create(ClosedAcceptanceContext.prototype);
  await assert.rejects(fake.readAcceptanceContext('status'), /unknown boundary/);
  assert.throws(() => fake.createAdmissionVerifier({mode:'status'}), /unknown boundary/);
  assert.throws(() => Object.getOwnPropertyDescriptor(ClosedAcceptanceContext.prototype,'target').get.call(fake), /unknown boundary/);
});

test('caller mutation cannot change captured physical identity or authority facts', async () => {
  const proposal = options({}); const boundary = new ClosedAcceptanceContext(proposal);
  proposal.target.databaseName = 'postgres'; proposal.authority = {admitted:true};
  assert.equal(boundary.target.databaseName, target.databaseName);
  assert.equal(await boundary.createAdmissionVerifier({mode:'sending'})(null), null);
  assert.throws(() => { boundary.contract.actualAdmission = true; }, TypeError);
  assert.throws(() => { boundary.target = {databaseName:'postgres'}; }, TypeError);
});


test('subclasses, prototype mutation and ignored verifier authority cannot inject positive proof', () => {
  class Forged extends ClosedAcceptanceContext { async readAcceptanceContext() { return {admitted:true}; } }
  assert.throws(() => new Forged(), /subclass authority/);
  assert.throws(() => { ClosedAcceptanceContext.prototype.readAcceptanceContext = async () => ({admitted:true}); }, TypeError);
  assert.throws(() => new ClosedAcceptanceContext().createAdmissionVerifier({mode:'status',authority:{admitted:true}}), /verifier shape/);
});
