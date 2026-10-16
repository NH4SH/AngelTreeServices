import type { Database } from './database.generated';
export type RpcName = keyof Database['public']['Functions'];
export type RpcArgs<Name extends RpcName> = Database['public']['Functions'][Name]['Args'];
// postgres-meta does not describe nullable function parameters. These two SQL
// parameters intentionally accept NULL for creation / invalid revision rejection.
export type ScheduleCommandArgs = Omit<RpcArgs<'save_schedule_event'>, 'p_event_id' | 'p_expected_revision' | 'p_override_reason'> & {
  p_override_reason?: string | null;
  p_event_id: string | null;
  p_expected_revision: number | null;
};
