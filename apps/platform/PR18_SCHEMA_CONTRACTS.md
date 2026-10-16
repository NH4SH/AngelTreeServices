# PR18B: reproducible application schema contracts

The committed `src/lib/types/database.generated.ts` is generated from a fresh
local replay of all committed migrations with Supabase CLI 2.121.0. It contains
schema definitions only, never rows, local credentials, or hosted configuration.
Extension-owned functions are excluded using catalog membership: their schema
location varies between Supabase bootstrap versions and is not an app API.
TypeScript's locked printer provides canonical formatting.

`npm run schema:check:offline` checks migration and generated-file fingerprints.
`node scripts/schema/fresh-check.mjs` creates its own temporary local Supabase
project, replays migrations, regenerates and compares, then stops only that
project. Docker, the pinned CLI, and free ports 56420–56429 are required. It never
copies linked project state. CLI diagnostics are kept in a private temporary log
because they can contain disposable credentials. CI runs the same fresh replay.

To regenerate after a reviewed migration, set `SCHEMA_DISPOSABLE=1` and a loopback
`SCHEMA_DATABASE_URL` pointing at a **fresh replay**, then run
`npm run schema:generate`. `SUPABASE_BIN` optionally selects the pinned CLI.
Never use hosted databases or `--linked` for this check. All script connections
are explicitly restricted to loopback, with the local stack's TLS disabled.

The first incremental adoption covers quote approval (staff and portal), invoice
generation, invoice-balance reconciliation and all four atomic schedule writes.
`RpcArgs` and `satisfies` check names/arguments without changing RPC execution.
Compile-only negative tests require revision/request IDs and valid crew ID types.
Nullable schedule event/revision/override parameters have a documented narrow
override because postgres-meta does not describe parameter nullability.

Existing domain/UI types and runtime response checks remain. JSON RPC responses
still need runtime validation; generated contracts do not prove financial,
authorization or concurrency correctness. A wholesale client typing rewrite is
outside this package; migrate further boundaries as they are changed.

Local verification: all 88 migrations replayed in an isolated CLI-created stack;
regenerated contract matched; typecheck passed; all 652 regression tests passed.
No production migrations or settings changed. This package remains local.
