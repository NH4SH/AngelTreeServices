import type { SupabaseClient } from '@supabase/supabase-js';
import { callDeliveryCommand } from '../src/lib/email/delivery-commands';
import type { RpcCommandArgs } from '../src/lib/types/rpc-contracts';
import type { SendEmailInput } from '../src/lib/email/send';

// Compile-only: never invoke this function. Unused @ts-expect-error directives
// fail the normal typecheck if these command boundaries become permissive.
function commandContracts(db: SupabaseClient, arbitraryName: string) {
  const response = {
    p_request_id: 'request', p_token_hash: 'hash', p_expected_updated_at: 'reviewed-at',
    p_intent: 'request_changes', p_message: 'Please revise the scope.',
  } satisfies RpcCommandArgs<'respond_to_change_order_by_portal'>;
  const preference = { p_preference: 'ach', p_token_hash: 'hash' } satisfies RpcCommandArgs<'record_invoice_preference_with_event'>;
  const approval = { p_change_order_id: 'change-order', p_approved_by_name: 'Customer' } satisfies RpcCommandArgs<'approve_change_order'>;
  const portalApproval = { ...approval, p_approved_by_contact_id: null,
    p_recorded_by_user_id: null, p_approval_notes: null } satisfies RpcCommandArgs<'approve_change_order'>;
  const snapshot: Pick<SendEmailInput, 'expectedSourceSnapshot'> = { expectedSourceSnapshot: { version: 1, current: true } };

  callDeliveryCommand(db, 'get_outbound_delivery', { p_delivery_id: 'delivery' });
  callDeliveryCommand(db, 'prepare_customer_activity', { p_event: {}, p_envelope: {} });
  callDeliveryCommand(db, 'prepare_customer_source_event', {
    p_source_id: 'source', p_destination: null, p_review_id: null, p_envelope: {},
  });
  callDeliveryCommand(db, 'prepare_customer_source_event', { p_source_id: 'source', p_envelope: {} });
  callDeliveryCommand(db, 'finish_outbound_delivery', {
    p_delivery_id: 'delivery', p_attempt_id: 'attempt', p_outcome: 'unknown',
  });
  callDeliveryCommand(db, 'finish_outbound_delivery', {
    p_delivery_id: 'delivery', p_attempt_id: 'attempt', p_outcome: 'unknown', p_provider_message_id: null,
  });
  callDeliveryCommand(db, 'list_outbound_deliveries', {});
  callDeliveryCommand(db, 'list_outbound_deliveries', { p_id: null, p_page: 1 });
  callDeliveryCommand(db, 'prepare_customer_activity', { p_event: {}, p_envelope: {}, p_destination: null });
  callDeliveryCommand(db, 'record_outbound_provider_event', {
    p_delivery_id: null, p_event_id: 'event', p_hash: 'hash', p_message_id: 'provider',
    p_occurred_at: 'timestamp', p_recipients: ['customer@example.invalid'], p_type: 'email.delivered',
  });
  callDeliveryCommand(db, 'review_customer_source_event', {
    p_source_id: 'source', p_request_id: 'request', p_reason: 'Reviewed',
  });
  callDeliveryCommand(db, 'review_outbound_delivery', {
    p_delivery_id: 'delivery', p_request_id: 'request', p_reason: 'Reviewed', p_action: 'check_provider',
  });

  // @ts-expect-error The reviewed change-order timestamp is required.
  const staleResponse: RpcCommandArgs<'respond_to_change_order_by_portal'> = { p_request_id: 'r', p_token_hash: 'h', p_intent: 'request_changes', p_message: 'Revise' };
  // @ts-expect-error Change-order responses require an idempotency request ID.
  const missingRequest: RpcCommandArgs<'respond_to_change_order_by_portal'> = { p_token_hash: 'h', p_expected_updated_at: 'now', p_intent: 'request_changes', p_message: 'Revise' };
  // @ts-expect-error Payment preferences require the portal token hash.
  const missingCapability: RpcCommandArgs<'record_invoice_preference_with_event'> = { p_preference: 'bank' };
  // @ts-expect-error An approval requires the approver's name.
  const missingApprover: RpcCommandArgs<'approve_change_order'> = { p_change_order_id: 'id' };
  // @ts-expect-error Required names do not accept null.
  const nullApprover: RpcCommandArgs<'approve_change_order'> = { ...approval, p_approved_by_name: null };
  // @ts-expect-error SQL nullability overrides do not permit the wrong primitive.
  const badContact: RpcCommandArgs<'approve_change_order'> = { ...approval, p_approved_by_contact_id: 1 };
  // @ts-expect-error Function names must exist in the generated schema.
  callDeliveryCommand(db, 'get_outbound_delivery_typo', { p_delivery_id: 'delivery' });
  // @ts-expect-error Unvalidated arbitrary function names are not a typed boundary.
  callDeliveryCommand(db, arbitraryName, { p_delivery_id: 'delivery' });
  // @ts-expect-error Required delivery ID cannot be omitted.
  callDeliveryCommand(db, 'get_outbound_delivery', {});
  // @ts-expect-error Function-name inference must not widen to accept another command's arguments.
  callDeliveryCommand(db, 'get_outbound_delivery', { p_source_id: 'source' });
  // @ts-expect-error Unknown argument keys are rejected.
  callDeliveryCommand(db, 'get_outbound_delivery', { p_delivery_id: 'delivery', p_force: true });
  // @ts-expect-error IDs are strings, not numbers.
  callDeliveryCommand(db, 'get_outbound_delivery', { p_delivery_id: 1 });
  // @ts-expect-error Required IDs cannot be null.
  callDeliveryCommand(db, 'get_outbound_delivery', { p_delivery_id: null });
  // @ts-expect-error A source ID is required even with an envelope.
  callDeliveryCommand(db, 'prepare_customer_source_event', { p_envelope: {} });
  // @ts-expect-error Review requests require an idempotency request ID.
  callDeliveryCommand(db, 'review_customer_source_event', { p_source_id: 'source', p_reason: 'Reviewed' });
  // @ts-expect-error A review reason is required.
  callDeliveryCommand(db, 'review_outbound_delivery', { p_delivery_id: 'delivery', p_request_id: 'request', p_action: 'check_provider' });
  // @ts-expect-error Finishing delivery requires the claimed attempt ID.
  callDeliveryCommand(db, 'finish_outbound_delivery', { p_delivery_id: 'delivery', p_outcome: 'accepted' });
  // @ts-expect-error Nullable provider IDs remain strings when present.
  callDeliveryCommand(db, 'finish_outbound_delivery', { p_delivery_id: 'delivery', p_attempt_id: 'attempt', p_outcome: 'accepted', p_provider_message_id: 1 });
  // @ts-expect-error Pagination uses numeric arguments.
  callDeliveryCommand(db, 'list_outbound_deliveries', { p_page: '1' });
  // @ts-expect-error JSON request envelopes cannot contain executable values.
  callDeliveryCommand(db, 'prepare_customer_activity', { p_event: {}, p_envelope: { run: () => 'unsafe' } });
  // @ts-expect-error Activity payloads cannot be omitted.
  callDeliveryCommand(db, 'prepare_customer_activity', { p_envelope: {} });
  // @ts-expect-error Nullable provider delivery IDs still require an explicit key.
  callDeliveryCommand(db, 'record_outbound_provider_event', { p_event_id: 'event', p_hash: 'hash', p_message_id: 'provider', p_occurred_at: 'timestamp', p_recipients: [], p_type: 'email.delivered' });
  // @ts-expect-error Source snapshots are JSON values, not executable values.
  const unsafeSnapshot: Pick<SendEmailInput, 'expectedSourceSnapshot'> = { expectedSourceSnapshot: () => ({}) };
  void [response, preference, approval, portalApproval, staleResponse, missingRequest,
    missingCapability, missingApprover, nullApprover, badContact, snapshot, unsafeSnapshot];
}
void commandContracts;
