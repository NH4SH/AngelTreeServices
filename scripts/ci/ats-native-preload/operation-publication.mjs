// Pure bridge for a future fixed-path guardian. This module has no SQL, file,
// process, environment or network authority and is not installed in production.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const POLICY = 'local-primary-operation-v1';
const HASH = /^[a-f0-9]{64}$/u, ID = /^[a-f0-9]{32}$/u;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
const integer = n => Number.isSafeInteger(n) && n > 0;
function exact(value, keys) {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
}
function clock(value) {
  exact(value, ['wallMs', 'bootMs', 'bootId']);
  assert(integer(value.wallMs) && Number.isFinite(value.bootMs) && value.bootMs > 0);
  assert.match(value.bootId, UUID);
}

// The caller must have positively completed COMMIT, re-observed the original
// installation custody and release/topology, and held the one guardian lock.
// A timeout or unknown COMMIT outcome provides no input to this function.
// sql is selected from the committed guard state, never constructed from now.
export function operationPublication({ bindingBytes, primaryInstallationId,
  operationSequence, sql, before, after }) {
  assert(Buffer.isBuffer(bindingBytes) && bindingBytes.length <= 16384);
  const text = bindingBytes.toString('utf8');
  assert(Buffer.from(text).equals(bindingBytes) && !text.startsWith('\uFEFF'));
  const binding = JSON.parse(text);
  assert.equal(binding.version, 2); assert.equal(binding.admissionProtocol, POLICY);
  assert.match(binding.namespace, /^ats-home-primary-[a-f0-9]{12}$/u);
  assert(integer(binding.generation)); assert.match(binding.systemIdentifier, /^[0-9]{16,20}$/u);
  assert.match(binding.topology, ID); assert.match(primaryInstallationId, ID);
  assert.equal(binding.primaryInstallationId, primaryInstallationId);
  assert(integer(operationSequence));
  clock(before); clock(after); assert.equal(before.bootId, after.bootId);
  const elapsed = after.bootMs - before.bootMs;
  assert(elapsed >= 0 && elapsed <= 1000, 'Renewal observation exceeded its conservative publication window');
  assert(after.wallMs >= before.wallMs, 'Wall clock moved backwards during renewal');
  assert(Math.abs(after.wallMs - before.wallMs - elapsed) <= 1000, 'Clock discontinuity during renewal');
  exact(sql, ['admissionProtocol', 'systemIdentifier', 'databaseBoot', 'leaseEpoch',
    'nodeIdentity', 'topologyFingerprint', 'operationObservedAtMs', 'leaseIssuedAtMs', 'expiresAtMs']);
  assert.equal(sql.admissionProtocol, POLICY);
  assert.equal(sql.systemIdentifier, binding.systemIdentifier);
  assert.equal(sql.leaseEpoch, String(binding.generation));
  assert.equal(sql.nodeIdentity, 'ats-home-primary');
  assert.equal(sql.topologyFingerprint, binding.topology);
  assert.equal(typeof sql.databaseBoot, 'string');
  const databaseBootMs = Date.parse(sql.databaseBoot);
  assert(integer(databaseBootMs));
  assert(integer(sql.operationObservedAtMs) && integer(sql.leaseIssuedAtMs) && integer(sql.expiresAtMs));
  assert.equal(sql.operationObservedAtMs, sql.leaseIssuedAtMs);
  assert(databaseBootMs <= sql.operationObservedAtMs);
  assert(sql.operationObservedAtMs >= before.wallMs && sql.operationObservedAtMs <= after.wallMs,
    'SQL operation timestamp must be observed inside this actual renewal');
  const lifetime = sql.expiresAtMs - sql.operationObservedAtMs;
  assert(lifetime > 0 && lifetime <= 14000 && sql.expiresAtMs > after.wallMs);
  // Anchor to the earlier real boot-clock observation. SQL processing, lock
  // waiting, COMMIT and publication cannot silently restart the fourteen seconds.
  const expiresAtBootMs = before.bootMs + lifetime;
  assert(expiresAtBootMs > after.bootMs);
  assert(Math.abs((after.wallMs - sql.operationObservedAtMs) - elapsed) <= 1000,
    'Published wall and boot observation ages must agree');
  const bindingSha256 = createHash('sha256').update(bindingBytes).digest('hex');
  assert.match(bindingSha256, HASH);
  return Object.freeze({ kind: 'ats-local-primary-operation-v1', bindingSha256,
    namespace: binding.namespace, generation: binding.generation, operationSequence,
    sourceBoot: before.bootId, databaseBoot: sql.databaseBoot,
    systemIdentifier: sql.systemIdentifier, topologyFingerprint: sql.topologyFingerprint,
    primaryInstallationId, observedAtMs: sql.operationObservedAtMs,
    observedMonotonicMs: before.bootMs, expiresAtMs: sql.expiresAtMs, expiresAtBootMs });
}
