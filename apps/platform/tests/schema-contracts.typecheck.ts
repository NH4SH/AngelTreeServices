import type { RpcArgs, ScheduleCommandArgs } from '../src/lib/types/rpc-contracts';
// Compile-only assertions. An unused @ts-expect-error fails the normal typecheck.
const approval: RpcArgs<'approve_quote'> = { p_quote_id: 'id', p_expected_revision: 2 };
const invoice: RpcArgs<'generate_job_invoice'> = { p_request_id: 'request', p_job_id: 'job' };
const assignment: ScheduleCommandArgs = { p_event_id: null, p_expected_revision: null, p_event: {}, p_employee_ids: ['user'] };
// @ts-expect-error Approval requires the revision the user reviewed.
const missingRevision: RpcArgs<'approve_quote'> = { p_quote_id: 'id' };
// @ts-expect-error Unknown RPCs are not accepted.
type Unknown = RpcArgs<'approve_quote_typo'>;
// @ts-expect-error A revision is numeric.
const badRevision: RpcArgs<'approve_quote'> = { p_quote_id: 'id', p_expected_revision: '2' };
// @ts-expect-error Invoice generation requires an idempotency request ID.
const missingRequest: RpcArgs<'generate_job_invoice'> = { p_job_id: 'id' };
// @ts-expect-error Crew assignments are user IDs, not numbers.
const badCrew: ScheduleCommandArgs = { p_event_id: null, p_expected_revision: null, p_event: {}, p_employee_ids: [1] };
void [approval, invoice, assignment, missingRevision, badRevision, missingRequest, badCrew];
