import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { linkIntents, readLinkAttempt, prepareLinkAttempt, forgetLinkAttempt } from '../src/lib/change-orders/link-attempt.ts';

const id = randomUUID(), requestId = randomUUID(), digest = 'a1'.repeat(32), newerDigest = 'b2'.repeat(32);
const identity = { requestId, sourceId: id, revision: 4, linkVersion: digest, intent: 'generate' };
function memoryStorage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('every customer-link intent round trips only its opaque request identity', () => {
  assert.deepEqual(linkIntents, ['generate', 'regenerate', 'revoke']);
  for (const intent of linkIntents) {
    const storage = memoryStorage(), result = prepareLinkAttempt(id, 4, digest, intent, storage);
    assert.equal(result.blocked, false);
    assert.match(result.attempt.requestId, /^[a-f0-9-]{36}$/);
    assert.deepEqual(readLinkAttempt(id, storage), result.attempt);
    assert.deepEqual([...storage.values.keys()], [`change-order-link:${id}`]);
    assert.deepEqual(Object.keys(JSON.parse(storage.getItem(`change-order-link:${id}`))).sort(), ['intent', 'linkVersion', 'requestId', 'revision', 'sourceId']);
  }
});

test('reload recovery retains the original request, reviewed revision and link digest after source changes', () => {
  const storage = memoryStorage(), original = prepareLinkAttempt(id, 4, digest, 'regenerate', storage);
  const recovered = prepareLinkAttempt(id, 12, newerDigest, 'regenerate', storage);
  assert.deepEqual(recovered, original);
  assert.equal(recovered.attempt.revision, 4);
  assert.equal(recovered.attempt.linkVersion, digest);
  const other = prepareLinkAttempt(randomUUID(), 12, newerDigest, 'regenerate', storage);
  assert.notEqual(other.attempt.requestId, original.attempt.requestId);
});

test('an unresolved request cannot switch its link action or overwrite the saved request', () => {
  const storage = memoryStorage(), original = prepareLinkAttempt(id, 4, digest, 'generate', storage);
  const stored = storage.getItem(`change-order-link:${id}`);
  for (const intent of ['regenerate', 'revoke']) {
    const result = prepareLinkAttempt(id, 12, newerDigest, intent, storage);
    assert.deepEqual(result, { attempt: original.attempt, blocked: true });
    assert.equal(storage.getItem(`change-order-link:${id}`), stored);
  }
});

test('malformed or tampered cached identities are rejected instead of authorizing recovery', () => {
  const storage = memoryStorage();
  for (const value of [null, [], 'bad', { ...identity, requestId: 'bad' }, { ...identity, sourceId: randomUUID() },
    { ...identity, revision: -1 }, { ...identity, revision: 0.5 }, { ...identity, revision: '4' },
    { ...identity, revision: Number.MAX_SAFE_INTEGER + 1 }, { ...identity, linkVersion: 'a'.repeat(63) },
    { ...identity, linkVersion: 'A'.repeat(64) }, { ...identity, linkVersion: 'g'.repeat(64) },
    { ...identity, linkVersion: null }, { ...identity, intent: 'send' }]) {
    storage.setItem(`change-order-link:${id}`, JSON.stringify(value));
    assert.equal(readLinkAttempt(id, storage), undefined);
  }
  storage.setItem(`change-order-link:${id}`, '{broken');
  assert.equal(readLinkAttempt(id, storage), undefined);
  storage.setItem('change-order-link:not-a-uuid', JSON.stringify({ ...identity, sourceId: 'not-a-uuid' }));
  assert.equal(readLinkAttempt('not-a-uuid', storage), undefined);
});

test('recovered and page-local requests strip token, URL and other private fields before persistence', () => {
  const storage = memoryStorage(), extra = { ...identity, token: 'synthetic-token', url: 'https://synthetic.invalid/private', tokenHash: 'private-hash', cipher: 'private-cipher', recipient: 'customer@example.invalid' };
  storage.setItem(`change-order-link:${id}`, JSON.stringify(extra));
  assert.deepEqual(readLinkAttempt(id, storage), identity);
  assert.deepEqual(prepareLinkAttempt(id, 12, newerDigest, 'generate', storage).attempt, identity);
  assert.deepEqual(JSON.parse(storage.getItem(`change-order-link:${id}`)), identity);
  storage.values.clear();
  assert.deepEqual(prepareLinkAttempt(id, 12, newerDigest, 'generate', storage, extra).attempt, identity);
  assert.deepEqual(JSON.parse(storage.getItem(`change-order-link:${id}`)), identity);
});

test('unavailable storage retains the page-local identity and its original intent', () => {
  const broken = { getItem() { throw Error('unavailable'); }, setItem() { throw Error('unavailable'); }, removeItem() { throw Error('unavailable'); } };
  const original = prepareLinkAttempt(id, 4, digest, 'revoke', broken);
  assert.deepEqual(prepareLinkAttempt(id, 12, newerDigest, 'revoke', broken, original.attempt), original);
  assert.deepEqual(prepareLinkAttempt(id, 12, newerDigest, 'generate', broken, original.attempt), { attempt: original.attempt, blocked: true });
  assert.equal(readLinkAttempt(id, broken), undefined);
  assert.doesNotThrow(() => forgetLinkAttempt(id, broken));
  const pageOnly = prepareLinkAttempt(id, 0, digest, 'generate', null);
  assert.deepEqual(prepareLinkAttempt(id, 12, newerDigest, 'generate', null, pageOnly.attempt), pageOnly);
});

test('forget clears only the selected record and permits a distinct new request', () => {
  const storage = memoryStorage(), otherId = randomUUID();
  const original = prepareLinkAttempt(id, 4, digest, 'generate', storage);
  const other = prepareLinkAttempt(otherId, 2, digest, 'revoke', storage);
  forgetLinkAttempt(id, storage);
  assert.equal(readLinkAttempt(id, storage), undefined);
  assert.deepEqual(readLinkAttempt(otherId, storage), other.attempt);
  const next = prepareLinkAttempt(id, 12, newerDigest, 'regenerate', storage);
  assert.notEqual(next.attempt.requestId, original.attempt.requestId);
  assert.equal(next.attempt.revision, 12);
  assert.equal(next.attempt.linkVersion, newerDigest);
  assert.equal(next.attempt.intent, 'regenerate');
});

test('invalid new identities cannot be persisted and malformed page-local data cannot cross records', () => {
  const storage = memoryStorage();
  for (const args of [['invalid', 4, digest, 'generate'], [id, -1, digest, 'generate'], [id, 4, 'bad', 'generate'], [id, 4, digest, 'send']]) {
    assert.throws(() => prepareLinkAttempt(...args, storage), /Invalid customer-link request identity/);
    assert.equal(storage.values.size, 0);
  }
  const next = prepareLinkAttempt(id, 12, newerDigest, 'regenerate', storage, { ...identity, sourceId: randomUUID() });
  assert.equal(next.attempt.sourceId, id);
  assert.equal(next.attempt.revision, 12);
  assert.notEqual(next.attempt.requestId, requestId);
});
