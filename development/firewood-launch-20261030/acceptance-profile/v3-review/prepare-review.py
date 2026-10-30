"""Offline inventory only. Reads pinned source files; never emits SQL or runtime code."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
WEBSITE = Path('/Users/noelsierra/Documents/Codex/2026-10-16/files-pasted-by-the-user-you/outputs/firewood-checkout/launch-20261030/acceptance-offline-v1')

def sha(data):
    return hashlib.sha256(data).hexdigest()

def load(path, pin=None):
    assert path.is_file() and not path.is_symlink(), str(path)
    data = path.read_bytes()
    if pin:
        assert sha(data) == pin, str(path)
    return json.loads(data)

def provenance(path):
    return {'path': str(path), 'bytes': path.stat().st_size, 'sha256': sha(path.read_bytes())}

def emit(name, value):
    # New review generation is intentionally not an overwrite API.
    with (OUT / name).open('x') as stream:
        json.dump(value, stream, indent=2)
        stream.write('\n')

def spans(data, old):
    value = old.encode()
    found, cursor = [], 0
    while (start := data.find(value, cursor)) != -1:
        found.append({'sourceStart': start, 'sourceEnd': start + len(value),
                      'line': data[:start].count(b'\n') + 1})
        cursor = start + len(value)
    return found

manifest_path = ROOT / 'crm-runtime/build/SNAPSHOT_SOURCE_MANIFEST.v3.json'
manifest = load(manifest_path, 'cf6f065c4d42ef1fd299733be959e150135b9ff9d0c24334b23d252b0fa9d765')
assert manifest['fileCount'] == len(manifest['files']) == 701
crm = ROOT / 'crm-runtime/source'
for entry in manifest['files']:
    path = crm / entry['path']
    assert path.is_file() and not path.is_symlink()
    data = path.read_bytes()
    assert len(data) == entry['bytes'] and sha(data) == entry['sha256'], str(path)

old_lock_path = ROOT / 'acceptance-profile/SOURCE_LOCK.json'
old = load(old_lock_path, 'b278318e9ee804fd3ef63c3ed82e9ff96064a698c2fe1dd37c6d55a79d00b04e')
sql_inventory_path = ROOT / 'installation-plan/FINAL_ELEVEN_UNIT_INVENTORY_UNBOUND.json'
sql = load(sql_inventory_path)
assert len(sql['units']) == sql['unitCount'] == 11
for entry in sql['units']:
    path = Path(entry['path'])
    assert path.is_file() and not path.is_symlink()
    assert path.stat().st_size == entry['bytes'] and sha(path.read_bytes()) == entry['sha256'], str(path)

web_manifest_path = WEBSITE / 'artifact/website-acceptance-source-manifest.json'
web = load(web_manifest_path, '13670db46efb393e5ca69867d19c1b1fae900cc0d6a7a69baf03f9ad5c358351')
assert len(web) == 50
for name, digest in web.items():
    path = WEBSITE / 'artifact' / name
    assert path.is_file() and not path.is_symlink() and sha(path.read_bytes()) == digest, str(path)

old_comparison = []
for entry in old['sources']:
    if entry['type'] != 'module':
        continue
    name = entry['source'].removeprefix('crm/apps/platform/')
    data = (crm / name).read_bytes()
    old_comparison.append({'path': name, 'oldSha256': entry['sha256'], 'v3Sha256': sha(data),
                           'sameAsOldInput': sha(data) == entry['sha256'],
                           'oldRules': [{'kind': rule['kind'], 'old': rule['from'], 'proposed': rule['to'],
                                         'oldCount': rule['count'], 'v3Count': len(spans(data, rule['from']))}
                                        for rule in entry['replacements']]})

# These are candidates for a new pinned allowlist, not a replacement engine.
# Whole-file hashes and byte positions are recorded, but no edited bytes are emitted.
identity_rules = [
    ('financial-contract', 'firewood-invoice-handoff-live-v1', 'firewood-invoice-handoff-acceptance-v1'),
    ('office-contract', 'firewood-office-live-v2', 'firewood-office-acceptance-v2'),
    ('source', 'website_firewood_invoice_live_v1', 'website_firewood_invoice_acceptance_v1'),
    ('environment', 'ats_firewood_live_v1', 'ats_firewood_acceptance_v1'),
    ('test-account-identity', 'acct_1Tv92EI7tY6VHUvU', 'acct_1UU9U8RAZXGe6tX0'),
    ('financial-api', '/api/integrations/firewood/live/v1', '/api/integrations/firewood/acceptance/v1'),
    ('office-api', '/api/integrations/firewood/live/v2/office', '/api/integrations/firewood/acceptance/v2/office'),
    ('financial-hmac', 'ATS-FIREWOOD-LIVE-V1', 'ATS-FIREWOOD-ACCEPTANCE-V1'),
    ('office-hmac', 'ATS-FIREWOOD-OFFICE-LIVE-V2', 'ATS-FIREWOOD-OFFICE-ACCEPTANCE-V2'),
    ('sql-rpc-namespace', 'firewood_live_', 'firewood_acceptance_'),
    ('website-storage-namespace', 'fwofficev2_', 'fwofficeacceptance_'),
    ('request-role', 'ats_firewood_request', 'binding.roles.request'),
    ('worker-role', 'ats_firewood_worker', 'binding.roles.worker'),
    ('health-role', 'ats_firewood_health', 'binding.roles.health'),
    ('order-advisory', 'firewood-live-v1-order:', 'firewood-acceptance-v1-order:'),
    ('office-advisory', 'firewood-office-request:', 'firewood-office-acceptance-request:'),
    ('report-credit', 'firewood-credit:', 'firewood-acceptance-credit:'),
    ('portal-origin-proposal', 'https://admin.angeltreeservices.org', 'binding.origins.portal'),
    ('website-origin-proposal', 'https://checkout.angeltreeservices.org', 'binding.origins.website'),
    ('review-sentinel', 'ats.firewood_live_review', 'ats.firewood_acceptance_review'),
]
specific_rules = {
    'src/lib/firewood/handoff/live-profile.mjs': [('profile', 'firewood-live-v1-review', 'firewood-acceptance-v1-review'), ('test-key-classifier', '^rk_live_', '^rk_test_')],
    'src/lib/firewood/handoff/live-collector.mjs': [('profile', 'firewood-live-v1', 'firewood-acceptance-v1')],
    'src/lib/firewood/handoff/collector-admission.mjs': [('profile', 'firewood-live-v1', 'firewood-acceptance-v1'), ('test-key-classifier', '^rk_live_', '^rk_test_')],
    'src/lib/firewood/handoff/protected-runtime.mjs': [('private-secret-namespace', '/run/secrets/firewood_handoff.json', '/run/acceptance-secrets/firewood_handoff.json')],
    'src/lib/firewood/runtime-admission/release-filesystem.mjs': [
        ('control-descriptor', '/release-admission/firewood-release.json', '/acceptance-admission/firewood-acceptance.json'),
        ('control-root', '/admission/', '/acceptance-admission/')],
}
dedicated_mode_files = {
    'src/lib/firewood/handoff/' + name for name in ['live-contract.mjs', 'live-profile.mjs', 'live-handler.mjs',
      'live-collector.mjs', 'office-contract.mjs', 'office-handler.mjs', 'protected-runtime.mjs', 'collector-admission.mjs', 'receipt-source-gate.mjs']
} | {'src/lib/documents/firewood-invoice-accounting.mjs', 'src/lib/firewood/runtime-admission/released-context-core.mjs'}
mode_rules = [('mode-single', "'live'", "'test'"), ('mode-double', '"live"', '"test"'),
              ('livemode-positive', '.livemode === true', '.livemode === false'),
              ('livemode-positive-compact', '.livemode===true', '.livemode===false'),
              ('livemode-negative', '.livemode !== true', '.livemode !== false'),
              ('livemode-negative-compact', '.livemode!==true', '.livemode!==false'),
              ('livemode-argument', 'livemode!==true', 'livemode!==false')]

crm_candidates = []
for file in manifest['files']:
    name = file['path']
    if not name.startswith('src/') or name.endswith(('.test.mjs', '.test.ts', '.d.mts', '.md')):
        continue
    data = (crm / name).read_bytes()
    rules = identity_rules + specific_rules.get(name, []) + (mode_rules if name in dedicated_mode_files else [])
    candidate = []
    for kind, old_value, proposed in rules:
        occurrences = spans(data, old_value)
        if occurrences:
            candidate.append({'kind': kind, 'old': old_value, 'proposed': proposed, 'count': len(occurrences), 'spans': occurrences})
    if candidate:
        crm_candidates.append({'path': name, 'bytes': len(data), 'sha256': sha(data), 'candidateRules': candidate,
            'classification': 'preserve-unrelated-production-reference; separately review isolated deployment configuration' if name in {
              'src/lib/leads/config.ts', 'src/lib/security/local-redirect.ts', 'src/lib/security/staging-policy.mjs'
            } else 'acceptance-identity-or-runtime-boundary',
            'status': 'REQUIRES_SEPARATELY_REVIEWED_PER_FILE_ALLOWLIST; NOT_AN_EXECUTABLE_REPLACEMENT_PLAN'})

sql_candidates = []
for entry in sql['units']:
    data = Path(entry['path']).read_bytes()
    rules = identity_rules + [('mode', "'live'", "'test'"), ('livemode-json', "'livemode',true", "'livemode',false"),
        ('native-current-database', "pg_catalog.current_database() <> 'postgres'", 'pg_catalog.current_database() <> binding.database.name'),
        ('temporary-privilege-database', "'postgres','TEMPORARY'", 'binding.database.name,TEMPORARY'),
        ('temporary-grant-database', 'GRANT TEMPORARY ON DATABASE postgres TO %I', 'GRANT TEMPORARY ON DATABASE <exact bound identifier> TO %I'),
        ('temporary-revoke-database', 'REVOKE TEMPORARY ON DATABASE postgres FROM PUBLIC', 'REVOKE TEMPORARY ON DATABASE <exact bound identifier> FROM PUBLIC'),
        ('document-review-sentinel', 'ats.firewood_doc_review', 'ats.firewood_acceptance_doc_review'),
        ('receipt-review-sentinel', 'ats.firewood_receipt_review', 'ats.firewood_acceptance_receipt_review')]
    found = []
    for kind, old_value, proposed in rules:
        occurrences = spans(data, old_value)
        if occurrences:
            found.append({'kind': kind, 'old': old_value, 'proposed': proposed, 'count': len(occurrences), 'spans': occurrences})
    sql_candidates.append({**entry, 'candidateIdentityRules': found,
        'requiredEnvelope': 'Exact bound acceptance DB/OID/systemIdentifier/comment/marker/schema/release/admission registry predicate before every unit on same pinned connection; preserve reviewed transaction semantics.',
        'executableAuthority': False})

inventory = {
    'kind': 'v3-offline-acceptance-interface-review', 'state': 'UNBOUND_REVIEW_ONLY',
    'authority': {'actualAdmission': False, 'providerReady': False, 'runtimeLoadable': False,
                  'activationAuthority': False, 'sqlRendered': False, 'sqlExecuted': False},
    'actualBindings': None,
    'provenance': {'approvalScope': provenance(ROOT / 'APPROVAL_SCOPE.json'),
      'installationStatus': provenance(ROOT / 'INSTALLATION_STATUS.json'),
      'crmV3Manifest': provenance(manifest_path), 'verifiedV3SourceFiles': 701,
      'priorSourceLock': provenance(old_lock_path), 'priorModuleCount': 14, 'priorSqlUnitCount': 6,
      'elevenSqlInventory': provenance(sql_inventory_path), 'verifiedSqlUnitCount': 11,
      'websiteAcceptanceManifest': provenance(web_manifest_path), 'verifiedWebsiteSourceFiles': 50,
      'websiteAcceptanceProof': provenance(WEBSITE / 'PROOF.json'),
      'qaOnlyPostimageSemanticSha256': '2a5207d17296e6e70c8f732bf2321554f024186919d2e04840e5487bedebb68e',
      'qaPostimageIsAcceptanceBinding': False},
    'priorModuleComparison': old_comparison, 'crmCandidateFiles': crm_candidates, 'sqlUnits': sql_candidates,
    'preserveExactly': ['terms/payment policy versions and hashes', 'price catalog/tax/card-fee/accounting math',
      'ordinary financial and historical receipt branches', 'RLS/ACL and grantors, SECURITY DEFINER owners and authorization',
      'native/row/deferred guards, row locks, CAS/replay rules and transaction boundaries',
      'production source, old acceptance artifacts and production gate defaults'],
    'candidateSpansAreNotAnAllowlist': True,
}
emit('INVENTORY.json', inventory)
print(json.dumps({'crmV3SourceFilesVerified': 701, 'websiteFilesVerified': 50, 'sqlUnitsVerified': 11,
                  'priorModulesChanged': sum(not e['sameAsOldInput'] for e in old_comparison),
                  'crmCandidateFiles': len(crm_candidates), 'actualBindings': None,
                  'inventorySha256': sha((OUT / 'INVENTORY.json').read_bytes())}))
