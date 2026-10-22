// Generated from committed migrations. Do not edit; see PR18_SCHEMA_CONTRACTS.md.
export type Json = string | number | boolean | null | {
    [key: string]: Json | undefined;
} | Json[];
export type Database = {
    "public": {
        Tables: {
            "activity_log": {
                Row: {
                    "action_category": string | null;
                    "actor_label": string | null;
                    "actor_type": string;
                    "actor_user_id": string | null;
                    "changes_json": NonNullable<Json>;
                    "created_at": string;
                    "destination_path": string | null;
                    "event_type": string;
                    "id": string;
                    "idempotency_key": string | null;
                    "metadata_json": NonNullable<Json>;
                    "organization_id": string | null;
                    "record_label": string | null;
                    "subject_id": string;
                    "subject_type": string;
                    "summary": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "action_category"?: string | null;
                    "actor_label"?: string | null;
                    "actor_type"?: string;
                    "actor_user_id"?: string | null;
                    "changes_json"?: NonNullable<Json>;
                    "created_at"?: string;
                    "destination_path"?: string | null;
                    "event_type": string;
                    "id"?: string;
                    "idempotency_key"?: string | null;
                    "metadata_json"?: NonNullable<Json>;
                    "organization_id"?: string | null;
                    "record_label"?: string | null;
                    "subject_id": string;
                    "subject_type": string;
                    "summary"?: string | null;
                };
                Update: {
                    "action_category"?: string | null;
                    "actor_label"?: string | null;
                    "actor_type"?: string;
                    "actor_user_id"?: string | null;
                    "changes_json"?: NonNullable<Json>;
                    "created_at"?: string;
                    "destination_path"?: string | null;
                    "event_type"?: string;
                    "id"?: string;
                    "idempotency_key"?: string | null;
                    "metadata_json"?: NonNullable<Json>;
                    "organization_id"?: string | null;
                    "record_label"?: string | null;
                    "subject_id"?: string;
                    "subject_type"?: string;
                    "summary"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "activity_log_actor_user_id_fkey";
                        columns: [
                            "actor_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "activity_log_actor_user_id_fkey";
                        columns: [
                            "actor_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "activity_log_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "admin_notification_preferences": {
                Row: {
                    "change_order_email_enabled": boolean;
                    "created_at": string;
                    "customer_update_email_enabled": boolean;
                    "daily_summary_email_enabled": boolean;
                    "daily_summary_hour": number;
                    "file_email_enabled": boolean;
                    "handoff_email_enabled": boolean;
                    "message_email_enabled": boolean;
                    "payment_email_enabled": boolean;
                    "quote_email_enabled": boolean;
                    "updated_at": string;
                    "user_id": string;
                };
                ComputedFields: never;
                Insert: {
                    "change_order_email_enabled"?: boolean;
                    "created_at"?: string;
                    "customer_update_email_enabled"?: boolean;
                    "daily_summary_email_enabled"?: boolean;
                    "daily_summary_hour"?: number;
                    "file_email_enabled"?: boolean;
                    "handoff_email_enabled"?: boolean;
                    "message_email_enabled"?: boolean;
                    "payment_email_enabled"?: boolean;
                    "quote_email_enabled"?: boolean;
                    "updated_at"?: string;
                    "user_id": string;
                };
                Update: {
                    "change_order_email_enabled"?: boolean;
                    "created_at"?: string;
                    "customer_update_email_enabled"?: boolean;
                    "daily_summary_email_enabled"?: boolean;
                    "daily_summary_hour"?: number;
                    "file_email_enabled"?: boolean;
                    "handoff_email_enabled"?: boolean;
                    "message_email_enabled"?: boolean;
                    "payment_email_enabled"?: boolean;
                    "quote_email_enabled"?: boolean;
                    "updated_at"?: string;
                    "user_id"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "admin_notification_preferences_user_id_fkey";
                        columns: [
                            "user_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "admin_notification_preferences_user_id_fkey";
                        columns: [
                            "user_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "admin_notifications": {
                Row: {
                    "activity_id": string;
                    "body": string | null;
                    "category": string;
                    "created_at": string;
                    "destination_path": string | null;
                    "digest_date": string | null;
                    "email_attempted_at": string | null;
                    "email_status": string;
                    "handoff_task_id": string | null;
                    "id": string;
                    "manager_email_attempts": number;
                    "manager_email_claimed_at": string | null;
                    "manager_email_first_attempt_at": string | null;
                    "manager_email_key": string | null;
                    "manager_email_kind": string | null;
                    "manager_email_next_attempt_at": string | null;
                    "manager_email_payload": Json | null;
                    "manager_email_problem": string | null;
                    "organization_id": string | null;
                    "read_at": string | null;
                    "recipient_user_id": string;
                    "stripe_email_attempt_token": string | null;
                    "stripe_email_problem": string | null;
                    "stripe_email_provider_id": string | null;
                    "stripe_email_started_at": string | null;
                    "stripe_email_state": string | null;
                    "stripe_email_to": string | null;
                    "stripe_event_id": string | null;
                    "title": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "activity_id": string;
                    "body"?: string | null;
                    "category": string;
                    "created_at"?: string;
                    "destination_path"?: string | null;
                    "digest_date"?: string | null;
                    "email_attempted_at"?: string | null;
                    "email_status"?: string;
                    "handoff_task_id"?: string | null;
                    "id"?: string;
                    "manager_email_attempts"?: number;
                    "manager_email_claimed_at"?: string | null;
                    "manager_email_first_attempt_at"?: string | null;
                    "manager_email_key"?: string | null;
                    "manager_email_kind"?: string | null;
                    "manager_email_next_attempt_at"?: string | null;
                    "manager_email_payload"?: Json | null;
                    "manager_email_problem"?: string | null;
                    "organization_id"?: string | null;
                    "read_at"?: string | null;
                    "recipient_user_id": string;
                    "stripe_email_attempt_token"?: string | null;
                    "stripe_email_problem"?: string | null;
                    "stripe_email_provider_id"?: string | null;
                    "stripe_email_started_at"?: string | null;
                    "stripe_email_state"?: string | null;
                    "stripe_email_to"?: string | null;
                    "stripe_event_id"?: string | null;
                    "title": string;
                    "updated_at"?: string;
                };
                Update: {
                    "activity_id"?: string;
                    "body"?: string | null;
                    "category"?: string;
                    "created_at"?: string;
                    "destination_path"?: string | null;
                    "digest_date"?: string | null;
                    "email_attempted_at"?: string | null;
                    "email_status"?: string;
                    "handoff_task_id"?: string | null;
                    "id"?: string;
                    "manager_email_attempts"?: number;
                    "manager_email_claimed_at"?: string | null;
                    "manager_email_first_attempt_at"?: string | null;
                    "manager_email_key"?: string | null;
                    "manager_email_kind"?: string | null;
                    "manager_email_next_attempt_at"?: string | null;
                    "manager_email_payload"?: Json | null;
                    "manager_email_problem"?: string | null;
                    "organization_id"?: string | null;
                    "read_at"?: string | null;
                    "recipient_user_id"?: string;
                    "stripe_email_attempt_token"?: string | null;
                    "stripe_email_problem"?: string | null;
                    "stripe_email_provider_id"?: string | null;
                    "stripe_email_started_at"?: string | null;
                    "stripe_email_state"?: string | null;
                    "stripe_email_to"?: string | null;
                    "stripe_event_id"?: string | null;
                    "title"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "admin_notifications_activity_id_fkey";
                        columns: [
                            "activity_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "activity_log";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "admin_notifications_handoff_task_id_fkey";
                        columns: [
                            "handoff_task_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "follow_up_tasks";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "admin_notifications_handoff_task_id_fkey";
                        columns: [
                            "handoff_task_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_follow_up_queue";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "admin_notifications_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "admin_notifications_recipient_user_id_fkey";
                        columns: [
                            "recipient_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "admin_notifications_recipient_user_id_fkey";
                        columns: [
                            "recipient_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "admin_notifications_stripe_event_id_fkey";
                        columns: [
                            "stripe_event_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "stripe_webhook_events";
                        referencedColumns: [
                            "event_id"
                        ];
                    }
                ];
            };
            "appointments": {
                Row: {
                    "appointment_type": string;
                    "assigned_employee_id": string | null;
                    "assigned_user_id": string | null;
                    "calendar_notes": string | null;
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "creation_request_hash": string | null;
                    "edit_revision": number;
                    "ends_at": string | null;
                    "id": string;
                    "job_id": string;
                    "service_location_id": string;
                    "starts_at": string;
                    "status": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "appointment_type"?: string;
                    "assigned_employee_id"?: string | null;
                    "assigned_user_id"?: string | null;
                    "calendar_notes"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "creation_request_hash"?: string | null;
                    "edit_revision"?: number;
                    "ends_at"?: string | null;
                    "id"?: string;
                    "job_id": string;
                    "service_location_id": string;
                    "starts_at": string;
                    "status"?: string;
                    "updated_at"?: string;
                };
                Update: {
                    "appointment_type"?: string;
                    "assigned_employee_id"?: string | null;
                    "assigned_user_id"?: string | null;
                    "calendar_notes"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "creation_request_hash"?: string | null;
                    "edit_revision"?: number;
                    "ends_at"?: string | null;
                    "id"?: string;
                    "job_id"?: string;
                    "service_location_id"?: string;
                    "starts_at"?: string;
                    "status"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "appointments_assigned_employee_id_fkey";
                        columns: [
                            "assigned_employee_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "employee_records";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "appointments_assigned_user_id_fkey";
                        columns: [
                            "assigned_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "appointments_assigned_user_id_fkey";
                        columns: [
                            "assigned_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "appointments_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "appointments_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "appointments_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "appointments_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "appointments_service_location_id_fkey";
                        columns: [
                            "service_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_locations";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "change_order_line_items": {
                Row: {
                    "amount_cents": number;
                    "change_order_id": string;
                    "created_at": string;
                    "description": string | null;
                    "id": string;
                    "internal_cost_estimate_cents": number | null;
                    "material_id": string | null;
                    "quantity": number;
                    "service_category_id": string | null;
                    "sort_order": number;
                    "title": string;
                    "unit": string | null;
                    "unit_price_cents": number;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "amount_cents"?: number;
                    "change_order_id": string;
                    "created_at"?: string;
                    "description"?: string | null;
                    "id"?: string;
                    "internal_cost_estimate_cents"?: number | null;
                    "material_id"?: string | null;
                    "quantity"?: number;
                    "service_category_id"?: string | null;
                    "sort_order"?: number;
                    "title": string;
                    "unit"?: string | null;
                    "unit_price_cents"?: number;
                    "updated_at"?: string;
                };
                Update: {
                    "amount_cents"?: number;
                    "change_order_id"?: string;
                    "created_at"?: string;
                    "description"?: string | null;
                    "id"?: string;
                    "internal_cost_estimate_cents"?: number | null;
                    "material_id"?: string | null;
                    "quantity"?: number;
                    "service_category_id"?: string | null;
                    "sort_order"?: number;
                    "title"?: string;
                    "unit"?: string | null;
                    "unit_price_cents"?: number;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "change_order_line_items_change_order_id_fkey";
                        columns: [
                            "change_order_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "change_orders";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_order_line_items_material_id_fkey";
                        columns: [
                            "material_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "material_catalog";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_order_line_items_service_category_id_fkey";
                        columns: [
                            "service_category_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_categories";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "change_order_portal_tokens": {
                Row: {
                    "change_order_id": string;
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "customer_id": string | null;
                    "expires_at": string | null;
                    "id": string;
                    "intended_contact_id": string | null;
                    "organization_id": string | null;
                    "revoked_at": string | null;
                    "token_encrypted": string | null;
                    "token_hash": string;
                    "token_hint": string | null;
                    "updated_at": string;
                    "used_at": string | null;
                    "viewed_at": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "change_order_id": string;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "customer_id"?: string | null;
                    "expires_at"?: string | null;
                    "id"?: string;
                    "intended_contact_id"?: string | null;
                    "organization_id"?: string | null;
                    "revoked_at"?: string | null;
                    "token_encrypted"?: string | null;
                    "token_hash": string;
                    "token_hint"?: string | null;
                    "updated_at"?: string;
                    "used_at"?: string | null;
                    "viewed_at"?: string | null;
                };
                Update: {
                    "change_order_id"?: string;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "customer_id"?: string | null;
                    "expires_at"?: string | null;
                    "id"?: string;
                    "intended_contact_id"?: string | null;
                    "organization_id"?: string | null;
                    "revoked_at"?: string | null;
                    "token_encrypted"?: string | null;
                    "token_hash"?: string;
                    "token_hint"?: string | null;
                    "updated_at"?: string;
                    "used_at"?: string | null;
                    "viewed_at"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "change_order_portal_tokens_change_order_id_fkey";
                        columns: [
                            "change_order_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "change_orders";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_order_portal_tokens_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_order_portal_tokens_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_order_portal_tokens_customer_id_fkey";
                        columns: [
                            "customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_order_portal_tokens_intended_contact_id_fkey";
                        columns: [
                            "intended_contact_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organization_contacts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_order_portal_tokens_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "change_orders": {
                Row: {
                    "applied_to_job_at": string | null;
                    "approval_contact_id": string | null;
                    "approval_method": string | null;
                    "approval_notes": string | null;
                    "approval_recorded_by_user_id": string | null;
                    "approved_at": string | null;
                    "approved_by_contact_id": string | null;
                    "approved_by_name": string | null;
                    "cancelled_at": string | null;
                    "change_order_number": string;
                    "created_at": string;
                    "created_by_user_id": string;
                    "customer_description": string | null;
                    "customer_id": string | null;
                    "customer_notes": string | null;
                    "declined_at": string | null;
                    "edit_revision": number;
                    "expires_at": string | null;
                    "fee_cents": number;
                    "id": string;
                    "internal_notes": string | null;
                    "internally_reviewed_at": string | null;
                    "internally_reviewed_by_user_id": string | null;
                    "invoice_id": string | null;
                    "job_id": string | null;
                    "organization_id": string | null;
                    "original_approved_amount_cents": number;
                    "reason": string | null;
                    "requested_by_contact_id": string | null;
                    "schedule_impact": NonNullable<Json>;
                    "sent_at": string | null;
                    "service_location_id": string | null;
                    "source_closeout_id": string | null;
                    "source_quote_id": string | null;
                    "status": string;
                    "subtotal_cents": number;
                    "tax_cents": number;
                    "title": string;
                    "total_cents": number;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "applied_to_job_at"?: string | null;
                    "approval_contact_id"?: string | null;
                    "approval_method"?: string | null;
                    "approval_notes"?: string | null;
                    "approval_recorded_by_user_id"?: string | null;
                    "approved_at"?: string | null;
                    "approved_by_contact_id"?: string | null;
                    "approved_by_name"?: string | null;
                    "cancelled_at"?: string | null;
                    "change_order_number": string;
                    "created_at"?: string;
                    "created_by_user_id": string;
                    "customer_description"?: string | null;
                    "customer_id"?: string | null;
                    "customer_notes"?: string | null;
                    "declined_at"?: string | null;
                    "edit_revision"?: number;
                    "expires_at"?: string | null;
                    "fee_cents"?: number;
                    "id"?: string;
                    "internal_notes"?: string | null;
                    "internally_reviewed_at"?: string | null;
                    "internally_reviewed_by_user_id"?: string | null;
                    "invoice_id"?: string | null;
                    "job_id"?: string | null;
                    "organization_id"?: string | null;
                    "original_approved_amount_cents"?: number;
                    "reason"?: string | null;
                    "requested_by_contact_id"?: string | null;
                    "schedule_impact"?: NonNullable<Json>;
                    "sent_at"?: string | null;
                    "service_location_id"?: string | null;
                    "source_closeout_id"?: string | null;
                    "source_quote_id"?: string | null;
                    "status"?: string;
                    "subtotal_cents"?: number;
                    "tax_cents"?: number;
                    "title": string;
                    "total_cents"?: number;
                    "updated_at"?: string;
                };
                Update: {
                    "applied_to_job_at"?: string | null;
                    "approval_contact_id"?: string | null;
                    "approval_method"?: string | null;
                    "approval_notes"?: string | null;
                    "approval_recorded_by_user_id"?: string | null;
                    "approved_at"?: string | null;
                    "approved_by_contact_id"?: string | null;
                    "approved_by_name"?: string | null;
                    "cancelled_at"?: string | null;
                    "change_order_number"?: string;
                    "created_at"?: string;
                    "created_by_user_id"?: string;
                    "customer_description"?: string | null;
                    "customer_id"?: string | null;
                    "customer_notes"?: string | null;
                    "declined_at"?: string | null;
                    "edit_revision"?: number;
                    "expires_at"?: string | null;
                    "fee_cents"?: number;
                    "id"?: string;
                    "internal_notes"?: string | null;
                    "internally_reviewed_at"?: string | null;
                    "internally_reviewed_by_user_id"?: string | null;
                    "invoice_id"?: string | null;
                    "job_id"?: string | null;
                    "organization_id"?: string | null;
                    "original_approved_amount_cents"?: number;
                    "reason"?: string | null;
                    "requested_by_contact_id"?: string | null;
                    "schedule_impact"?: NonNullable<Json>;
                    "sent_at"?: string | null;
                    "service_location_id"?: string | null;
                    "source_closeout_id"?: string | null;
                    "source_quote_id"?: string | null;
                    "status"?: string;
                    "subtotal_cents"?: number;
                    "tax_cents"?: number;
                    "title"?: string;
                    "total_cents"?: number;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "change_orders_approval_contact_id_fkey";
                        columns: [
                            "approval_contact_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organization_contacts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_orders_approval_recorded_by_user_id_fkey";
                        columns: [
                            "approval_recorded_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_orders_approval_recorded_by_user_id_fkey";
                        columns: [
                            "approval_recorded_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_orders_approved_by_contact_id_fkey";
                        columns: [
                            "approved_by_contact_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organization_contacts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_orders_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_orders_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_orders_customer_id_fkey";
                        columns: [
                            "customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_orders_internally_reviewed_by_user_id_fkey";
                        columns: [
                            "internally_reviewed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_orders_internally_reviewed_by_user_id_fkey";
                        columns: [
                            "internally_reviewed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_orders_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "invoices";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_orders_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    },
                    {
                        foreignKeyName: "change_orders_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    },
                    {
                        foreignKeyName: "change_orders_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_orders_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_orders_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_orders_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_orders_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_orders_requested_by_contact_id_fkey";
                        columns: [
                            "requested_by_contact_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organization_contacts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_orders_service_location_id_fkey";
                        columns: [
                            "service_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_locations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_orders_source_closeout_id_fkey";
                        columns: [
                            "source_closeout_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_closeouts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "change_orders_source_quote_id_fkey";
                        columns: [
                            "source_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "change_orders_source_quote_id_fkey";
                        columns: [
                            "source_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "change_orders_source_quote_id_fkey";
                        columns: [
                            "source_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "quotes";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "communication_settings": {
                Row: {
                    "appointment_change_notices_enabled": boolean;
                    "automated_sending_enabled": boolean;
                    "business_timezone": string;
                    "created_at": string;
                    "estimate_confirmation_enabled": boolean;
                    "estimate_reminder_enabled": boolean;
                    "estimate_reminder_hours_before": number;
                    "invoice_first_reminder_days": number;
                    "invoice_reminder_enabled": boolean;
                    "invoice_second_reminder_days": number;
                    "minimum_send_interval_hours": number;
                    "payment_confirmation_enabled": boolean;
                    "quote_first_follow_up_days": number;
                    "quote_follow_up_enabled": boolean;
                    "quote_second_follow_up_days": number;
                    "singleton": boolean;
                    "updated_at": string;
                    "work_confirmation_enabled": boolean;
                    "work_reminder_enabled": boolean;
                    "work_reminder_hours_before": number;
                };
                ComputedFields: never;
                Insert: {
                    "appointment_change_notices_enabled"?: boolean;
                    "automated_sending_enabled"?: boolean;
                    "business_timezone"?: string;
                    "created_at"?: string;
                    "estimate_confirmation_enabled"?: boolean;
                    "estimate_reminder_enabled"?: boolean;
                    "estimate_reminder_hours_before"?: number;
                    "invoice_first_reminder_days"?: number;
                    "invoice_reminder_enabled"?: boolean;
                    "invoice_second_reminder_days"?: number;
                    "minimum_send_interval_hours"?: number;
                    "payment_confirmation_enabled"?: boolean;
                    "quote_first_follow_up_days"?: number;
                    "quote_follow_up_enabled"?: boolean;
                    "quote_second_follow_up_days"?: number;
                    "singleton"?: boolean;
                    "updated_at"?: string;
                    "work_confirmation_enabled"?: boolean;
                    "work_reminder_enabled"?: boolean;
                    "work_reminder_hours_before"?: number;
                };
                Update: {
                    "appointment_change_notices_enabled"?: boolean;
                    "automated_sending_enabled"?: boolean;
                    "business_timezone"?: string;
                    "created_at"?: string;
                    "estimate_confirmation_enabled"?: boolean;
                    "estimate_reminder_enabled"?: boolean;
                    "estimate_reminder_hours_before"?: number;
                    "invoice_first_reminder_days"?: number;
                    "invoice_reminder_enabled"?: boolean;
                    "invoice_second_reminder_days"?: number;
                    "minimum_send_interval_hours"?: number;
                    "payment_confirmation_enabled"?: boolean;
                    "quote_first_follow_up_days"?: number;
                    "quote_follow_up_enabled"?: boolean;
                    "quote_second_follow_up_days"?: number;
                    "singleton"?: boolean;
                    "updated_at"?: string;
                    "work_confirmation_enabled"?: boolean;
                    "work_reminder_enabled"?: boolean;
                    "work_reminder_hours_before"?: number;
                };
                Relationships: [
                ];
            };
            "contracting_party_review_items": {
                Row: {
                    "created_at": string;
                    "details": NonNullable<Json>;
                    "id": string;
                    "issue_type": string;
                    "record_id": string;
                    "record_type": string;
                    "resolved_at": string | null;
                    "resolved_by_user_id": string | null;
                    "status": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "details"?: NonNullable<Json>;
                    "id"?: string;
                    "issue_type": string;
                    "record_id": string;
                    "record_type": string;
                    "resolved_at"?: string | null;
                    "resolved_by_user_id"?: string | null;
                    "status"?: string;
                    "updated_at"?: string;
                };
                Update: {
                    "created_at"?: string;
                    "details"?: NonNullable<Json>;
                    "id"?: string;
                    "issue_type"?: string;
                    "record_id"?: string;
                    "record_type"?: string;
                    "resolved_at"?: string | null;
                    "resolved_by_user_id"?: string | null;
                    "status"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "contracting_party_review_items_resolved_by_user_id_fkey";
                        columns: [
                            "resolved_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "contracting_party_review_items_resolved_by_user_id_fkey";
                        columns: [
                            "resolved_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "credential_types": {
                Row: {
                    "created_at": string;
                    "default_warning_days": number;
                    "description": string | null;
                    "id": string;
                    "is_active": boolean;
                    "label": string;
                    "type_key": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "default_warning_days"?: number;
                    "description"?: string | null;
                    "id"?: string;
                    "is_active"?: boolean;
                    "label": string;
                    "type_key": string;
                    "updated_at"?: string;
                };
                Update: {
                    "created_at"?: string;
                    "default_warning_days"?: number;
                    "description"?: string | null;
                    "id"?: string;
                    "is_active"?: boolean;
                    "label"?: string;
                    "type_key"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                ];
            };
            "customer_communications": {
                Row: {
                    "appointment_id": string | null;
                    "attempt_count": number;
                    "cancelled_at": string | null;
                    "communication_type": string;
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "customer_id": string | null;
                    "id": string;
                    "idempotency_key": string;
                    "invoice_id": string | null;
                    "is_automatic": boolean;
                    "job_id": string | null;
                    "last_error": string | null;
                    "organization_id": string | null;
                    "payment_id": string | null;
                    "processing_started_at": string | null;
                    "provider_message_id": string | null;
                    "quote_id": string | null;
                    "recipient_email": string;
                    "recipient_source": string;
                    "reminder_stage": string;
                    "schedule_event_id": string | null;
                    "scheduled_for": string;
                    "sent_at": string | null;
                    "skip_reason": string | null;
                    "source_version": string | null;
                    "status": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "appointment_id"?: string | null;
                    "attempt_count"?: number;
                    "cancelled_at"?: string | null;
                    "communication_type": string;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "customer_id"?: string | null;
                    "id"?: string;
                    "idempotency_key": string;
                    "invoice_id"?: string | null;
                    "is_automatic"?: boolean;
                    "job_id"?: string | null;
                    "last_error"?: string | null;
                    "organization_id"?: string | null;
                    "payment_id"?: string | null;
                    "processing_started_at"?: string | null;
                    "provider_message_id"?: string | null;
                    "quote_id"?: string | null;
                    "recipient_email": string;
                    "recipient_source"?: string;
                    "reminder_stage": string;
                    "schedule_event_id"?: string | null;
                    "scheduled_for": string;
                    "sent_at"?: string | null;
                    "skip_reason"?: string | null;
                    "source_version"?: string | null;
                    "status"?: string;
                    "updated_at"?: string;
                };
                Update: {
                    "appointment_id"?: string | null;
                    "attempt_count"?: number;
                    "cancelled_at"?: string | null;
                    "communication_type"?: string;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "customer_id"?: string | null;
                    "id"?: string;
                    "idempotency_key"?: string;
                    "invoice_id"?: string | null;
                    "is_automatic"?: boolean;
                    "job_id"?: string | null;
                    "last_error"?: string | null;
                    "organization_id"?: string | null;
                    "payment_id"?: string | null;
                    "processing_started_at"?: string | null;
                    "provider_message_id"?: string | null;
                    "quote_id"?: string | null;
                    "recipient_email"?: string;
                    "recipient_source"?: string;
                    "reminder_stage"?: string;
                    "schedule_event_id"?: string | null;
                    "scheduled_for"?: string;
                    "sent_at"?: string | null;
                    "skip_reason"?: string | null;
                    "source_version"?: string | null;
                    "status"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "customer_communications_appointment_id_fkey";
                        columns: [
                            "appointment_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "appointments";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_communications_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_communications_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_communications_customer_id_fkey";
                        columns: [
                            "customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_communications_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "invoices";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_communications_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_communications_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_communications_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_communications_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_communications_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_communications_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_communications_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_communications_payment_id_fkey";
                        columns: [
                            "payment_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "payments";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_communications_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_communications_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_communications_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "quotes";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_communications_schedule_event_id_fkey";
                        columns: [
                            "schedule_event_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "appointment_id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_communications_schedule_event_id_fkey";
                        columns: [
                            "schedule_event_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "appointment_id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_communications_schedule_event_id_fkey";
                        columns: [
                            "schedule_event_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "schedule_events";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "customer_deliveries": {
                Row: {
                    "acknowledgment_name": string | null;
                    "created_at": string;
                    "created_by_user_id": string;
                    "customer_id": string | null;
                    "customer_visible_notes": string | null;
                    "delivered_at": string | null;
                    "delivery_instructions": string | null;
                    "delivery_window_end": string | null;
                    "delivery_window_start": string | null;
                    "driver_user_id": string | null;
                    "id": string;
                    "idempotency_key": string;
                    "internal_notes": string | null;
                    "inventory_transaction_id": string | null;
                    "invoice_id": string | null;
                    "job_id": string | null;
                    "material_id": string;
                    "organization_id": string | null;
                    "proof_storage_path": string | null;
                    "quantity": number;
                    "quote_id": string | null;
                    "service_location_id": string | null;
                    "status": string;
                    "trailer_asset_id": string | null;
                    "unit": string;
                    "updated_at": string;
                    "vehicle_asset_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "acknowledgment_name"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id": string;
                    "customer_id"?: string | null;
                    "customer_visible_notes"?: string | null;
                    "delivered_at"?: string | null;
                    "delivery_instructions"?: string | null;
                    "delivery_window_end"?: string | null;
                    "delivery_window_start"?: string | null;
                    "driver_user_id"?: string | null;
                    "id"?: string;
                    "idempotency_key": string;
                    "internal_notes"?: string | null;
                    "inventory_transaction_id"?: string | null;
                    "invoice_id"?: string | null;
                    "job_id"?: string | null;
                    "material_id": string;
                    "organization_id"?: string | null;
                    "proof_storage_path"?: string | null;
                    "quantity": number;
                    "quote_id"?: string | null;
                    "service_location_id"?: string | null;
                    "status"?: string;
                    "trailer_asset_id"?: string | null;
                    "unit": string;
                    "updated_at"?: string;
                    "vehicle_asset_id"?: string | null;
                };
                Update: {
                    "acknowledgment_name"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string;
                    "customer_id"?: string | null;
                    "customer_visible_notes"?: string | null;
                    "delivered_at"?: string | null;
                    "delivery_instructions"?: string | null;
                    "delivery_window_end"?: string | null;
                    "delivery_window_start"?: string | null;
                    "driver_user_id"?: string | null;
                    "id"?: string;
                    "idempotency_key"?: string;
                    "internal_notes"?: string | null;
                    "inventory_transaction_id"?: string | null;
                    "invoice_id"?: string | null;
                    "job_id"?: string | null;
                    "material_id"?: string;
                    "organization_id"?: string | null;
                    "proof_storage_path"?: string | null;
                    "quantity"?: number;
                    "quote_id"?: string | null;
                    "service_location_id"?: string | null;
                    "status"?: string;
                    "trailer_asset_id"?: string | null;
                    "unit"?: string;
                    "updated_at"?: string;
                    "vehicle_asset_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "customer_deliveries_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_deliveries_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_deliveries_customer_id_fkey";
                        columns: [
                            "customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_deliveries_driver_user_id_fkey";
                        columns: [
                            "driver_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_deliveries_driver_user_id_fkey";
                        columns: [
                            "driver_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_deliveries_inventory_transaction_id_fkey";
                        columns: [
                            "inventory_transaction_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "inventory_transactions";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_deliveries_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "invoices";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_deliveries_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_deliveries_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_deliveries_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_deliveries_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_deliveries_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_deliveries_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_deliveries_material_id_fkey";
                        columns: [
                            "material_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "material_catalog";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_deliveries_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_deliveries_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_deliveries_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_deliveries_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "quotes";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_deliveries_service_location_id_fkey";
                        columns: [
                            "service_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_locations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_deliveries_trailer_asset_id_fkey";
                        columns: [
                            "trailer_asset_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_assets";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customer_deliveries_vehicle_asset_id_fkey";
                        columns: [
                            "vehicle_asset_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_assets";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "customers": {
                Row: {
                    "archived_at": string | null;
                    "archived_by_user_id": string | null;
                    "billing_address": string | null;
                    "created_at": string;
                    "customer_type": string;
                    "display_name": string;
                    "email": string | null;
                    "id": string;
                    "lead_campaign": string | null;
                    "lead_source_id": string | null;
                    "organization_id": string | null;
                    "phone": string | null;
                    "primary_contact_name": string | null;
                    "status": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "archived_at"?: string | null;
                    "archived_by_user_id"?: string | null;
                    "billing_address"?: string | null;
                    "created_at"?: string;
                    "customer_type"?: string;
                    "display_name": string;
                    "email"?: string | null;
                    "id"?: string;
                    "lead_campaign"?: string | null;
                    "lead_source_id"?: string | null;
                    "organization_id"?: string | null;
                    "phone"?: string | null;
                    "primary_contact_name"?: string | null;
                    "status"?: string;
                    "updated_at"?: string;
                };
                Update: {
                    "archived_at"?: string | null;
                    "archived_by_user_id"?: string | null;
                    "billing_address"?: string | null;
                    "created_at"?: string;
                    "customer_type"?: string;
                    "display_name"?: string;
                    "email"?: string | null;
                    "id"?: string;
                    "lead_campaign"?: string | null;
                    "lead_source_id"?: string | null;
                    "organization_id"?: string | null;
                    "phone"?: string | null;
                    "primary_contact_name"?: string | null;
                    "status"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "customers_archived_by_user_id_fkey";
                        columns: [
                            "archived_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customers_archived_by_user_id_fkey";
                        columns: [
                            "archived_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customers_lead_source_id_fkey";
                        columns: [
                            "lead_source_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "lead_sources";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "customers_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "disposal_records": {
                Row: {
                    "arrived_at": string | null;
                    "completed_at": string | null;
                    "created_at": string;
                    "created_by_user_id": string;
                    "departed_at": string | null;
                    "destination_name": string;
                    "destination_organization_id": string | null;
                    "destination_type": string;
                    "driver_user_id": string | null;
                    "fee_cents": number | null;
                    "id": string;
                    "idempotency_key": string;
                    "inventory_transaction_id": string | null;
                    "is_estimated": boolean;
                    "job_cost_entry_id": string | null;
                    "job_id": string | null;
                    "loaded_at": string | null;
                    "material_id": string | null;
                    "notes": string | null;
                    "quantity": number | null;
                    "receipt_storage_path": string | null;
                    "source_location_id": string | null;
                    "status": string;
                    "ticket_reference": string | null;
                    "trailer_asset_id": string | null;
                    "unit": string | null;
                    "updated_at": string;
                    "vehicle_asset_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "arrived_at"?: string | null;
                    "completed_at"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id": string;
                    "departed_at"?: string | null;
                    "destination_name": string;
                    "destination_organization_id"?: string | null;
                    "destination_type": string;
                    "driver_user_id"?: string | null;
                    "fee_cents"?: number | null;
                    "id"?: string;
                    "idempotency_key": string;
                    "inventory_transaction_id"?: string | null;
                    "is_estimated"?: boolean;
                    "job_cost_entry_id"?: string | null;
                    "job_id"?: string | null;
                    "loaded_at"?: string | null;
                    "material_id"?: string | null;
                    "notes"?: string | null;
                    "quantity"?: number | null;
                    "receipt_storage_path"?: string | null;
                    "source_location_id"?: string | null;
                    "status"?: string;
                    "ticket_reference"?: string | null;
                    "trailer_asset_id"?: string | null;
                    "unit"?: string | null;
                    "updated_at"?: string;
                    "vehicle_asset_id"?: string | null;
                };
                Update: {
                    "arrived_at"?: string | null;
                    "completed_at"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string;
                    "departed_at"?: string | null;
                    "destination_name"?: string;
                    "destination_organization_id"?: string | null;
                    "destination_type"?: string;
                    "driver_user_id"?: string | null;
                    "fee_cents"?: number | null;
                    "id"?: string;
                    "idempotency_key"?: string;
                    "inventory_transaction_id"?: string | null;
                    "is_estimated"?: boolean;
                    "job_cost_entry_id"?: string | null;
                    "job_id"?: string | null;
                    "loaded_at"?: string | null;
                    "material_id"?: string | null;
                    "notes"?: string | null;
                    "quantity"?: number | null;
                    "receipt_storage_path"?: string | null;
                    "source_location_id"?: string | null;
                    "status"?: string;
                    "ticket_reference"?: string | null;
                    "trailer_asset_id"?: string | null;
                    "unit"?: string | null;
                    "updated_at"?: string;
                    "vehicle_asset_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "disposal_records_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "disposal_records_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "disposal_records_destination_organization_id_fkey";
                        columns: [
                            "destination_organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "disposal_records_driver_user_id_fkey";
                        columns: [
                            "driver_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "disposal_records_driver_user_id_fkey";
                        columns: [
                            "driver_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "disposal_records_inventory_transaction_id_fkey";
                        columns: [
                            "inventory_transaction_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "inventory_transactions";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "disposal_records_job_cost_entry_id_fkey";
                        columns: [
                            "job_cost_entry_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_cost_entries";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "disposal_records_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "disposal_records_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "disposal_records_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "disposal_records_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "disposal_records_material_id_fkey";
                        columns: [
                            "material_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "material_catalog";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "disposal_records_source_location_id_fkey";
                        columns: [
                            "source_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "inventory_locations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "disposal_records_trailer_asset_id_fkey";
                        columns: [
                            "trailer_asset_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_assets";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "disposal_records_vehicle_asset_id_fkey";
                        columns: [
                            "vehicle_asset_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_assets";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "documents": {
                Row: {
                    "access_classification": string;
                    "archived_at": string | null;
                    "archived_by_user_id": string | null;
                    "created_at": string;
                    "customer_id": string | null;
                    "document_type": string;
                    "employee_id": string | null;
                    "equipment_asset_id": string | null;
                    "expires_at": string | null;
                    "file_size_bytes": number | null;
                    "id": string;
                    "invoice_id": string | null;
                    "job_id": string | null;
                    "mime_type": string | null;
                    "organization_id": string | null;
                    "quote_id": string | null;
                    "scan_checked_at": string | null;
                    "scan_sha256": string | null;
                    "scan_status": string;
                    "storage_path": string;
                    "title": string;
                    "updated_at": string;
                    "uploaded_by_user_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "access_classification"?: string;
                    "archived_at"?: string | null;
                    "archived_by_user_id"?: string | null;
                    "created_at"?: string;
                    "customer_id"?: string | null;
                    "document_type"?: string;
                    "employee_id"?: string | null;
                    "equipment_asset_id"?: string | null;
                    "expires_at"?: string | null;
                    "file_size_bytes"?: number | null;
                    "id"?: string;
                    "invoice_id"?: string | null;
                    "job_id"?: string | null;
                    "mime_type"?: string | null;
                    "organization_id"?: string | null;
                    "quote_id"?: string | null;
                    "scan_checked_at"?: string | null;
                    "scan_sha256"?: string | null;
                    "scan_status"?: string;
                    "storage_path": string;
                    "title": string;
                    "updated_at"?: string;
                    "uploaded_by_user_id"?: string | null;
                };
                Update: {
                    "access_classification"?: string;
                    "archived_at"?: string | null;
                    "archived_by_user_id"?: string | null;
                    "created_at"?: string;
                    "customer_id"?: string | null;
                    "document_type"?: string;
                    "employee_id"?: string | null;
                    "equipment_asset_id"?: string | null;
                    "expires_at"?: string | null;
                    "file_size_bytes"?: number | null;
                    "id"?: string;
                    "invoice_id"?: string | null;
                    "job_id"?: string | null;
                    "mime_type"?: string | null;
                    "organization_id"?: string | null;
                    "quote_id"?: string | null;
                    "scan_checked_at"?: string | null;
                    "scan_sha256"?: string | null;
                    "scan_status"?: string;
                    "storage_path"?: string;
                    "title"?: string;
                    "updated_at"?: string;
                    "uploaded_by_user_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "documents_archived_by_user_id_fkey";
                        columns: [
                            "archived_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "documents_archived_by_user_id_fkey";
                        columns: [
                            "archived_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "documents_customer_id_fkey";
                        columns: [
                            "customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "documents_employee_id_fkey";
                        columns: [
                            "employee_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "employee_records";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "documents_equipment_asset_id_fkey";
                        columns: [
                            "equipment_asset_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_assets";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "documents_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "invoices";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "documents_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    },
                    {
                        foreignKeyName: "documents_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    },
                    {
                        foreignKeyName: "documents_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "documents_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "documents_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "documents_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "documents_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "documents_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "documents_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "documents_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "quotes";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "documents_uploaded_by_user_id_fkey";
                        columns: [
                            "uploaded_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "documents_uploaded_by_user_id_fkey";
                        columns: [
                            "uploaded_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "email_events": {
                Row: {
                    "created_at": string;
                    "delivery_status": string | null;
                    "delivery_status_at": string | null;
                    "email_type": string;
                    "error_message": string | null;
                    "id": string;
                    "outbound_delivery_id": string | null;
                    "provider_message_id": string | null;
                    "recipient_email": string;
                    "related_appointment_id": string | null;
                    "related_change_order_id": string | null;
                    "related_communication_id": string | null;
                    "related_customer_id": string | null;
                    "related_invoice_id": string | null;
                    "related_job_id": string | null;
                    "related_organization_id": string | null;
                    "related_payment_id": string | null;
                    "related_quote_id": string | null;
                    "related_schedule_event_id": string | null;
                    "sent_at": string | null;
                    "sent_by_user_id": string | null;
                    "status": string;
                    "subject": string;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "delivery_status"?: string | null;
                    "delivery_status_at"?: string | null;
                    "email_type": string;
                    "error_message"?: string | null;
                    "id"?: string;
                    "outbound_delivery_id"?: string | null;
                    "provider_message_id"?: string | null;
                    "recipient_email": string;
                    "related_appointment_id"?: string | null;
                    "related_change_order_id"?: string | null;
                    "related_communication_id"?: string | null;
                    "related_customer_id"?: string | null;
                    "related_invoice_id"?: string | null;
                    "related_job_id"?: string | null;
                    "related_organization_id"?: string | null;
                    "related_payment_id"?: string | null;
                    "related_quote_id"?: string | null;
                    "related_schedule_event_id"?: string | null;
                    "sent_at"?: string | null;
                    "sent_by_user_id"?: string | null;
                    "status"?: string;
                    "subject": string;
                };
                Update: {
                    "created_at"?: string;
                    "delivery_status"?: string | null;
                    "delivery_status_at"?: string | null;
                    "email_type"?: string;
                    "error_message"?: string | null;
                    "id"?: string;
                    "outbound_delivery_id"?: string | null;
                    "provider_message_id"?: string | null;
                    "recipient_email"?: string;
                    "related_appointment_id"?: string | null;
                    "related_change_order_id"?: string | null;
                    "related_communication_id"?: string | null;
                    "related_customer_id"?: string | null;
                    "related_invoice_id"?: string | null;
                    "related_job_id"?: string | null;
                    "related_organization_id"?: string | null;
                    "related_payment_id"?: string | null;
                    "related_quote_id"?: string | null;
                    "related_schedule_event_id"?: string | null;
                    "sent_at"?: string | null;
                    "sent_by_user_id"?: string | null;
                    "status"?: string;
                    "subject"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "email_events_related_appointment_id_fkey";
                        columns: [
                            "related_appointment_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "appointments";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "email_events_related_change_order_id_fkey";
                        columns: [
                            "related_change_order_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "change_orders";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "email_events_related_communication_id_fkey";
                        columns: [
                            "related_communication_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customer_communications";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "email_events_related_customer_id_fkey";
                        columns: [
                            "related_customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "email_events_related_invoice_id_fkey";
                        columns: [
                            "related_invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "invoices";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "email_events_related_invoice_id_fkey";
                        columns: [
                            "related_invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    },
                    {
                        foreignKeyName: "email_events_related_invoice_id_fkey";
                        columns: [
                            "related_invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    },
                    {
                        foreignKeyName: "email_events_related_job_id_fkey";
                        columns: [
                            "related_job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "email_events_related_job_id_fkey";
                        columns: [
                            "related_job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "email_events_related_job_id_fkey";
                        columns: [
                            "related_job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "email_events_related_job_id_fkey";
                        columns: [
                            "related_job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "email_events_related_organization_id_fkey";
                        columns: [
                            "related_organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "email_events_related_payment_id_fkey";
                        columns: [
                            "related_payment_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "payments";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "email_events_related_quote_id_fkey";
                        columns: [
                            "related_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "email_events_related_quote_id_fkey";
                        columns: [
                            "related_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "email_events_related_quote_id_fkey";
                        columns: [
                            "related_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "quotes";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "email_events_related_schedule_event_id_fkey";
                        columns: [
                            "related_schedule_event_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "appointment_id"
                        ];
                    },
                    {
                        foreignKeyName: "email_events_related_schedule_event_id_fkey";
                        columns: [
                            "related_schedule_event_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "appointment_id"
                        ];
                    },
                    {
                        foreignKeyName: "email_events_related_schedule_event_id_fkey";
                        columns: [
                            "related_schedule_event_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "schedule_events";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "email_events_sent_by_user_id_fkey";
                        columns: [
                            "sent_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "email_events_sent_by_user_id_fkey";
                        columns: [
                            "sent_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "employee_access_requests": {
                Row: {
                    "assigned_role": string | null;
                    "auth_user_id": string | null;
                    "created_at": string;
                    "email": string;
                    "full_name": string;
                    "id": string;
                    "note": string | null;
                    "phone": string | null;
                    "rejection_reason": string | null;
                    "requested_role": string | null;
                    "reviewed_at": string | null;
                    "reviewed_by_user_id": string | null;
                    "status": string;
                    "time_clock_enabled": boolean;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "assigned_role"?: string | null;
                    "auth_user_id"?: string | null;
                    "created_at"?: string;
                    "email": string;
                    "full_name": string;
                    "id"?: string;
                    "note"?: string | null;
                    "phone"?: string | null;
                    "rejection_reason"?: string | null;
                    "requested_role"?: string | null;
                    "reviewed_at"?: string | null;
                    "reviewed_by_user_id"?: string | null;
                    "status"?: string;
                    "time_clock_enabled"?: boolean;
                    "updated_at"?: string;
                };
                Update: {
                    "assigned_role"?: string | null;
                    "auth_user_id"?: string | null;
                    "created_at"?: string;
                    "email"?: string;
                    "full_name"?: string;
                    "id"?: string;
                    "note"?: string | null;
                    "phone"?: string | null;
                    "rejection_reason"?: string | null;
                    "requested_role"?: string | null;
                    "reviewed_at"?: string | null;
                    "reviewed_by_user_id"?: string | null;
                    "status"?: string;
                    "time_clock_enabled"?: boolean;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "employee_access_requests_reviewed_by_user_id_fkey";
                        columns: [
                            "reviewed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_access_requests_reviewed_by_user_id_fkey";
                        columns: [
                            "reviewed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "employee_acknowledgments": {
                Row: {
                    "acknowledged_at": string;
                    "acknowledged_by_auth_user_id": string | null;
                    "acknowledgment_method": string;
                    "acknowledgment_name": string;
                    "created_at": string;
                    "employee_id": string;
                    "id": string;
                    "subject_id": string;
                    "subject_type": string;
                    "subject_version": string;
                };
                ComputedFields: never;
                Insert: {
                    "acknowledged_at"?: string;
                    "acknowledged_by_auth_user_id"?: string | null;
                    "acknowledgment_method"?: string;
                    "acknowledgment_name": string;
                    "created_at"?: string;
                    "employee_id": string;
                    "id"?: string;
                    "subject_id": string;
                    "subject_type": string;
                    "subject_version"?: string;
                };
                Update: {
                    "acknowledged_at"?: string;
                    "acknowledged_by_auth_user_id"?: string | null;
                    "acknowledgment_method"?: string;
                    "acknowledgment_name"?: string;
                    "created_at"?: string;
                    "employee_id"?: string;
                    "id"?: string;
                    "subject_id"?: string;
                    "subject_type"?: string;
                    "subject_version"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "employee_acknowledgments_acknowledged_by_auth_user_id_fkey";
                        columns: [
                            "acknowledged_by_auth_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_acknowledgments_acknowledged_by_auth_user_id_fkey";
                        columns: [
                            "acknowledged_by_auth_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_acknowledgments_employee_id_fkey";
                        columns: [
                            "employee_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "employee_records";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "employee_credentials": {
                Row: {
                    "archived_at": string | null;
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "credential_number": string | null;
                    "credential_type_id": string;
                    "document_id": string | null;
                    "employee_id": string;
                    "expiration_date": string | null;
                    "id": string;
                    "issue_date": string | null;
                    "issuing_organization": string | null;
                    "notes": string | null;
                    "status": string;
                    "updated_at": string;
                    "verified_at": string | null;
                    "verified_by_user_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "archived_at"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "credential_number"?: string | null;
                    "credential_type_id": string;
                    "document_id"?: string | null;
                    "employee_id": string;
                    "expiration_date"?: string | null;
                    "id"?: string;
                    "issue_date"?: string | null;
                    "issuing_organization"?: string | null;
                    "notes"?: string | null;
                    "status"?: string;
                    "updated_at"?: string;
                    "verified_at"?: string | null;
                    "verified_by_user_id"?: string | null;
                };
                Update: {
                    "archived_at"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "credential_number"?: string | null;
                    "credential_type_id"?: string;
                    "document_id"?: string | null;
                    "employee_id"?: string;
                    "expiration_date"?: string | null;
                    "id"?: string;
                    "issue_date"?: string | null;
                    "issuing_organization"?: string | null;
                    "notes"?: string | null;
                    "status"?: string;
                    "updated_at"?: string;
                    "verified_at"?: string | null;
                    "verified_by_user_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "employee_credentials_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_credentials_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_credentials_credential_type_id_fkey";
                        columns: [
                            "credential_type_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "credential_types";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_credentials_document_id_fkey";
                        columns: [
                            "document_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "employee_documents";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_credentials_employee_id_fkey";
                        columns: [
                            "employee_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "employee_records";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_credentials_verified_by_user_id_fkey";
                        columns: [
                            "verified_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_credentials_verified_by_user_id_fkey";
                        columns: [
                            "verified_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "employee_documents": {
                Row: {
                    "access_classification": string;
                    "archived_at": string | null;
                    "created_at": string;
                    "document_type": string;
                    "employee_id": string;
                    "expiration_date": string | null;
                    "file_size_bytes": number | null;
                    "id": string;
                    "issue_date": string | null;
                    "mime_type": string | null;
                    "notes": string | null;
                    "review_notes": string | null;
                    "review_status": string;
                    "reviewed_at": string | null;
                    "reviewed_by_user_id": string | null;
                    "storage_path": string;
                    "title": string;
                    "updated_at": string;
                    "uploaded_by_user_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "access_classification"?: string;
                    "archived_at"?: string | null;
                    "created_at"?: string;
                    "document_type": string;
                    "employee_id": string;
                    "expiration_date"?: string | null;
                    "file_size_bytes"?: number | null;
                    "id"?: string;
                    "issue_date"?: string | null;
                    "mime_type"?: string | null;
                    "notes"?: string | null;
                    "review_notes"?: string | null;
                    "review_status"?: string;
                    "reviewed_at"?: string | null;
                    "reviewed_by_user_id"?: string | null;
                    "storage_path": string;
                    "title": string;
                    "updated_at"?: string;
                    "uploaded_by_user_id"?: string | null;
                };
                Update: {
                    "access_classification"?: string;
                    "archived_at"?: string | null;
                    "created_at"?: string;
                    "document_type"?: string;
                    "employee_id"?: string;
                    "expiration_date"?: string | null;
                    "file_size_bytes"?: number | null;
                    "id"?: string;
                    "issue_date"?: string | null;
                    "mime_type"?: string | null;
                    "notes"?: string | null;
                    "review_notes"?: string | null;
                    "review_status"?: string;
                    "reviewed_at"?: string | null;
                    "reviewed_by_user_id"?: string | null;
                    "storage_path"?: string;
                    "title"?: string;
                    "updated_at"?: string;
                    "uploaded_by_user_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "employee_documents_employee_id_fkey";
                        columns: [
                            "employee_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "employee_records";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_documents_reviewed_by_user_id_fkey";
                        columns: [
                            "reviewed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_documents_reviewed_by_user_id_fkey";
                        columns: [
                            "reviewed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_documents_uploaded_by_user_id_fkey";
                        columns: [
                            "uploaded_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_documents_uploaded_by_user_id_fkey";
                        columns: [
                            "uploaded_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "employee_emergency_contacts": {
                Row: {
                    "alternate_phone": string | null;
                    "created_at": string;
                    "employee_id": string;
                    "full_name": string;
                    "id": string;
                    "is_primary": boolean;
                    "phone": string;
                    "relationship": string | null;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "alternate_phone"?: string | null;
                    "created_at"?: string;
                    "employee_id": string;
                    "full_name": string;
                    "id"?: string;
                    "is_primary"?: boolean;
                    "phone": string;
                    "relationship"?: string | null;
                    "updated_at"?: string;
                };
                Update: {
                    "alternate_phone"?: string | null;
                    "created_at"?: string;
                    "employee_id"?: string;
                    "full_name"?: string;
                    "id"?: string;
                    "is_primary"?: boolean;
                    "phone"?: string;
                    "relationship"?: string | null;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "employee_emergency_contacts_employee_id_fkey";
                        columns: [
                            "employee_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "employee_records";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "employee_labor_cost_rates": {
                Row: {
                    "burden_percent": number | null;
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "effective_from": string;
                    "effective_to": string | null;
                    "employee_id": string;
                    "hourly_cost_cents": number;
                    "id": string;
                    "notes": string | null;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "burden_percent"?: number | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "effective_from": string;
                    "effective_to"?: string | null;
                    "employee_id": string;
                    "hourly_cost_cents": number;
                    "id"?: string;
                    "notes"?: string | null;
                    "updated_at"?: string;
                };
                Update: {
                    "burden_percent"?: number | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "effective_from"?: string;
                    "effective_to"?: string | null;
                    "employee_id"?: string;
                    "hourly_cost_cents"?: number;
                    "id"?: string;
                    "notes"?: string | null;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "employee_labor_cost_rates_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_labor_cost_rates_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_labor_cost_rates_employee_id_fkey";
                        columns: [
                            "employee_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "employee_records";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "employee_onboarding_items": {
                Row: {
                    "completed_at": string | null;
                    "completed_by_user_id": string | null;
                    "completion_status": string;
                    "created_at": string;
                    "employee_id": string;
                    "id": string;
                    "item_key": string;
                    "label": string;
                    "notes": string | null;
                    "reopen_reason": string | null;
                    "reopened_at": string | null;
                    "reopened_by_user_id": string | null;
                    "sort_order": number;
                    "template_id": string | null;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "completed_at"?: string | null;
                    "completed_by_user_id"?: string | null;
                    "completion_status"?: string;
                    "created_at"?: string;
                    "employee_id": string;
                    "id"?: string;
                    "item_key": string;
                    "label": string;
                    "notes"?: string | null;
                    "reopen_reason"?: string | null;
                    "reopened_at"?: string | null;
                    "reopened_by_user_id"?: string | null;
                    "sort_order"?: number;
                    "template_id"?: string | null;
                    "updated_at"?: string;
                };
                Update: {
                    "completed_at"?: string | null;
                    "completed_by_user_id"?: string | null;
                    "completion_status"?: string;
                    "created_at"?: string;
                    "employee_id"?: string;
                    "id"?: string;
                    "item_key"?: string;
                    "label"?: string;
                    "notes"?: string | null;
                    "reopen_reason"?: string | null;
                    "reopened_at"?: string | null;
                    "reopened_by_user_id"?: string | null;
                    "sort_order"?: number;
                    "template_id"?: string | null;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "employee_onboarding_items_completed_by_user_id_fkey";
                        columns: [
                            "completed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_onboarding_items_completed_by_user_id_fkey";
                        columns: [
                            "completed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_onboarding_items_employee_id_fkey";
                        columns: [
                            "employee_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "employee_records";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_onboarding_items_reopened_by_user_id_fkey";
                        columns: [
                            "reopened_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_onboarding_items_reopened_by_user_id_fkey";
                        columns: [
                            "reopened_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_onboarding_items_template_id_fkey";
                        columns: [
                            "template_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "onboarding_templates";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "employee_private_records": {
                Row: {
                    "created_at": string;
                    "employee_id": string;
                    "private_hr_notes": string | null;
                    "updated_at": string;
                    "updated_by_user_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "employee_id": string;
                    "private_hr_notes"?: string | null;
                    "updated_at"?: string;
                    "updated_by_user_id"?: string | null;
                };
                Update: {
                    "created_at"?: string;
                    "employee_id"?: string;
                    "private_hr_notes"?: string | null;
                    "updated_at"?: string;
                    "updated_by_user_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "employee_private_records_employee_id_fkey";
                        columns: [
                            "employee_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "employee_records";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_private_records_updated_by_user_id_fkey";
                        columns: [
                            "updated_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_private_records_updated_by_user_id_fkey";
                        columns: [
                            "updated_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "employee_program_files": {
                Row: {
                    "created_at": string;
                    "file_kind": string;
                    "file_size_bytes": number | null;
                    "id": string;
                    "mime_type": string | null;
                    "safety_meeting_id": string | null;
                    "storage_path": string;
                    "title": string;
                    "training_session_id": string | null;
                    "updated_at": string;
                    "uploaded_by_user_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "file_kind"?: string;
                    "file_size_bytes"?: number | null;
                    "id"?: string;
                    "mime_type"?: string | null;
                    "safety_meeting_id"?: string | null;
                    "storage_path": string;
                    "title": string;
                    "training_session_id"?: string | null;
                    "updated_at"?: string;
                    "uploaded_by_user_id"?: string | null;
                };
                Update: {
                    "created_at"?: string;
                    "file_kind"?: string;
                    "file_size_bytes"?: number | null;
                    "id"?: string;
                    "mime_type"?: string | null;
                    "safety_meeting_id"?: string | null;
                    "storage_path"?: string;
                    "title"?: string;
                    "training_session_id"?: string | null;
                    "updated_at"?: string;
                    "uploaded_by_user_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "employee_program_files_safety_meeting_id_fkey";
                        columns: [
                            "safety_meeting_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "safety_meetings";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_program_files_training_session_id_fkey";
                        columns: [
                            "training_session_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "training_sessions";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_program_files_uploaded_by_user_id_fkey";
                        columns: [
                            "uploaded_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_program_files_uploaded_by_user_id_fkey";
                        columns: [
                            "uploaded_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "employee_records": {
                Row: {
                    "access_request_id": string | null;
                    "archived_at": string | null;
                    "archived_by_user_id": string | null;
                    "auth_user_id": string | null;
                    "contact_email": string | null;
                    "contact_phone": string | null;
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "crew_name": string | null;
                    "department": string | null;
                    "employee_number": string | null;
                    "employment_status": string;
                    "employment_type": string | null;
                    "hire_date": string | null;
                    "home_address": string | null;
                    "id": string;
                    "is_active": boolean;
                    "is_supervisor": boolean;
                    "job_title": string | null;
                    "legal_name": string | null;
                    "manual_review_required": boolean;
                    "operational_notes": string | null;
                    "preferred_language": string | null;
                    "preferred_name": string | null;
                    "profile_photo_storage_path": string | null;
                    "separation_date": string | null;
                    "separation_reason": string | null;
                    "supervisor_employee_id": string | null;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "access_request_id"?: string | null;
                    "archived_at"?: string | null;
                    "archived_by_user_id"?: string | null;
                    "auth_user_id"?: string | null;
                    "contact_email"?: string | null;
                    "contact_phone"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "crew_name"?: string | null;
                    "department"?: string | null;
                    "employee_number"?: string | null;
                    "employment_status"?: string;
                    "employment_type"?: string | null;
                    "hire_date"?: string | null;
                    "home_address"?: string | null;
                    "id"?: string;
                    "is_active"?: boolean;
                    "is_supervisor"?: boolean;
                    "job_title"?: string | null;
                    "legal_name"?: string | null;
                    "manual_review_required"?: boolean;
                    "operational_notes"?: string | null;
                    "preferred_language"?: string | null;
                    "preferred_name"?: string | null;
                    "profile_photo_storage_path"?: string | null;
                    "separation_date"?: string | null;
                    "separation_reason"?: string | null;
                    "supervisor_employee_id"?: string | null;
                    "updated_at"?: string;
                };
                Update: {
                    "access_request_id"?: string | null;
                    "archived_at"?: string | null;
                    "archived_by_user_id"?: string | null;
                    "auth_user_id"?: string | null;
                    "contact_email"?: string | null;
                    "contact_phone"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "crew_name"?: string | null;
                    "department"?: string | null;
                    "employee_number"?: string | null;
                    "employment_status"?: string;
                    "employment_type"?: string | null;
                    "hire_date"?: string | null;
                    "home_address"?: string | null;
                    "id"?: string;
                    "is_active"?: boolean;
                    "is_supervisor"?: boolean;
                    "job_title"?: string | null;
                    "legal_name"?: string | null;
                    "manual_review_required"?: boolean;
                    "operational_notes"?: string | null;
                    "preferred_language"?: string | null;
                    "preferred_name"?: string | null;
                    "profile_photo_storage_path"?: string | null;
                    "separation_date"?: string | null;
                    "separation_reason"?: string | null;
                    "supervisor_employee_id"?: string | null;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "employee_records_access_request_id_fkey";
                        columns: [
                            "access_request_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "employee_access_requests";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_records_archived_by_user_id_fkey";
                        columns: [
                            "archived_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_records_archived_by_user_id_fkey";
                        columns: [
                            "archived_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_records_auth_user_id_fkey";
                        columns: [
                            "auth_user_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_records_auth_user_id_fkey";
                        columns: [
                            "auth_user_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_records_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_records_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_records_supervisor_employee_id_fkey";
                        columns: [
                            "supervisor_employee_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "employee_records";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "employee_requests": {
                Row: {
                    "created_at": string;
                    "details": string;
                    "employee_id": string;
                    "id": string;
                    "related_credential_id": string | null;
                    "related_document_id": string | null;
                    "request_type": string;
                    "review_notes": string | null;
                    "reviewed_at": string | null;
                    "reviewed_by_user_id": string | null;
                    "status": string;
                    "submitted_by_user_id": string | null;
                    "title": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "details": string;
                    "employee_id": string;
                    "id"?: string;
                    "related_credential_id"?: string | null;
                    "related_document_id"?: string | null;
                    "request_type": string;
                    "review_notes"?: string | null;
                    "reviewed_at"?: string | null;
                    "reviewed_by_user_id"?: string | null;
                    "status"?: string;
                    "submitted_by_user_id"?: string | null;
                    "title": string;
                    "updated_at"?: string;
                };
                Update: {
                    "created_at"?: string;
                    "details"?: string;
                    "employee_id"?: string;
                    "id"?: string;
                    "related_credential_id"?: string | null;
                    "related_document_id"?: string | null;
                    "request_type"?: string;
                    "review_notes"?: string | null;
                    "reviewed_at"?: string | null;
                    "reviewed_by_user_id"?: string | null;
                    "status"?: string;
                    "submitted_by_user_id"?: string | null;
                    "title"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "employee_requests_employee_id_fkey";
                        columns: [
                            "employee_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "employee_records";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_requests_related_credential_id_fkey";
                        columns: [
                            "related_credential_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "employee_credentials";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_requests_related_document_id_fkey";
                        columns: [
                            "related_document_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "employee_documents";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_requests_reviewed_by_user_id_fkey";
                        columns: [
                            "reviewed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_requests_reviewed_by_user_id_fkey";
                        columns: [
                            "reviewed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_requests_submitted_by_user_id_fkey";
                        columns: [
                            "submitted_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_requests_submitted_by_user_id_fkey";
                        columns: [
                            "submitted_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "employee_separation_items": {
                Row: {
                    "completed_at": string | null;
                    "completed_by_user_id": string | null;
                    "completion_status": string;
                    "created_at": string;
                    "employee_id": string;
                    "id": string;
                    "item_key": string;
                    "label": string;
                    "notes": string | null;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "completed_at"?: string | null;
                    "completed_by_user_id"?: string | null;
                    "completion_status"?: string;
                    "created_at"?: string;
                    "employee_id": string;
                    "id"?: string;
                    "item_key": string;
                    "label": string;
                    "notes"?: string | null;
                    "updated_at"?: string;
                };
                Update: {
                    "completed_at"?: string | null;
                    "completed_by_user_id"?: string | null;
                    "completion_status"?: string;
                    "created_at"?: string;
                    "employee_id"?: string;
                    "id"?: string;
                    "item_key"?: string;
                    "label"?: string;
                    "notes"?: string | null;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "employee_separation_items_completed_by_user_id_fkey";
                        columns: [
                            "completed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_separation_items_completed_by_user_id_fkey";
                        columns: [
                            "completed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "employee_separation_items_employee_id_fkey";
                        columns: [
                            "employee_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "employee_records";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "equipment_asset_costs": {
                Row: {
                    "asset_id": string;
                    "internal_daily_cost_cents": number | null;
                    "internal_hourly_cost_cents": number | null;
                    "purchase_price_cents": number | null;
                    "replacement_value_cents": number | null;
                    "updated_at": string;
                    "updated_by_user_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "asset_id": string;
                    "internal_daily_cost_cents"?: number | null;
                    "internal_hourly_cost_cents"?: number | null;
                    "purchase_price_cents"?: number | null;
                    "replacement_value_cents"?: number | null;
                    "updated_at"?: string;
                    "updated_by_user_id"?: string | null;
                };
                Update: {
                    "asset_id"?: string;
                    "internal_daily_cost_cents"?: number | null;
                    "internal_hourly_cost_cents"?: number | null;
                    "purchase_price_cents"?: number | null;
                    "replacement_value_cents"?: number | null;
                    "updated_at"?: string;
                    "updated_by_user_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "equipment_asset_costs_asset_id_fkey";
                        columns: [
                            "asset_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "equipment_assets";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_asset_costs_updated_by_user_id_fkey";
                        columns: [
                            "updated_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_asset_costs_updated_by_user_id_fkey";
                        columns: [
                            "updated_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "equipment_assets": {
                Row: {
                    "admin_notes": string | null;
                    "archived_at": string | null;
                    "archived_by_user_id": string | null;
                    "asset_number": string;
                    "assigned_employee_id": string | null;
                    "category": string;
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "current_hours": number | null;
                    "current_mileage": number | null;
                    "id": string;
                    "inspection_interval_days": number | null;
                    "inspection_template_key": string | null;
                    "is_active": boolean;
                    "license_plate": string | null;
                    "location_label": string | null;
                    "manufacturer": string | null;
                    "model": string | null;
                    "model_year": number | null;
                    "name": string;
                    "next_inspection_due_at": string | null;
                    "ownership_type": string | null;
                    "photo_storage_path": string | null;
                    "ppe_required": string | null;
                    "purchase_date": string | null;
                    "safety_class": string | null;
                    "serial_number": string | null;
                    "status": string;
                    "updated_at": string;
                    "vin": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "admin_notes"?: string | null;
                    "archived_at"?: string | null;
                    "archived_by_user_id"?: string | null;
                    "asset_number": string;
                    "assigned_employee_id"?: string | null;
                    "category": string;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "current_hours"?: number | null;
                    "current_mileage"?: number | null;
                    "id"?: string;
                    "inspection_interval_days"?: number | null;
                    "inspection_template_key"?: string | null;
                    "is_active"?: boolean;
                    "license_plate"?: string | null;
                    "location_label"?: string | null;
                    "manufacturer"?: string | null;
                    "model"?: string | null;
                    "model_year"?: number | null;
                    "name": string;
                    "next_inspection_due_at"?: string | null;
                    "ownership_type"?: string | null;
                    "photo_storage_path"?: string | null;
                    "ppe_required"?: string | null;
                    "purchase_date"?: string | null;
                    "safety_class"?: string | null;
                    "serial_number"?: string | null;
                    "status"?: string;
                    "updated_at"?: string;
                    "vin"?: string | null;
                };
                Update: {
                    "admin_notes"?: string | null;
                    "archived_at"?: string | null;
                    "archived_by_user_id"?: string | null;
                    "asset_number"?: string;
                    "assigned_employee_id"?: string | null;
                    "category"?: string;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "current_hours"?: number | null;
                    "current_mileage"?: number | null;
                    "id"?: string;
                    "inspection_interval_days"?: number | null;
                    "inspection_template_key"?: string | null;
                    "is_active"?: boolean;
                    "license_plate"?: string | null;
                    "location_label"?: string | null;
                    "manufacturer"?: string | null;
                    "model"?: string | null;
                    "model_year"?: number | null;
                    "name"?: string;
                    "next_inspection_due_at"?: string | null;
                    "ownership_type"?: string | null;
                    "photo_storage_path"?: string | null;
                    "ppe_required"?: string | null;
                    "purchase_date"?: string | null;
                    "safety_class"?: string | null;
                    "serial_number"?: string | null;
                    "status"?: string;
                    "updated_at"?: string;
                    "vin"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "equipment_assets_archived_by_user_id_fkey";
                        columns: [
                            "archived_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_assets_archived_by_user_id_fkey";
                        columns: [
                            "archived_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_assets_assigned_employee_id_fkey";
                        columns: [
                            "assigned_employee_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_assets_assigned_employee_id_fkey";
                        columns: [
                            "assigned_employee_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_assets_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_assets_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "equipment_assignments": {
                Row: {
                    "asset_id": string;
                    "assigned_user_id": string | null;
                    "conflict_override_reason": string | null;
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "ends_at": string | null;
                    "id": string;
                    "job_id": string | null;
                    "notes": string | null;
                    "returned_at": string | null;
                    "returned_by_user_id": string | null;
                    "schedule_event_id": string | null;
                    "starts_at": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "asset_id": string;
                    "assigned_user_id"?: string | null;
                    "conflict_override_reason"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "ends_at"?: string | null;
                    "id"?: string;
                    "job_id"?: string | null;
                    "notes"?: string | null;
                    "returned_at"?: string | null;
                    "returned_by_user_id"?: string | null;
                    "schedule_event_id"?: string | null;
                    "starts_at": string;
                    "updated_at"?: string;
                };
                Update: {
                    "asset_id"?: string;
                    "assigned_user_id"?: string | null;
                    "conflict_override_reason"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "ends_at"?: string | null;
                    "id"?: string;
                    "job_id"?: string | null;
                    "notes"?: string | null;
                    "returned_at"?: string | null;
                    "returned_by_user_id"?: string | null;
                    "schedule_event_id"?: string | null;
                    "starts_at"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "equipment_assignments_asset_id_fkey";
                        columns: [
                            "asset_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_assets";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_assignments_assigned_user_id_fkey";
                        columns: [
                            "assigned_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_assignments_assigned_user_id_fkey";
                        columns: [
                            "assigned_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_assignments_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_assignments_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_assignments_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_assignments_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_assignments_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_assignments_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_assignments_returned_by_user_id_fkey";
                        columns: [
                            "returned_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_assignments_returned_by_user_id_fkey";
                        columns: [
                            "returned_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_assignments_schedule_event_id_fkey";
                        columns: [
                            "schedule_event_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "appointment_id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_assignments_schedule_event_id_fkey";
                        columns: [
                            "schedule_event_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "appointment_id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_assignments_schedule_event_id_fkey";
                        columns: [
                            "schedule_event_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "schedule_events";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "equipment_documents": {
                Row: {
                    "asset_id": string;
                    "created_at": string;
                    "document_type": string;
                    "expires_at": string | null;
                    "id": string;
                    "storage_path": string;
                    "title": string;
                    "updated_at": string;
                    "uploaded_by_user_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "asset_id": string;
                    "created_at"?: string;
                    "document_type": string;
                    "expires_at"?: string | null;
                    "id"?: string;
                    "storage_path": string;
                    "title": string;
                    "updated_at"?: string;
                    "uploaded_by_user_id"?: string | null;
                };
                Update: {
                    "asset_id"?: string;
                    "created_at"?: string;
                    "document_type"?: string;
                    "expires_at"?: string | null;
                    "id"?: string;
                    "storage_path"?: string;
                    "title"?: string;
                    "updated_at"?: string;
                    "uploaded_by_user_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "equipment_documents_asset_id_fkey";
                        columns: [
                            "asset_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_assets";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_documents_uploaded_by_user_id_fkey";
                        columns: [
                            "uploaded_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_documents_uploaded_by_user_id_fkey";
                        columns: [
                            "uploaded_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "equipment_inspections": {
                Row: {
                    "asset_id": string;
                    "assignment_id": string | null;
                    "created_at": string;
                    "hours": number | null;
                    "id": string;
                    "inspected_at": string;
                    "inspected_by_user_id": string | null;
                    "job_id": string | null;
                    "mileage": number | null;
                    "notes": string | null;
                    "overall_result": string;
                    "responses_json": NonNullable<Json>;
                    "template_key": string;
                    "template_version": number;
                };
                ComputedFields: never;
                Insert: {
                    "asset_id": string;
                    "assignment_id"?: string | null;
                    "created_at"?: string;
                    "hours"?: number | null;
                    "id"?: string;
                    "inspected_at"?: string;
                    "inspected_by_user_id"?: string | null;
                    "job_id"?: string | null;
                    "mileage"?: number | null;
                    "notes"?: string | null;
                    "overall_result": string;
                    "responses_json"?: NonNullable<Json>;
                    "template_key": string;
                    "template_version"?: number;
                };
                Update: {
                    "asset_id"?: string;
                    "assignment_id"?: string | null;
                    "created_at"?: string;
                    "hours"?: number | null;
                    "id"?: string;
                    "inspected_at"?: string;
                    "inspected_by_user_id"?: string | null;
                    "job_id"?: string | null;
                    "mileage"?: number | null;
                    "notes"?: string | null;
                    "overall_result"?: string;
                    "responses_json"?: NonNullable<Json>;
                    "template_key"?: string;
                    "template_version"?: number;
                };
                Relationships: [
                    {
                        foreignKeyName: "equipment_inspections_asset_id_fkey";
                        columns: [
                            "asset_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_assets";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_inspections_assignment_id_fkey";
                        columns: [
                            "assignment_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_assignments";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_inspections_inspected_by_user_id_fkey";
                        columns: [
                            "inspected_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_inspections_inspected_by_user_id_fkey";
                        columns: [
                            "inspected_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_inspections_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_inspections_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_inspections_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_inspections_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "equipment_maintenance_records": {
                Row: {
                    "asset_id": string;
                    "completed_at": string | null;
                    "completed_by_user_id": string | null;
                    "cost_cents": number | null;
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "description": string | null;
                    "hours_at_service": number | null;
                    "id": string;
                    "maintenance_type": string;
                    "mileage_at_service": number | null;
                    "schedule_event_id": string | null;
                    "schedule_id": string | null;
                    "scheduled_for": string | null;
                    "status": string;
                    "title": string;
                    "updated_at": string;
                    "vendor_name": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "asset_id": string;
                    "completed_at"?: string | null;
                    "completed_by_user_id"?: string | null;
                    "cost_cents"?: number | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "description"?: string | null;
                    "hours_at_service"?: number | null;
                    "id"?: string;
                    "maintenance_type"?: string;
                    "mileage_at_service"?: number | null;
                    "schedule_event_id"?: string | null;
                    "schedule_id"?: string | null;
                    "scheduled_for"?: string | null;
                    "status"?: string;
                    "title": string;
                    "updated_at"?: string;
                    "vendor_name"?: string | null;
                };
                Update: {
                    "asset_id"?: string;
                    "completed_at"?: string | null;
                    "completed_by_user_id"?: string | null;
                    "cost_cents"?: number | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "description"?: string | null;
                    "hours_at_service"?: number | null;
                    "id"?: string;
                    "maintenance_type"?: string;
                    "mileage_at_service"?: number | null;
                    "schedule_event_id"?: string | null;
                    "schedule_id"?: string | null;
                    "scheduled_for"?: string | null;
                    "status"?: string;
                    "title"?: string;
                    "updated_at"?: string;
                    "vendor_name"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "equipment_maintenance_records_asset_id_fkey";
                        columns: [
                            "asset_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_assets";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_maintenance_records_completed_by_user_id_fkey";
                        columns: [
                            "completed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_maintenance_records_completed_by_user_id_fkey";
                        columns: [
                            "completed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_maintenance_records_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_maintenance_records_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_maintenance_records_schedule_event_id_fkey";
                        columns: [
                            "schedule_event_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "appointment_id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_maintenance_records_schedule_event_id_fkey";
                        columns: [
                            "schedule_event_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "appointment_id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_maintenance_records_schedule_event_id_fkey";
                        columns: [
                            "schedule_event_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "schedule_events";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_maintenance_records_schedule_id_fkey";
                        columns: [
                            "schedule_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_maintenance_schedules";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "equipment_maintenance_schedules": {
                Row: {
                    "asset_id": string;
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "id": string;
                    "instructions": string | null;
                    "interval_days": number | null;
                    "interval_hours": number | null;
                    "interval_miles": number | null;
                    "is_active": boolean;
                    "last_completed_at": string | null;
                    "last_completed_hours": number | null;
                    "last_completed_mileage": number | null;
                    "maintenance_type": string;
                    "next_due_at": string | null;
                    "next_due_hours": number | null;
                    "next_due_mileage": number | null;
                    "title": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "asset_id": string;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "id"?: string;
                    "instructions"?: string | null;
                    "interval_days"?: number | null;
                    "interval_hours"?: number | null;
                    "interval_miles"?: number | null;
                    "is_active"?: boolean;
                    "last_completed_at"?: string | null;
                    "last_completed_hours"?: number | null;
                    "last_completed_mileage"?: number | null;
                    "maintenance_type"?: string;
                    "next_due_at"?: string | null;
                    "next_due_hours"?: number | null;
                    "next_due_mileage"?: number | null;
                    "title": string;
                    "updated_at"?: string;
                };
                Update: {
                    "asset_id"?: string;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "id"?: string;
                    "instructions"?: string | null;
                    "interval_days"?: number | null;
                    "interval_hours"?: number | null;
                    "interval_miles"?: number | null;
                    "is_active"?: boolean;
                    "last_completed_at"?: string | null;
                    "last_completed_hours"?: number | null;
                    "last_completed_mileage"?: number | null;
                    "maintenance_type"?: string;
                    "next_due_at"?: string | null;
                    "next_due_hours"?: number | null;
                    "next_due_mileage"?: number | null;
                    "title"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "equipment_maintenance_schedules_asset_id_fkey";
                        columns: [
                            "asset_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_assets";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_maintenance_schedules_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_maintenance_schedules_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "equipment_problem_reports": {
                Row: {
                    "asset_id": string;
                    "assignment_id": string | null;
                    "created_at": string;
                    "description": string;
                    "equipment_stopped": boolean;
                    "id": string;
                    "job_id": string | null;
                    "photo_storage_path": string | null;
                    "reported_by_user_id": string | null;
                    "resolution_notes": string | null;
                    "resolved_at": string | null;
                    "resolved_by_user_id": string | null;
                    "severity": string;
                    "status": string;
                    "title": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "asset_id": string;
                    "assignment_id"?: string | null;
                    "created_at"?: string;
                    "description": string;
                    "equipment_stopped"?: boolean;
                    "id"?: string;
                    "job_id"?: string | null;
                    "photo_storage_path"?: string | null;
                    "reported_by_user_id"?: string | null;
                    "resolution_notes"?: string | null;
                    "resolved_at"?: string | null;
                    "resolved_by_user_id"?: string | null;
                    "severity"?: string;
                    "status"?: string;
                    "title": string;
                    "updated_at"?: string;
                };
                Update: {
                    "asset_id"?: string;
                    "assignment_id"?: string | null;
                    "created_at"?: string;
                    "description"?: string;
                    "equipment_stopped"?: boolean;
                    "id"?: string;
                    "job_id"?: string | null;
                    "photo_storage_path"?: string | null;
                    "reported_by_user_id"?: string | null;
                    "resolution_notes"?: string | null;
                    "resolved_at"?: string | null;
                    "resolved_by_user_id"?: string | null;
                    "severity"?: string;
                    "status"?: string;
                    "title"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "equipment_problem_reports_asset_id_fkey";
                        columns: [
                            "asset_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_assets";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_problem_reports_assignment_id_fkey";
                        columns: [
                            "assignment_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_assignments";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_problem_reports_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_problem_reports_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_problem_reports_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_problem_reports_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_problem_reports_reported_by_user_id_fkey";
                        columns: [
                            "reported_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_problem_reports_reported_by_user_id_fkey";
                        columns: [
                            "reported_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_problem_reports_resolved_by_user_id_fkey";
                        columns: [
                            "resolved_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_problem_reports_resolved_by_user_id_fkey";
                        columns: [
                            "resolved_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "equipment_readings": {
                Row: {
                    "asset_id": string;
                    "correction_reason": string | null;
                    "created_at": string;
                    "id": string;
                    "reading_type": string;
                    "reading_value": number;
                    "recorded_at": string;
                    "recorded_by_user_id": string | null;
                    "source": string;
                    "supersedes_reading_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "asset_id": string;
                    "correction_reason"?: string | null;
                    "created_at"?: string;
                    "id"?: string;
                    "reading_type": string;
                    "reading_value": number;
                    "recorded_at"?: string;
                    "recorded_by_user_id"?: string | null;
                    "source"?: string;
                    "supersedes_reading_id"?: string | null;
                };
                Update: {
                    "asset_id"?: string;
                    "correction_reason"?: string | null;
                    "created_at"?: string;
                    "id"?: string;
                    "reading_type"?: string;
                    "reading_value"?: number;
                    "recorded_at"?: string;
                    "recorded_by_user_id"?: string | null;
                    "source"?: string;
                    "supersedes_reading_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "equipment_readings_asset_id_fkey";
                        columns: [
                            "asset_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_assets";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_readings_recorded_by_user_id_fkey";
                        columns: [
                            "recorded_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_readings_recorded_by_user_id_fkey";
                        columns: [
                            "recorded_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_readings_supersedes_reading_id_fkey";
                        columns: [
                            "supersedes_reading_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_readings";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "equipment_status_history": {
                Row: {
                    "asset_id": string;
                    "changed_at": string;
                    "changed_by_user_id": string | null;
                    "id": string;
                    "next_status": string;
                    "previous_status": string | null;
                    "reason": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "asset_id": string;
                    "changed_at"?: string;
                    "changed_by_user_id"?: string | null;
                    "id"?: string;
                    "next_status": string;
                    "previous_status"?: string | null;
                    "reason"?: string | null;
                };
                Update: {
                    "asset_id"?: string;
                    "changed_at"?: string;
                    "changed_by_user_id"?: string | null;
                    "id"?: string;
                    "next_status"?: string;
                    "previous_status"?: string | null;
                    "reason"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "equipment_status_history_asset_id_fkey";
                        columns: [
                            "asset_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_assets";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_status_history_changed_by_user_id_fkey";
                        columns: [
                            "changed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "equipment_status_history_changed_by_user_id_fkey";
                        columns: [
                            "changed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "follow_up_tasks": {
                Row: {
                    "assigned_to_user_id": string | null;
                    "change_order_id": string | null;
                    "completed_at": string | null;
                    "completed_by_user_id": string | null;
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "customer_id": string | null;
                    "dedupe_key": string | null;
                    "description": string | null;
                    "due_at": string;
                    "id": string;
                    "invoice_id": string | null;
                    "job_id": string | null;
                    "next_action_at": string | null;
                    "notes": string | null;
                    "organization_contact_id": string | null;
                    "organization_id": string | null;
                    "priority": string;
                    "quote_id": string | null;
                    "recommendation_id": string | null;
                    "recurring_occurrence_id": string | null;
                    "recurring_plan_id": string | null;
                    "service_location_id": string | null;
                    "snoozed_until": string | null;
                    "status": string;
                    "task_type": string;
                    "title": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "assigned_to_user_id"?: string | null;
                    "change_order_id"?: string | null;
                    "completed_at"?: string | null;
                    "completed_by_user_id"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "customer_id"?: string | null;
                    "dedupe_key"?: string | null;
                    "description"?: string | null;
                    "due_at": string;
                    "id"?: string;
                    "invoice_id"?: string | null;
                    "job_id"?: string | null;
                    "next_action_at"?: never;
                    "notes"?: string | null;
                    "organization_contact_id"?: string | null;
                    "organization_id"?: string | null;
                    "priority"?: string;
                    "quote_id"?: string | null;
                    "recommendation_id"?: string | null;
                    "recurring_occurrence_id"?: string | null;
                    "recurring_plan_id"?: string | null;
                    "service_location_id"?: string | null;
                    "snoozed_until"?: string | null;
                    "status"?: string;
                    "task_type"?: string;
                    "title": string;
                    "updated_at"?: string;
                };
                Update: {
                    "assigned_to_user_id"?: string | null;
                    "change_order_id"?: string | null;
                    "completed_at"?: string | null;
                    "completed_by_user_id"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "customer_id"?: string | null;
                    "dedupe_key"?: string | null;
                    "description"?: string | null;
                    "due_at"?: string;
                    "id"?: string;
                    "invoice_id"?: string | null;
                    "job_id"?: string | null;
                    "next_action_at"?: never;
                    "notes"?: string | null;
                    "organization_contact_id"?: string | null;
                    "organization_id"?: string | null;
                    "priority"?: string;
                    "quote_id"?: string | null;
                    "recommendation_id"?: string | null;
                    "recurring_occurrence_id"?: string | null;
                    "recurring_plan_id"?: string | null;
                    "service_location_id"?: string | null;
                    "snoozed_until"?: string | null;
                    "status"?: string;
                    "task_type"?: string;
                    "title"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "follow_up_tasks_assigned_to_user_id_fkey";
                        columns: [
                            "assigned_to_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_assigned_to_user_id_fkey";
                        columns: [
                            "assigned_to_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_change_order_id_fkey";
                        columns: [
                            "change_order_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "change_orders";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_completed_by_user_id_fkey";
                        columns: [
                            "completed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_completed_by_user_id_fkey";
                        columns: [
                            "completed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_customer_id_fkey";
                        columns: [
                            "customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "invoices";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_organization_contact_id_fkey";
                        columns: [
                            "organization_contact_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organization_contacts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "quotes";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_recommendation_id_fkey";
                        columns: [
                            "recommendation_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_recommendations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_recurring_occurrence_id_fkey";
                        columns: [
                            "recurring_occurrence_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "recurring_service_occurrences";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_recurring_plan_id_fkey";
                        columns: [
                            "recurring_plan_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "recurring_service_plans";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_service_location_id_fkey";
                        columns: [
                            "service_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_locations";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "google_calendar_connections": {
                Row: {
                    "auth_user_id": string;
                    "created_at": string;
                    "employee_id": string | null;
                    "google_account_email": string;
                    "google_account_id": string;
                    "granted_scopes": (string)[];
                    "id": string;
                    "last_sync_attempt_at": string | null;
                    "last_sync_error_at": string | null;
                    "last_sync_error_code": string | null;
                    "last_sync_status": string;
                    "last_sync_succeeded_at": string | null;
                    "refresh_token_encrypted": string | null;
                    "selected_calendar_id": string;
                    "selected_calendar_summary": string;
                    "status": string;
                    "sync_company_all": boolean;
                    "sync_enabled": boolean;
                    "sync_estimates": boolean;
                    "sync_jobs": boolean;
                    "token_encryption_version": number;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "auth_user_id": string;
                    "created_at"?: string;
                    "employee_id"?: string | null;
                    "google_account_email": string;
                    "google_account_id": string;
                    "granted_scopes"?: (string)[];
                    "id"?: string;
                    "last_sync_attempt_at"?: string | null;
                    "last_sync_error_at"?: string | null;
                    "last_sync_error_code"?: string | null;
                    "last_sync_status"?: string;
                    "last_sync_succeeded_at"?: string | null;
                    "refresh_token_encrypted"?: string | null;
                    "selected_calendar_id"?: string;
                    "selected_calendar_summary"?: string;
                    "status"?: string;
                    "sync_company_all"?: boolean;
                    "sync_enabled"?: boolean;
                    "sync_estimates"?: boolean;
                    "sync_jobs"?: boolean;
                    "token_encryption_version"?: number;
                    "updated_at"?: string;
                };
                Update: {
                    "auth_user_id"?: string;
                    "created_at"?: string;
                    "employee_id"?: string | null;
                    "google_account_email"?: string;
                    "google_account_id"?: string;
                    "granted_scopes"?: (string)[];
                    "id"?: string;
                    "last_sync_attempt_at"?: string | null;
                    "last_sync_error_at"?: string | null;
                    "last_sync_error_code"?: string | null;
                    "last_sync_status"?: string;
                    "last_sync_succeeded_at"?: string | null;
                    "refresh_token_encrypted"?: string | null;
                    "selected_calendar_id"?: string;
                    "selected_calendar_summary"?: string;
                    "status"?: string;
                    "sync_company_all"?: boolean;
                    "sync_enabled"?: boolean;
                    "sync_estimates"?: boolean;
                    "sync_jobs"?: boolean;
                    "token_encryption_version"?: number;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "google_calendar_connections_auth_user_id_fkey";
                        columns: [
                            "auth_user_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "google_calendar_connections_auth_user_id_fkey";
                        columns: [
                            "auth_user_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "google_calendar_connections_employee_id_fkey";
                        columns: [
                            "employee_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "employee_records";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "google_calendar_event_mappings": {
                Row: {
                    "connection_id": string;
                    "created_at": string;
                    "google_calendar_id": string;
                    "google_event_html_link": string | null;
                    "google_event_id": string;
                    "id": string;
                    "last_sync_error_code": string | null;
                    "last_synced_at": string | null;
                    "schedule_event_id": string;
                    "source_starts_at": string | null;
                    "sync_fingerprint": string;
                    "sync_status": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "connection_id": string;
                    "created_at"?: string;
                    "google_calendar_id": string;
                    "google_event_html_link"?: string | null;
                    "google_event_id": string;
                    "id"?: string;
                    "last_sync_error_code"?: string | null;
                    "last_synced_at"?: string | null;
                    "schedule_event_id": string;
                    "source_starts_at"?: string | null;
                    "sync_fingerprint": string;
                    "sync_status"?: string;
                    "updated_at"?: string;
                };
                Update: {
                    "connection_id"?: string;
                    "created_at"?: string;
                    "google_calendar_id"?: string;
                    "google_event_html_link"?: string | null;
                    "google_event_id"?: string;
                    "id"?: string;
                    "last_sync_error_code"?: string | null;
                    "last_synced_at"?: string | null;
                    "schedule_event_id"?: string;
                    "source_starts_at"?: string | null;
                    "sync_fingerprint"?: string;
                    "sync_status"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "google_calendar_event_mappings_connection_id_fkey";
                        columns: [
                            "connection_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "google_calendar_connections";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "google_calendar_sync_outbox": {
                Row: {
                    "attempt_count": number;
                    "available_at": string;
                    "connection_id": string | null;
                    "created_at": string;
                    "dedupe_key": string;
                    "last_error_code": string | null;
                    "locked_at": string | null;
                    "reason": string;
                    "revision": number;
                    "schedule_event_id": string | null;
                    "status": string;
                    "task_type": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "attempt_count"?: number;
                    "available_at"?: string;
                    "connection_id"?: string | null;
                    "created_at"?: string;
                    "dedupe_key": string;
                    "last_error_code"?: string | null;
                    "locked_at"?: string | null;
                    "reason"?: string;
                    "revision"?: number;
                    "schedule_event_id"?: string | null;
                    "status"?: string;
                    "task_type": string;
                    "updated_at"?: string;
                };
                Update: {
                    "attempt_count"?: number;
                    "available_at"?: string;
                    "connection_id"?: string | null;
                    "created_at"?: string;
                    "dedupe_key"?: string;
                    "last_error_code"?: string | null;
                    "locked_at"?: string | null;
                    "reason"?: string;
                    "revision"?: number;
                    "schedule_event_id"?: string | null;
                    "status"?: string;
                    "task_type"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "google_calendar_sync_outbox_connection_id_fkey";
                        columns: [
                            "connection_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "google_calendar_connections";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "inventory_locations": {
                Row: {
                    "address": string | null;
                    "archived_at": string | null;
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "equipment_asset_id": string | null;
                    "id": string;
                    "is_active": boolean;
                    "location_type": string;
                    "name": string;
                    "notes": string | null;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "address"?: string | null;
                    "archived_at"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "equipment_asset_id"?: string | null;
                    "id"?: string;
                    "is_active"?: boolean;
                    "location_type"?: string;
                    "name": string;
                    "notes"?: string | null;
                    "updated_at"?: string;
                };
                Update: {
                    "address"?: string | null;
                    "archived_at"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "equipment_asset_id"?: string | null;
                    "id"?: string;
                    "is_active"?: boolean;
                    "location_type"?: string;
                    "name"?: string;
                    "notes"?: string | null;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "inventory_locations_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_locations_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_locations_equipment_asset_id_fkey";
                        columns: [
                            "equipment_asset_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_assets";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "inventory_reservations": {
                Row: {
                    "created_at": string;
                    "created_by_user_id": string;
                    "expected_available_at": string | null;
                    "id": string;
                    "job_id": string;
                    "job_material_requirement_id": string | null;
                    "location_id": string;
                    "material_id": string;
                    "notes": string | null;
                    "quantity": number;
                    "released_at": string | null;
                    "released_reason": string | null;
                    "status": string;
                    "unit": string;
                    "updated_at": string;
                    "updated_by_user_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "created_by_user_id": string;
                    "expected_available_at"?: string | null;
                    "id"?: string;
                    "job_id": string;
                    "job_material_requirement_id"?: string | null;
                    "location_id": string;
                    "material_id": string;
                    "notes"?: string | null;
                    "quantity": number;
                    "released_at"?: string | null;
                    "released_reason"?: string | null;
                    "status"?: string;
                    "unit": string;
                    "updated_at"?: string;
                    "updated_by_user_id"?: string | null;
                };
                Update: {
                    "created_at"?: string;
                    "created_by_user_id"?: string;
                    "expected_available_at"?: string | null;
                    "id"?: string;
                    "job_id"?: string;
                    "job_material_requirement_id"?: string | null;
                    "location_id"?: string;
                    "material_id"?: string;
                    "notes"?: string | null;
                    "quantity"?: number;
                    "released_at"?: string | null;
                    "released_reason"?: string | null;
                    "status"?: string;
                    "unit"?: string;
                    "updated_at"?: string;
                    "updated_by_user_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "inventory_reservations_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_reservations_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_reservations_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_reservations_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_reservations_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_reservations_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_reservations_job_material_requirement_id_fkey";
                        columns: [
                            "job_material_requirement_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_material_requirements";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_reservations_location_id_fkey";
                        columns: [
                            "location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "inventory_locations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_reservations_material_id_fkey";
                        columns: [
                            "material_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "material_catalog";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_reservations_updated_by_user_id_fkey";
                        columns: [
                            "updated_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_reservations_updated_by_user_id_fkey";
                        columns: [
                            "updated_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "inventory_transaction_costs": {
                Row: {
                    "costing_status": string;
                    "created_at": string;
                    "direct_cost_cents": number | null;
                    "job_cost_entry_id": string | null;
                    "notes": string | null;
                    "reviewed_at": string | null;
                    "reviewed_by_user_id": string | null;
                    "transaction_id": string;
                    "unit_cost_cents_snapshot": number | null;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "costing_status"?: string;
                    "created_at"?: string;
                    "direct_cost_cents"?: number | null;
                    "job_cost_entry_id"?: string | null;
                    "notes"?: string | null;
                    "reviewed_at"?: string | null;
                    "reviewed_by_user_id"?: string | null;
                    "transaction_id": string;
                    "unit_cost_cents_snapshot"?: number | null;
                    "updated_at"?: string;
                };
                Update: {
                    "costing_status"?: string;
                    "created_at"?: string;
                    "direct_cost_cents"?: number | null;
                    "job_cost_entry_id"?: string | null;
                    "notes"?: string | null;
                    "reviewed_at"?: string | null;
                    "reviewed_by_user_id"?: string | null;
                    "transaction_id"?: string;
                    "unit_cost_cents_snapshot"?: number | null;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "inventory_transaction_costs_job_cost_entry_id_fkey";
                        columns: [
                            "job_cost_entry_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_cost_entries";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_transaction_costs_reviewed_by_user_id_fkey";
                        columns: [
                            "reviewed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_transaction_costs_reviewed_by_user_id_fkey";
                        columns: [
                            "reviewed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_transaction_costs_transaction_id_fkey";
                        columns: [
                            "transaction_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "inventory_transactions";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "inventory_transactions": {
                Row: {
                    "attachment_storage_path": string | null;
                    "created_at": string;
                    "created_by_user_id": string;
                    "customer_id": string | null;
                    "destination_location_id": string | null;
                    "equipment_asset_id": string | null;
                    "id": string;
                    "idempotency_key": string;
                    "is_estimated": boolean;
                    "job_id": string | null;
                    "material_id": string;
                    "negative_override_authorized_by": string | null;
                    "negative_override_reason": string | null;
                    "notes": string | null;
                    "occurred_at": string;
                    "quantity": number;
                    "reversal_of_transaction_id": string | null;
                    "service_location_id": string | null;
                    "source_location_id": string | null;
                    "transaction_type": string;
                    "unit": string;
                    "vendor_organization_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "attachment_storage_path"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id": string;
                    "customer_id"?: string | null;
                    "destination_location_id"?: string | null;
                    "equipment_asset_id"?: string | null;
                    "id"?: string;
                    "idempotency_key": string;
                    "is_estimated"?: boolean;
                    "job_id"?: string | null;
                    "material_id": string;
                    "negative_override_authorized_by"?: string | null;
                    "negative_override_reason"?: string | null;
                    "notes"?: string | null;
                    "occurred_at"?: string;
                    "quantity": number;
                    "reversal_of_transaction_id"?: string | null;
                    "service_location_id"?: string | null;
                    "source_location_id"?: string | null;
                    "transaction_type": string;
                    "unit": string;
                    "vendor_organization_id"?: string | null;
                };
                Update: {
                    "attachment_storage_path"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string;
                    "customer_id"?: string | null;
                    "destination_location_id"?: string | null;
                    "equipment_asset_id"?: string | null;
                    "id"?: string;
                    "idempotency_key"?: string;
                    "is_estimated"?: boolean;
                    "job_id"?: string | null;
                    "material_id"?: string;
                    "negative_override_authorized_by"?: string | null;
                    "negative_override_reason"?: string | null;
                    "notes"?: string | null;
                    "occurred_at"?: string;
                    "quantity"?: number;
                    "reversal_of_transaction_id"?: string | null;
                    "service_location_id"?: string | null;
                    "source_location_id"?: string | null;
                    "transaction_type"?: string;
                    "unit"?: string;
                    "vendor_organization_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "inventory_transactions_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_transactions_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_transactions_customer_id_fkey";
                        columns: [
                            "customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_transactions_destination_location_id_fkey";
                        columns: [
                            "destination_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "inventory_locations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_transactions_equipment_asset_id_fkey";
                        columns: [
                            "equipment_asset_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_assets";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_transactions_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_transactions_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_transactions_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_transactions_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_transactions_material_id_fkey";
                        columns: [
                            "material_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "material_catalog";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_transactions_negative_override_authorized_by_fkey";
                        columns: [
                            "negative_override_authorized_by"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_transactions_negative_override_authorized_by_fkey";
                        columns: [
                            "negative_override_authorized_by"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_transactions_reversal_of_transaction_id_fkey";
                        columns: [
                            "reversal_of_transaction_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "inventory_transactions";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_transactions_service_location_id_fkey";
                        columns: [
                            "service_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_locations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_transactions_source_location_id_fkey";
                        columns: [
                            "source_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "inventory_locations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "inventory_transactions_vendor_organization_id_fkey";
                        columns: [
                            "vendor_organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "invoice_checkout_sessions": {
                Row: {
                    "amount_cents": number;
                    "authorized_at": string | null;
                    "card_brand": string | null;
                    "card_country": string | null;
                    "card_funding_type": string | null;
                    "checkout_url": string | null;
                    "completed_at": string | null;
                    "created_at": string;
                    "currency": string;
                    "customer_id": string | null;
                    "expires_at": string | null;
                    "failed_at": string | null;
                    "id": string;
                    "invoice_id": string;
                    "invoice_principal_cents": number;
                    "organization_id": string | null;
                    "payment_channel": string;
                    "processing_expires_at": string | null;
                    "reviewed_at": string | null;
                    "status": string;
                    "stripe_checkout_session_id": string | null;
                    "stripe_confirmation_token_id": string | null;
                    "stripe_payment_intent_id": string | null;
                    "submitted_at": string | null;
                    "surcharge_cents": number;
                    "total_charge_cents": number;
                    "updated_at": string;
                    "void_reconciled_token": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "amount_cents": number;
                    "authorized_at"?: string | null;
                    "card_brand"?: string | null;
                    "card_country"?: string | null;
                    "card_funding_type"?: string | null;
                    "checkout_url"?: string | null;
                    "completed_at"?: string | null;
                    "created_at"?: string;
                    "currency"?: string;
                    "customer_id"?: string | null;
                    "expires_at"?: string | null;
                    "failed_at"?: string | null;
                    "id"?: string;
                    "invoice_id": string;
                    "invoice_principal_cents": number;
                    "organization_id"?: string | null;
                    "payment_channel": string;
                    "processing_expires_at"?: string | null;
                    "reviewed_at"?: string | null;
                    "status"?: string;
                    "stripe_checkout_session_id"?: string | null;
                    "stripe_confirmation_token_id"?: string | null;
                    "stripe_payment_intent_id"?: string | null;
                    "submitted_at"?: string | null;
                    "surcharge_cents"?: number;
                    "total_charge_cents": number;
                    "updated_at"?: string;
                    "void_reconciled_token"?: string | null;
                };
                Update: {
                    "amount_cents"?: number;
                    "authorized_at"?: string | null;
                    "card_brand"?: string | null;
                    "card_country"?: string | null;
                    "card_funding_type"?: string | null;
                    "checkout_url"?: string | null;
                    "completed_at"?: string | null;
                    "created_at"?: string;
                    "currency"?: string;
                    "customer_id"?: string | null;
                    "expires_at"?: string | null;
                    "failed_at"?: string | null;
                    "id"?: string;
                    "invoice_id"?: string;
                    "invoice_principal_cents"?: number;
                    "organization_id"?: string | null;
                    "payment_channel"?: string;
                    "processing_expires_at"?: string | null;
                    "reviewed_at"?: string | null;
                    "status"?: string;
                    "stripe_checkout_session_id"?: string | null;
                    "stripe_confirmation_token_id"?: string | null;
                    "stripe_payment_intent_id"?: string | null;
                    "submitted_at"?: string | null;
                    "surcharge_cents"?: number;
                    "total_charge_cents"?: number;
                    "updated_at"?: string;
                    "void_reconciled_token"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "invoice_checkout_sessions_customer_id_fkey";
                        columns: [
                            "customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "invoice_checkout_sessions_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "invoices";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "invoice_checkout_sessions_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    },
                    {
                        foreignKeyName: "invoice_checkout_sessions_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    },
                    {
                        foreignKeyName: "invoice_checkout_sessions_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "invoice_line_items": {
                Row: {
                    "created_at": string;
                    "description": string | null;
                    "id": string;
                    "invoice_id": string;
                    "material_id": string | null;
                    "name": string;
                    "quantity": number;
                    "service_category_id": string | null;
                    "sort_order": number;
                    "source_change_order_line_item_id": string | null;
                    "total_cents": number;
                    "unit_price_cents": number;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "description"?: string | null;
                    "id"?: string;
                    "invoice_id": string;
                    "material_id"?: string | null;
                    "name": string;
                    "quantity"?: number;
                    "service_category_id"?: string | null;
                    "sort_order"?: number;
                    "source_change_order_line_item_id"?: string | null;
                    "total_cents"?: number;
                    "unit_price_cents"?: number;
                    "updated_at"?: string;
                };
                Update: {
                    "created_at"?: string;
                    "description"?: string | null;
                    "id"?: string;
                    "invoice_id"?: string;
                    "material_id"?: string | null;
                    "name"?: string;
                    "quantity"?: number;
                    "service_category_id"?: string | null;
                    "sort_order"?: number;
                    "source_change_order_line_item_id"?: string | null;
                    "total_cents"?: number;
                    "unit_price_cents"?: number;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "invoice_line_items_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "invoices";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "invoice_line_items_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    },
                    {
                        foreignKeyName: "invoice_line_items_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    },
                    {
                        foreignKeyName: "invoice_line_items_material_id_fkey";
                        columns: [
                            "material_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "material_catalog";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "invoice_line_items_service_category_id_fkey";
                        columns: [
                            "service_category_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_categories";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "invoice_line_items_source_change_order_line_item_id_fkey";
                        columns: [
                            "source_change_order_line_item_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "change_order_line_items";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "invoice_portal_tokens": {
                Row: {
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "customer_id": string | null;
                    "expires_at": string | null;
                    "id": string;
                    "invoice_id": string;
                    "organization_id": string | null;
                    "revoked_at": string | null;
                    "token_encrypted": string | null;
                    "token_hash": string;
                    "token_hint": string | null;
                    "updated_at": string;
                    "viewed_at": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "customer_id"?: string | null;
                    "expires_at"?: string | null;
                    "id"?: string;
                    "invoice_id": string;
                    "organization_id"?: string | null;
                    "revoked_at"?: string | null;
                    "token_encrypted"?: string | null;
                    "token_hash": string;
                    "token_hint"?: string | null;
                    "updated_at"?: string;
                    "viewed_at"?: string | null;
                };
                Update: {
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "customer_id"?: string | null;
                    "expires_at"?: string | null;
                    "id"?: string;
                    "invoice_id"?: string;
                    "organization_id"?: string | null;
                    "revoked_at"?: string | null;
                    "token_encrypted"?: string | null;
                    "token_hash"?: string;
                    "token_hint"?: string | null;
                    "updated_at"?: string;
                    "viewed_at"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "invoice_portal_tokens_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "invoice_portal_tokens_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "invoice_portal_tokens_customer_id_fkey";
                        columns: [
                            "customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "invoice_portal_tokens_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "invoices";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "invoice_portal_tokens_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    },
                    {
                        foreignKeyName: "invoice_portal_tokens_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    },
                    {
                        foreignKeyName: "invoice_portal_tokens_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "invoices": {
                Row: {
                    "accounts_payable_contact_id": string | null;
                    "archived_at": string | null;
                    "archived_by_user_id": string | null;
                    "automatic_reminders_enabled": boolean;
                    "balance_due_cents": number;
                    "billing_contact_id": string | null;
                    "created_at": string;
                    "customer_id": string | null;
                    "due_at": string | null;
                    "first_viewed_at": string | null;
                    "id": string;
                    "invoice_number": string | null;
                    "job_id": string | null;
                    "last_viewed_at": string | null;
                    "legacy_customer_id": string | null;
                    "organization_id": string | null;
                    "paid_at": string | null;
                    "payment_preference": string | null;
                    "payment_preference_selected_at": string | null;
                    "payment_terms": string | null;
                    "purchase_order_reference": string | null;
                    "quote_id": string | null;
                    "recurring_occurrence_id": string | null;
                    "recurring_service_plan_id": string | null;
                    "sent_at": string | null;
                    "service_location_id": string | null;
                    "status": string;
                    "subtotal_cents": number;
                    "tax_cents": number;
                    "total_cents": number;
                    "updated_at": string;
                    "view_count": number;
                };
                ComputedFields: never;
                Insert: {
                    "accounts_payable_contact_id"?: string | null;
                    "archived_at"?: string | null;
                    "archived_by_user_id"?: string | null;
                    "automatic_reminders_enabled"?: boolean;
                    "balance_due_cents"?: number;
                    "billing_contact_id"?: string | null;
                    "created_at"?: string;
                    "customer_id"?: string | null;
                    "due_at"?: string | null;
                    "first_viewed_at"?: string | null;
                    "id"?: string;
                    "invoice_number"?: string | null;
                    "job_id"?: string | null;
                    "last_viewed_at"?: string | null;
                    "legacy_customer_id"?: string | null;
                    "organization_id"?: string | null;
                    "paid_at"?: string | null;
                    "payment_preference"?: string | null;
                    "payment_preference_selected_at"?: string | null;
                    "payment_terms"?: string | null;
                    "purchase_order_reference"?: string | null;
                    "quote_id"?: string | null;
                    "recurring_occurrence_id"?: string | null;
                    "recurring_service_plan_id"?: string | null;
                    "sent_at"?: string | null;
                    "service_location_id"?: string | null;
                    "status"?: string;
                    "subtotal_cents"?: number;
                    "tax_cents"?: number;
                    "total_cents"?: number;
                    "updated_at"?: string;
                    "view_count"?: number;
                };
                Update: {
                    "accounts_payable_contact_id"?: string | null;
                    "archived_at"?: string | null;
                    "archived_by_user_id"?: string | null;
                    "automatic_reminders_enabled"?: boolean;
                    "balance_due_cents"?: number;
                    "billing_contact_id"?: string | null;
                    "created_at"?: string;
                    "customer_id"?: string | null;
                    "due_at"?: string | null;
                    "first_viewed_at"?: string | null;
                    "id"?: string;
                    "invoice_number"?: string | null;
                    "job_id"?: string | null;
                    "last_viewed_at"?: string | null;
                    "legacy_customer_id"?: string | null;
                    "organization_id"?: string | null;
                    "paid_at"?: string | null;
                    "payment_preference"?: string | null;
                    "payment_preference_selected_at"?: string | null;
                    "payment_terms"?: string | null;
                    "purchase_order_reference"?: string | null;
                    "quote_id"?: string | null;
                    "recurring_occurrence_id"?: string | null;
                    "recurring_service_plan_id"?: string | null;
                    "sent_at"?: string | null;
                    "service_location_id"?: string | null;
                    "status"?: string;
                    "subtotal_cents"?: number;
                    "tax_cents"?: number;
                    "total_cents"?: number;
                    "updated_at"?: string;
                    "view_count"?: number;
                };
                Relationships: [
                    {
                        foreignKeyName: "invoices_accounts_payable_contact_id_fkey";
                        columns: [
                            "accounts_payable_contact_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organization_contacts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "invoices_archived_by_user_id_fkey";
                        columns: [
                            "archived_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "invoices_archived_by_user_id_fkey";
                        columns: [
                            "archived_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "invoices_billing_contact_id_fkey";
                        columns: [
                            "billing_contact_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organization_contacts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "invoices_customer_id_fkey";
                        columns: [
                            "customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "invoices_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "invoices_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "invoices_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "invoices_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "invoices_legacy_customer_id_fkey";
                        columns: [
                            "legacy_customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "invoices_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "invoices_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "invoices_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "invoices_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "quotes";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "invoices_recurring_occurrence_id_fkey";
                        columns: [
                            "recurring_occurrence_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "recurring_service_occurrences";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "invoices_recurring_service_plan_id_fkey";
                        columns: [
                            "recurring_service_plan_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "recurring_service_plans";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "invoices_service_location_id_fkey";
                        columns: [
                            "service_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_locations";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "job_change_order_scope_items": {
                Row: {
                    "change_order_id": string;
                    "change_order_line_item_id": string;
                    "created_at": string;
                    "description": string | null;
                    "id": string;
                    "job_id": string;
                    "sort_order": number;
                    "title": string;
                };
                ComputedFields: never;
                Insert: {
                    "change_order_id": string;
                    "change_order_line_item_id": string;
                    "created_at"?: string;
                    "description"?: string | null;
                    "id"?: string;
                    "job_id": string;
                    "sort_order"?: number;
                    "title": string;
                };
                Update: {
                    "change_order_id"?: string;
                    "change_order_line_item_id"?: string;
                    "created_at"?: string;
                    "description"?: string | null;
                    "id"?: string;
                    "job_id"?: string;
                    "sort_order"?: number;
                    "title"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "job_change_order_scope_items_change_order_id_fkey";
                        columns: [
                            "change_order_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "change_orders";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_change_order_scope_items_change_order_line_item_id_fkey";
                        columns: [
                            "change_order_line_item_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "change_order_line_items";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_change_order_scope_items_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_change_order_scope_items_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_change_order_scope_items_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_change_order_scope_items_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "job_closeout_checklist_items": {
                Row: {
                    "allow_not_applicable": boolean;
                    "completion_status": string;
                    "created_at": string;
                    "explanation": string | null;
                    "id": string;
                    "is_required": boolean;
                    "item_key": string;
                    "job_id": string;
                    "label": string;
                    "sort_order": number;
                    "updated_at": string;
                    "updated_by_user_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "allow_not_applicable"?: boolean;
                    "completion_status"?: string;
                    "created_at"?: string;
                    "explanation"?: string | null;
                    "id"?: string;
                    "is_required"?: boolean;
                    "item_key": string;
                    "job_id": string;
                    "label": string;
                    "sort_order"?: number;
                    "updated_at"?: string;
                    "updated_by_user_id"?: string | null;
                };
                Update: {
                    "allow_not_applicable"?: boolean;
                    "completion_status"?: string;
                    "created_at"?: string;
                    "explanation"?: string | null;
                    "id"?: string;
                    "is_required"?: boolean;
                    "item_key"?: string;
                    "job_id"?: string;
                    "label"?: string;
                    "sort_order"?: number;
                    "updated_at"?: string;
                    "updated_by_user_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "job_closeout_checklist_items_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeout_checklist_items_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeout_checklist_items_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeout_checklist_items_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeout_checklist_items_updated_by_user_id_fkey";
                        columns: [
                            "updated_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeout_checklist_items_updated_by_user_id_fkey";
                        columns: [
                            "updated_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "job_closeout_scope_items": {
                Row: {
                    "completion_state": string | null;
                    "created_at": string;
                    "description": string | null;
                    "exception_note": string | null;
                    "id": string;
                    "job_id": string;
                    "quote_line_item_id": string | null;
                    "sort_order": number;
                    "source_key": string;
                    "title": string;
                    "updated_at": string;
                    "updated_by_user_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "completion_state"?: string | null;
                    "created_at"?: string;
                    "description"?: string | null;
                    "exception_note"?: string | null;
                    "id"?: string;
                    "job_id": string;
                    "quote_line_item_id"?: string | null;
                    "sort_order"?: number;
                    "source_key": string;
                    "title": string;
                    "updated_at"?: string;
                    "updated_by_user_id"?: string | null;
                };
                Update: {
                    "completion_state"?: string | null;
                    "created_at"?: string;
                    "description"?: string | null;
                    "exception_note"?: string | null;
                    "id"?: string;
                    "job_id"?: string;
                    "quote_line_item_id"?: string | null;
                    "sort_order"?: number;
                    "source_key"?: string;
                    "title"?: string;
                    "updated_at"?: string;
                    "updated_by_user_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "job_closeout_scope_items_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeout_scope_items_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeout_scope_items_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeout_scope_items_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeout_scope_items_quote_line_item_id_fkey";
                        columns: [
                            "quote_line_item_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "quote_line_items";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeout_scope_items_updated_by_user_id_fkey";
                        columns: [
                            "updated_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeout_scope_items_updated_by_user_id_fkey";
                        columns: [
                            "updated_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "job_closeout_submissions": {
                Row: {
                    "closeout_id": string;
                    "id": string;
                    "revision_number": number;
                    "snapshot_json": NonNullable<Json>;
                    "submitted_at": string;
                    "submitted_by_user_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "closeout_id": string;
                    "id"?: string;
                    "revision_number": number;
                    "snapshot_json": NonNullable<Json>;
                    "submitted_at"?: string;
                    "submitted_by_user_id"?: string | null;
                };
                Update: {
                    "closeout_id"?: string;
                    "id"?: string;
                    "revision_number"?: number;
                    "snapshot_json"?: NonNullable<Json>;
                    "submitted_at"?: string;
                    "submitted_by_user_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "job_closeout_submissions_closeout_id_fkey";
                        columns: [
                            "closeout_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_closeouts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeout_submissions_submitted_by_user_id_fkey";
                        columns: [
                            "submitted_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeout_submissions_submitted_by_user_id_fkey";
                        columns: [
                            "submitted_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "job_closeouts": {
                Row: {
                    "acknowledged_at": string | null;
                    "acknowledgment_collected_by_user_id": string | null;
                    "acknowledgment_name": string | null;
                    "acknowledgment_status": string | null;
                    "additional_work_description": string | null;
                    "additional_work_requested": boolean | null;
                    "change_order_id": string | null;
                    "created_at": string;
                    "crew_internal_notes": string | null;
                    "customer_summary": string | null;
                    "future_work_description": string | null;
                    "future_work_recommended": boolean | null;
                    "future_work_timeframe": string | null;
                    "has_additional_work": boolean;
                    "has_incident": boolean;
                    "has_scope_exception": boolean;
                    "id": string;
                    "incident_description": string | null;
                    "incident_occurred": boolean | null;
                    "job_id": string;
                    "reopen_reason": string | null;
                    "reopened_at": string | null;
                    "reopened_by_user_id": string | null;
                    "review_notes": string | null;
                    "reviewed_at": string | null;
                    "reviewed_by_user_id": string | null;
                    "status": string;
                    "submitted_at": string | null;
                    "submitted_by_user_id": string | null;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "acknowledged_at"?: string | null;
                    "acknowledgment_collected_by_user_id"?: string | null;
                    "acknowledgment_name"?: string | null;
                    "acknowledgment_status"?: string | null;
                    "additional_work_description"?: string | null;
                    "additional_work_requested"?: boolean | null;
                    "change_order_id"?: string | null;
                    "created_at"?: string;
                    "crew_internal_notes"?: string | null;
                    "customer_summary"?: string | null;
                    "future_work_description"?: string | null;
                    "future_work_recommended"?: boolean | null;
                    "future_work_timeframe"?: string | null;
                    "has_additional_work"?: boolean;
                    "has_incident"?: boolean;
                    "has_scope_exception"?: boolean;
                    "id"?: string;
                    "incident_description"?: string | null;
                    "incident_occurred"?: boolean | null;
                    "job_id": string;
                    "reopen_reason"?: string | null;
                    "reopened_at"?: string | null;
                    "reopened_by_user_id"?: string | null;
                    "review_notes"?: string | null;
                    "reviewed_at"?: string | null;
                    "reviewed_by_user_id"?: string | null;
                    "status"?: string;
                    "submitted_at"?: string | null;
                    "submitted_by_user_id"?: string | null;
                    "updated_at"?: string;
                };
                Update: {
                    "acknowledged_at"?: string | null;
                    "acknowledgment_collected_by_user_id"?: string | null;
                    "acknowledgment_name"?: string | null;
                    "acknowledgment_status"?: string | null;
                    "additional_work_description"?: string | null;
                    "additional_work_requested"?: boolean | null;
                    "change_order_id"?: string | null;
                    "created_at"?: string;
                    "crew_internal_notes"?: string | null;
                    "customer_summary"?: string | null;
                    "future_work_description"?: string | null;
                    "future_work_recommended"?: boolean | null;
                    "future_work_timeframe"?: string | null;
                    "has_additional_work"?: boolean;
                    "has_incident"?: boolean;
                    "has_scope_exception"?: boolean;
                    "id"?: string;
                    "incident_description"?: string | null;
                    "incident_occurred"?: boolean | null;
                    "job_id"?: string;
                    "reopen_reason"?: string | null;
                    "reopened_at"?: string | null;
                    "reopened_by_user_id"?: string | null;
                    "review_notes"?: string | null;
                    "reviewed_at"?: string | null;
                    "reviewed_by_user_id"?: string | null;
                    "status"?: string;
                    "submitted_at"?: string | null;
                    "submitted_by_user_id"?: string | null;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "job_closeouts_acknowledgment_collected_by_user_id_fkey";
                        columns: [
                            "acknowledgment_collected_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeouts_acknowledgment_collected_by_user_id_fkey";
                        columns: [
                            "acknowledgment_collected_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeouts_change_order_id_fkey";
                        columns: [
                            "change_order_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "change_orders";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeouts_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeouts_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeouts_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeouts_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeouts_reopened_by_user_id_fkey";
                        columns: [
                            "reopened_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeouts_reopened_by_user_id_fkey";
                        columns: [
                            "reopened_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeouts_reviewed_by_user_id_fkey";
                        columns: [
                            "reviewed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeouts_reviewed_by_user_id_fkey";
                        columns: [
                            "reviewed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeouts_submitted_by_user_id_fkey";
                        columns: [
                            "submitted_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_closeouts_submitted_by_user_id_fkey";
                        columns: [
                            "submitted_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "job_cost_entries": {
                Row: {
                    "amount_cents": number;
                    "archived_at": string | null;
                    "category": string;
                    "created_at": string;
                    "description": string;
                    "id": string;
                    "incurred_on": string;
                    "job_id": string;
                    "notes": string | null;
                    "receipt_storage_path": string | null;
                    "review_notes": string | null;
                    "review_status": string;
                    "reviewed_at": string | null;
                    "reviewed_by_user_id": string | null;
                    "submitted_by_user_id": string;
                    "supersedes_cost_id": string | null;
                    "updated_at": string;
                    "vendor_name": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "amount_cents": number;
                    "archived_at"?: string | null;
                    "category": string;
                    "created_at"?: string;
                    "description": string;
                    "id"?: string;
                    "incurred_on"?: string;
                    "job_id": string;
                    "notes"?: string | null;
                    "receipt_storage_path"?: string | null;
                    "review_notes"?: string | null;
                    "review_status"?: string;
                    "reviewed_at"?: string | null;
                    "reviewed_by_user_id"?: string | null;
                    "submitted_by_user_id": string;
                    "supersedes_cost_id"?: string | null;
                    "updated_at"?: string;
                    "vendor_name"?: string | null;
                };
                Update: {
                    "amount_cents"?: number;
                    "archived_at"?: string | null;
                    "category"?: string;
                    "created_at"?: string;
                    "description"?: string;
                    "id"?: string;
                    "incurred_on"?: string;
                    "job_id"?: string;
                    "notes"?: string | null;
                    "receipt_storage_path"?: string | null;
                    "review_notes"?: string | null;
                    "review_status"?: string;
                    "reviewed_at"?: string | null;
                    "reviewed_by_user_id"?: string | null;
                    "submitted_by_user_id"?: string;
                    "supersedes_cost_id"?: string | null;
                    "updated_at"?: string;
                    "vendor_name"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "job_cost_entries_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_cost_entries_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_cost_entries_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_cost_entries_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_cost_entries_reviewed_by_user_id_fkey";
                        columns: [
                            "reviewed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_cost_entries_reviewed_by_user_id_fkey";
                        columns: [
                            "reviewed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_cost_entries_submitted_by_user_id_fkey";
                        columns: [
                            "submitted_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_cost_entries_submitted_by_user_id_fkey";
                        columns: [
                            "submitted_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_cost_entries_supersedes_cost_id_fkey";
                        columns: [
                            "supersedes_cost_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_cost_entries";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "job_equipment_usage": {
                Row: {
                    "asset_id": string;
                    "calculated_cost_cents": number;
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "daily_cost_cents_snapshot": number | null;
                    "hourly_cost_cents_snapshot": number | null;
                    "id": string;
                    "job_id": string;
                    "notes": string | null;
                    "updated_at": string;
                    "usage_date": string;
                    "usage_days": number | null;
                    "usage_hours": number | null;
                };
                ComputedFields: never;
                Insert: {
                    "asset_id": string;
                    "calculated_cost_cents"?: number;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "daily_cost_cents_snapshot"?: number | null;
                    "hourly_cost_cents_snapshot"?: number | null;
                    "id"?: string;
                    "job_id": string;
                    "notes"?: string | null;
                    "updated_at"?: string;
                    "usage_date"?: string;
                    "usage_days"?: number | null;
                    "usage_hours"?: number | null;
                };
                Update: {
                    "asset_id"?: string;
                    "calculated_cost_cents"?: number;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "daily_cost_cents_snapshot"?: number | null;
                    "hourly_cost_cents_snapshot"?: number | null;
                    "id"?: string;
                    "job_id"?: string;
                    "notes"?: string | null;
                    "updated_at"?: string;
                    "usage_date"?: string;
                    "usage_days"?: number | null;
                    "usage_hours"?: number | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "job_equipment_usage_asset_id_fkey";
                        columns: [
                            "asset_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_assets";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_equipment_usage_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_equipment_usage_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_equipment_usage_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_equipment_usage_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_equipment_usage_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_equipment_usage_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "job_material_requirements": {
                Row: {
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "id": string;
                    "is_estimated": boolean;
                    "job_id": string;
                    "material_id": string;
                    "notes": string | null;
                    "planned_quantity": number;
                    "source_change_order_line_item_id": string | null;
                    "source_quote_requirement_id": string | null;
                    "unit": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "id"?: string;
                    "is_estimated"?: boolean;
                    "job_id": string;
                    "material_id": string;
                    "notes"?: string | null;
                    "planned_quantity": number;
                    "source_change_order_line_item_id"?: string | null;
                    "source_quote_requirement_id"?: string | null;
                    "unit": string;
                    "updated_at"?: string;
                };
                Update: {
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "id"?: string;
                    "is_estimated"?: boolean;
                    "job_id"?: string;
                    "material_id"?: string;
                    "notes"?: string | null;
                    "planned_quantity"?: number;
                    "source_change_order_line_item_id"?: string | null;
                    "source_quote_requirement_id"?: string | null;
                    "unit"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "job_material_requirements_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_material_requirements_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_material_requirements_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_material_requirements_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_material_requirements_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_material_requirements_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_material_requirements_material_id_fkey";
                        columns: [
                            "material_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "material_catalog";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_material_requirements_source_change_order_line_item_id_fkey";
                        columns: [
                            "source_change_order_line_item_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "change_order_line_items";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_material_requirements_source_quote_requirement_id_fkey";
                        columns: [
                            "source_quote_requirement_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "quote_material_requirements";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "job_photos": {
                Row: {
                    "caption": string | null;
                    "created_at": string;
                    "id": string;
                    "job_id": string;
                    "photo_type": string;
                    "storage_path": string;
                    "updated_at": string;
                    "uploaded_by_user_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "caption"?: string | null;
                    "created_at"?: string;
                    "id"?: string;
                    "job_id": string;
                    "photo_type"?: string;
                    "storage_path": string;
                    "updated_at"?: string;
                    "uploaded_by_user_id"?: string | null;
                };
                Update: {
                    "caption"?: string | null;
                    "created_at"?: string;
                    "id"?: string;
                    "job_id"?: string;
                    "photo_type"?: string;
                    "storage_path"?: string;
                    "updated_at"?: string;
                    "uploaded_by_user_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "job_photos_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_photos_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_photos_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_photos_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_photos_uploaded_by_user_id_fkey";
                        columns: [
                            "uploaded_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "job_photos_uploaded_by_user_id_fkey";
                        columns: [
                            "uploaded_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "jobs": {
                Row: {
                    "archived_at": string | null;
                    "archived_by_user_id": string | null;
                    "assigned_crew_employee_id": string | null;
                    "assigned_crew_user_id": string | null;
                    "completed_at": string | null;
                    "completed_by_user_id": string | null;
                    "completion_revision": number;
                    "created_at": string;
                    "customer_id": string | null;
                    "debris_handling": string | null;
                    "debris_handling_notes": string | null;
                    "duplicate_of_job_id": string | null;
                    "id": string;
                    "internal_notes": string | null;
                    "lead_campaign": string | null;
                    "lead_disposition": string;
                    "lead_source_id": string | null;
                    "legacy_customer_id": string | null;
                    "lost_reason": string | null;
                    "notification_attempt_id": string | null;
                    "notification_error": string | null;
                    "notification_outcome": string | null;
                    "notification_started_at": string | null;
                    "notification_status": string;
                    "onsite_contact_id": string | null;
                    "organization_id": string | null;
                    "preferred_appointment_timing": string | null;
                    "preferred_contact_method": string | null;
                    "priority": string;
                    "projected_value_cents": number;
                    "property_manager_contact_id": string | null;
                    "recurring_authorization_source": string | null;
                    "recurring_occurrence_id": string | null;
                    "recurring_service_plan_id": string | null;
                    "requested_scope": string | null;
                    "scheduled_end_at": string | null;
                    "scheduled_start_at": string | null;
                    "service_location_id": string;
                    "service_type": string | null;
                    "source_detail": string | null;
                    "source_page_url": string | null;
                    "source_quote_id": string | null;
                    "source_referrer_url": string | null;
                    "started_at": string | null;
                    "started_by_user_id": string | null;
                    "status": string;
                    "submitted_at": string;
                    "updated_at": string;
                    "utm_campaign": string | null;
                    "utm_content": string | null;
                    "utm_medium": string | null;
                    "utm_source": string | null;
                    "utm_term": string | null;
                    "website_request_fingerprint": string | null;
                    "website_submission_id": string | null;
                    "website_submission_payload_hash": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "archived_at"?: string | null;
                    "archived_by_user_id"?: string | null;
                    "assigned_crew_employee_id"?: string | null;
                    "assigned_crew_user_id"?: string | null;
                    "completed_at"?: string | null;
                    "completed_by_user_id"?: string | null;
                    "completion_revision"?: number;
                    "created_at"?: string;
                    "customer_id"?: string | null;
                    "debris_handling"?: string | null;
                    "debris_handling_notes"?: string | null;
                    "duplicate_of_job_id"?: string | null;
                    "id"?: string;
                    "internal_notes"?: string | null;
                    "lead_campaign"?: string | null;
                    "lead_disposition"?: string;
                    "lead_source_id"?: string | null;
                    "legacy_customer_id"?: string | null;
                    "lost_reason"?: string | null;
                    "notification_attempt_id"?: string | null;
                    "notification_error"?: string | null;
                    "notification_outcome"?: string | null;
                    "notification_started_at"?: string | null;
                    "notification_status"?: string;
                    "onsite_contact_id"?: string | null;
                    "organization_id"?: string | null;
                    "preferred_appointment_timing"?: string | null;
                    "preferred_contact_method"?: string | null;
                    "priority"?: string;
                    "projected_value_cents"?: number;
                    "property_manager_contact_id"?: string | null;
                    "recurring_authorization_source"?: string | null;
                    "recurring_occurrence_id"?: string | null;
                    "recurring_service_plan_id"?: string | null;
                    "requested_scope"?: string | null;
                    "scheduled_end_at"?: string | null;
                    "scheduled_start_at"?: string | null;
                    "service_location_id": string;
                    "service_type"?: string | null;
                    "source_detail"?: string | null;
                    "source_page_url"?: string | null;
                    "source_quote_id"?: string | null;
                    "source_referrer_url"?: string | null;
                    "started_at"?: string | null;
                    "started_by_user_id"?: string | null;
                    "status"?: string;
                    "submitted_at"?: string;
                    "updated_at"?: string;
                    "utm_campaign"?: string | null;
                    "utm_content"?: string | null;
                    "utm_medium"?: string | null;
                    "utm_source"?: string | null;
                    "utm_term"?: string | null;
                    "website_request_fingerprint"?: string | null;
                    "website_submission_id"?: string | null;
                    "website_submission_payload_hash"?: string | null;
                };
                Update: {
                    "archived_at"?: string | null;
                    "archived_by_user_id"?: string | null;
                    "assigned_crew_employee_id"?: string | null;
                    "assigned_crew_user_id"?: string | null;
                    "completed_at"?: string | null;
                    "completed_by_user_id"?: string | null;
                    "completion_revision"?: number;
                    "created_at"?: string;
                    "customer_id"?: string | null;
                    "debris_handling"?: string | null;
                    "debris_handling_notes"?: string | null;
                    "duplicate_of_job_id"?: string | null;
                    "id"?: string;
                    "internal_notes"?: string | null;
                    "lead_campaign"?: string | null;
                    "lead_disposition"?: string;
                    "lead_source_id"?: string | null;
                    "legacy_customer_id"?: string | null;
                    "lost_reason"?: string | null;
                    "notification_attempt_id"?: string | null;
                    "notification_error"?: string | null;
                    "notification_outcome"?: string | null;
                    "notification_started_at"?: string | null;
                    "notification_status"?: string;
                    "onsite_contact_id"?: string | null;
                    "organization_id"?: string | null;
                    "preferred_appointment_timing"?: string | null;
                    "preferred_contact_method"?: string | null;
                    "priority"?: string;
                    "projected_value_cents"?: number;
                    "property_manager_contact_id"?: string | null;
                    "recurring_authorization_source"?: string | null;
                    "recurring_occurrence_id"?: string | null;
                    "recurring_service_plan_id"?: string | null;
                    "requested_scope"?: string | null;
                    "scheduled_end_at"?: string | null;
                    "scheduled_start_at"?: string | null;
                    "service_location_id"?: string;
                    "service_type"?: string | null;
                    "source_detail"?: string | null;
                    "source_page_url"?: string | null;
                    "source_quote_id"?: string | null;
                    "source_referrer_url"?: string | null;
                    "started_at"?: string | null;
                    "started_by_user_id"?: string | null;
                    "status"?: string;
                    "submitted_at"?: string;
                    "updated_at"?: string;
                    "utm_campaign"?: string | null;
                    "utm_content"?: string | null;
                    "utm_medium"?: string | null;
                    "utm_source"?: string | null;
                    "utm_term"?: string | null;
                    "website_request_fingerprint"?: string | null;
                    "website_submission_id"?: string | null;
                    "website_submission_payload_hash"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "jobs_archived_by_user_id_fkey";
                        columns: [
                            "archived_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_archived_by_user_id_fkey";
                        columns: [
                            "archived_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_assigned_crew_employee_id_fkey";
                        columns: [
                            "assigned_crew_employee_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "employee_records";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_assigned_crew_user_id_fkey";
                        columns: [
                            "assigned_crew_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_assigned_crew_user_id_fkey";
                        columns: [
                            "assigned_crew_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_completed_by_user_id_fkey";
                        columns: [
                            "completed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_completed_by_user_id_fkey";
                        columns: [
                            "completed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_customer_id_fkey";
                        columns: [
                            "customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_duplicate_of_job_id_fkey";
                        columns: [
                            "duplicate_of_job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_duplicate_of_job_id_fkey";
                        columns: [
                            "duplicate_of_job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_duplicate_of_job_id_fkey";
                        columns: [
                            "duplicate_of_job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_duplicate_of_job_id_fkey";
                        columns: [
                            "duplicate_of_job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_lead_source_id_fkey";
                        columns: [
                            "lead_source_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "lead_sources";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_legacy_customer_id_fkey";
                        columns: [
                            "legacy_customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_onsite_contact_id_fkey";
                        columns: [
                            "onsite_contact_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organization_contacts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_property_manager_contact_id_fkey";
                        columns: [
                            "property_manager_contact_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organization_contacts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_recurring_occurrence_id_fkey";
                        columns: [
                            "recurring_occurrence_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "recurring_service_occurrences";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_recurring_service_plan_id_fkey";
                        columns: [
                            "recurring_service_plan_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "recurring_service_plans";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_service_location_id_fkey";
                        columns: [
                            "service_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_locations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_source_quote_id_fkey";
                        columns: [
                            "source_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_source_quote_id_fkey";
                        columns: [
                            "source_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_source_quote_id_fkey";
                        columns: [
                            "source_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "quotes";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_started_by_user_id_fkey";
                        columns: [
                            "started_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_started_by_user_id_fkey";
                        columns: [
                            "started_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "lead_sources": {
                Row: {
                    "created_at": string;
                    "id": string;
                    "is_active": boolean;
                    "name": string;
                    "source_type": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "id"?: string;
                    "is_active"?: boolean;
                    "name": string;
                    "source_type"?: string;
                    "updated_at"?: string;
                };
                Update: {
                    "created_at"?: string;
                    "id"?: string;
                    "is_active"?: boolean;
                    "name"?: string;
                    "source_type"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                ];
            };
            "material_catalog": {
                Row: {
                    "archived_at": string | null;
                    "category": string;
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "default_price_cents": number | null;
                    "default_unit": string;
                    "description": string | null;
                    "id": string;
                    "is_active": boolean;
                    "is_billable": boolean;
                    "name": string;
                    "notes": string | null;
                    "preferred_vendor_organization_id": string | null;
                    "reorder_threshold": number | null;
                    "sku": string | null;
                    "stock_tracked": boolean;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "archived_at"?: string | null;
                    "category": string;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "default_price_cents"?: number | null;
                    "default_unit": string;
                    "description"?: string | null;
                    "id"?: string;
                    "is_active"?: boolean;
                    "is_billable"?: boolean;
                    "name": string;
                    "notes"?: string | null;
                    "preferred_vendor_organization_id"?: string | null;
                    "reorder_threshold"?: number | null;
                    "sku"?: string | null;
                    "stock_tracked"?: boolean;
                    "updated_at"?: string;
                };
                Update: {
                    "archived_at"?: string | null;
                    "category"?: string;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "default_price_cents"?: number | null;
                    "default_unit"?: string;
                    "description"?: string | null;
                    "id"?: string;
                    "is_active"?: boolean;
                    "is_billable"?: boolean;
                    "name"?: string;
                    "notes"?: string | null;
                    "preferred_vendor_organization_id"?: string | null;
                    "reorder_threshold"?: number | null;
                    "sku"?: string | null;
                    "stock_tracked"?: boolean;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "material_catalog_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_catalog_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_catalog_preferred_vendor_organization_id_fkey";
                        columns: [
                            "preferred_vendor_organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "material_cost_settings": {
                Row: {
                    "costing_method": string;
                    "created_at": string;
                    "internal_unit_cost_cents": number | null;
                    "material_id": string;
                    "pricing_notes": string | null;
                    "updated_at": string;
                    "updated_by_user_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "costing_method"?: string;
                    "created_at"?: string;
                    "internal_unit_cost_cents"?: number | null;
                    "material_id": string;
                    "pricing_notes"?: string | null;
                    "updated_at"?: string;
                    "updated_by_user_id"?: string | null;
                };
                Update: {
                    "costing_method"?: string;
                    "created_at"?: string;
                    "internal_unit_cost_cents"?: number | null;
                    "material_id"?: string;
                    "pricing_notes"?: string | null;
                    "updated_at"?: string;
                    "updated_by_user_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "material_cost_settings_material_id_fkey";
                        columns: [
                            "material_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "material_catalog";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_cost_settings_updated_by_user_id_fkey";
                        columns: [
                            "updated_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_cost_settings_updated_by_user_id_fkey";
                        columns: [
                            "updated_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "material_loads": {
                Row: {
                    "arrived_at": string | null;
                    "chipper_asset_id": string | null;
                    "created_at": string;
                    "created_by_user_id": string;
                    "departed_at": string | null;
                    "destination_location_id": string | null;
                    "destination_name": string | null;
                    "destination_type": string;
                    "driver_user_id": string | null;
                    "id": string;
                    "inventory_transaction_id": string | null;
                    "is_estimated": boolean;
                    "job_id": string | null;
                    "material_id": string;
                    "notes": string | null;
                    "proof_storage_path": string | null;
                    "quantity": number;
                    "source_location_id": string | null;
                    "trailer_asset_id": string | null;
                    "unit": string;
                    "updated_at": string;
                    "vehicle_asset_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "arrived_at"?: string | null;
                    "chipper_asset_id"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id": string;
                    "departed_at"?: string | null;
                    "destination_location_id"?: string | null;
                    "destination_name"?: string | null;
                    "destination_type"?: string;
                    "driver_user_id"?: string | null;
                    "id"?: string;
                    "inventory_transaction_id"?: string | null;
                    "is_estimated"?: boolean;
                    "job_id"?: string | null;
                    "material_id": string;
                    "notes"?: string | null;
                    "proof_storage_path"?: string | null;
                    "quantity": number;
                    "source_location_id"?: string | null;
                    "trailer_asset_id"?: string | null;
                    "unit": string;
                    "updated_at"?: string;
                    "vehicle_asset_id"?: string | null;
                };
                Update: {
                    "arrived_at"?: string | null;
                    "chipper_asset_id"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string;
                    "departed_at"?: string | null;
                    "destination_location_id"?: string | null;
                    "destination_name"?: string | null;
                    "destination_type"?: string;
                    "driver_user_id"?: string | null;
                    "id"?: string;
                    "inventory_transaction_id"?: string | null;
                    "is_estimated"?: boolean;
                    "job_id"?: string | null;
                    "material_id"?: string;
                    "notes"?: string | null;
                    "proof_storage_path"?: string | null;
                    "quantity"?: number;
                    "source_location_id"?: string | null;
                    "trailer_asset_id"?: string | null;
                    "unit"?: string;
                    "updated_at"?: string;
                    "vehicle_asset_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "material_loads_chipper_asset_id_fkey";
                        columns: [
                            "chipper_asset_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_assets";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_loads_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_loads_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_loads_destination_location_id_fkey";
                        columns: [
                            "destination_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "inventory_locations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_loads_driver_user_id_fkey";
                        columns: [
                            "driver_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_loads_driver_user_id_fkey";
                        columns: [
                            "driver_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_loads_inventory_transaction_id_fkey";
                        columns: [
                            "inventory_transaction_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "inventory_transactions";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_loads_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_loads_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_loads_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_loads_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_loads_material_id_fkey";
                        columns: [
                            "material_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "material_catalog";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_loads_source_location_id_fkey";
                        columns: [
                            "source_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "inventory_locations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_loads_trailer_asset_id_fkey";
                        columns: [
                            "trailer_asset_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_assets";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_loads_vehicle_asset_id_fkey";
                        columns: [
                            "vehicle_asset_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_assets";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "material_purchase_items": {
                Row: {
                    "created_at": string;
                    "id": string;
                    "inventory_transaction_id": string | null;
                    "line_total_cents": number;
                    "material_id": string;
                    "purchase_id": string;
                    "quantity": number;
                    "unit": string;
                    "unit_cost_cents": number;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "id"?: string;
                    "inventory_transaction_id"?: string | null;
                    "line_total_cents": number;
                    "material_id": string;
                    "purchase_id": string;
                    "quantity": number;
                    "unit": string;
                    "unit_cost_cents": number;
                    "updated_at"?: string;
                };
                Update: {
                    "created_at"?: string;
                    "id"?: string;
                    "inventory_transaction_id"?: string | null;
                    "line_total_cents"?: number;
                    "material_id"?: string;
                    "purchase_id"?: string;
                    "quantity"?: number;
                    "unit"?: string;
                    "unit_cost_cents"?: number;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "material_purchase_items_inventory_transaction_id_fkey";
                        columns: [
                            "inventory_transaction_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "inventory_transactions";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_purchase_items_material_id_fkey";
                        columns: [
                            "material_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "material_catalog";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_purchase_items_purchase_id_fkey";
                        columns: [
                            "purchase_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "material_purchases";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "material_purchases": {
                Row: {
                    "created_at": string;
                    "created_by_user_id": string;
                    "delivery_charge_cents": number;
                    "id": string;
                    "idempotency_key": string;
                    "notes": string | null;
                    "purchase_date": string;
                    "purchase_order_reference": string | null;
                    "receipt_storage_path": string | null;
                    "received_by_user_id": string | null;
                    "received_location_id": string | null;
                    "taxes_fees_cents": number;
                    "total_cents": number;
                    "updated_at": string;
                    "vendor_name": string | null;
                    "vendor_organization_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "created_by_user_id": string;
                    "delivery_charge_cents"?: number;
                    "id"?: string;
                    "idempotency_key": string;
                    "notes"?: string | null;
                    "purchase_date"?: string;
                    "purchase_order_reference"?: string | null;
                    "receipt_storage_path"?: string | null;
                    "received_by_user_id"?: string | null;
                    "received_location_id"?: string | null;
                    "taxes_fees_cents"?: number;
                    "total_cents"?: number;
                    "updated_at"?: string;
                    "vendor_name"?: string | null;
                    "vendor_organization_id"?: string | null;
                };
                Update: {
                    "created_at"?: string;
                    "created_by_user_id"?: string;
                    "delivery_charge_cents"?: number;
                    "id"?: string;
                    "idempotency_key"?: string;
                    "notes"?: string | null;
                    "purchase_date"?: string;
                    "purchase_order_reference"?: string | null;
                    "receipt_storage_path"?: string | null;
                    "received_by_user_id"?: string | null;
                    "received_location_id"?: string | null;
                    "taxes_fees_cents"?: number;
                    "total_cents"?: number;
                    "updated_at"?: string;
                    "vendor_name"?: string | null;
                    "vendor_organization_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "material_purchases_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_purchases_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_purchases_received_by_user_id_fkey";
                        columns: [
                            "received_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_purchases_received_by_user_id_fkey";
                        columns: [
                            "received_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_purchases_received_location_id_fkey";
                        columns: [
                            "received_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "inventory_locations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "material_purchases_vendor_organization_id_fkey";
                        columns: [
                            "vendor_organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "notes": {
                Row: {
                    "author_user_id": string | null;
                    "body": string;
                    "created_at": string;
                    "customer_id": string | null;
                    "id": string;
                    "job_id": string | null;
                    "service_location_id": string | null;
                    "updated_at": string;
                    "visibility": string;
                };
                ComputedFields: never;
                Insert: {
                    "author_user_id"?: string | null;
                    "body": string;
                    "created_at"?: string;
                    "customer_id"?: string | null;
                    "id"?: string;
                    "job_id"?: string | null;
                    "service_location_id"?: string | null;
                    "updated_at"?: string;
                    "visibility"?: string;
                };
                Update: {
                    "author_user_id"?: string | null;
                    "body"?: string;
                    "created_at"?: string;
                    "customer_id"?: string | null;
                    "id"?: string;
                    "job_id"?: string | null;
                    "service_location_id"?: string | null;
                    "updated_at"?: string;
                    "visibility"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "notes_author_user_id_fkey";
                        columns: [
                            "author_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "notes_author_user_id_fkey";
                        columns: [
                            "author_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "notes_customer_id_fkey";
                        columns: [
                            "customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "notes_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "notes_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "notes_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "notes_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "notes_service_location_id_fkey";
                        columns: [
                            "service_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_locations";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "onboarding_templates": {
                Row: {
                    "created_at": string;
                    "description": string | null;
                    "id": string;
                    "is_active": boolean;
                    "is_required": boolean;
                    "item_key": string;
                    "label": string;
                    "sort_order": number;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "description"?: string | null;
                    "id"?: string;
                    "is_active"?: boolean;
                    "is_required"?: boolean;
                    "item_key": string;
                    "label": string;
                    "sort_order"?: number;
                    "updated_at"?: string;
                };
                Update: {
                    "created_at"?: string;
                    "description"?: string | null;
                    "id"?: string;
                    "is_active"?: boolean;
                    "is_required"?: boolean;
                    "item_key"?: string;
                    "label"?: string;
                    "sort_order"?: number;
                    "updated_at"?: string;
                };
                Relationships: [
                ];
            };
            "organization_contacts": {
                Row: {
                    "contact_roles": (string)[];
                    "created_at": string;
                    "email": string | null;
                    "full_name": string;
                    "id": string;
                    "is_active": boolean;
                    "notes": string | null;
                    "organization_id": string;
                    "phone": string | null;
                    "preferred_contact_method": string | null;
                    "receives_invoices": boolean;
                    "receives_job_updates": boolean;
                    "role_title": string | null;
                    "service_location_id": string | null;
                    "updated_at": string;
                    "user_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "contact_roles"?: (string)[];
                    "created_at"?: string;
                    "email"?: string | null;
                    "full_name": string;
                    "id"?: string;
                    "is_active"?: boolean;
                    "notes"?: string | null;
                    "organization_id": string;
                    "phone"?: string | null;
                    "preferred_contact_method"?: string | null;
                    "receives_invoices"?: boolean;
                    "receives_job_updates"?: boolean;
                    "role_title"?: string | null;
                    "service_location_id"?: string | null;
                    "updated_at"?: string;
                    "user_id"?: string | null;
                };
                Update: {
                    "contact_roles"?: (string)[];
                    "created_at"?: string;
                    "email"?: string | null;
                    "full_name"?: string;
                    "id"?: string;
                    "is_active"?: boolean;
                    "notes"?: string | null;
                    "organization_id"?: string;
                    "phone"?: string | null;
                    "preferred_contact_method"?: string | null;
                    "receives_invoices"?: boolean;
                    "receives_job_updates"?: boolean;
                    "role_title"?: string | null;
                    "service_location_id"?: string | null;
                    "updated_at"?: string;
                    "user_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "organization_contacts_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "organization_contacts_service_location_id_fkey";
                        columns: [
                            "service_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_locations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "organization_contacts_user_id_fkey";
                        columns: [
                            "user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "organization_contacts_user_id_fkey";
                        columns: [
                            "user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "organizations": {
                Row: {
                    "archived_at": string | null;
                    "archived_by_user_id": string | null;
                    "billing_address": string | null;
                    "billing_email": string | null;
                    "billing_phone": string | null;
                    "created_at": string;
                    "id": string;
                    "name": string;
                    "notes": string | null;
                    "organization_type": string;
                    "payment_terms": string | null;
                    "status": string;
                    "tax_exempt": boolean;
                    "tax_reference": string | null;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "archived_at"?: string | null;
                    "archived_by_user_id"?: string | null;
                    "billing_address"?: string | null;
                    "billing_email"?: string | null;
                    "billing_phone"?: string | null;
                    "created_at"?: string;
                    "id"?: string;
                    "name": string;
                    "notes"?: string | null;
                    "organization_type"?: string;
                    "payment_terms"?: string | null;
                    "status"?: string;
                    "tax_exempt"?: boolean;
                    "tax_reference"?: string | null;
                    "updated_at"?: string;
                };
                Update: {
                    "archived_at"?: string | null;
                    "archived_by_user_id"?: string | null;
                    "billing_address"?: string | null;
                    "billing_email"?: string | null;
                    "billing_phone"?: string | null;
                    "created_at"?: string;
                    "id"?: string;
                    "name"?: string;
                    "notes"?: string | null;
                    "organization_type"?: string;
                    "payment_terms"?: string | null;
                    "status"?: string;
                    "tax_exempt"?: boolean;
                    "tax_reference"?: string | null;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "organizations_archived_by_user_id_fkey";
                        columns: [
                            "archived_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "organizations_archived_by_user_id_fkey";
                        columns: [
                            "archived_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "pay_periods": {
                Row: {
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "ends_at": string;
                    "id": string;
                    "notes": string | null;
                    "starts_at": string;
                    "status": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "ends_at": string;
                    "id"?: string;
                    "notes"?: string | null;
                    "starts_at": string;
                    "status"?: string;
                    "updated_at"?: string;
                };
                Update: {
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "ends_at"?: string;
                    "id"?: string;
                    "notes"?: string | null;
                    "starts_at"?: string;
                    "status"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "pay_periods_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "pay_periods_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "payments": {
                Row: {
                    "amount_cents": number;
                    "authorized_at": string | null;
                    "card_brand": string | null;
                    "card_funding_type": string | null;
                    "created_at": string;
                    "currency": string;
                    "customer_id": string | null;
                    "dispute_closed_at": string | null;
                    "dispute_event_created_at": string | null;
                    "dispute_principal_restored_at": string | null;
                    "dispute_status": string | null;
                    "disputed_at": string | null;
                    "disputed_gross_cents": number;
                    "disputed_principal_cents": number;
                    "disputed_surcharge_cents": number;
                    "failed_at": string | null;
                    "id": string;
                    "invoice_id": string;
                    "net_received_cents": number | null;
                    "notes": string | null;
                    "organization_id": string | null;
                    "paid_at": string | null;
                    "payment_method": string | null;
                    "provider": string | null;
                    "provider_charge_id": string | null;
                    "provider_checkout_session_id": string | null;
                    "provider_dispute_id": string | null;
                    "provider_payment_id": string | null;
                    "reference": string | null;
                    "refunded_at": string | null;
                    "refunded_principal_cents": number;
                    "refunded_surcharge_cents": number;
                    "status": string;
                    "stripe_fee_cents": number | null;
                    "submitted_at": string | null;
                    "succeeded_at": string | null;
                    "surcharge_cents": number;
                    "total_collected_cents": number;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "amount_cents": number;
                    "authorized_at"?: string | null;
                    "card_brand"?: string | null;
                    "card_funding_type"?: string | null;
                    "created_at"?: string;
                    "currency"?: string;
                    "customer_id"?: string | null;
                    "dispute_closed_at"?: string | null;
                    "dispute_event_created_at"?: string | null;
                    "dispute_principal_restored_at"?: string | null;
                    "dispute_status"?: string | null;
                    "disputed_at"?: string | null;
                    "disputed_gross_cents"?: number;
                    "disputed_principal_cents"?: number;
                    "disputed_surcharge_cents"?: number;
                    "failed_at"?: string | null;
                    "id"?: string;
                    "invoice_id": string;
                    "net_received_cents"?: number | null;
                    "notes"?: string | null;
                    "organization_id"?: string | null;
                    "paid_at"?: string | null;
                    "payment_method"?: string | null;
                    "provider"?: string | null;
                    "provider_charge_id"?: string | null;
                    "provider_checkout_session_id"?: string | null;
                    "provider_dispute_id"?: string | null;
                    "provider_payment_id"?: string | null;
                    "reference"?: string | null;
                    "refunded_at"?: string | null;
                    "refunded_principal_cents"?: number;
                    "refunded_surcharge_cents"?: number;
                    "status"?: string;
                    "stripe_fee_cents"?: number | null;
                    "submitted_at"?: string | null;
                    "succeeded_at"?: string | null;
                    "surcharge_cents"?: number;
                    "total_collected_cents": number;
                    "updated_at"?: string;
                };
                Update: {
                    "amount_cents"?: number;
                    "authorized_at"?: string | null;
                    "card_brand"?: string | null;
                    "card_funding_type"?: string | null;
                    "created_at"?: string;
                    "currency"?: string;
                    "customer_id"?: string | null;
                    "dispute_closed_at"?: string | null;
                    "dispute_event_created_at"?: string | null;
                    "dispute_principal_restored_at"?: string | null;
                    "dispute_status"?: string | null;
                    "disputed_at"?: string | null;
                    "disputed_gross_cents"?: number;
                    "disputed_principal_cents"?: number;
                    "disputed_surcharge_cents"?: number;
                    "failed_at"?: string | null;
                    "id"?: string;
                    "invoice_id"?: string;
                    "net_received_cents"?: number | null;
                    "notes"?: string | null;
                    "organization_id"?: string | null;
                    "paid_at"?: string | null;
                    "payment_method"?: string | null;
                    "provider"?: string | null;
                    "provider_charge_id"?: string | null;
                    "provider_checkout_session_id"?: string | null;
                    "provider_dispute_id"?: string | null;
                    "provider_payment_id"?: string | null;
                    "reference"?: string | null;
                    "refunded_at"?: string | null;
                    "refunded_principal_cents"?: number;
                    "refunded_surcharge_cents"?: number;
                    "status"?: string;
                    "stripe_fee_cents"?: number | null;
                    "submitted_at"?: string | null;
                    "succeeded_at"?: string | null;
                    "surcharge_cents"?: number;
                    "total_collected_cents"?: number;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "payments_customer_id_fkey";
                        columns: [
                            "customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "payments_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "invoices";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "payments_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    },
                    {
                        foreignKeyName: "payments_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    },
                    {
                        foreignKeyName: "payments_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "portal_view_events": {
                Row: {
                    "created_at": string;
                    "customer_id": string | null;
                    "document_id": string;
                    "document_type": string;
                    "id": string;
                    "organization_id": string | null;
                    "referrer_domain": string | null;
                    "user_agent_family": string | null;
                    "viewed_at": string;
                    "visitor_session_id": string;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "customer_id"?: string | null;
                    "document_id": string;
                    "document_type": string;
                    "id"?: string;
                    "organization_id"?: string | null;
                    "referrer_domain"?: string | null;
                    "user_agent_family"?: string | null;
                    "viewed_at"?: string;
                    "visitor_session_id": string;
                };
                Update: {
                    "created_at"?: string;
                    "customer_id"?: string | null;
                    "document_id"?: string;
                    "document_type"?: string;
                    "id"?: string;
                    "organization_id"?: string | null;
                    "referrer_domain"?: string | null;
                    "user_agent_family"?: string | null;
                    "viewed_at"?: string;
                    "visitor_session_id"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "portal_view_events_customer_id_fkey";
                        columns: [
                            "customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "portal_view_events_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "production_batch_inputs": {
                Row: {
                    "batch_id": string;
                    "created_at": string;
                    "id": string;
                    "inventory_transaction_id": string | null;
                    "material_id": string;
                    "quantity": number;
                    "unit": string;
                };
                ComputedFields: never;
                Insert: {
                    "batch_id": string;
                    "created_at"?: string;
                    "id"?: string;
                    "inventory_transaction_id"?: string | null;
                    "material_id": string;
                    "quantity": number;
                    "unit": string;
                };
                Update: {
                    "batch_id"?: string;
                    "created_at"?: string;
                    "id"?: string;
                    "inventory_transaction_id"?: string | null;
                    "material_id"?: string;
                    "quantity"?: number;
                    "unit"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "production_batch_inputs_batch_id_fkey";
                        columns: [
                            "batch_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "production_batches";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "production_batch_inputs_inventory_transaction_id_fkey";
                        columns: [
                            "inventory_transaction_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "inventory_transactions";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "production_batch_inputs_material_id_fkey";
                        columns: [
                            "material_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "material_catalog";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "production_batch_outputs": {
                Row: {
                    "batch_id": string;
                    "created_at": string;
                    "id": string;
                    "inventory_transaction_id": string | null;
                    "is_estimated": boolean;
                    "material_id": string;
                    "quantity": number;
                    "unit": string;
                };
                ComputedFields: never;
                Insert: {
                    "batch_id": string;
                    "created_at"?: string;
                    "id"?: string;
                    "inventory_transaction_id"?: string | null;
                    "is_estimated"?: boolean;
                    "material_id": string;
                    "quantity": number;
                    "unit": string;
                };
                Update: {
                    "batch_id"?: string;
                    "created_at"?: string;
                    "id"?: string;
                    "inventory_transaction_id"?: string | null;
                    "is_estimated"?: boolean;
                    "material_id"?: string;
                    "quantity"?: number;
                    "unit"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "production_batch_outputs_batch_id_fkey";
                        columns: [
                            "batch_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "production_batches";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "production_batch_outputs_inventory_transaction_id_fkey";
                        columns: [
                            "inventory_transaction_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "inventory_transactions";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "production_batch_outputs_material_id_fkey";
                        columns: [
                            "material_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "material_catalog";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "production_batches": {
                Row: {
                    "attachment_storage_path": string | null;
                    "batch_number": string;
                    "color": string | null;
                    "cost_per_unit_cents": number | null;
                    "created_at": string;
                    "created_by_user_id": string;
                    "direct_cost_cents": number | null;
                    "dye_amount": number | null;
                    "dye_product": string | null;
                    "dye_unit": string | null;
                    "equipment_asset_id": string | null;
                    "estimated_output_quantity": number | null;
                    "id": string;
                    "labor_hours": number | null;
                    "location_id": string;
                    "moisture_weather_notes": string | null;
                    "output_unit": string | null;
                    "processed_at": string | null;
                    "product_material_id": string;
                    "quality_notes": string | null;
                    "ready_at": string | null;
                    "reviewed_by_user_id": string | null;
                    "status": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "attachment_storage_path"?: string | null;
                    "batch_number": string;
                    "color"?: string | null;
                    "cost_per_unit_cents"?: number | null;
                    "created_at"?: string;
                    "created_by_user_id": string;
                    "direct_cost_cents"?: number | null;
                    "dye_amount"?: number | null;
                    "dye_product"?: string | null;
                    "dye_unit"?: string | null;
                    "equipment_asset_id"?: string | null;
                    "estimated_output_quantity"?: number | null;
                    "id"?: string;
                    "labor_hours"?: number | null;
                    "location_id": string;
                    "moisture_weather_notes"?: string | null;
                    "output_unit"?: string | null;
                    "processed_at"?: string | null;
                    "product_material_id": string;
                    "quality_notes"?: string | null;
                    "ready_at"?: string | null;
                    "reviewed_by_user_id"?: string | null;
                    "status"?: string;
                    "updated_at"?: string;
                };
                Update: {
                    "attachment_storage_path"?: string | null;
                    "batch_number"?: string;
                    "color"?: string | null;
                    "cost_per_unit_cents"?: number | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string;
                    "direct_cost_cents"?: number | null;
                    "dye_amount"?: number | null;
                    "dye_product"?: string | null;
                    "dye_unit"?: string | null;
                    "equipment_asset_id"?: string | null;
                    "estimated_output_quantity"?: number | null;
                    "id"?: string;
                    "labor_hours"?: number | null;
                    "location_id"?: string;
                    "moisture_weather_notes"?: string | null;
                    "output_unit"?: string | null;
                    "processed_at"?: string | null;
                    "product_material_id"?: string;
                    "quality_notes"?: string | null;
                    "ready_at"?: string | null;
                    "reviewed_by_user_id"?: string | null;
                    "status"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "production_batches_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "production_batches_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "production_batches_equipment_asset_id_fkey";
                        columns: [
                            "equipment_asset_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "equipment_assets";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "production_batches_location_id_fkey";
                        columns: [
                            "location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "inventory_locations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "production_batches_product_material_id_fkey";
                        columns: [
                            "product_material_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "material_catalog";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "production_batches_reviewed_by_user_id_fkey";
                        columns: [
                            "reviewed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "production_batches_reviewed_by_user_id_fkey";
                        columns: [
                            "reviewed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "profiles": {
                Row: {
                    "created_at": string;
                    "email": string | null;
                    "full_name": string | null;
                    "id": string;
                    "phone": string | null;
                    "status": string;
                    "updated_at": string;
                    "user_type": string;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "email"?: string | null;
                    "full_name"?: string | null;
                    "id": string;
                    "phone"?: string | null;
                    "status"?: string;
                    "updated_at"?: string;
                    "user_type"?: string;
                };
                Update: {
                    "created_at"?: string;
                    "email"?: string | null;
                    "full_name"?: string | null;
                    "id"?: string;
                    "phone"?: string | null;
                    "status"?: string;
                    "updated_at"?: string;
                    "user_type"?: string;
                };
                Relationships: [
                ];
            };
            "qualification_requirements": {
                Row: {
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "credential_type_id": string;
                    "id": string;
                    "is_active": boolean;
                    "notes": string | null;
                    "requirement_scope": string;
                    "scope_value": string;
                    "updated_at": string;
                    "warning_only": boolean;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "credential_type_id": string;
                    "id"?: string;
                    "is_active"?: boolean;
                    "notes"?: string | null;
                    "requirement_scope": string;
                    "scope_value": string;
                    "updated_at"?: string;
                    "warning_only"?: boolean;
                };
                Update: {
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "credential_type_id"?: string;
                    "id"?: string;
                    "is_active"?: boolean;
                    "notes"?: string | null;
                    "requirement_scope"?: string;
                    "scope_value"?: string;
                    "updated_at"?: string;
                    "warning_only"?: boolean;
                };
                Relationships: [
                    {
                        foreignKeyName: "qualification_requirements_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "qualification_requirements_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "qualification_requirements_credential_type_id_fkey";
                        columns: [
                            "credential_type_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "credential_types";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "quote_line_items": {
                Row: {
                    "created_at": string;
                    "description": string | null;
                    "id": string;
                    "material_id": string | null;
                    "name": string;
                    "quantity": number;
                    "quote_id": string;
                    "service_category_id": string | null;
                    "sort_order": number;
                    "total_cents": number;
                    "unit_price_cents": number;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "description"?: string | null;
                    "id"?: string;
                    "material_id"?: string | null;
                    "name": string;
                    "quantity"?: number;
                    "quote_id": string;
                    "service_category_id"?: string | null;
                    "sort_order"?: number;
                    "total_cents"?: number;
                    "unit_price_cents"?: number;
                    "updated_at"?: string;
                };
                Update: {
                    "created_at"?: string;
                    "description"?: string | null;
                    "id"?: string;
                    "material_id"?: string | null;
                    "name"?: string;
                    "quantity"?: number;
                    "quote_id"?: string;
                    "service_category_id"?: string | null;
                    "sort_order"?: number;
                    "total_cents"?: number;
                    "unit_price_cents"?: number;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "quote_line_items_material_id_fkey";
                        columns: [
                            "material_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "material_catalog";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quote_line_items_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "quote_line_items_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "quote_line_items_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "quotes";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quote_line_items_service_category_id_fkey";
                        columns: [
                            "service_category_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_categories";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "quote_material_requirements": {
                Row: {
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "id": string;
                    "is_estimated": boolean;
                    "material_id": string;
                    "notes": string | null;
                    "planned_quantity": number;
                    "quote_id": string;
                    "quote_line_item_id": string | null;
                    "unit": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "id"?: string;
                    "is_estimated"?: boolean;
                    "material_id": string;
                    "notes"?: string | null;
                    "planned_quantity": number;
                    "quote_id": string;
                    "quote_line_item_id"?: string | null;
                    "unit": string;
                    "updated_at"?: string;
                };
                Update: {
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "id"?: string;
                    "is_estimated"?: boolean;
                    "material_id"?: string;
                    "notes"?: string | null;
                    "planned_quantity"?: number;
                    "quote_id"?: string;
                    "quote_line_item_id"?: string | null;
                    "unit"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "quote_material_requirements_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quote_material_requirements_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quote_material_requirements_material_id_fkey";
                        columns: [
                            "material_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "material_catalog";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quote_material_requirements_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "quote_material_requirements_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "quote_material_requirements_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "quotes";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quote_material_requirements_quote_line_item_id_fkey";
                        columns: [
                            "quote_line_item_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "quote_line_items";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "quote_portal_tokens": {
                Row: {
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "customer_id": string | null;
                    "expires_at": string | null;
                    "id": string;
                    "organization_id": string | null;
                    "quote_id": string;
                    "revoked_at": string | null;
                    "token_encrypted": string | null;
                    "token_hash": string;
                    "token_hint": string | null;
                    "updated_at": string;
                    "used_at": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "customer_id"?: string | null;
                    "expires_at"?: string | null;
                    "id"?: string;
                    "organization_id"?: string | null;
                    "quote_id": string;
                    "revoked_at"?: string | null;
                    "token_encrypted"?: string | null;
                    "token_hash": string;
                    "token_hint"?: string | null;
                    "updated_at"?: string;
                    "used_at"?: string | null;
                };
                Update: {
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "customer_id"?: string | null;
                    "expires_at"?: string | null;
                    "id"?: string;
                    "organization_id"?: string | null;
                    "quote_id"?: string;
                    "revoked_at"?: string | null;
                    "token_encrypted"?: string | null;
                    "token_hash"?: string;
                    "token_hint"?: string | null;
                    "updated_at"?: string;
                    "used_at"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "quote_portal_tokens_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quote_portal_tokens_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quote_portal_tokens_customer_id_fkey";
                        columns: [
                            "customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quote_portal_tokens_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quote_portal_tokens_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "quote_portal_tokens_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "quote_portal_tokens_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "quotes";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "quotes": {
                Row: {
                    "approval_contact_id": string | null;
                    "approved_at": string | null;
                    "approved_from_revision": number | null;
                    "archived_at": string | null;
                    "archived_by_user_id": string | null;
                    "automatic_follow_ups_enabled": boolean;
                    "billing_contact_id": string | null;
                    "created_at": string;
                    "customer_id": string | null;
                    "customer_message": string | null;
                    "debris_handling": string | null;
                    "debris_handling_notes": string | null;
                    "edit_revision": number;
                    "estimate_schedule_event_id": string | null;
                    "estimator_employee_id": string | null;
                    "estimator_user_id": string | null;
                    "expires_at": string | null;
                    "first_viewed_at": string | null;
                    "id": string;
                    "job_id": string | null;
                    "last_edited_at": string | null;
                    "last_edited_by_user_id": string | null;
                    "last_viewed_at": string | null;
                    "legacy_customer_id": string | null;
                    "onsite_contact_id": string | null;
                    "organization_id": string | null;
                    "payment_terms": string | null;
                    "pricing_reviewed_at": string | null;
                    "pricing_reviewed_by_user_id": string | null;
                    "purchase_order_reference": string | null;
                    "quote_number": string | null;
                    "recipient_contact_id": string | null;
                    "recurring_occurrence_id": string | null;
                    "recurring_service_plan_id": string | null;
                    "renewal_source_quote_id": string | null;
                    "sent_at": string | null;
                    "sent_by_user_id": string | null;
                    "sent_method": string | null;
                    "service_location_id": string | null;
                    "source_recommendation_id": string | null;
                    "status": string;
                    "subtotal_cents": number;
                    "tax_cents": number;
                    "total_cents": number;
                    "updated_at": string;
                    "view_count": number;
                };
                ComputedFields: never;
                Insert: {
                    "approval_contact_id"?: string | null;
                    "approved_at"?: string | null;
                    "approved_from_revision"?: number | null;
                    "archived_at"?: string | null;
                    "archived_by_user_id"?: string | null;
                    "automatic_follow_ups_enabled"?: boolean;
                    "billing_contact_id"?: string | null;
                    "created_at"?: string;
                    "customer_id"?: string | null;
                    "customer_message"?: string | null;
                    "debris_handling"?: string | null;
                    "debris_handling_notes"?: string | null;
                    "edit_revision"?: number;
                    "estimate_schedule_event_id"?: string | null;
                    "estimator_employee_id"?: string | null;
                    "estimator_user_id"?: string | null;
                    "expires_at"?: string | null;
                    "first_viewed_at"?: string | null;
                    "id"?: string;
                    "job_id"?: string | null;
                    "last_edited_at"?: string | null;
                    "last_edited_by_user_id"?: string | null;
                    "last_viewed_at"?: string | null;
                    "legacy_customer_id"?: string | null;
                    "onsite_contact_id"?: string | null;
                    "organization_id"?: string | null;
                    "payment_terms"?: string | null;
                    "pricing_reviewed_at"?: string | null;
                    "pricing_reviewed_by_user_id"?: string | null;
                    "purchase_order_reference"?: string | null;
                    "quote_number"?: string | null;
                    "recipient_contact_id"?: string | null;
                    "recurring_occurrence_id"?: string | null;
                    "recurring_service_plan_id"?: string | null;
                    "renewal_source_quote_id"?: string | null;
                    "sent_at"?: string | null;
                    "sent_by_user_id"?: string | null;
                    "sent_method"?: string | null;
                    "service_location_id"?: string | null;
                    "source_recommendation_id"?: string | null;
                    "status"?: string;
                    "subtotal_cents"?: number;
                    "tax_cents"?: number;
                    "total_cents"?: number;
                    "updated_at"?: string;
                    "view_count"?: number;
                };
                Update: {
                    "approval_contact_id"?: string | null;
                    "approved_at"?: string | null;
                    "approved_from_revision"?: number | null;
                    "archived_at"?: string | null;
                    "archived_by_user_id"?: string | null;
                    "automatic_follow_ups_enabled"?: boolean;
                    "billing_contact_id"?: string | null;
                    "created_at"?: string;
                    "customer_id"?: string | null;
                    "customer_message"?: string | null;
                    "debris_handling"?: string | null;
                    "debris_handling_notes"?: string | null;
                    "edit_revision"?: number;
                    "estimate_schedule_event_id"?: string | null;
                    "estimator_employee_id"?: string | null;
                    "estimator_user_id"?: string | null;
                    "expires_at"?: string | null;
                    "first_viewed_at"?: string | null;
                    "id"?: string;
                    "job_id"?: string | null;
                    "last_edited_at"?: string | null;
                    "last_edited_by_user_id"?: string | null;
                    "last_viewed_at"?: string | null;
                    "legacy_customer_id"?: string | null;
                    "onsite_contact_id"?: string | null;
                    "organization_id"?: string | null;
                    "payment_terms"?: string | null;
                    "pricing_reviewed_at"?: string | null;
                    "pricing_reviewed_by_user_id"?: string | null;
                    "purchase_order_reference"?: string | null;
                    "quote_number"?: string | null;
                    "recipient_contact_id"?: string | null;
                    "recurring_occurrence_id"?: string | null;
                    "recurring_service_plan_id"?: string | null;
                    "renewal_source_quote_id"?: string | null;
                    "sent_at"?: string | null;
                    "sent_by_user_id"?: string | null;
                    "sent_method"?: string | null;
                    "service_location_id"?: string | null;
                    "source_recommendation_id"?: string | null;
                    "status"?: string;
                    "subtotal_cents"?: number;
                    "tax_cents"?: number;
                    "total_cents"?: number;
                    "updated_at"?: string;
                    "view_count"?: number;
                };
                Relationships: [
                    {
                        foreignKeyName: "quotes_approval_contact_id_fkey";
                        columns: [
                            "approval_contact_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organization_contacts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_archived_by_user_id_fkey";
                        columns: [
                            "archived_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_archived_by_user_id_fkey";
                        columns: [
                            "archived_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_billing_contact_id_fkey";
                        columns: [
                            "billing_contact_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organization_contacts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_customer_id_fkey";
                        columns: [
                            "customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_estimate_schedule_event_id_fkey";
                        columns: [
                            "estimate_schedule_event_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "appointment_id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_estimate_schedule_event_id_fkey";
                        columns: [
                            "estimate_schedule_event_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "appointment_id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_estimate_schedule_event_id_fkey";
                        columns: [
                            "estimate_schedule_event_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "schedule_events";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_estimator_employee_id_fkey";
                        columns: [
                            "estimator_employee_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "employee_records";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_estimator_user_id_fkey";
                        columns: [
                            "estimator_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_estimator_user_id_fkey";
                        columns: [
                            "estimator_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_last_edited_by_user_id_fkey";
                        columns: [
                            "last_edited_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_last_edited_by_user_id_fkey";
                        columns: [
                            "last_edited_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_legacy_customer_id_fkey";
                        columns: [
                            "legacy_customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_onsite_contact_id_fkey";
                        columns: [
                            "onsite_contact_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organization_contacts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_pricing_reviewed_by_user_id_fkey";
                        columns: [
                            "pricing_reviewed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_pricing_reviewed_by_user_id_fkey";
                        columns: [
                            "pricing_reviewed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_recipient_contact_id_fkey";
                        columns: [
                            "recipient_contact_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organization_contacts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_recurring_occurrence_id_fkey";
                        columns: [
                            "recurring_occurrence_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "recurring_service_occurrences";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_recurring_service_plan_id_fkey";
                        columns: [
                            "recurring_service_plan_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "recurring_service_plans";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_renewal_source_quote_id_fkey";
                        columns: [
                            "renewal_source_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_renewal_source_quote_id_fkey";
                        columns: [
                            "renewal_source_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_renewal_source_quote_id_fkey";
                        columns: [
                            "renewal_source_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "quotes";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_sent_by_user_id_fkey";
                        columns: [
                            "sent_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_sent_by_user_id_fkey";
                        columns: [
                            "sent_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_service_location_id_fkey";
                        columns: [
                            "service_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_locations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "quotes_source_recommendation_id_fkey";
                        columns: [
                            "source_recommendation_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_recommendations";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "record_deletion_audit": {
                Row: {
                    "action": string;
                    "actor_user_id": string | null;
                    "created_at": string;
                    "dependency_counts": NonNullable<Json>;
                    "id": string;
                    "reason": string | null;
                    "record_id": string;
                    "record_type": string;
                };
                ComputedFields: never;
                Insert: {
                    "action": string;
                    "actor_user_id"?: string | null;
                    "created_at"?: string;
                    "dependency_counts"?: NonNullable<Json>;
                    "id"?: string;
                    "reason"?: string | null;
                    "record_id": string;
                    "record_type": string;
                };
                Update: {
                    "action"?: string;
                    "actor_user_id"?: string | null;
                    "created_at"?: string;
                    "dependency_counts"?: NonNullable<Json>;
                    "id"?: string;
                    "reason"?: string | null;
                    "record_id"?: string;
                    "record_type"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "record_deletion_audit_actor_user_id_fkey";
                        columns: [
                            "actor_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "record_deletion_audit_actor_user_id_fkey";
                        columns: [
                            "actor_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "recurring_plan_locations": {
                Row: {
                    "access_instructions": string | null;
                    "created_at": string;
                    "id": string;
                    "next_review_date": string | null;
                    "next_service_due_date": string;
                    "onsite_contact_id": string | null;
                    "paused_reason": string | null;
                    "preferred_service_window": string | null;
                    "property_notes": string | null;
                    "recurring_plan_id": string;
                    "service_location_id": string;
                    "state": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "access_instructions"?: string | null;
                    "created_at"?: string;
                    "id"?: string;
                    "next_review_date"?: string | null;
                    "next_service_due_date": string;
                    "onsite_contact_id"?: string | null;
                    "paused_reason"?: string | null;
                    "preferred_service_window"?: string | null;
                    "property_notes"?: string | null;
                    "recurring_plan_id": string;
                    "service_location_id": string;
                    "state"?: string;
                    "updated_at"?: string;
                };
                Update: {
                    "access_instructions"?: string | null;
                    "created_at"?: string;
                    "id"?: string;
                    "next_review_date"?: string | null;
                    "next_service_due_date"?: string;
                    "onsite_contact_id"?: string | null;
                    "paused_reason"?: string | null;
                    "preferred_service_window"?: string | null;
                    "property_notes"?: string | null;
                    "recurring_plan_id"?: string;
                    "service_location_id"?: string;
                    "state"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "recurring_plan_locations_onsite_contact_id_fkey";
                        columns: [
                            "onsite_contact_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organization_contacts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_plan_locations_recurring_plan_id_fkey";
                        columns: [
                            "recurring_plan_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "recurring_service_plans";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_plan_locations_service_location_id_fkey";
                        columns: [
                            "service_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_locations";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "recurring_service_occurrences": {
                Row: {
                    "approved_price_cents_snapshot": number | null;
                    "assigned_estimator_user_id": string | null;
                    "authorization_mode_snapshot": string;
                    "authorization_reference_snapshot": string | null;
                    "completed_at": string | null;
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "generated_at": string;
                    "id": string;
                    "occurrence_key": string;
                    "pricing_review_status": string;
                    "prior_quote_id": string | null;
                    "prior_work_order_id": string | null;
                    "recurring_plan_id": string;
                    "recurring_plan_location_id": string;
                    "renewal_quote_id": string | null;
                    "review_notes": string | null;
                    "service_location_id": string;
                    "skip_reason": string | null;
                    "status": string;
                    "target_service_date": string;
                    "target_window_end": string | null;
                    "target_window_start": string | null;
                    "updated_at": string;
                    "work_order_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "approved_price_cents_snapshot"?: number | null;
                    "assigned_estimator_user_id"?: string | null;
                    "authorization_mode_snapshot": string;
                    "authorization_reference_snapshot"?: string | null;
                    "completed_at"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "generated_at"?: string;
                    "id"?: string;
                    "occurrence_key": string;
                    "pricing_review_status"?: string;
                    "prior_quote_id"?: string | null;
                    "prior_work_order_id"?: string | null;
                    "recurring_plan_id": string;
                    "recurring_plan_location_id": string;
                    "renewal_quote_id"?: string | null;
                    "review_notes"?: string | null;
                    "service_location_id": string;
                    "skip_reason"?: string | null;
                    "status"?: string;
                    "target_service_date": string;
                    "target_window_end"?: string | null;
                    "target_window_start"?: string | null;
                    "updated_at"?: string;
                    "work_order_id"?: string | null;
                };
                Update: {
                    "approved_price_cents_snapshot"?: number | null;
                    "assigned_estimator_user_id"?: string | null;
                    "authorization_mode_snapshot"?: string;
                    "authorization_reference_snapshot"?: string | null;
                    "completed_at"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "generated_at"?: string;
                    "id"?: string;
                    "occurrence_key"?: string;
                    "pricing_review_status"?: string;
                    "prior_quote_id"?: string | null;
                    "prior_work_order_id"?: string | null;
                    "recurring_plan_id"?: string;
                    "recurring_plan_location_id"?: string;
                    "renewal_quote_id"?: string | null;
                    "review_notes"?: string | null;
                    "service_location_id"?: string;
                    "skip_reason"?: string | null;
                    "status"?: string;
                    "target_service_date"?: string;
                    "target_window_end"?: string | null;
                    "target_window_start"?: string | null;
                    "updated_at"?: string;
                    "work_order_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "recurring_service_occurrences_assigned_estimator_user_id_fkey";
                        columns: [
                            "assigned_estimator_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_occurrences_assigned_estimator_user_id_fkey";
                        columns: [
                            "assigned_estimator_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_occurrences_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_occurrences_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_occurrences_prior_quote_id_fkey";
                        columns: [
                            "prior_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_occurrences_prior_quote_id_fkey";
                        columns: [
                            "prior_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_occurrences_prior_quote_id_fkey";
                        columns: [
                            "prior_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "quotes";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_occurrences_prior_work_order_id_fkey";
                        columns: [
                            "prior_work_order_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_occurrences_prior_work_order_id_fkey";
                        columns: [
                            "prior_work_order_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_occurrences_prior_work_order_id_fkey";
                        columns: [
                            "prior_work_order_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_occurrences_prior_work_order_id_fkey";
                        columns: [
                            "prior_work_order_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_occurrences_recurring_plan_id_fkey";
                        columns: [
                            "recurring_plan_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "recurring_service_plans";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_occurrences_recurring_plan_location_id_fkey";
                        columns: [
                            "recurring_plan_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "recurring_generation_preview";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_occurrences_recurring_plan_location_id_fkey";
                        columns: [
                            "recurring_plan_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "recurring_plan_locations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_occurrences_renewal_quote_id_fkey";
                        columns: [
                            "renewal_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_occurrences_renewal_quote_id_fkey";
                        columns: [
                            "renewal_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_occurrences_renewal_quote_id_fkey";
                        columns: [
                            "renewal_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "quotes";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_occurrences_service_location_id_fkey";
                        columns: [
                            "service_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_locations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_occurrences_work_order_id_fkey";
                        columns: [
                            "work_order_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_occurrences_work_order_id_fkey";
                        columns: [
                            "work_order_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_occurrences_work_order_id_fkey";
                        columns: [
                            "work_order_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_occurrences_work_order_id_fkey";
                        columns: [
                            "work_order_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "recurring_service_plans": {
                Row: {
                    "agreement_reference": string | null;
                    "approval_contact_id": string | null;
                    "approved_price_cents": number | null;
                    "authorization_end_date": string | null;
                    "authorization_mode": string;
                    "authorization_start_date": string | null;
                    "authorized_contact_id": string | null;
                    "billing_contact_id": string | null;
                    "created_at": string;
                    "created_by_user_id": string;
                    "custom_interval_count": number | null;
                    "customer_id": string | null;
                    "customer_notes": string | null;
                    "default_onsite_contact_id": string | null;
                    "default_payment_terms": string | null;
                    "equipment_requirements": NonNullable<Json>;
                    "estimated_duration_minutes": number | null;
                    "id": string;
                    "internal_notes": string | null;
                    "material_requirements": NonNullable<Json>;
                    "organization_id": string | null;
                    "plan_name": string;
                    "planning_window_days": number;
                    "preferred_crew_user_id": string | null;
                    "preferred_service_window": string | null;
                    "pricing_rule": string | null;
                    "quote_lead_days": number;
                    "recurrence_pattern": string;
                    "reminder_lead_days": number;
                    "season_end_month": number | null;
                    "season_start_month": number | null;
                    "service_category_id": string | null;
                    "service_description": string;
                    "source_job_id": string | null;
                    "source_quote_id": string | null;
                    "source_recommendation_id": string | null;
                    "standard_scope": NonNullable<Json>;
                    "state": string;
                    "updated_at": string;
                    "weather_reschedule_allowed": boolean;
                };
                ComputedFields: never;
                Insert: {
                    "agreement_reference"?: string | null;
                    "approval_contact_id"?: string | null;
                    "approved_price_cents"?: number | null;
                    "authorization_end_date"?: string | null;
                    "authorization_mode"?: string;
                    "authorization_start_date"?: string | null;
                    "authorized_contact_id"?: string | null;
                    "billing_contact_id"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id": string;
                    "custom_interval_count"?: number | null;
                    "customer_id"?: string | null;
                    "customer_notes"?: string | null;
                    "default_onsite_contact_id"?: string | null;
                    "default_payment_terms"?: string | null;
                    "equipment_requirements"?: NonNullable<Json>;
                    "estimated_duration_minutes"?: number | null;
                    "id"?: string;
                    "internal_notes"?: string | null;
                    "material_requirements"?: NonNullable<Json>;
                    "organization_id"?: string | null;
                    "plan_name": string;
                    "planning_window_days"?: number;
                    "preferred_crew_user_id"?: string | null;
                    "preferred_service_window"?: string | null;
                    "pricing_rule"?: string | null;
                    "quote_lead_days"?: number;
                    "recurrence_pattern": string;
                    "reminder_lead_days"?: number;
                    "season_end_month"?: number | null;
                    "season_start_month"?: number | null;
                    "service_category_id"?: string | null;
                    "service_description": string;
                    "source_job_id"?: string | null;
                    "source_quote_id"?: string | null;
                    "source_recommendation_id"?: string | null;
                    "standard_scope"?: NonNullable<Json>;
                    "state"?: string;
                    "updated_at"?: string;
                    "weather_reschedule_allowed"?: boolean;
                };
                Update: {
                    "agreement_reference"?: string | null;
                    "approval_contact_id"?: string | null;
                    "approved_price_cents"?: number | null;
                    "authorization_end_date"?: string | null;
                    "authorization_mode"?: string;
                    "authorization_start_date"?: string | null;
                    "authorized_contact_id"?: string | null;
                    "billing_contact_id"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string;
                    "custom_interval_count"?: number | null;
                    "customer_id"?: string | null;
                    "customer_notes"?: string | null;
                    "default_onsite_contact_id"?: string | null;
                    "default_payment_terms"?: string | null;
                    "equipment_requirements"?: NonNullable<Json>;
                    "estimated_duration_minutes"?: number | null;
                    "id"?: string;
                    "internal_notes"?: string | null;
                    "material_requirements"?: NonNullable<Json>;
                    "organization_id"?: string | null;
                    "plan_name"?: string;
                    "planning_window_days"?: number;
                    "preferred_crew_user_id"?: string | null;
                    "preferred_service_window"?: string | null;
                    "pricing_rule"?: string | null;
                    "quote_lead_days"?: number;
                    "recurrence_pattern"?: string;
                    "reminder_lead_days"?: number;
                    "season_end_month"?: number | null;
                    "season_start_month"?: number | null;
                    "service_category_id"?: string | null;
                    "service_description"?: string;
                    "source_job_id"?: string | null;
                    "source_quote_id"?: string | null;
                    "source_recommendation_id"?: string | null;
                    "standard_scope"?: NonNullable<Json>;
                    "state"?: string;
                    "updated_at"?: string;
                    "weather_reschedule_allowed"?: boolean;
                };
                Relationships: [
                    {
                        foreignKeyName: "recurring_service_plans_approval_contact_id_fkey";
                        columns: [
                            "approval_contact_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organization_contacts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_plans_authorized_contact_id_fkey";
                        columns: [
                            "authorized_contact_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organization_contacts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_plans_billing_contact_id_fkey";
                        columns: [
                            "billing_contact_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organization_contacts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_plans_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_plans_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_plans_customer_id_fkey";
                        columns: [
                            "customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_plans_default_onsite_contact_id_fkey";
                        columns: [
                            "default_onsite_contact_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organization_contacts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_plans_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_plans_preferred_crew_user_id_fkey";
                        columns: [
                            "preferred_crew_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_plans_preferred_crew_user_id_fkey";
                        columns: [
                            "preferred_crew_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_plans_service_category_id_fkey";
                        columns: [
                            "service_category_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_categories";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_plans_source_job_id_fkey";
                        columns: [
                            "source_job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_plans_source_job_id_fkey";
                        columns: [
                            "source_job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_plans_source_job_id_fkey";
                        columns: [
                            "source_job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_plans_source_job_id_fkey";
                        columns: [
                            "source_job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_plans_source_quote_id_fkey";
                        columns: [
                            "source_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_plans_source_quote_id_fkey";
                        columns: [
                            "source_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_plans_source_quote_id_fkey";
                        columns: [
                            "source_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "quotes";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_plans_source_recommendation_id_fkey";
                        columns: [
                            "source_recommendation_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_recommendations";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "recurring_service_settings": {
                Row: {
                    "automated_generation_enabled": boolean;
                    "business_timezone": string;
                    "created_at": string;
                    "default_planning_window_days": number;
                    "default_quote_lead_days": number;
                    "default_reminder_lead_days": number;
                    "overdue_escalation_days": number;
                    "singleton_key": boolean;
                    "updated_at": string;
                    "updated_by_user_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "automated_generation_enabled"?: boolean;
                    "business_timezone"?: string;
                    "created_at"?: string;
                    "default_planning_window_days"?: number;
                    "default_quote_lead_days"?: number;
                    "default_reminder_lead_days"?: number;
                    "overdue_escalation_days"?: number;
                    "singleton_key"?: boolean;
                    "updated_at"?: string;
                    "updated_by_user_id"?: string | null;
                };
                Update: {
                    "automated_generation_enabled"?: boolean;
                    "business_timezone"?: string;
                    "created_at"?: string;
                    "default_planning_window_days"?: number;
                    "default_quote_lead_days"?: number;
                    "default_reminder_lead_days"?: number;
                    "overdue_escalation_days"?: number;
                    "singleton_key"?: boolean;
                    "updated_at"?: string;
                    "updated_by_user_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "recurring_service_settings_updated_by_user_id_fkey";
                        columns: [
                            "updated_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "recurring_service_settings_updated_by_user_id_fkey";
                        columns: [
                            "updated_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "reporting_settings": {
                Row: {
                    "blended_labor_cost_cents": number | null;
                    "business_timezone": string;
                    "created_at": string;
                    "default_labor_burden_percent": number | null;
                    "draft_quote_stale_days": number;
                    "lead_stale_business_days": number;
                    "sent_quote_stale_days": number;
                    "singleton_key": boolean;
                    "updated_at": string;
                    "updated_by_user_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "blended_labor_cost_cents"?: number | null;
                    "business_timezone"?: string;
                    "created_at"?: string;
                    "default_labor_burden_percent"?: number | null;
                    "draft_quote_stale_days"?: number;
                    "lead_stale_business_days"?: number;
                    "sent_quote_stale_days"?: number;
                    "singleton_key"?: boolean;
                    "updated_at"?: string;
                    "updated_by_user_id"?: string | null;
                };
                Update: {
                    "blended_labor_cost_cents"?: number | null;
                    "business_timezone"?: string;
                    "created_at"?: string;
                    "default_labor_burden_percent"?: number | null;
                    "draft_quote_stale_days"?: number;
                    "lead_stale_business_days"?: number;
                    "sent_quote_stale_days"?: number;
                    "singleton_key"?: boolean;
                    "updated_at"?: string;
                    "updated_by_user_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "reporting_settings_updated_by_user_id_fkey";
                        columns: [
                            "updated_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "reporting_settings_updated_by_user_id_fkey";
                        columns: [
                            "updated_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "role_assignment_events": {
                Row: {
                    "actor_user_id": string;
                    "assigned_roles": (string)[];
                    "created_at": string;
                    "id": string;
                    "previous_roles": (string)[];
                    "reason": string | null;
                    "target_user_id": string;
                };
                ComputedFields: never;
                Insert: {
                    "actor_user_id": string;
                    "assigned_roles"?: (string)[];
                    "created_at"?: string;
                    "id"?: string;
                    "previous_roles"?: (string)[];
                    "reason"?: string | null;
                    "target_user_id": string;
                };
                Update: {
                    "actor_user_id"?: string;
                    "assigned_roles"?: (string)[];
                    "created_at"?: string;
                    "id"?: string;
                    "previous_roles"?: (string)[];
                    "reason"?: string | null;
                    "target_user_id"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "role_assignment_events_actor_user_id_fkey";
                        columns: [
                            "actor_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "role_assignment_events_actor_user_id_fkey";
                        columns: [
                            "actor_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "role_assignment_events_target_user_id_fkey";
                        columns: [
                            "target_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "role_assignment_events_target_user_id_fkey";
                        columns: [
                            "target_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "roles": {
                Row: {
                    "created_at": string;
                    "description": string | null;
                    "id": string;
                    "name": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "description"?: string | null;
                    "id"?: string;
                    "name": string;
                    "updated_at"?: string;
                };
                Update: {
                    "created_at"?: string;
                    "description"?: string | null;
                    "id"?: string;
                    "name"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                ];
            };
            "safety_meeting_attendees": {
                Row: {
                    "acknowledged_at": string | null;
                    "acknowledgment_name": string | null;
                    "attendance_status": string;
                    "created_at": string;
                    "employee_id": string;
                    "id": string;
                    "notes": string | null;
                    "safety_meeting_id": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "acknowledged_at"?: string | null;
                    "acknowledgment_name"?: string | null;
                    "attendance_status"?: string;
                    "created_at"?: string;
                    "employee_id": string;
                    "id"?: string;
                    "notes"?: string | null;
                    "safety_meeting_id": string;
                    "updated_at"?: string;
                };
                Update: {
                    "acknowledged_at"?: string | null;
                    "acknowledgment_name"?: string | null;
                    "attendance_status"?: string;
                    "created_at"?: string;
                    "employee_id"?: string;
                    "id"?: string;
                    "notes"?: string | null;
                    "safety_meeting_id"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "safety_meeting_attendees_employee_id_fkey";
                        columns: [
                            "employee_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "employee_records";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "safety_meeting_attendees_safety_meeting_id_fkey";
                        columns: [
                            "safety_meeting_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "safety_meetings";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "safety_meetings": {
                Row: {
                    "archived_at": string | null;
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "document_version": string | null;
                    "follow_up_actions": string | null;
                    "id": string;
                    "leader_name": string | null;
                    "location_label": string | null;
                    "meeting_notes": string | null;
                    "starts_at": string;
                    "subject_matter": string | null;
                    "title": string;
                    "topic_key": string | null;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "archived_at"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "document_version"?: string | null;
                    "follow_up_actions"?: string | null;
                    "id"?: string;
                    "leader_name"?: string | null;
                    "location_label"?: string | null;
                    "meeting_notes"?: string | null;
                    "starts_at": string;
                    "subject_matter"?: string | null;
                    "title": string;
                    "topic_key"?: string | null;
                    "updated_at"?: string;
                };
                Update: {
                    "archived_at"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "document_version"?: string | null;
                    "follow_up_actions"?: string | null;
                    "id"?: string;
                    "leader_name"?: string | null;
                    "location_label"?: string | null;
                    "meeting_notes"?: string | null;
                    "starts_at"?: string;
                    "subject_matter"?: string | null;
                    "title"?: string;
                    "topic_key"?: string | null;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "safety_meetings_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "safety_meetings_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "schedule_event_assignments": {
                Row: {
                    "assignment_role": string;
                    "created_at": string;
                    "employee_id": string | null;
                    "event_id": string;
                    "id": string;
                    "user_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "assignment_role"?: string;
                    "created_at"?: string;
                    "employee_id"?: string | null;
                    "event_id": string;
                    "id"?: string;
                    "user_id"?: string | null;
                };
                Update: {
                    "assignment_role"?: string;
                    "created_at"?: string;
                    "employee_id"?: string | null;
                    "event_id"?: string;
                    "id"?: string;
                    "user_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "schedule_event_assignments_employee_id_fkey";
                        columns: [
                            "employee_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "employee_records";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "schedule_event_assignments_event_id_fkey";
                        columns: [
                            "event_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "appointment_id"
                        ];
                    },
                    {
                        foreignKeyName: "schedule_event_assignments_event_id_fkey";
                        columns: [
                            "event_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "appointment_id"
                        ];
                    },
                    {
                        foreignKeyName: "schedule_event_assignments_event_id_fkey";
                        columns: [
                            "event_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "schedule_events";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "schedule_event_assignments_user_id_fkey";
                        columns: [
                            "user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "schedule_event_assignments_user_id_fkey";
                        columns: [
                            "user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "schedule_events": {
                Row: {
                    "all_day": boolean;
                    "calendar_notes": string | null;
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "description": string | null;
                    "edit_revision": number;
                    "ends_at": string | null;
                    "event_type": string;
                    "id": string;
                    "job_id": string | null;
                    "lead_intake_job_id": string | null;
                    "location_label": string | null;
                    "recurring_occurrence_id": string | null;
                    "service_location_id": string | null;
                    "source_appointment_id": string | null;
                    "source_contact_id": string | null;
                    "source_customer_id": string | null;
                    "source_organization_id": string | null;
                    "source_request_key": string | null;
                    "source_service_type": string | null;
                    "starts_at": string;
                    "status": string;
                    "title": string;
                    "updated_at": string;
                    "work_session_group_id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "all_day"?: boolean;
                    "calendar_notes"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "description"?: string | null;
                    "edit_revision"?: number;
                    "ends_at"?: string | null;
                    "event_type"?: string;
                    "id"?: string;
                    "job_id"?: string | null;
                    "lead_intake_job_id"?: string | null;
                    "location_label"?: string | null;
                    "recurring_occurrence_id"?: string | null;
                    "service_location_id"?: string | null;
                    "source_appointment_id"?: string | null;
                    "source_contact_id"?: string | null;
                    "source_customer_id"?: string | null;
                    "source_organization_id"?: string | null;
                    "source_request_key"?: string | null;
                    "source_service_type"?: string | null;
                    "starts_at": string;
                    "status"?: string;
                    "title": string;
                    "updated_at"?: string;
                    "work_session_group_id"?: string | null;
                };
                Update: {
                    "all_day"?: boolean;
                    "calendar_notes"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "description"?: string | null;
                    "edit_revision"?: number;
                    "ends_at"?: string | null;
                    "event_type"?: string;
                    "id"?: string;
                    "job_id"?: string | null;
                    "lead_intake_job_id"?: string | null;
                    "location_label"?: string | null;
                    "recurring_occurrence_id"?: string | null;
                    "service_location_id"?: string | null;
                    "source_appointment_id"?: string | null;
                    "source_contact_id"?: string | null;
                    "source_customer_id"?: string | null;
                    "source_organization_id"?: string | null;
                    "source_request_key"?: string | null;
                    "source_service_type"?: string | null;
                    "starts_at"?: string;
                    "status"?: string;
                    "title"?: string;
                    "updated_at"?: string;
                    "work_session_group_id"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "schedule_events_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "schedule_events_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "schedule_events_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "schedule_events_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "schedule_events_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "schedule_events_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "schedule_events_lead_intake_job_id_fkey";
                        columns: [
                            "lead_intake_job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "schedule_events_lead_intake_job_id_fkey";
                        columns: [
                            "lead_intake_job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "schedule_events_lead_intake_job_id_fkey";
                        columns: [
                            "lead_intake_job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "schedule_events_lead_intake_job_id_fkey";
                        columns: [
                            "lead_intake_job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "schedule_events_recurring_occurrence_id_fkey";
                        columns: [
                            "recurring_occurrence_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "recurring_service_occurrences";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "schedule_events_service_location_id_fkey";
                        columns: [
                            "service_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_locations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "schedule_events_source_appointment_id_fkey";
                        columns: [
                            "source_appointment_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "appointments";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "schedule_events_source_contact_id_fkey";
                        columns: [
                            "source_contact_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organization_contacts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "schedule_events_source_customer_id_fkey";
                        columns: [
                            "source_customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "schedule_events_source_organization_id_fkey";
                        columns: [
                            "source_organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "security_rate_limits": {
                Row: {
                    "action_name": string;
                    "expires_at": string;
                    "key_hash": string;
                    "request_count": number;
                    "updated_at": string;
                    "window_started_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "action_name": string;
                    "expires_at": string;
                    "key_hash": string;
                    "request_count"?: number;
                    "updated_at"?: string;
                    "window_started_at": string;
                };
                Update: {
                    "action_name"?: string;
                    "expires_at"?: string;
                    "key_hash"?: string;
                    "request_count"?: number;
                    "updated_at"?: string;
                    "window_started_at"?: string;
                };
                Relationships: [
                ];
            };
            "service_categories": {
                Row: {
                    "category_key": string;
                    "created_at": string;
                    "id": string;
                    "is_active": boolean;
                    "label": string;
                    "sort_order": number;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "category_key": string;
                    "created_at"?: string;
                    "id"?: string;
                    "is_active"?: boolean;
                    "label": string;
                    "sort_order"?: number;
                    "updated_at"?: string;
                };
                Update: {
                    "category_key"?: string;
                    "created_at"?: string;
                    "id"?: string;
                    "is_active"?: boolean;
                    "label"?: string;
                    "sort_order"?: number;
                    "updated_at"?: string;
                };
                Relationships: [
                ];
            };
            "service_locations": {
                Row: {
                    "access_notes": string | null;
                    "archived_at": string | null;
                    "archived_by_user_id": string | null;
                    "city": string;
                    "created_at": string;
                    "customer_id": string | null;
                    "gate_code": string | null;
                    "id": string;
                    "label": string | null;
                    "latitude": number | null;
                    "longitude": number | null;
                    "organization_id": string | null;
                    "postal_code": string | null;
                    "service_notes": string | null;
                    "state": string;
                    "street": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "access_notes"?: string | null;
                    "archived_at"?: string | null;
                    "archived_by_user_id"?: string | null;
                    "city": string;
                    "created_at"?: string;
                    "customer_id"?: string | null;
                    "gate_code"?: string | null;
                    "id"?: string;
                    "label"?: string | null;
                    "latitude"?: number | null;
                    "longitude"?: number | null;
                    "organization_id"?: string | null;
                    "postal_code"?: string | null;
                    "service_notes"?: string | null;
                    "state"?: string;
                    "street": string;
                    "updated_at"?: string;
                };
                Update: {
                    "access_notes"?: string | null;
                    "archived_at"?: string | null;
                    "archived_by_user_id"?: string | null;
                    "city"?: string;
                    "created_at"?: string;
                    "customer_id"?: string | null;
                    "gate_code"?: string | null;
                    "id"?: string;
                    "label"?: string | null;
                    "latitude"?: number | null;
                    "longitude"?: number | null;
                    "organization_id"?: string | null;
                    "postal_code"?: string | null;
                    "service_notes"?: string | null;
                    "state"?: string;
                    "street"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "service_locations_archived_by_user_id_fkey";
                        columns: [
                            "archived_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "service_locations_archived_by_user_id_fkey";
                        columns: [
                            "archived_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "service_locations_customer_id_fkey";
                        columns: [
                            "customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "service_locations_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "service_recommendations": {
                Row: {
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "customer_id": string | null;
                    "customer_recommendation": string;
                    "estimated_value_cents": number | null;
                    "id": string;
                    "internal_notes": string | null;
                    "organization_contact_id": string | null;
                    "organization_id": string | null;
                    "origin": string;
                    "priority": string;
                    "recommended_timeframe": string | null;
                    "related_quote_id": string | null;
                    "reviewed_at": string | null;
                    "reviewed_by_user_id": string | null;
                    "service_category_id": string | null;
                    "service_location_id": string;
                    "source_closeout_id": string | null;
                    "source_job_id": string | null;
                    "status": string;
                    "title": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "customer_id"?: string | null;
                    "customer_recommendation": string;
                    "estimated_value_cents"?: number | null;
                    "id"?: string;
                    "internal_notes"?: string | null;
                    "organization_contact_id"?: string | null;
                    "organization_id"?: string | null;
                    "origin"?: string;
                    "priority"?: string;
                    "recommended_timeframe"?: string | null;
                    "related_quote_id"?: string | null;
                    "reviewed_at"?: string | null;
                    "reviewed_by_user_id"?: string | null;
                    "service_category_id"?: string | null;
                    "service_location_id": string;
                    "source_closeout_id"?: string | null;
                    "source_job_id"?: string | null;
                    "status"?: string;
                    "title": string;
                    "updated_at"?: string;
                };
                Update: {
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "customer_id"?: string | null;
                    "customer_recommendation"?: string;
                    "estimated_value_cents"?: number | null;
                    "id"?: string;
                    "internal_notes"?: string | null;
                    "organization_contact_id"?: string | null;
                    "organization_id"?: string | null;
                    "origin"?: string;
                    "priority"?: string;
                    "recommended_timeframe"?: string | null;
                    "related_quote_id"?: string | null;
                    "reviewed_at"?: string | null;
                    "reviewed_by_user_id"?: string | null;
                    "service_category_id"?: string | null;
                    "service_location_id"?: string;
                    "source_closeout_id"?: string | null;
                    "source_job_id"?: string | null;
                    "status"?: string;
                    "title"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "service_recommendations_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "service_recommendations_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "service_recommendations_customer_id_fkey";
                        columns: [
                            "customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "service_recommendations_organization_contact_id_fkey";
                        columns: [
                            "organization_contact_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organization_contacts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "service_recommendations_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "service_recommendations_related_quote_id_fkey";
                        columns: [
                            "related_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "service_recommendations_related_quote_id_fkey";
                        columns: [
                            "related_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "service_recommendations_related_quote_id_fkey";
                        columns: [
                            "related_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "quotes";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "service_recommendations_reviewed_by_user_id_fkey";
                        columns: [
                            "reviewed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "service_recommendations_reviewed_by_user_id_fkey";
                        columns: [
                            "reviewed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "service_recommendations_service_category_id_fkey";
                        columns: [
                            "service_category_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_categories";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "service_recommendations_service_location_id_fkey";
                        columns: [
                            "service_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_locations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "service_recommendations_source_closeout_id_fkey";
                        columns: [
                            "source_closeout_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_closeouts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "service_recommendations_source_job_id_fkey";
                        columns: [
                            "source_job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "service_recommendations_source_job_id_fkey";
                        columns: [
                            "source_job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "service_recommendations_source_job_id_fkey";
                        columns: [
                            "source_job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "service_recommendations_source_job_id_fkey";
                        columns: [
                            "source_job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "stockpile_measurements": {
                Row: {
                    "created_at": string;
                    "id": string;
                    "is_estimated": boolean;
                    "location_id": string;
                    "material_id": string;
                    "measured_at": string;
                    "measured_by_user_id": string;
                    "measurement_method": string;
                    "notes": string | null;
                    "photo_storage_path": string | null;
                    "quantity": number;
                    "unit": string;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "id"?: string;
                    "is_estimated"?: boolean;
                    "location_id": string;
                    "material_id": string;
                    "measured_at"?: string;
                    "measured_by_user_id": string;
                    "measurement_method"?: string;
                    "notes"?: string | null;
                    "photo_storage_path"?: string | null;
                    "quantity": number;
                    "unit": string;
                };
                Update: {
                    "created_at"?: string;
                    "id"?: string;
                    "is_estimated"?: boolean;
                    "location_id"?: string;
                    "material_id"?: string;
                    "measured_at"?: string;
                    "measured_by_user_id"?: string;
                    "measurement_method"?: string;
                    "notes"?: string | null;
                    "photo_storage_path"?: string | null;
                    "quantity"?: number;
                    "unit"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "stockpile_measurements_location_id_fkey";
                        columns: [
                            "location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "inventory_locations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "stockpile_measurements_material_id_fkey";
                        columns: [
                            "material_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "material_catalog";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "stockpile_measurements_measured_by_user_id_fkey";
                        columns: [
                            "measured_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "stockpile_measurements_measured_by_user_id_fkey";
                        columns: [
                            "measured_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "stripe_webhook_events": {
                Row: {
                    "attempt_limit": number;
                    "attempts": number;
                    "communications_synced": boolean;
                    "event_created_at": string | null;
                    "event_id": string;
                    "event_object_id": string | null;
                    "event_type": string;
                    "financial_applied_at": string | null;
                    "invoice_id": string | null;
                    "last_attempt_at": string | null;
                    "last_problem": string | null;
                    "lease_expires_at": string | null;
                    "livemode": boolean | null;
                    "manual_retry_requested_at": string | null;
                    "owner_token": string | null;
                    "phase": string;
                    "processed_at": string | null;
                    "received_at": string;
                    "state": string;
                };
                ComputedFields: never;
                Insert: {
                    "attempt_limit"?: number;
                    "attempts"?: number;
                    "communications_synced"?: boolean;
                    "event_created_at"?: string | null;
                    "event_id": string;
                    "event_object_id"?: string | null;
                    "event_type": string;
                    "financial_applied_at"?: string | null;
                    "invoice_id"?: string | null;
                    "last_attempt_at"?: string | null;
                    "last_problem"?: string | null;
                    "lease_expires_at"?: string | null;
                    "livemode"?: boolean | null;
                    "manual_retry_requested_at"?: string | null;
                    "owner_token"?: string | null;
                    "phase"?: string;
                    "processed_at"?: string | null;
                    "received_at"?: string;
                    "state"?: string;
                };
                Update: {
                    "attempt_limit"?: number;
                    "attempts"?: number;
                    "communications_synced"?: boolean;
                    "event_created_at"?: string | null;
                    "event_id"?: string;
                    "event_object_id"?: string | null;
                    "event_type"?: string;
                    "financial_applied_at"?: string | null;
                    "invoice_id"?: string | null;
                    "last_attempt_at"?: string | null;
                    "last_problem"?: string | null;
                    "lease_expires_at"?: string | null;
                    "livemode"?: boolean | null;
                    "manual_retry_requested_at"?: string | null;
                    "owner_token"?: string | null;
                    "phase"?: string;
                    "processed_at"?: string | null;
                    "received_at"?: string;
                    "state"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "stripe_webhook_events_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "invoices";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "stripe_webhook_events_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    },
                    {
                        foreignKeyName: "stripe_webhook_events_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    }
                ];
            };
            "system_health_checks": {
                Row: {
                    "check_source": string;
                    "checked_at": string;
                    "component_key": string;
                    "details": NonNullable<Json>;
                    "id": number;
                    "latency_ms": number | null;
                    "status": string;
                    "summary": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "check_source": string;
                    "checked_at"?: string;
                    "component_key": string;
                    "details"?: NonNullable<Json>;
                    "id"?: never;
                    "latency_ms"?: number | null;
                    "status": string;
                    "summary"?: string | null;
                };
                Update: {
                    "check_source"?: string;
                    "checked_at"?: string;
                    "component_key"?: string;
                    "details"?: NonNullable<Json>;
                    "id"?: never;
                    "latency_ms"?: number | null;
                    "status"?: string;
                    "summary"?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "system_health_checks_component_key_fkey";
                        columns: [
                            "component_key"
                        ];
                        isOneToOne: false;
                        referencedRelation: "system_health_components";
                        referencedColumns: [
                            "component_key"
                        ];
                    }
                ];
            };
            "system_health_components": {
                Row: {
                    "active_incident_started_at": string | null;
                    "category": string;
                    "check_source": string | null;
                    "checked_at": string | null;
                    "component_key": string;
                    "consecutive_failures": number;
                    "consecutive_successes": number;
                    "created_at": string;
                    "critical": boolean;
                    "details": NonNullable<Json>;
                    "failure_summary": string | null;
                    "label": string;
                    "last_observed_usage_at": string | null;
                    "last_success_at": string | null;
                    "latency_ms": number | null;
                    "status": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "active_incident_started_at"?: string | null;
                    "category": string;
                    "check_source"?: string | null;
                    "checked_at"?: string | null;
                    "component_key": string;
                    "consecutive_failures"?: number;
                    "consecutive_successes"?: number;
                    "created_at"?: string;
                    "critical"?: boolean;
                    "details"?: NonNullable<Json>;
                    "failure_summary"?: string | null;
                    "label": string;
                    "last_observed_usage_at"?: string | null;
                    "last_success_at"?: string | null;
                    "latency_ms"?: number | null;
                    "status"?: string;
                    "updated_at"?: string;
                };
                Update: {
                    "active_incident_started_at"?: string | null;
                    "category"?: string;
                    "check_source"?: string | null;
                    "checked_at"?: string | null;
                    "component_key"?: string;
                    "consecutive_failures"?: number;
                    "consecutive_successes"?: number;
                    "created_at"?: string;
                    "critical"?: boolean;
                    "details"?: NonNullable<Json>;
                    "failure_summary"?: string | null;
                    "label"?: string;
                    "last_observed_usage_at"?: string | null;
                    "last_success_at"?: string | null;
                    "latency_ms"?: number | null;
                    "status"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                ];
            };
            "system_health_incidents": {
                Row: {
                    "alert_attempted_at": string | null;
                    "component_key": string;
                    "created_at": string;
                    "failure_count": number;
                    "failure_summary": string | null;
                    "id": string;
                    "latest_status": string;
                    "opening_status": string;
                    "recovery_alert_attempted_at": string | null;
                    "recovery_summary": string | null;
                    "resolved_at": string | null;
                    "started_at": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "alert_attempted_at"?: string | null;
                    "component_key": string;
                    "created_at"?: string;
                    "failure_count"?: number;
                    "failure_summary"?: string | null;
                    "id"?: string;
                    "latest_status": string;
                    "opening_status": string;
                    "recovery_alert_attempted_at"?: string | null;
                    "recovery_summary"?: string | null;
                    "resolved_at"?: string | null;
                    "started_at": string;
                    "updated_at"?: string;
                };
                Update: {
                    "alert_attempted_at"?: string | null;
                    "component_key"?: string;
                    "created_at"?: string;
                    "failure_count"?: number;
                    "failure_summary"?: string | null;
                    "id"?: string;
                    "latest_status"?: string;
                    "opening_status"?: string;
                    "recovery_alert_attempted_at"?: string | null;
                    "recovery_summary"?: string | null;
                    "resolved_at"?: string | null;
                    "started_at"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "system_health_incidents_component_key_fkey";
                        columns: [
                            "component_key"
                        ];
                        isOneToOne: false;
                        referencedRelation: "system_health_components";
                        referencedColumns: [
                            "component_key"
                        ];
                    }
                ];
            };
            "time_clock_permissions": {
                Row: {
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "is_enabled": boolean;
                    "notes": string | null;
                    "updated_at": string;
                    "user_id": string;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "is_enabled"?: boolean;
                    "notes"?: string | null;
                    "updated_at"?: string;
                    "user_id": string;
                };
                Update: {
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "is_enabled"?: boolean;
                    "notes"?: string | null;
                    "updated_at"?: string;
                    "user_id"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "time_clock_permissions_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "time_clock_permissions_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "time_clock_permissions_user_id_fkey";
                        columns: [
                            "user_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "time_clock_permissions_user_id_fkey";
                        columns: [
                            "user_id"
                        ];
                        isOneToOne: true;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "time_entries": {
                Row: {
                    "break_minutes": number;
                    "clock_in_at": string;
                    "clock_out_at": string | null;
                    "created_at": string;
                    "entry_type": string;
                    "id": string;
                    "job_id": string | null;
                    "notes": string | null;
                    "schedule_event_id": string | null;
                    "status": string;
                    "updated_at": string;
                    "user_id": string;
                };
                ComputedFields: never;
                Insert: {
                    "break_minutes"?: number;
                    "clock_in_at": string;
                    "clock_out_at"?: string | null;
                    "created_at"?: string;
                    "entry_type"?: string;
                    "id"?: string;
                    "job_id"?: string | null;
                    "notes"?: string | null;
                    "schedule_event_id"?: string | null;
                    "status"?: string;
                    "updated_at"?: string;
                    "user_id": string;
                };
                Update: {
                    "break_minutes"?: number;
                    "clock_in_at"?: string;
                    "clock_out_at"?: string | null;
                    "created_at"?: string;
                    "entry_type"?: string;
                    "id"?: string;
                    "job_id"?: string | null;
                    "notes"?: string | null;
                    "schedule_event_id"?: string | null;
                    "status"?: string;
                    "updated_at"?: string;
                    "user_id"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "time_entries_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "time_entries_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "time_entries_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "time_entries_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "time_entries_schedule_event_id_fkey";
                        columns: [
                            "schedule_event_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "appointment_id"
                        ];
                    },
                    {
                        foreignKeyName: "time_entries_schedule_event_id_fkey";
                        columns: [
                            "schedule_event_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "appointment_id"
                        ];
                    },
                    {
                        foreignKeyName: "time_entries_schedule_event_id_fkey";
                        columns: [
                            "schedule_event_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "schedule_events";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "time_entries_user_id_fkey";
                        columns: [
                            "user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "time_entries_user_id_fkey";
                        columns: [
                            "user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "time_entry_adjustments": {
                Row: {
                    "adjusted_by_user_id": string;
                    "created_at": string;
                    "id": string;
                    "new_break_minutes": number;
                    "new_clock_in_at": string;
                    "new_clock_out_at": string | null;
                    "original_break_minutes": number;
                    "original_clock_in_at": string;
                    "original_clock_out_at": string | null;
                    "reason": string | null;
                    "time_entry_id": string;
                };
                ComputedFields: never;
                Insert: {
                    "adjusted_by_user_id": string;
                    "created_at"?: string;
                    "id"?: string;
                    "new_break_minutes"?: number;
                    "new_clock_in_at": string;
                    "new_clock_out_at"?: string | null;
                    "original_break_minutes"?: number;
                    "original_clock_in_at": string;
                    "original_clock_out_at"?: string | null;
                    "reason"?: string | null;
                    "time_entry_id": string;
                };
                Update: {
                    "adjusted_by_user_id"?: string;
                    "created_at"?: string;
                    "id"?: string;
                    "new_break_minutes"?: number;
                    "new_clock_in_at"?: string;
                    "new_clock_out_at"?: string | null;
                    "original_break_minutes"?: number;
                    "original_clock_in_at"?: string;
                    "original_clock_out_at"?: string | null;
                    "reason"?: string | null;
                    "time_entry_id"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "time_entry_adjustments_adjusted_by_user_id_fkey";
                        columns: [
                            "adjusted_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "time_entry_adjustments_adjusted_by_user_id_fkey";
                        columns: [
                            "adjusted_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "time_entry_adjustments_time_entry_id_fkey";
                        columns: [
                            "time_entry_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "time_entries";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "time_entry_approvals": {
                Row: {
                    "approval_note": string | null;
                    "approval_status": string;
                    "approved_at": string;
                    "approved_by_user_id": string;
                    "created_at": string;
                    "id": string;
                    "time_entry_id": string;
                };
                ComputedFields: never;
                Insert: {
                    "approval_note"?: string | null;
                    "approval_status"?: string;
                    "approved_at"?: string;
                    "approved_by_user_id": string;
                    "created_at"?: string;
                    "id"?: string;
                    "time_entry_id": string;
                };
                Update: {
                    "approval_note"?: string | null;
                    "approval_status"?: string;
                    "approved_at"?: string;
                    "approved_by_user_id"?: string;
                    "created_at"?: string;
                    "id"?: string;
                    "time_entry_id"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "time_entry_approvals_approved_by_user_id_fkey";
                        columns: [
                            "approved_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "time_entry_approvals_approved_by_user_id_fkey";
                        columns: [
                            "approved_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "time_entry_approvals_time_entry_id_fkey";
                        columns: [
                            "time_entry_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "time_entries";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "training_attendees": {
                Row: {
                    "acknowledged_at": string | null;
                    "acknowledgment_name": string | null;
                    "attendee_notes": string | null;
                    "created_at": string;
                    "employee_id": string;
                    "id": string;
                    "result": string;
                    "score": number | null;
                    "training_session_id": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "acknowledged_at"?: string | null;
                    "acknowledgment_name"?: string | null;
                    "attendee_notes"?: string | null;
                    "created_at"?: string;
                    "employee_id": string;
                    "id"?: string;
                    "result"?: string;
                    "score"?: number | null;
                    "training_session_id": string;
                    "updated_at"?: string;
                };
                Update: {
                    "acknowledged_at"?: string | null;
                    "acknowledgment_name"?: string | null;
                    "attendee_notes"?: string | null;
                    "created_at"?: string;
                    "employee_id"?: string;
                    "id"?: string;
                    "result"?: string;
                    "score"?: number | null;
                    "training_session_id"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "training_attendees_employee_id_fkey";
                        columns: [
                            "employee_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "employee_records";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "training_attendees_training_session_id_fkey";
                        columns: [
                            "training_session_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "training_sessions";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "training_sessions": {
                Row: {
                    "archived_at": string | null;
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "document_version": string | null;
                    "duration_minutes": number | null;
                    "id": string;
                    "instructor_notes": string | null;
                    "location_label": string | null;
                    "provider_or_instructor": string | null;
                    "refresher_due_at": string | null;
                    "starts_at": string;
                    "title": string;
                    "training_type": string;
                    "updated_at": string;
                };
                ComputedFields: never;
                Insert: {
                    "archived_at"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "document_version"?: string | null;
                    "duration_minutes"?: number | null;
                    "id"?: string;
                    "instructor_notes"?: string | null;
                    "location_label"?: string | null;
                    "provider_or_instructor"?: string | null;
                    "refresher_due_at"?: string | null;
                    "starts_at": string;
                    "title": string;
                    "training_type": string;
                    "updated_at"?: string;
                };
                Update: {
                    "archived_at"?: string | null;
                    "created_at"?: string;
                    "created_by_user_id"?: string | null;
                    "document_version"?: string | null;
                    "duration_minutes"?: number | null;
                    "id"?: string;
                    "instructor_notes"?: string | null;
                    "location_label"?: string | null;
                    "provider_or_instructor"?: string | null;
                    "refresher_due_at"?: string | null;
                    "starts_at"?: string;
                    "title"?: string;
                    "training_type"?: string;
                    "updated_at"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "training_sessions_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "training_sessions_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "user_roles": {
                Row: {
                    "created_at": string;
                    "role_id": string;
                    "user_id": string;
                };
                ComputedFields: never;
                Insert: {
                    "created_at"?: string;
                    "role_id": string;
                    "user_id": string;
                };
                Update: {
                    "created_at"?: string;
                    "role_id"?: string;
                    "user_id"?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "user_roles_role_id_fkey";
                        columns: [
                            "role_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "roles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "user_roles_user_id_fkey";
                        columns: [
                            "user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "user_roles_user_id_fkey";
                        columns: [
                            "user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
        };
        Views: {
            "admin_record_search": {
                Row: {
                    "amount_cents": number | null;
                    "archived_at": string | null;
                    "created_at": string | null;
                    "record_id": string | null;
                    "record_type": string | null;
                    "search_text": string | null;
                    "source_type": string | null;
                    "status": string | null;
                };
                ComputedFields: never;
                Relationships: [
                ];
            };
            "approved_work_handoff_gaps": {
                Row: {
                    "approved_at": string | null;
                    "id": string | null;
                    "party_label": string | null;
                    "source_quote_id": string | null;
                };
                ComputedFields: never;
                Relationships: [
                    {
                        foreignKeyName: "jobs_source_quote_id_fkey";
                        columns: [
                            "source_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_source_quote_id_fkey";
                        columns: [
                            "source_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_source_quote_id_fkey";
                        columns: [
                            "source_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "quotes";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "attachment_file_checks": {
                Row: {
                    "bucket_id": string | null;
                    "can_open": boolean | null;
                    "can_retry": boolean | null;
                    "enabled": boolean | null;
                    "label": string | null;
                    "source_id": string | null;
                    "source_type": string | null;
                    "status": string | null;
                    "storage_path": string | null;
                };
                ComputedFields: never;
                Relationships: [
                ];
            };
            "attachment_file_sources": {
                Row: {
                    "bucket_id": string | null;
                    "label": string | null;
                    "source_id": string | null;
                    "source_type": string | null;
                    "storage_path": string | null;
                };
                ComputedFields: never;
                Relationships: [
                ];
            };
            "job_operations_index": {
                Row: {
                    "action_rank": number | null;
                    "appointment_ends_at": string | null;
                    "appointment_id": string | null;
                    "appointment_local_date": string | null;
                    "appointment_starts_at": string | null;
                    "appointment_status": string | null;
                    "approved_unbilled_change_order_count": number | null;
                    "assigned_crew_email": string | null;
                    "assigned_crew_name": string | null;
                    "assigned_crew_user_id": string | null;
                    "awaiting_invoice": boolean | null;
                    "city": string | null;
                    "contracting_party_name": string | null;
                    "created_at": string | null;
                    "customer_id": string | null;
                    "customer_name": string | null;
                    "display_title": string | null;
                    "failed_communication_count": number | null;
                    "has_cancelled_appointment": boolean | null;
                    "id": string | null;
                    "invoice_balance_due_cents": number | null;
                    "invoice_due_at": string | null;
                    "invoice_id": string | null;
                    "invoice_number": string | null;
                    "invoice_status": string | null;
                    "invoice_total_cents": number | null;
                    "is_billing": boolean | null;
                    "is_today": boolean | null;
                    "job_status": string | null;
                    "needs_attention": boolean | null;
                    "operational_state": string | null;
                    "organization_id": string | null;
                    "organization_name": string | null;
                    "postal_code": string | null;
                    "priority": string | null;
                    "quote_id": string | null;
                    "quote_number": string | null;
                    "quote_status": string | null;
                    "quote_total_cents": number | null;
                    "requested_scope": string | null;
                    "search_text": string | null;
                    "service_location_id": string | null;
                    "service_type": string | null;
                    "source_quote_id": string | null;
                    "state": string | null;
                    "street": string | null;
                    "updated_at": string | null;
                };
                ComputedFields: never;
                Relationships: [
                    {
                        foreignKeyName: "jobs_assigned_crew_user_id_fkey";
                        columns: [
                            "assigned_crew_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_assigned_crew_user_id_fkey";
                        columns: [
                            "assigned_crew_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_customer_id_fkey";
                        columns: [
                            "customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_service_location_id_fkey";
                        columns: [
                            "service_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_locations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_source_quote_id_fkey";
                        columns: [
                            "source_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_source_quote_id_fkey";
                        columns: [
                            "source_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_source_quote_id_fkey";
                        columns: [
                            "source_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "quotes";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "job_operations_search_index": {
                Row: {
                    "action_rank": number | null;
                    "appointment_ends_at": string | null;
                    "appointment_id": string | null;
                    "appointment_local_date": string | null;
                    "appointment_starts_at": string | null;
                    "appointment_status": string | null;
                    "approved_unbilled_change_order_count": number | null;
                    "archived_at": string | null;
                    "archived_by_user_id": string | null;
                    "assigned_crew_email": string | null;
                    "assigned_crew_name": string | null;
                    "assigned_crew_user_id": string | null;
                    "awaiting_invoice": boolean | null;
                    "city": string | null;
                    "contracting_party_name": string | null;
                    "created_at": string | null;
                    "customer_id": string | null;
                    "customer_name": string | null;
                    "display_title": string | null;
                    "expanded_search_text": string | null;
                    "failed_communication_count": number | null;
                    "has_cancelled_appointment": boolean | null;
                    "id": string | null;
                    "invoice_balance_due_cents": number | null;
                    "invoice_due_at": string | null;
                    "invoice_id": string | null;
                    "invoice_number": string | null;
                    "invoice_status": string | null;
                    "invoice_total_cents": number | null;
                    "is_billing": boolean | null;
                    "is_today": boolean | null;
                    "job_status": string | null;
                    "needs_attention": boolean | null;
                    "operational_state": string | null;
                    "organization_id": string | null;
                    "organization_name": string | null;
                    "postal_code": string | null;
                    "priority": string | null;
                    "quote_id": string | null;
                    "quote_number": string | null;
                    "quote_status": string | null;
                    "quote_total_cents": number | null;
                    "requested_scope": string | null;
                    "search_text": string | null;
                    "service_location_id": string | null;
                    "service_type": string | null;
                    "source_quote_id": string | null;
                    "state": string | null;
                    "street": string | null;
                    "updated_at": string | null;
                };
                ComputedFields: never;
                Relationships: [
                    {
                        foreignKeyName: "jobs_archived_by_user_id_fkey";
                        columns: [
                            "archived_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_archived_by_user_id_fkey";
                        columns: [
                            "archived_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_assigned_crew_user_id_fkey";
                        columns: [
                            "assigned_crew_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_assigned_crew_user_id_fkey";
                        columns: [
                            "assigned_crew_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_customer_id_fkey";
                        columns: [
                            "customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_service_location_id_fkey";
                        columns: [
                            "service_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_locations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_source_quote_id_fkey";
                        columns: [
                            "source_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_source_quote_id_fkey";
                        columns: [
                            "source_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "jobs_source_quote_id_fkey";
                        columns: [
                            "source_quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "quotes";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "material_stock_balances": {
                Row: {
                    "available_quantity": number | null;
                    "latest_transaction_at": string | null;
                    "location_id": string | null;
                    "material_id": string | null;
                    "on_hand_quantity": number | null;
                    "reserved_quantity": number | null;
                };
                ComputedFields: never;
                Relationships: [
                ];
            };
            "office_follow_up_queue": {
                Row: {
                    "assigned_label": string | null;
                    "assigned_to_user_id": string | null;
                    "change_order_id": string | null;
                    "completed_at": string | null;
                    "completed_by_user_id": string | null;
                    "created_at": string | null;
                    "created_by_user_id": string | null;
                    "customer_id": string | null;
                    "dedupe_key": string | null;
                    "description": string | null;
                    "due_at": string | null;
                    "id": string | null;
                    "invoice_id": string | null;
                    "job_id": string | null;
                    "needs_owner": boolean | null;
                    "next_action_at": string | null;
                    "notes": string | null;
                    "organization_contact_id": string | null;
                    "organization_id": string | null;
                    "party_label": string | null;
                    "priority": string | null;
                    "quote_id": string | null;
                    "recommendation_id": string | null;
                    "recurring_occurrence_id": string | null;
                    "recurring_plan_id": string | null;
                    "service_location_id": string | null;
                    "snoozed_until": string | null;
                    "status": string | null;
                    "task_type": string | null;
                    "title": string | null;
                    "updated_at": string | null;
                };
                ComputedFields: never;
                Relationships: [
                    {
                        foreignKeyName: "follow_up_tasks_assigned_to_user_id_fkey";
                        columns: [
                            "assigned_to_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_assigned_to_user_id_fkey";
                        columns: [
                            "assigned_to_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_change_order_id_fkey";
                        columns: [
                            "change_order_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "change_orders";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_completed_by_user_id_fkey";
                        columns: [
                            "completed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_completed_by_user_id_fkey";
                        columns: [
                            "completed_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "office_handoff_staff";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_created_by_user_id_fkey";
                        columns: [
                            "created_by_user_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_customer_id_fkey";
                        columns: [
                            "customer_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "customers";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "invoices";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_invoice_id_fkey";
                        columns: [
                            "invoice_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "invoice_id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "approved_work_handoff_gaps";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_job_id_fkey";
                        columns: [
                            "job_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "jobs";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_organization_contact_id_fkey";
                        columns: [
                            "organization_contact_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organization_contacts";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_organization_id_fkey";
                        columns: [
                            "organization_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "organizations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "job_operations_search_index";
                        referencedColumns: [
                            "quote_id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_quote_id_fkey";
                        columns: [
                            "quote_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "quotes";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_recommendation_id_fkey";
                        columns: [
                            "recommendation_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_recommendations";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_recurring_occurrence_id_fkey";
                        columns: [
                            "recurring_occurrence_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "recurring_service_occurrences";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_recurring_plan_id_fkey";
                        columns: [
                            "recurring_plan_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "recurring_service_plans";
                        referencedColumns: [
                            "id"
                        ];
                    },
                    {
                        foreignKeyName: "follow_up_tasks_service_location_id_fkey";
                        columns: [
                            "service_location_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "service_locations";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
            "office_handoff_staff": {
                Row: {
                    "email": string | null;
                    "full_name": string | null;
                    "id": string | null;
                };
                ComputedFields: never;
                Insert: {
                    "email"?: string | null;
                    "full_name"?: string | null;
                    "id"?: string | null;
                };
                Update: {
                    "email"?: string | null;
                    "full_name"?: string | null;
                    "id"?: string | null;
                };
                Relationships: [
                ];
            };
            "recurring_generation_preview": {
                Row: {
                    "already_generated": boolean | null;
                    "authorization_mode": string | null;
                    "business_timezone": string | null;
                    "id": string | null;
                    "next_service_due_date": string | null;
                    "party_label": string | null;
                    "plan_name": string | null;
                    "property_label": string | null;
                    "recurring_plan_id": string | null;
                    "version": string | null;
                };
                ComputedFields: never;
                Relationships: [
                    {
                        foreignKeyName: "recurring_plan_locations_recurring_plan_id_fkey";
                        columns: [
                            "recurring_plan_id"
                        ];
                        isOneToOne: false;
                        referencedRelation: "recurring_service_plans";
                        referencedColumns: [
                            "id"
                        ];
                    }
                ];
            };
        };
        Functions: {
            "acknowledge_my_employee_item": {
                Args: {
                    "p_name": string;
                    "p_subject_id": string;
                    "p_subject_type": string;
                    "p_subject_version": string;
                };
                Returns: string;
            };
            "acknowledge_outbound_followup": {
                Args: {
                    "p_delivery_id": string;
                };
                Returns: boolean;
            };
            "advance_scheduled_jobs_to_in_progress": {
                Args: Record<PropertyKey, never>;
                Returns: {
                    "advanced_count": number;
                }[];
            };
            "apply_stripe_webhook": {
                Args: {
                    "p_event_id": string;
                    "p_evidence": Json;
                    "p_token": string;
                };
                Returns: Json;
            };
            "approve_change_order": {
                Args: {
                    "p_approval_method"?: string;
                    "p_approval_notes"?: string;
                    "p_approved_by_contact_id"?: string;
                    "p_approved_by_name": string;
                    "p_change_order_id": string;
                    "p_recorded_by_user_id"?: string;
                };
                Returns: {
                    "applied_scope_count": number;
                    "change_order_id": string;
                    "job_id": string;
                    "newly_approved": boolean;
                }[];
            };
            "approve_change_order_by_portal": {
                Args: {
                    "p_approver_name": string;
                    "p_expected_updated_at": string;
                    "p_request_id": string;
                    "p_review_hash": string;
                    "p_token_hash": string;
                };
                Returns: Json;
            };
            "approve_quote": {
                Args: {
                    "p_expected_revision": number;
                    "p_quote_id": string;
                };
                Returns: Json;
            };
            "approve_quote_by_portal": {
                Args: {
                    "p_expected_revision": number;
                    "p_token_hash": string;
                };
                Returns: Json;
            };
            "approve_recurring_generation": {
                Args: {
                    "p_request_id": string;
                    "p_selection": Json;
                };
                Returns: Json;
            };
            "attach_approved_change_orders_to_invoice": {
                Args: {
                    "p_invoice_id": string;
                };
                Returns: {
                    "added_change_order_count": number;
                    "added_line_count": number;
                }[];
            };
            "attachment_scan_enabled": {
                Args: {
                    "p_bucket": string;
                };
                Returns: boolean;
            };
            "begin_invoice_checkout_review": {
                Args: {
                    "p_invoice_id": string;
                };
                Returns: Json;
            };
            "begin_invoice_void": {
                Args: {
                    "p_invoice_id": string;
                };
                Returns: Json;
            };
            "begin_stripe_notification_email": {
                Args: {
                    "p_event_id": string;
                    "p_notification": string;
                    "p_token": string;
                };
                Returns: Json;
            };
            "block_website_sender": {
                Args: {
                    "p_contacts": Json;
                    "p_email": boolean;
                    "p_job": string;
                    "p_phone": boolean;
                    "p_reason": string;
                    "p_request": string;
                };
                Returns: Json;
            };
            "calendar_account_can_sync": {
                Args: {
                    "p_user": string;
                };
                Returns: boolean;
            };
            "cancel_manual_invoice_payment": {
                Args: {
                    "p_invoice_id": string;
                    "p_payment_id": string;
                    "p_reason"?: string;
                };
                Returns: undefined;
            };
            "check_invoice_checkout_lease": {
                Args: {
                    "p_invoice_id": string;
                    "p_token": string;
                };
                Returns: boolean;
            };
            "claim_attachment_scan": {
                Args: {
                    "p_actor": string;
                    "p_bucket": string;
                    "p_expected_sha256"?: string;
                    "p_path": string;
                };
                Returns: Json;
            };
            "claim_document_scan": {
                Args: {
                    "p_actor": string;
                    "p_document": string;
                    "p_expected_sha256"?: string;
                };
                Returns: Json;
            };
            "claim_due_customer_communications": {
                Args: {
                    "p_limit"?: number;
                };
                Returns: {
                    "appointment_id": string | null;
                    "attempt_count": number;
                    "cancelled_at": string | null;
                    "communication_type": string;
                    "created_at": string;
                    "created_by_user_id": string | null;
                    "customer_id": string | null;
                    "id": string;
                    "idempotency_key": string;
                    "invoice_id": string | null;
                    "is_automatic": boolean;
                    "job_id": string | null;
                    "last_error": string | null;
                    "organization_id": string | null;
                    "payment_id": string | null;
                    "processing_started_at": string | null;
                    "provider_message_id": string | null;
                    "quote_id": string | null;
                    "recipient_email": string;
                    "recipient_source": string;
                    "reminder_stage": string;
                    "schedule_event_id": string | null;
                    "scheduled_for": string;
                    "sent_at": string | null;
                    "skip_reason": string | null;
                    "source_version": string | null;
                    "status": string;
                    "updated_at": string;
                }[];
                SetofOptions: {
                    from: "*";
                    to: "customer_communications";
                    isOneToOne: false;
                    isSetofReturn: true;
                };
            };
            "claim_google_calendar_sync_tasks": {
                Args: {
                    "p_limit"?: number;
                };
                Returns: {
                    "attempt_count": number;
                    "available_at": string;
                    "connection_id": string | null;
                    "created_at": string;
                    "dedupe_key": string;
                    "last_error_code": string | null;
                    "locked_at": string | null;
                    "reason": string;
                    "revision": number;
                    "schedule_event_id": string | null;
                    "status": string;
                    "task_type": string;
                    "updated_at": string;
                }[];
                SetofOptions: {
                    from: "*";
                    to: "google_calendar_sync_outbox";
                    isOneToOne: false;
                    isSetofReturn: true;
                };
            };
            "claim_outbound_delivery": {
                Args: {
                    "p_delivery_id": string;
                };
                Returns: Json;
            };
            "claim_stripe_webhook": {
                Args: {
                    "p_created_at": string;
                    "p_event_id": string;
                    "p_event_type": string;
                    "p_livemode": boolean;
                    "p_object_id": string;
                };
                Returns: Json;
            };
            "claim_website_lead_notification": {
                Args: {
                    "p_job_id": string;
                };
                Returns: string;
            };
            "close_recurring_occurrence": {
                Args: {
                    "p_occurrence_id": string;
                    "p_reason"?: string;
                    "p_status": string;
                };
                Returns: {
                    "next_service_due_date": string;
                    "occurrence_id": string;
                }[];
            };
            "complete_completed_job_schedule": {
                Args: {
                    "p_job_id": string;
                };
                Returns: number;
            };
            "complete_job_work": {
                Args: {
                    "p_confirm_future"?: boolean;
                    "p_expected_revision": number;
                    "p_expected_snapshot": Json;
                    "p_job_id": string;
                    "p_mode"?: string;
                    "p_reason"?: string;
                    "p_request_id": string;
                };
                Returns: Json;
            };
            "complete_stripe_webhook": {
                Args: {
                    "p_event_id": string;
                    "p_token": string;
                };
                Returns: boolean;
            };
            "consume_security_rate_limit": {
                Args: {
                    "p_action_name": string;
                    "p_key_hash": string;
                    "p_limit": number;
                    "p_window_seconds": number;
                };
                Returns: {
                    "allowed": boolean;
                    "remaining": number;
                    "retry_after_seconds": number;
                }[];
            };
            "copy_change_order_draft": {
                Args: {
                    "p_expected_revision": number;
                    "p_request_id": string;
                    "p_source_id": string;
                };
                Returns: Json;
            };
            "create_invoice_draft": {
                Args: {
                    "p_header": Json;
                    "p_lines": Json;
                };
                Returns: Json;
            };
            "create_or_get_change_order_portal_token": {
                Args: {
                    "p_change_order_id": string;
                    "p_expires_at": string;
                    "p_token_encrypted": string;
                    "p_token_hash": string;
                    "p_token_hint": string;
                };
                Returns: {
                    "created": boolean;
                    "expires_at": string;
                    "id": string;
                    "token_encrypted": string;
                }[];
            };
            "create_or_get_invoice_portal_token": {
                Args: {
                    "p_expires_at": string;
                    "p_invoice_id": string;
                    "p_token_encrypted": string;
                    "p_token_hash": string;
                    "p_token_hint": string;
                };
                Returns: {
                    "created": boolean;
                    "expires_at": string;
                    "id": string;
                    "token_encrypted": string;
                }[];
            };
            "create_or_get_quote_portal_token": {
                Args: {
                    "p_expires_at": string;
                    "p_quote_id": string;
                    "p_token_encrypted": string;
                    "p_token_hash": string;
                    "p_token_hint": string;
                };
                Returns: {
                    "created": boolean;
                    "expires_at": string;
                    "id": string;
                    "token_encrypted": string;
                }[];
            };
            "create_quote_draft": {
                Args: {
                    "p_header": Json;
                    "p_lines": Json;
                };
                Returns: Json;
            };
            "create_quote_draft_request": {
                Args: {
                    "p_header": Json;
                    "p_lines": Json;
                    "p_request_id": string;
                };
                Returns: Json;
            };
            "create_standalone_invoice": {
                Args: {
                    "p_header": Json;
                    "p_lines": Json;
                    "p_new_customer"?: Json;
                    "p_notes"?: string;
                    "p_request_id": string;
                };
                Returns: Json;
            };
            "document_scan_mode": {
                Args: Record<PropertyKey, never>;
                Returns: boolean;
            };
            "ensure_scheduling_handoff": {
                Args: {
                    "p_job_id": string;
                };
                Returns: string;
            };
            "fail_stripe_webhook": {
                Args: {
                    "p_event_id": string;
                    "p_problem": string;
                    "p_token": string;
                };
                Returns: boolean;
            };
            "finalize_invoice_void": {
                Args: {
                    "p_invoice_id": string;
                    "p_token": string;
                };
                Returns: boolean;
            };
            "find_customer_source_event": {
                Args: {
                    "p_source_key": string;
                };
                Returns: Json;
            };
            "find_outbound_delivery_request": {
                Args: {
                    "p_request_key": string;
                };
                Returns: string;
            };
            "finish_attachment_scan": {
                Args: {
                    "p_actor": string;
                    "p_bucket": string;
                    "p_path": string;
                    "p_sha256": string;
                    "p_token": string;
                    "p_verdict": string;
                };
                Returns: boolean;
            };
            "finish_document_scan": {
                Args: {
                    "p_actor": string;
                    "p_document": string;
                    "p_sha256": string;
                    "p_token": string;
                    "p_verdict": string;
                };
                Returns: boolean;
            };
            "finish_outbound_delivery": {
                Args: {
                    "p_attempt_id": string;
                    "p_delivery_id": string;
                    "p_outcome": string;
                    "p_provider_message_id"?: string;
                };
                Returns: Json;
            };
            "finish_stripe_notification_email": {
                Args: {
                    "p_attempt_token": string;
                    "p_notification": string;
                    "p_outcome": string;
                    "p_provider_id"?: string;
                };
                Returns: boolean;
            };
            "finish_website_lead_notification": {
                Args: {
                    "p_attempt_id": string;
                    "p_job_id": string;
                    "p_outcome": string;
                };
                Returns: boolean;
            };
            "generate_due_recurring_occurrences": {
                Args: {
                    "p_limit"?: number;
                };
                Returns: {
                    "created_count": number;
                    "existing_count": number;
                }[];
            } | {
                Args: {
                    "p_limit": number;
                    "p_location_ids": (string)[];
                };
                Returns: {
                    "created_count": number;
                    "existing_count": number;
                }[];
            };
            "generate_job_invoice": {
                Args: {
                    "p_job_id"?: string;
                    "p_manual"?: Json;
                    "p_quote_id"?: string;
                    "p_request_id": string;
                };
                Returns: Json;
            };
            "get_appointment_change_notice": {
                Args: {
                    "p_communication_id": string;
                };
                Returns: Json;
            };
            "get_appointment_notice_coverage": {
                Args: Record<PropertyKey, never>;
                Returns: {
                    "source_id": string;
                    "source_kind": string;
                    "suppress_reminder": boolean;
                }[];
            };
            "get_attachment_scan_states": {
                Args: {
                    "p_bucket": string;
                    "p_paths": (string)[];
                };
                Returns: Json;
            };
            "get_business_report": {
                Args: {
                    "p_end": string;
                    "p_export"?: boolean;
                    "p_filters"?: Json;
                    "p_page_size"?: number;
                    "p_pages"?: Json;
                    "p_start": string;
                    "p_versions"?: Json;
                    "p_view": string;
                };
                Returns: Json;
            };
            "get_calendar_operations": {
                Args: Record<PropertyKey, never>;
                Returns: Json;
            };
            "get_change_order_link_request": {
                Args: {
                    "p_change_order_id": string;
                    "p_expected_link_version": string;
                    "p_expected_revision": number;
                    "p_intent": string;
                    "p_request_id": string;
                };
                Returns: Json;
            };
            "get_change_order_link_state": {
                Args: {
                    "p_change_order_id": string;
                };
                Returns: Json;
            };
            "get_change_order_portal_review": {
                Args: {
                    "p_token_hash": string;
                };
                Returns: Json;
            };
            "get_change_order_send_request": {
                Args: {
                    "p_actor_id": string;
                    "p_additional_copy"?: boolean;
                    "p_change_order_id": string;
                    "p_expected_revision": number;
                    "p_request_id": string;
                };
                Returns: Json;
            };
            "get_change_order_send_source": {
                Args: {
                    "p_actor_id": string;
                    "p_change_order_id": string;
                    "p_expected_revision": number;
                };
                Returns: Json;
            };
            "get_crew_change_order_scope": {
                Args: {
                    "p_job_id": string;
                };
                Returns: {
                    "approved_at": string;
                    "change_order_id": string;
                    "change_order_number": string;
                    "description": string;
                    "sort_order": number;
                    "title": string;
                }[];
            };
            "get_customer_source_event": {
                Args: {
                    "p_source_id": string;
                };
                Returns: Json;
            };
            "get_employee_operational_directory": {
                Args: Record<PropertyKey, never>;
                Returns: Json;
            };
            "get_invoice_checkout_review": {
                Args: {
                    "p_invoice_id": string;
                };
                Returns: {
                    "id": string;
                    "payment_channel": string;
                    "provider_reference": string;
                    "status": string;
                }[];
            };
            "get_invoice_link_request": {
                Args: {
                    "p_expected_version": string;
                    "p_intent": string;
                    "p_invoice_id": string;
                    "p_request_id": string;
                    "p_token_id"?: string;
                };
                Returns: Json;
            };
            "get_invoice_link_state": {
                Args: {
                    "p_invoice_id": string;
                };
                Returns: Json;
            };
            "get_invoice_payment_principal": {
                Args: {
                    "p_invoice_id": string;
                };
                Returns: Json;
            };
            "get_job_completion_context": {
                Args: {
                    "p_job_id": string;
                };
                Returns: Json;
            };
            "get_my_assigned_equipment": {
                Args: Record<PropertyKey, never>;
                Returns: {
                    "asset_id": string;
                    "asset_name": string;
                    "asset_number": string;
                    "assignment_id": string;
                    "assignment_notes": string;
                    "category": string;
                    "ends_at": string;
                    "inspection_template_key": string;
                    "job_id": string;
                    "manufacturer": string;
                    "model": string;
                    "next_inspection_due_at": string;
                    "photo_storage_path": string;
                    "ppe_required": string;
                    "safety_class": string;
                    "schedule_event_id": string;
                    "starts_at": string;
                    "status": string;
                }[];
            };
            "get_my_employee_self_service": {
                Args: Record<PropertyKey, never>;
                Returns: Json;
            };
            "get_my_supervised_team": {
                Args: Record<PropertyKey, never>;
                Returns: Json;
            };
            "get_outbound_delivery": {
                Args: {
                    "p_delivery_id": string;
                };
                Returns: Json;
            };
            "get_outbound_source_snapshot": {
                Args: {
                    "p_context": Json;
                };
                Returns: Json;
            };
            "get_recurring_review_runs": {
                Args: Record<PropertyKey, never>;
                Returns: Json;
            };
            "get_stripe_webhook_recovery": {
                Args: Record<PropertyKey, never>;
                Returns: {
                    "attempts": number;
                    "email_failed_count": number;
                    "email_review_count": number;
                    "event_id": string;
                    "event_type": string;
                    "invoice_id": string;
                    "last_problem": string;
                    "lease_active": boolean;
                    "phase": string;
                    "processed_at": string;
                    "received_at": string;
                    "state": string;
                }[];
            };
            "get_system_health_uptime": {
                Args: Record<PropertyKey, never>;
                Returns: {
                    "component_key": string;
                    "uptime_24h": number;
                    "uptime_30d": number;
                    "uptime_7d": number;
                }[];
            };
            "get_website_notice_repair": {
                Args: {
                    "p_job_id": string;
                };
                Returns: Json;
            };
            "get_website_sender_controls": {
                Args: {
                    "p_jobs": (string)[];
                };
                Returns: Json;
            };
            "has_effective_platform_access": {
                Args: Record<PropertyKey, never>;
                Returns: boolean;
            };
            "list_outbound_deliveries": {
                Args: {
                    "p_all"?: boolean;
                    "p_id"?: string;
                    "p_page"?: number;
                };
                Returns: Json;
            };
            "list_pending_customer_source_events": {
                Args: {
                    "p_page"?: number;
                };
                Returns: Json;
            };
            "list_website_sender_blocks": {
                Args: {
                    "p_all"?: boolean;
                    "p_page"?: number;
                };
                Returns: Json;
            };
            "manage_change_order_portal_link": {
                Args: {
                    "p_candidate"?: Json;
                    "p_change_order_id": string;
                    "p_expected_link_version": string;
                    "p_expected_revision": number;
                    "p_intent": string;
                    "p_request_id": string;
                };
                Returns: Json;
            };
            "manage_invoice_portal_link": {
                Args: {
                    "p_candidate"?: Json;
                    "p_expected_version": string;
                    "p_intent": string;
                    "p_invoice_id": string;
                    "p_request_id": string;
                    "p_token_id"?: string;
                };
                Returns: Json;
            };
            "mark_stripe_webhook_sync": {
                Args: {
                    "p_event_id": string;
                    "p_token": string;
                };
                Returns: boolean;
            };
            "office_handoff_owner_is_active": {
                Args: {
                    "p_user": string;
                };
                Returns: boolean;
            };
            "prepare_change_order_send": {
                Args: {
                    "p_actor_id": string;
                    "p_additional_copy": boolean;
                    "p_change_order_id": string;
                    "p_expected_revision": number;
                    "p_expected_snapshot": Json;
                    "p_payload": Json;
                    "p_portal_token_id": string;
                    "p_request_id": string;
                };
                Returns: Json;
            };
            "prepare_customer_activity": {
                Args: {
                    "p_destination"?: string;
                    "p_envelope": Json;
                    "p_event": Json;
                };
                Returns: Json;
            };
            "prepare_customer_source_event": {
                Args: {
                    "p_destination"?: string;
                    "p_envelope": Json;
                    "p_review_id"?: string;
                    "p_source_id": string;
                };
                Returns: Json;
            };
            "prepare_outbound_delivery": {
                Args: {
                    "p_context": Json;
                    "p_expected_snapshot"?: Json;
                    "p_payload": Json;
                    "p_request_key": string;
                };
                Returns: Json;
            };
            "prepare_stripe_webhook_snapshot": {
                Args: {
                    "p_event_id": string;
                    "p_evidence": Json;
                    "p_token": string;
                };
                Returns: string;
            };
            "prepare_website_notice_batch": {
                Args: {
                    "p_attempt_id": string;
                    "p_job_id": string;
                    "p_messages": Json;
                };
                Returns: (string)[];
            };
            "private_file_descriptor": {
                Args: {
                    "p_source_id": string;
                    "p_source_type": string;
                };
                Returns: {
                    "bucket_id": string;
                    "etag": string;
                    "label": string;
                    "mime_type": string;
                    "object_id": string;
                    "object_version": string;
                    "size_bytes": number;
                    "storage_path": string;
                }[];
            };
            "queue_google_calendar_connection_sync": {
                Args: {
                    "queue_reason"?: string;
                    "target_connection_id": string;
                };
                Returns: undefined;
            };
            "read_crew_job_page": {
                Args: {
                    "p_cursor"?: Json;
                    "p_date"?: string;
                    "p_limit"?: number;
                    "p_scope"?: string;
                };
                Returns: Json;
            };
            "reconcile_invoice_balance": {
                Args: {
                    "p_invoice_id": string;
                };
                Returns: Json;
            };
            "reconcile_stripe_dispute": {
                Args: {
                    "p_charge_id": string;
                    "p_dispute_id": string;
                    "p_dispute_status": string;
                    "p_disputed_gross_cents": number;
                    "p_event_created_at": string;
                    "p_event_type": string;
                };
                Returns: {
                    "changed": boolean;
                    "invoice_balance_changed": boolean;
                    "invoice_id": string;
                    "payment_id": string;
                }[];
            };
            "record_change_order_manual_approval": {
                Args: {
                    "p_approval": Json;
                    "p_change_order_id": string;
                    "p_expected_revision": number;
                    "p_request_id": string;
                };
                Returns: Json;
            };
            "record_invoice_delivery": {
                Args: {
                    "p_invoice_id": string;
                    "p_manual"?: boolean;
                };
                Returns: boolean;
            };
            "record_invoice_payment_preference": {
                Args: {
                    "p_preference": string;
                    "p_token_hash": string;
                };
                Returns: {
                    "invoice_id": string;
                    "preference_changed": boolean;
                }[];
            };
            "record_invoice_preference_with_event": {
                Args: {
                    "p_preference": string;
                    "p_token_hash": string;
                };
                Returns: Json;
            };
            "record_legacy_email_provider_check": {
                Args: {
                    "p_actor_id": string;
                    "p_delivery_status": string;
                    "p_event_id": string;
                    "p_provider_created_at": string;
                    "p_provider_id": string;
                    "p_reason": string;
                    "p_recipient": string;
                    "p_subject": string;
                };
                Returns: boolean;
            };
            "record_manual_invoice_payment": {
                Args: {
                    "p_amount_cents": number;
                    "p_invoice_id": string;
                    "p_method": string;
                    "p_notes"?: string;
                    "p_paid_at": string;
                    "p_reference"?: string;
                };
                Returns: string;
            };
            "record_manual_invoice_payment_request": {
                Args: {
                    "p_amount_cents": number;
                    "p_invoice_id": string;
                    "p_method": string;
                    "p_notes"?: string;
                    "p_paid_at": string;
                    "p_reference"?: string;
                    "p_request_id": string;
                };
                Returns: Json;
            };
            "record_outbound_provider_event": {
                Args: {
                    "p_delivery_id": string;
                    "p_event_id": string;
                    "p_hash": string;
                    "p_message_id": string;
                    "p_occurred_at": string;
                    "p_recipients": Json;
                    "p_type": string;
                };
                Returns: Json;
            };
            "record_portal_view": {
                Args: {
                    "p_document_type": string;
                    "p_referrer_domain"?: string;
                    "p_token_hash": string;
                    "p_user_agent_family"?: string;
                    "p_visitor_session_id": string;
                };
                Returns: {
                    "current_view_count": number;
                    "first_view": boolean;
                    "recorded": boolean;
                }[];
            };
            "release_invoice_void": {
                Args: {
                    "p_invoice_id": string;
                    "p_token": string;
                };
                Returns: undefined;
            };
            "replace_platform_user_roles": {
                Args: {
                    "p_reason"?: string;
                    "p_role_names": (string)[];
                    "p_target_user_id": string;
                };
                Returns: (string)[];
            };
            "report_assigned_equipment_problem": {
                Args: {
                    "p_asset_id": string;
                    "p_assignment_id": string;
                    "p_description": string;
                    "p_equipment_stopped"?: boolean;
                    "p_photo_storage_path"?: string;
                    "p_severity": string;
                    "p_title": string;
                };
                Returns: string;
            };
            "request_quote_changes_by_portal": {
                Args: {
                    "p_expected_revision": number;
                    "p_message": string;
                    "p_request_id": string;
                    "p_token_hash": string;
                };
                Returns: Json;
            };
            "request_stripe_webhook_retry": {
                Args: {
                    "p_event_id": string;
                };
                Returns: Json;
            };
            "resolve_manual_invoice_payment_request": {
                Args: {
                    "p_invoice_id": string;
                    "p_request_id": string;
                };
                Returns: Json;
            };
            "resolve_quote_draft_request": {
                Args: {
                    "p_header": Json;
                    "p_lines": Json;
                    "p_request_id": string;
                };
                Returns: Json;
            };
            "respond_to_change_order_by_portal": {
                Args: {
                    "p_expected_updated_at": string;
                    "p_intent": string;
                    "p_message": string;
                    "p_request_id": string;
                    "p_token_hash": string;
                };
                Returns: Json;
            };
            "restore_cancelled_manual_invoice_payment": {
                Args: {
                    "p_invoice_id": string;
                    "p_payment_id": string;
                };
                Returns: undefined;
            };
            "restore_voided_invoice": {
                Args: {
                    "p_invoice_id": string;
                };
                Returns: string;
            };
            "retry_calendar_operation": {
                Args: {
                    "p_key": string;
                    "p_reason": string;
                    "p_revision": number;
                    "p_updated_at": string;
                };
                Returns: Json;
            };
            "review_customer_source_event": {
                Args: {
                    "p_reason": string;
                    "p_request_id": string;
                    "p_source_id": string;
                };
                Returns: Json;
            };
            "review_job_closeout": {
                Args: {
                    "p_action": string;
                    "p_job_id": string;
                    "p_reason"?: string;
                };
                Returns: Json;
            };
            "review_outbound_delivery": {
                Args: {
                    "p_action": string;
                    "p_delivery_id": string;
                    "p_reason": string;
                    "p_request_id": string;
                };
                Returns: Json;
            };
            "save_assigned_job_closeout": {
                Args: {
                    "p_job_id": string;
                    "p_payload": Json;
                };
                Returns: Json;
            };
            "save_change_order_draft": {
                Args: {
                    "p_change_order_id": string;
                    "p_expected_revision": number;
                    "p_header": Json;
                    "p_lines": Json;
                    "p_request_id": string;
                };
                Returns: Json;
            };
            "save_invoice_details": {
                Args: {
                    "p_due_at": string;
                    "p_expected_updated_at": string;
                    "p_invoice_id": string;
                    "p_lines": Json;
                };
                Returns: Json;
            };
            "save_job_closeout_draft": {
                Args: {
                    "p_expected_revision": number;
                    "p_expected_snapshot": Json;
                    "p_job_id": string;
                    "p_payload": Json;
                };
                Returns: Json;
            };
            "save_job_employee_work_sessions": {
                Args: {
                    "p_job_id": string;
                    "p_mode"?: string;
                    "p_sessions": Json;
                };
                Returns: Json;
            } | {
                Args: {
                    "p_allow_conflicts"?: boolean;
                    "p_expected_snapshot": Json;
                    "p_job_id": string;
                    "p_mode": string;
                    "p_override_reason"?: string;
                    "p_sessions": Json;
                };
                Returns: Json;
            };
            "save_job_work_sessions": {
                Args: {
                    "p_job_id": string;
                    "p_mode"?: string;
                    "p_sessions": Json;
                };
                Returns: Json;
            };
            "save_legacy_appointment": {
                Args: {
                    "p_appointment_id": string;
                    "p_expected_revision": number;
                    "p_job_id": string;
                    "p_mode"?: string;
                    "p_override_reason"?: string;
                    "p_values": Json;
                };
                Returns: Json;
            };
            "save_quote_details": {
                Args: {
                    "p_confirm_party_change"?: boolean;
                    "p_expected_revision": number;
                    "p_header": Json;
                    "p_lines": Json;
                    "p_quote_id": string;
                };
                Returns: Json;
            };
            "save_schedule_event": {
                Args: {
                    "p_allow_conflicts"?: boolean;
                    "p_employee_ids"?: (string)[];
                    "p_event": Json;
                    "p_event_id": string;
                    "p_expected_revision": number;
                    "p_mode"?: string;
                    "p_override_reason"?: string;
                };
                Returns: Json;
            };
            "schedule_lead_estimate": {
                Args: {
                    "p_access_notes": string;
                    "p_assigned_user_id": string;
                    "p_calendar_notes": string;
                    "p_city": string;
                    "p_contact_name": string;
                    "p_email": string;
                    "p_ends_at": string;
                    "p_event_title": string;
                    "p_internal_notes": string;
                    "p_lead_job_id": string;
                    "p_organization_name": string;
                    "p_phone": string;
                    "p_postal_code": string;
                    "p_preferred_appointment_timing": string;
                    "p_preferred_contact_method": string;
                    "p_requested_scope": string;
                    "p_service_notes": string;
                    "p_service_type": string;
                    "p_starts_at": string;
                    "p_state": string;
                    "p_street": string;
                };
                Returns: {
                    "event_created": boolean;
                    "event_id": string;
                }[];
            } | {
                Args: {
                    "p_access_notes": string;
                    "p_assigned_user_id": string;
                    "p_calendar_notes": string;
                    "p_city": string;
                    "p_contact_name": string;
                    "p_email": string;
                    "p_ends_at": string;
                    "p_event_title": string;
                    "p_expected_revision"?: number;
                    "p_internal_notes": string;
                    "p_lead_job_id": string;
                    "p_organization_name": string;
                    "p_override_reason"?: string;
                    "p_phone": string;
                    "p_postal_code": string;
                    "p_preferred_appointment_timing": string;
                    "p_preferred_contact_method": string;
                    "p_requested_scope": string;
                    "p_service_notes": string;
                    "p_service_type": string;
                    "p_starts_at": string;
                    "p_state": string;
                    "p_street": string;
                };
                Returns: {
                    "event_created": boolean;
                    "event_id": string;
                }[];
            };
            "schedule_party_estimate": {
                Args: {
                    "p_access_notes": string;
                    "p_assigned_user_id": string;
                    "p_calendar_notes": string;
                    "p_city": string;
                    "p_contact_id": string;
                    "p_contact_name": string;
                    "p_customer_id": string;
                    "p_email": string;
                    "p_ends_at": string;
                    "p_event_title": string;
                    "p_organization_id": string;
                    "p_phone": string;
                    "p_postal_code": string;
                    "p_requested_scope": string;
                    "p_service_location_id": string;
                    "p_service_notes": string;
                    "p_service_type": string;
                    "p_source_request_key": string;
                    "p_starts_at": string;
                    "p_state": string;
                    "p_street": string;
                };
                Returns: {
                    "event_created": boolean;
                    "event_id": string;
                }[];
            } | {
                Args: {
                    "p_access_notes": string;
                    "p_assigned_user_id": string;
                    "p_calendar_notes": string;
                    "p_city": string;
                    "p_contact_id": string;
                    "p_contact_name": string;
                    "p_customer_id": string;
                    "p_email": string;
                    "p_ends_at": string;
                    "p_event_title": string;
                    "p_expected_revision"?: number;
                    "p_organization_id": string;
                    "p_override_reason"?: string;
                    "p_phone": string;
                    "p_postal_code": string;
                    "p_requested_scope": string;
                    "p_service_location_id": string;
                    "p_service_notes": string;
                    "p_service_type": string;
                    "p_source_request_key": string;
                    "p_starts_at": string;
                    "p_state": string;
                    "p_street": string;
                };
                Returns: {
                    "event_created": boolean;
                    "event_id": string;
                }[];
            };
            "set_employee_access_status": {
                Args: {
                    "p_employee_id": string;
                    "p_reason": string;
                    "p_status": string;
                };
                Returns: Json;
            };
            "staged_upload_info": {
                Args: {
                    "p_actor": string;
                    "p_upload": string;
                };
                Returns: Json;
            };
            "start_assigned_job": {
                Args: {
                    "p_job_id": string;
                };
                Returns: Json;
            };
            "submit_assigned_equipment_inspection": {
                Args: {
                    "p_asset_id": string;
                    "p_assignment_id": string;
                    "p_hours"?: number;
                    "p_mileage"?: number;
                    "p_notes"?: string;
                    "p_overall_result": string;
                    "p_responses": Json;
                    "p_template_key": string;
                };
                Returns: string;
            };
            "submit_assigned_job_closeout": {
                Args: {
                    "p_job_id": string;
                };
                Returns: Json;
            };
            "submit_crew_service_recommendation": {
                Args: {
                    "p_description": string;
                    "p_internal_notes"?: string;
                    "p_job_id": string;
                    "p_timeframe"?: string;
                    "p_title": string;
                };
                Returns: string;
            };
            "submit_job_closeout_atomic": {
                Args: {
                    "p_confirm_future"?: boolean;
                    "p_expected_revision": number;
                    "p_expected_snapshot": Json;
                    "p_job_id": string;
                    "p_payload": Json;
                    "p_request_id": string;
                };
                Returns: Json;
            };
            "submit_my_employee_document": {
                Args: {
                    "p_document_type": string;
                    "p_expiration_date"?: string;
                    "p_file_size_bytes": number;
                    "p_issue_date"?: string;
                    "p_mime_type": string;
                    "p_storage_path": string;
                    "p_title": string;
                };
                Returns: string;
            };
            "submit_my_employee_request": {
                Args: {
                    "p_details": string;
                    "p_request_type": string;
                    "p_title": string;
                };
                Returns: string;
            };
            "submit_website_lead": {
                Args: {
                    "p_submission": Json;
                };
                Returns: Json;
            };
            "transition_change_order_workflow": {
                Args: {
                    "p_change_order_id": string;
                    "p_expected_revision": number;
                    "p_intent": string;
                    "p_request_id": string;
                };
                Returns: Json;
            };
            "unblock_website_sender": {
                Args: {
                    "p_block": string;
                    "p_reason": string;
                    "p_request": string;
                };
                Returns: Json;
            };
            "update_office_handoff": {
                Args: {
                    "p_assignee_id": string;
                    "p_expected_updated_at": string;
                    "p_snoozed_until": string;
                    "p_task_id": string;
                };
                Returns: Json;
            };
        };
        Enums: {
            [_ in never]: never;
        };
        CompositeTypes: {
            [_ in never]: never;
        };
    };
};
type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];
export type Tables<DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | {
    schema: keyof DatabaseWithoutInternals;
}, TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"]) : never = never> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
    Row: infer R;
} ? R : never : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
    Row: infer R;
} ? R : never : never;
export type TablesInsert<DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | {
    schema: keyof DatabaseWithoutInternals;
}, TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] : never = never> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Insert: infer I;
} ? I : never : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Insert: infer I;
} ? I : never : never;
export type TablesUpdate<DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | {
    schema: keyof DatabaseWithoutInternals;
}, TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] : never = never> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Update: infer U;
} ? U : never : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Update: infer U;
} ? U : never : never;
export type Enums<DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | {
    schema: keyof DatabaseWithoutInternals;
}, EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"] : never = never> = DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName] : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions] : never;
export type CompositeTypes<PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] | {
    schema: keyof DatabaseWithoutInternals;
}, CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"] : never = never> = PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName] : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions] : never;
export const Constants = {
    "public": {
        Enums: {}
    }
} as const;
