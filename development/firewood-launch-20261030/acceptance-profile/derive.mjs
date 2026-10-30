import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, lstat, readdir } from 'node:fs/promises';
import { dirname, resolve, relative, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDerivableAcceptance, assertBoundAcceptance, BUSINESS_POLICY,
  createHermeticAcceptanceFixture, validateSerializedAcceptanceReviewDescriptor } from './profiles.mjs';

export const SOURCE_LOCK_SHA256 = 'b278318e9ee804fd3ef63c3ed82e9ff96064a698c2fe1dd37c6d55a79d00b04e';
const here = dirname(fileURLToPath(import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const reject = message => { throw new Error('Acceptance derivation rejected: ' + message); };
const inside = (root, path) => { const name = relative(root, path);
  if (!name || name === '..' || name.startsWith('..' + sep) || resolve(root, name) !== path) reject('path outside owned child');
  return path;
};
const local = (root, name) => {
  if (typeof name !== 'string' || name.includes('\\') || name.startsWith('/') || name.split('/').some(part => !part || part === '.' || part === '..')) reject('invalid manifest path');
  return inside(root, resolve(root, name));
};
async function regular(path) { if (!(await lstat(path)).isFile()) reject('source is not a regular file'); }
export async function readSourceLock() {
  const path = join(here, 'SOURCE_LOCK.json'); await regular(path); const bytes = await readFile(path);
  if (sha(bytes) !== SOURCE_LOCK_SHA256) reject('source-lock preimage changed');
  const lock = JSON.parse(bytes);
  if (lock.version !== 1 || lock.sources.length !== 20) reject('unknown source-lock shape');
  return lock;
}
function outputLiteral(rule, descriptor) {
  if (rule.to !== null) return rule.to;
  if (rule.kind === 'portal-origin') return descriptor.origins.portalOrigin;
  if (rule.kind === 'website-origin') return descriptor.origins.websiteOrigin;
  reject('unknown replacement literal');
}
export function applyPinnedReplacements(source, entry, descriptor) {
  if (!Buffer.isBuffer(source) || source.length !== entry.bytes || sha(source) !== entry.sha256) reject('frozen source preimage changed: ' + entry.source);
  const spans = [];
  for (const rule of entry.replacements) {
    if (rule.count < 1 || rule.sourceStarts.length !== rule.count) reject('replacement occurrence count');
    const from = Buffer.from(rule.from), to = Buffer.from(outputLiteral(rule, descriptor));
    for (const start of rule.sourceStarts) {
      if (!Number.isSafeInteger(start) || start < 0 || !source.subarray(start, start + from.length).equals(from)) reject('replacement source span');
      spans.push({ kind: rule.kind, sourceStart: start, sourceEnd: start + from.length, from: from.toString(), to: to.toString() });
    }
  }
  spans.sort((a, b) => a.sourceStart - b.sourceStart);
  const parts = []; let cursor = 0, outputCursor = 0;
  for (const span of spans) {
    if (span.sourceStart < cursor) reject('overlapping replacement spans');
    const prefix = source.subarray(cursor, span.sourceStart); parts.push(prefix); outputCursor += prefix.length;
    span.outputStart = outputCursor; const to = Buffer.from(span.to); parts.push(to); outputCursor += to.length; span.outputEnd = outputCursor;
    cursor = span.sourceEnd;
  }
  parts.push(source.subarray(cursor)); const bytes = Buffer.concat(parts);
  if (!inversePinnedReplacements(bytes, spans).equals(source)) reject('inverse reconstruction did not match frozen bytes');
  return { bytes, spans };
}
export function inversePinnedReplacements(output, spans) {
  const parts = []; let cursor = 0;
  for (const span of spans) {
    if (!Number.isSafeInteger(span.outputStart) || span.outputStart < cursor || span.outputEnd < span.outputStart
      || !output.subarray(span.outputStart, span.outputEnd).equals(Buffer.from(span.to))) reject('inverse output span');
    parts.push(output.subarray(cursor, span.outputStart), Buffer.from(span.from)); cursor = span.outputEnd;
  }
  parts.push(output.subarray(cursor)); return Buffer.concat(parts);
}
const literal = value => "'" + value.replaceAll("'", "''") + "'";
export function acceptanceSqlIdentityPrecondition(descriptor) {
  const db = assertBoundAcceptance(descriptor);
  // The metadata row is established and independently verified by root's owned
  // QA admission procedure. This module never creates or updates that registry.
  return `-- Exact separately owned QA target guard; never a production installer.\nDO $ats_acceptance_target$\nBEGIN\n IF current_database() IS DISTINCT FROM ${literal(db.name)}\n OR (SELECT oid::text FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM ${literal(db.oid)}\n OR (SELECT system_identifier::text FROM pg_control_system()) IS DISTINCT FROM ${literal(db.systemIdentifier)}\n OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM ${literal(db.comment)}\n THEN RAISE EXCEPTION 'Acceptance target literal database identity mismatch.' USING ERRCODE='42501'; END IF;\n IF to_regclass('ats_firewood_acceptance_meta.target') IS NULL THEN RAISE EXCEPTION 'Acceptance QA admission registry absent.' USING ERRCODE='42501'; END IF;\n IF (SELECT count(*) FROM ats_firewood_acceptance_meta.target)<>1\n OR NOT EXISTS(SELECT 1 FROM ats_firewood_acceptance_meta.target WHERE marker_uuid=${literal(db.markerId)}::uuid\n AND purpose='ats-firewood-acceptance-v1' AND schema_fingerprint=${literal(db.schemaFingerprint)}\n AND release_digest=${literal(db.releaseDigest)} AND admission_binding_id=${literal(db.admissionBindingId)}::uuid)\n THEN RAISE EXCEPTION 'Acceptance purpose, marker or admission binding mismatch.' USING ERRCODE='42501'; END IF;\nEND $ats_acceptance_target$;\n`;
}
export async function deriveAcceptanceArtifact({ descriptor, outputDirectory, sourceRoot } = {}) {
  const kind = assertDerivableAcceptance(descriptor), lock = await readSourceLock();
  const sourceBase = resolve(sourceRoot ?? lock.sourceRoot);
  const outputRoot = resolve(outputDirectory ?? ''); inside(here, outputRoot);
  // Must be a fresh child owned by this derivation. Never replace prior evidence.
  await mkdir(outputRoot, { mode: 0o700 });
  const outputs = [];
  for (const entry of lock.sources) {
    const sourcePath = local(sourceBase, entry.source); await regular(sourcePath);
    const source = await readFile(sourcePath), derived = applyPinnedReplacements(source, entry, descriptor);
    const suffix = entry.type === 'sql' ? '.review-only.txt' : '';
    const output = entry.output + suffix, path = local(outputRoot, output); await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, derived.bytes, { flag: 'wx', mode: 0o600 });
    outputs.push({ source: entry.source, output, type: entry.type, sourceSha256: entry.sha256,
      outputSha256: sha(derived.bytes), inverseSha256: sha(inversePinnedReplacements(derived.bytes, derived.spans)), spans: derived.spans });
    if (entry.type === 'sql' && kind === 'acceptance:bound-review') {
      // Preserve each reviewed source unit's existing transaction boundaries.
      // Execute its guard and unit on one already pinned connection; no pool
      // reassignment, source mutation, or separate unguarded unit is permitted.
      const envelopeName = entry.output + '.bound-review.txt';
      const envelope = Buffer.from(acceptanceSqlIdentityPrecondition(descriptor)
        + "SET ats.firewood_acceptance_review='isolated-synthetic-only';\n" + derived.bytes.toString());
      await writeFile(local(outputRoot, envelopeName), envelope, { flag: 'wx', mode: 0o600 });
      outputs.push({ output: envelopeName, type: 'guarded-review-envelope', outputSha256: sha(envelope), sourceOutput: output,
        guardSha256: sha(acceptanceSqlIdentityPrecondition(descriptor)), executableAuthority: false });
    }
  }
  const descriptorFile = Buffer.from(json(descriptor)); await writeFile(join(outputRoot, 'REVIEW_ONLY_PROFILE.json'), descriptorFile, { flag: 'wx', mode: 0o600 });
  outputs.push({ output: 'REVIEW_ONLY_PROFILE.json', type: 'descriptor', outputSha256: sha(descriptorFile) });
  const manifest = { version: 1, purpose: 'local-source-derivation-and-consistency-review-only', sourceLockSha256: SOURCE_LOCK_SHA256,
    identity: { profile: descriptor.profile, officeContract: descriptor.officeContract, financialContract: descriptor.financialContract,
      sourceId: descriptor.sourceId, environmentId: descriptor.environmentId, expectedAccountId: descriptor.expectedAccountId,
      accountVerification: descriptor.accountVerification, mode: descriptor.mode, livemode: descriptor.livemode,
      financialHmacDomain: descriptor.financialHmacDomain, officeHmacDomain: descriptor.officeHmacDomain,
      targetPurpose: descriptor.targetPurpose, origins: descriptor.origins },
    providerReady: false, runtimeLoadable: false, activationAuthority: false, databaseConnected: false,
    sqlFilesAreReviewText: true, businessPolicy: BUSINESS_POLICY, files: outputs };
  const manifestBytes = Buffer.from(json(manifest));
  await writeFile(join(outputRoot, 'DERIVATION_MANIFEST.json'), manifestBytes, { flag: 'wx', mode: 0o600 });
  await verifyDerivedArtifact(outputRoot, { expectedManifestSha256: sha(manifestBytes) });
  return { outputDirectory: outputRoot, manifestSha256: sha(manifestBytes), files: outputs.length,
    identitySpans: outputs.reduce((count, entry) => count + (entry.spans?.length ?? 0), 0), providerReady: false };
}
export async function verifyDerivedArtifact(outputDirectory, { expectedManifestSha256 = null } = {}) {
  const root = resolve(outputDirectory); inside(here, root);
  const manifestPath = join(root, 'DERIVATION_MANIFEST.json'); await regular(manifestPath);
  const manifestBytes = await readFile(manifestPath);
  if (expectedManifestSha256 !== null && sha(manifestBytes) !== expectedManifestSha256) reject('trusted manifest digest changed');
  const manifest = JSON.parse(manifestBytes);
  const serialized = JSON.parse(await readFile(join(root, 'REVIEW_ONLY_PROFILE.json'), 'utf8'));
  const validatedDescriptor = validateSerializedAcceptanceReviewDescriptor(serialized);
  if (manifest.version !== 1 || manifest.sourceLockSha256 !== SOURCE_LOCK_SHA256 || manifest.providerReady !== false
    || manifest.runtimeLoadable !== false || manifest.activationAuthority !== false || manifest.databaseConnected !== false) reject('artifact authority or source lock');
  const lock = await readSourceLock(), entries = new Map(lock.sources.map(entry => [entry.source, entry]));
  if (JSON.stringify(manifest.businessPolicy) !== JSON.stringify(BUSINESS_POLICY)) reject('business-policy manifest changed');
  const expectedCount = validatedDescriptor.state === 'hermetic-fixture-only' ? 21 : 27;
  if (manifest.files.length !== expectedCount || new Set(manifest.files.map(entry => entry.output)).size !== expectedCount
    || manifest.files.filter(entry => entry.source).length !== 20
    || new Set(manifest.files.filter(entry => entry.source).map(entry => entry.source)).size !== 20) reject('source/closure count changed');
  for (const key of Object.keys(manifest.identity)) {
    if (JSON.stringify(manifest.identity[key]) !== JSON.stringify(validatedDescriptor[key])) reject('manifest identity disagrees with descriptor');
  }
  const expectedFiles = new Set(['DERIVATION_MANIFEST.json', ...manifest.files.map(entry => entry.output)]);
  async function walk(folder) {
    for (const child of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, child.name);
      if (child.isSymbolicLink()) reject('artifact symlink');
      if (child.isDirectory()) await walk(path);
      else if (!child.isFile() || !expectedFiles.delete(relative(root, path).split(sep).join('/'))) reject('unexpected artifact file');
    }
  }
  await walk(root); if (expectedFiles.size) reject('artifact file missing');
  for (const entry of manifest.files) {
    const path = local(root, entry.output); await regular(path); const data = await readFile(path);
    if (sha(data) !== entry.outputSha256) reject('artifact output hash changed: ' + entry.output);
    if (entry.type === 'descriptor') {
      if (entry.output !== 'REVIEW_ONLY_PROFILE.json') reject('unknown descriptor output');
    } else if (entry.type === 'guarded-review-envelope') {
      if (validatedDescriptor.state !== 'binding-consistent-review-only' || entry.executableAuthority !== false) reject('unguarded or active SQL claim');
      const sourceEntry = manifest.files.find(item => item.output === entry.sourceOutput && item.type === 'sql');
      if (!sourceEntry || entry.output !== sourceEntry.output.replace(/\.review-only\.txt$/u, '.bound-review.txt')) reject('unknown SQL envelope source');
      const guard = acceptanceSqlIdentityPrecondition(validatedDescriptor);
      const raw = await readFile(local(root, sourceEntry.output));
      if (entry.guardSha256 !== sha(guard) || !data.equals(Buffer.from(guard + "SET ats.firewood_acceptance_review='isolated-synthetic-only';\n" + raw.toString()))) reject('SQL target precondition or source body changed');
    } else if (!entry.source) reject('unknown output type');
    if (entry.source) {
      const locked = entries.get(entry.source);
      if (!locked || entry.output !== locked.output + (locked.type === 'sql' ? '.review-only.txt' : '')
        || entry.type !== locked.type || entry.sourceSha256 !== locked.sha256 || sha(inversePinnedReplacements(data, entry.spans)) !== locked.sha256
        || entry.inverseSha256 !== locked.sha256) reject('artifact inverse frozen-source proof');
      // Re-derive from the reconstructed pinned bytes and the serialized
      // descriptor, then compare every allowed span. Manifest edits cannot
      // bless an arbitrary non-identity source change.
      const expected = applyPinnedReplacements(inversePinnedReplacements(data, entry.spans), locked, validatedDescriptor);
      if (!expected.bytes.equals(data) || JSON.stringify(expected.spans) !== JSON.stringify(entry.spans)) reject('artifact span allowlist changed');
    }
  }
  return { verified: true, files: manifest.files.length, providerReady: false };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4 || process.argv[2] !== '--hermetic-output') throw new Error('Usage: node derive.mjs --hermetic-output <fresh-owned-child-directory>');
  const proof = await deriveAcceptanceArtifact({ descriptor: createHermeticAcceptanceFixture(), outputDirectory: process.argv[3] });
  process.stdout.write(json(proof));
}
