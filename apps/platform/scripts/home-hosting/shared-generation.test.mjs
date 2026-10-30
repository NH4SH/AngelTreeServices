import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sharedObjectDelta, sharedPoolReferences } from './shared-generation.mjs';

const hash = c => c.repeat(64);
const object = (name, c = 'a') => ({ name, size: 41, sha256: hash(c), id: randomUUID(), version: 'v1' });

test('logical views reuse identical ciphertext; only new indexes need uploading', () => {
  const base = [object('config'), object('keys/' + hash('1')), object('data/aa/' + hash('a')),
    object('index/' + hash('b')), object('snapshots/' + hash('c'))];
  const target = [...base.slice(0, 3), object('index/' + hash('d'))];
  const d = sharedObjectDelta(base, target);
  assert.equal(d.reusedBytes, 123); assert.equal(d.uploadBytes, 41);
  assert.equal(d.retiredReferences.length, 2); assert.equal(d.physicalObjectsRemoved, 0);
  assert.throws(() => sharedObjectDelta(base, [...target, object('data/ee/' + hash('e'))]));
  assert.throws(() => sharedObjectDelta(base, target.map(o => o.name === 'config' ? { ...o, sha256: hash('f') } : o)));
  assert.throws(() => sharedObjectDelta(base, target.filter(o => !o.name.startsWith('keys/'))));
});

test('all generations, retired views and unknown roots pin shared provider objects', () => {
  const o = object('config');
  const generations = ['active', 'retired', 'unverified'].map((status, i) => ({
    id: hash(String(i + 1)), status, objects: [{ ...o }],
  }));
  const r = sharedPoolReferences(generations, { pinned: [generations[1].id] });
  assert.equal(r.objects.length, 1); assert.equal(r.objects[0].generations.length, 3);
  assert.equal(r.physicalDeletionAllowed, false); assert.equal(r.writerAdmission, false);
  assert.throws(() => sharedPoolReferences(generations, { pinned: [hash('f')] }));
  const replaced = structuredClone(generations); replaced[1].objects[0].version = 'v2';
  assert.throws(() => sharedPoolReferences(replaced));
  const changed = structuredClone(generations); changed[1].objects[0].id = randomUUID();
  assert.throws(() => sharedPoolReferences(changed));
});
