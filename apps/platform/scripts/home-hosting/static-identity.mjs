import assert from 'node:assert/strict';
import { sha256 } from './cloud-policy.mjs';
import { staticIdentity } from './paired-backup-policy.mjs';
export function staticBindingFromVerifiedArtifacts(manifest, artifacts, schemaFingerprint) {
  assert.equal(manifest.backupLayout, 'schema-base-v1');
  assert.ok(Array.isArray(manifest.roles) && Array.isArray(manifest.memberships) && Array.isArray(manifest.sequenceOwnerPrivileges));
  assert.match(schemaFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(manifest.schemaContentFingerprint, schemaFingerprint);
  assert.ok(manifest.runtime?.version===1&&Array.isArray(manifest.runtime.files));
  const fields = {
    schemaContentFingerprint: schemaFingerprint,
    rolesSha256: sha256(JSON.stringify([manifest.roles, manifest.memberships, manifest.sequenceOwnerPrivileges])),
    coreConfigSha256: artifacts['core.private.env'].sha256,
    appConfigSha256: artifacts['app.private.env'].sha256,
    releaseSourceSha256: artifacts['release-source.tar.gz'].sha256,
    objectInventorySha256: sha256(JSON.stringify(manifest.objects)),
    runtimeManifestSha256: sha256(JSON.stringify(manifest.runtime)),
  };
  const identity = staticIdentity(fields);
  assert.equal(manifest.staticIdentitySha256, identity, 'Static recovery artifact binding differs');
  return { backupLayout: 'schema-base-v1', staticBinding: fields, staticIdentitySha256: identity };
}
