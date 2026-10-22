import type { Database } from './database.generated';
export type RpcName = keyof Database['public']['Functions'];
export type RpcArgs<Name extends RpcName> = Database['public']['Functions'][Name]['Args'];
// Generated Args preserve defaults but postgres-meta omits SQL parameter
// nullability. Widen only these parameters reviewed against their SQL bodies;
// required keys and every other generated argument type remain unchanged.
type NullableRpcArgs<Name extends RpcName, Keys extends keyof RpcArgs<Name>> =
  Omit<RpcArgs<Name>, Keys> & {
    [Key in keyof Pick<RpcArgs<Name>, Keys>]: RpcArgs<Name>[Key] | null;
  };
type NullableCommandArgs = {
  get_invoice_link_request: NullableRpcArgs<'get_invoice_link_request', 'p_token_id'>;
  manage_invoice_portal_link: NullableRpcArgs<'manage_invoice_portal_link', 'p_token_id'>;
  save_change_order_draft: NullableRpcArgs<'save_change_order_draft', 'p_change_order_id' | 'p_expected_revision'>;
  approve_change_order: NullableRpcArgs<'approve_change_order', 'p_approved_by_contact_id' | 'p_recorded_by_user_id' | 'p_approval_notes'>;
  finish_outbound_delivery: NullableRpcArgs<'finish_outbound_delivery', 'p_provider_message_id'>;
  list_outbound_deliveries: NullableRpcArgs<'list_outbound_deliveries', 'p_id'>;
  record_outbound_provider_event: NullableRpcArgs<'record_outbound_provider_event', 'p_delivery_id'>;
  prepare_customer_activity: NullableRpcArgs<'prepare_customer_activity', 'p_destination'>;
  prepare_customer_source_event: NullableRpcArgs<'prepare_customer_source_event', 'p_destination' | 'p_review_id'>;
};
export type RpcCommandArgs<Name extends RpcName> = Name extends keyof NullableCommandArgs
  ? NullableCommandArgs[Name] : RpcArgs<Name>;
// postgres-meta does not describe nullable function parameters. These two SQL
// parameters intentionally accept NULL for creation / invalid revision rejection.
export type ScheduleCommandArgs = Omit<RpcArgs<'save_schedule_event'>, 'p_event_id' | 'p_expected_revision' | 'p_override_reason'> & {
  p_override_reason?: string | null;
  p_event_id: string | null;
  p_expected_revision: number | null;
};
export type LegacyAppointmentCommandArgs = Omit<RpcArgs<'save_legacy_appointment'>, 'p_expected_revision' | 'p_override_reason'> & {
  p_expected_revision: number | null;
  p_override_reason: string | null;
};
