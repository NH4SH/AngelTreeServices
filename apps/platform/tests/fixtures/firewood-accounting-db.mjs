// Separate in-memory repair fixture. The original readyDb remains unchanged.
// Auth helpers are the original disclosed test.uid/test.admin model, never the
// genuine native Auth/RLS evidence. Financial functions are exact102 preimages.
import { readFileSync } from 'node:fs';
import { readyDb as officeReadyDb } from './firewood-office-db.mjs';
export * from './firewood-office-db.mjs';

export const accounting102SQL = readFileSync(new URL('./firewood-accounting-102.sql', import.meta.url), 'utf8');
export const accountingSQL = readFileSync(new URL('../../../../supabase/review/firewood-live/accounting.sql', import.meta.url), 'utf8');

const fixtureDependenciesSQL = `
alter table public.invoices add column paid_at timestamptz,add column created_at timestamptz not null default clock_timestamp(),add column updated_at timestamptz not null default clock_timestamp();
alter table public.invoices add constraint invoices_status_check check(status in('draft','sent','partially_paid','paid','void','overdue'));
-- Same disclosed owner-test authority as readyDb, solely to satisfy the exact
-- original reconciler's staff predicate. Native tests never use this helper.
create function app_private.has_staff_role()returns boolean language sql stable as $$select app_private.has_platform_admin_role()$$;
-- Empty shapes needed by the exact outbound function's declared row types.
-- No fake provider acceptance or delivery implementation is supplied.
create table app_private.outbound_deliveries(id uuid primary key,state text,context jsonb,payload jsonb,source_snapshot jsonb,
 provider_message_id text,actor_id uuid,accepted_at timestamptz,delivery_status text,last_event_at timestamptz,
 repair_state text,problem_code text,updated_at timestamptz,active_communication_claim jsonb,followup_sync_pending boolean);
create table public.quotes(id uuid primary key,status text,sent_at timestamptz,sent_method text,sent_by_user_id uuid,recurring_occurrence_id uuid);
`;

export async function accountingReadyDb(options = {}) {
  const db = await officeReadyDb(options);
  try {
    await db.exec(fixtureDependenciesSQL);
    await db.exec(accounting102SQL);
    await db.exec('begin');
    await db.exec(accountingSQL);
    await db.exec('commit');
    return db;
  } catch (error) { await db.close(); throw error; }
}
