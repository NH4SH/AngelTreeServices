Encrypted-input, owned schema-only rehearsal. This is not an app or primary deployment.

The branch-filtered workflow runs only on one owner-controlled branch of the existing public repository.
The capsule and diagnostic artifact remain authenticated ciphertext; no raw
SQL, role setting, original identity or key value is committed or logged.
No fork/PR/workflow-dispatch trigger or caller-supplied input is accepted.
It accepts an AES256-GCM authenticated capsule containing rowless structural SQL,
unchanged function definitions and role/catalog metadata. Only ciphertext, pins
and test code are committed. No customer row, role password, provider credential,
production mount/socket, source activation file or backup authority key is input.
The separate one-use decryption key is installed as a temporary Actions secret;
remove that exact secret once all owned attempts have settled. It is retained
privately by the owner and is unrelated to all production encryption/signing keys.

A wrong key must fail before plaintext is written. The controlled root driver
uses credential-free child environments. Only the decryption/diagnostic helper
gets the one-use key; the SQL server/container never receives it or a GitHub token.
Private errors are encrypted for the owner. Uploaded plaintext is bounded
counts/digests, SQLSTATEs and hashed identifiers. No raw SQL or setting is logged.

The new public digest-pinned ARM64 PG17.11 container has 512MiB/one CPU/pids64,
read-only root, tmpfs data and one newly created owned Unix-socket directory. The socket
directory contains no incoming host file; no production bind or TCP listener
is provided. Both server and client have no outbound IP network. An actual denied outbound
connection precedes extension/schema execution. Fresh initdb uses ICU en-US and
en_US.UTF-8 to match source database metadata. Its system identifier must differ
from the source. The Nix postgres wrapper preserves the vendor library paths.
pg_net and pg_stat_statements are preloaded only in this networkless fixture.

The fixture bootstrap logical role supabase_admin has the new OID10 in a new
isolated cluster; it has no production credential. All copied ordinary roles
stay NOLOGIN. Attributes, exact GUC bytes/order, memberships/grantors, database
owner/ACL and extension versions/owners are checked. All eight source event triggers are installed only after the structural load.
Their catalog records and relevant CREATE/ALTER/DROP behavior are checked in
rolled-back fixture transactions. Guard state is empty afterward.

The actual catalog loads 381 policies and 600 guard triggers/200 constraints,
then validates all361 unchanged function definitions against real tables.
Source/fixture opaque inventories and ACL digest equality are reported truthfully;
Full exact catalog equality is required before candidate migration. Source
line endings and two dropped-column slots are retained; omitted logical-dump
ACL/configuration properties are restored through ordinary SQL grants/settings.
The separately pinned candidate adds the two local-policy columns, with legacy
default and no row, renewal or write admission. No original-host guardian,
rootless overflow-owner, native app/worker, paired restore, provider recovery or
production release acceptance follows from this structural fixture.

Work has a400-second deadline with a separate35-second cleanup reserve and a
ten-minute Actions limit. Cleanup inspects the random owned label/CID, stops
Postgres and removes/verifies only that container. Partial/failed evidence stays
retained; no automatic in-place retry, promotion, backup deletion or main update.

The private-repository queue admitted no jobs. This independent key/capsule
uses the already observed native ARM64 public-runner route. All original
private queued attempts remain recorded separately; never call them passed.

Native SDK extension: only pg8.23.1 and its exact lockfile dependency closure
are fetched, with SHA512 verification and bounded regular-file extraction. No
lifecycle script runs. The private runtime source stays in authenticated
ciphertext. A real UID1000 client with no capabilities/NNP uses its isolated
Unix socket; source contexts are explicitly synthetic. Two fixture roles open
only for eight real SQL/SDK cases, then close and guard state is emptied.
Twenty-seven source tests also run natively. This is not original-Mac authority,
full application/worker startup, real reboot, backup/restore or release acceptance.
SDK source directories and all process groups are removed/joined before proof.
