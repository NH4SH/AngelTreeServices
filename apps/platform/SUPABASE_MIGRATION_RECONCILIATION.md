# Supabase migration reconciliation

Use this process when the repository migration list, production migration history, and production schema disagree. Production schema state must be inspected before any repair.

## Safety rules

- Never run `supabase db push` merely because `migration list` shows missing remote versions.
- Never edit `supabase_migrations.schema_migrations` with SQL.
- Never mark a partially applied migration as applied.
- Never edit an old committed migration to imitate production drift.
- Link and inspect only the intended project reference.
- Keep credentials, token ciphertext, customer data, and database passwords out of command output and documentation.

## Audit

1. Confirm the intended project and repository state.

   ```bash
   git status --short
   npx supabase --version
   npx supabase link --project-ref YOUR_PRODUCTION_PROJECT_REF
   npx supabase migration list --linked
   ```

2. Inventory each missing version and the tables, columns, constraints, indexes, triggers, functions, RLS policies, and grants it intends to create.
3. Inspect those objects read-only in production. Compare function bodies, `SECURITY DEFINER`, fixed `search_path`, privileges, trigger definitions, and validated constraints.
4. Replay the complete committed chain locally and lint it.

   ```bash
   npx supabase db reset --local --no-seed
   npx supabase db lint --local --schema public,app_private,private --level error --fail-on error
   ```

5. Classify every discrepancy:
   - History missing, schema fully equivalent
   - History missing, schema functionally equivalent
   - History missing, schema partially applied
   - History says applied, schema differs
   - Legitimately pending migration

## Repair choices

### Schema is already equivalent

Use the supported CLI history repair only after the object comparison is documented and reviewed:

```bash
npx supabase migration repair --linked --status applied MIGRATION_VERSION
npx supabase migration list --linked
```

This records history only. It does not replay the migration SQL.

### Schema is partially applied or materially different

Do not mark the old migration applied. Create a new additive corrective migration, verify it on a clean local reset, review a linked dry run, apply it during an approved maintenance step, and then re-audit both schema and history.

### Production contains an intentional change missing from the repo

Capture the intended state in a new additive migration. If production already exactly contains that state, record the new version with `migration repair --status applied` after review instead of replaying it.

## Final verification

After an approved repair:

```bash
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

The dry run should show only legitimately pending migrations. Recheck sensitive functions, triggers, RLS, grants, and application health before considering the baseline trustworthy.
