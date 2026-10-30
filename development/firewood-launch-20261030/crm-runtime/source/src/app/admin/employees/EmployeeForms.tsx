"use client";

import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import Link from "next/link";
import { useState } from "react";
import {
  Award,
  FileUp,
  Save,
  ShieldCheck,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import type {
  CredentialType,
  EmployeeDetail,
  EmployeeOnboardingItem,
} from "@/lib/types/database";
import { formatBusinessDate } from "@/lib/business-time";
import {
  addEmployeeCredential,
  createEmployee,
  createSafetyMeeting,
  createTrainingSession,
  deactivateQualificationRequirement,
  linkEmployeePlatformAccount,
  saveQualificationRequirement,
  updateEmployee,
  updateEmployeeRoles,
  updateOnboardingItem,
  updateSeparationItem,
  uploadEmployeeDocument,
  type EmployeeActionState,
} from "./actions";

const initialState: EmployeeActionState = { status: "idle", message: "" };
const statuses = [
  "applicant",
  "onboarding",
  "active",
  "seasonal",
  "leave",
  "inactive",
  "separated",
];

export function EmployeeForm({
  employee,
  supervisors,
  emergencyContact,
  privateNotes,
  canSeePrivate,
}: {
  employee?: EmployeeDetail;
  supervisors: {
    id: string;
    preferred_name: string | null;
    legal_name: string | null;
  }[];
  emergencyContact?: {
    full_name: string;
    relationship: string | null;
    phone: string;
    alternate_phone: string | null;
  } | null;
  privateNotes?: string | null;
  canSeePrivate: boolean;
}) {
  const [state, action, pending] = useReliableActionState(
    employee ? updateEmployee : createEmployee,
    initialState,
  );
  const accessDisabled = Boolean(
    employee &&
      (!employee.is_active ||
        employee.archived_at ||
        ["inactive", "separated"].includes(employee.employment_status)),
  );
  return (
    <form action={action} className="crm-form employee-form">
      {employee ? (
        <input name="employee_id" type="hidden" value={employee.id} />
      ) : null}
      <Message state={state} />
      <fieldset className="nested-fieldset">
        <legend>Name</legend>
        <div className="form-grid-two">
          <label>
            Legal name
            <input
              defaultValue={employee?.legal_name ?? ""}
              name="legal_name"
              required
            />
          </label>
          <label>
            Preferred name
            <input
              defaultValue={employee?.preferred_name ?? ""}
              name="preferred_name"
            />
          </label>
        </div>
      </fieldset>
      <fieldset className="nested-fieldset">
        <legend>Work</legend>
        <div className="form-grid-two">
          <label>
            Job title
            <input defaultValue={employee?.job_title ?? ""} name="job_title" />
          </label>
          <label>
            Crew
            <input defaultValue={employee?.crew_name ?? ""} name="crew_name" />
          </label>
        </div>
        {accessDisabled ? (
          <input
            type="hidden"
            name="employment_status"
            value={employee!.employment_status}
          />
        ) : null}
        <label>
          Status
          <select
            disabled={accessDisabled}
            defaultValue={employee?.employment_status ?? "applicant"}
            name="employment_status"
          >
            {statuses.map((status) => (
              <option
                disabled={
                  Boolean(employee) &&
                  ["inactive", "separated"].includes(status)
                }
                key={status}
                value={status}
              >
                {title(status)}
              </option>
            ))}
          </select>
        </label>
        {employee ? (
          <p className="employee-muted">
            To deactivate or reactivate, return to the employee overview.
          </p>
        ) : null}
      </fieldset>
      <fieldset className="nested-fieldset">
        <legend>Contact</legend>
        <div className="form-grid-two">
          <label>
            Contact email
            <input
              defaultValue={employee?.contact_email ?? ""}
              name="contact_email"
              type="email"
            />
          </label>
          <label>
            Phone
            <input
              defaultValue={employee?.contact_phone ?? ""}
              name="contact_phone"
              type="tel"
            />
          </label>
        </div>
        {employee?.profiles?.email &&
        employee.contact_email &&
        employee.profiles.email.toLowerCase() !==
          employee.contact_email.toLowerCase() ? (
          <p className="form-message warning">
            Sign-in email: {employee.profiles.email}. Contact changes do not
            change the sign-in email.
          </p>
        ) : null}
      </fieldset>
      <details className="employee-disclosure">
        <summary>Employment details</summary>
        <div className="form-grid-two">
          <label>
            Employment type
            <select
              defaultValue={employee?.employment_type ?? "permanent"}
              name="employment_type"
            >
              <option value="permanent">Permanent</option>
              <option value="seasonal">Seasonal</option>
              <option value="temporary">Temporary</option>
              <option value="contractor">Contractor</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Hire date
            <input
              defaultValue={employee?.hire_date ?? ""}
              name="hire_date"
              type="date"
            />
          </label>
          <label>
            Department
            <input
              defaultValue={employee?.department ?? ""}
              name="department"
            />
          </label>
          <label>
            Primary supervisor
            <select
              defaultValue={employee?.supervisor_employee_id ?? ""}
              name="supervisor_employee_id"
            >
              <option value="">Not assigned</option>
              {supervisors
                .filter((item) => item.id !== employee?.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.preferred_name || item.legal_name || "Supervisor"}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <label className="checkbox-field">
          <input
            defaultChecked={employee?.is_supervisor ?? false}
            name="is_supervisor"
            type="checkbox"
          />
          This employee supervises a crew
        </label>
      </details>
      <details className="employee-disclosure">
        <summary>Employee number & photo</summary>
        <div className="form-grid-two">
          <label>
            Employee number
            <input
              defaultValue={employee?.employee_number ?? ""}
              name="employee_number"
              placeholder="ATS-EMP-001"
            />
          </label>
          <label>
            Profile photo
            <input
              accept="image/jpeg,image/png,image/webp"
              name="profile_photo"
              type="file"
            />
          </label>
        </div>
      </details>
      <details className="employee-disclosure">
        <summary>Address & language</summary>
        <label>
          Home address
          <textarea
            defaultValue={employee?.home_address ?? ""}
            name="home_address"
            rows={2}
          />
        </label>
        <label>
          Preferred language
          <input
            defaultValue={employee?.preferred_language ?? ""}
            name="preferred_language"
          />
        </label>
      </details>
      <details className="employee-disclosure">
        <summary>Emergency contact</summary>
        <div className="form-grid-two">
          <label>
            Name
            <input
              defaultValue={emergencyContact?.full_name ?? ""}
              name="emergency_name"
            />
          </label>
          <label>
            Relationship
            <input
              defaultValue={emergencyContact?.relationship ?? ""}
              name="emergency_relationship"
            />
          </label>
          <label>
            Phone
            <input
              defaultValue={emergencyContact?.phone ?? ""}
              name="emergency_phone"
              type="tel"
            />
          </label>
          <label>
            Alternate phone
            <input
              defaultValue={emergencyContact?.alternate_phone ?? ""}
              name="emergency_alternate_phone"
              type="tel"
            />
          </label>
        </div>
      </details>
      {!employee || employee.separation_date || employee.separation_reason ? (
        <details className="employee-disclosure">
          <summary>Separation details</summary>
          <div className="form-grid-two">
            <label>
              Separation date
              <input
                disabled={Boolean(employee)}
                defaultValue={employee?.separation_date ?? ""}
                name="separation_date"
                type="date"
              />
            </label>
            <label>
              Reason
              <input
                disabled={Boolean(employee)}
                defaultValue={employee?.separation_reason ?? ""}
                name="separation_reason"
              />
            </label>
          </div>
        </details>
      ) : null}
      <details className="employee-disclosure">
        <summary>Notes</summary>
        <label>
          Operational notes
          <textarea
            defaultValue={employee?.operational_notes ?? ""}
            name="operational_notes"
            placeholder="Scheduling, training, or crew notes. Do not enter medical diagnoses or sensitive identity data."
            rows={4}
          />
        </label>
        {canSeePrivate ? (
          <label>
            Owner/admin private notes
            <textarea
              defaultValue={privateNotes ?? ""}
              name="private_hr_notes"
              placeholder="Restricted notes. Do not store SSNs, bank credentials, or detailed medical information."
              rows={3}
            />
          </label>
        ) : null}
      </details>
      {state.status === "warning" ? (
        <label className="checkbox-field">
          <input name="duplicate_override" type="checkbox" />I confirmed this is
          a separate employee record.
        </label>
      ) : null}
      <div className="action-row employee-sticky-actions">
        <button disabled={pending} type="submit">
          <Save size={18} />
          {pending ? "Saving…" : employee ? "Save changes" : "Create employee"}
        </button>
        <Link
          className="secondary-action"
          href={
            employee ? `/admin/employees/${employee.id}` : "/admin/employees"
          }
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

export function OnboardingItemForm({
  employeeId,
  item,
}: {
  employeeId: string;
  item: EmployeeOnboardingItem;
}) {
  const [state, action, pending] = useReliableActionState(
    updateOnboardingItem,
    initialState,
  );
  const [status, setStatus] = useState(item.completion_status);
  return (
    <details className="employee-task">
      <summary>
        <span>{item.label}</span>
        <small>{title(item.completion_status)}</small>
      </summary>
      <form action={action} className="employee-checklist-row">
        <input name="employee_id" type="hidden" value={employeeId} />
        <input name="item_id" type="hidden" value={item.id} />
        <label className="review-field">
          Status
          <select
            aria-label={`Status for ${item.label}`}
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            name="completion_status"
          >
            <option value="incomplete">Incomplete</option>
            <option value="complete">Complete</option>
            <option value="not_applicable">Not applicable</option>
          </select>
        </label>
        <label className="review-field">
          Notes
          <input
            aria-label={`Notes for ${item.label}`}
            defaultValue={item.notes ?? ""}
            name="notes"
            placeholder="Optional note"
          />
        </label>
        {item.completion_status !== "incomplete" && status === "incomplete" ? (
          <label className="review-field">
            Reason for reopening
            <input
              aria-label={`Reopening reason for ${item.label}`}
              name="reopen_reason"
              required
            />
          </label>
        ) : null}
        {item.completed_at ? (
          <p className="employee-muted">
            Verified {formatDate(item.completed_at)}
          </p>
        ) : null}
        <button disabled={pending} type="submit">
          {pending ? "Saving…" : "Save task"}
        </button>
        <Message state={state} />
      </form>
    </details>
  );
}

export function SeparationItemForm({ employeeId, item }: {
  employeeId: string;
  item: EmployeeOnboardingItem;
}) {
  const [state, action, pending] = useReliableActionState(updateSeparationItem, initialState);
  const [status, setStatus] = useState(item.completion_status);
  const [notes, setNotes] = useState(item.notes ?? "");
  return (
    <form action={action} className="employee-checklist-row" aria-busy={pending}
      onReset={(event) => event.preventDefault()}>
      <input name="employee_id" type="hidden" value={employeeId} />
      <input name="item_id" type="hidden" value={item.id} />
      <label className="review-field">
        Status
        <select aria-label={`Status for ${item.label}`} name="completion_status"
          value={status} onChange={(event) => setStatus(event.target.value as typeof status)} disabled={pending}>
          <option value="incomplete">Incomplete</option>
          <option value="complete">Complete</option>
          <option value="not_applicable">Not applicable</option>
        </select>
      </label>
      <label className="review-field">
        Review note
        <input aria-label={`Review note for ${item.label}`} name="notes" maxLength={800}
          value={notes} onChange={(event) => setNotes(event.target.value)} readOnly={pending} placeholder="Optional note" />
      </label>
      {item.completed_at ? <p className="employee-muted">Completed {formatDate(item.completed_at)}</p> : null}
      <button disabled={pending} type="submit">{pending ? "Saving…" : "Save task"}</button>
      <Message state={state} />
    </form>
  );
}

export function CredentialForm({
  employeeId,
  types,
  canAdmin,
}: {
  employeeId: string;
  types: CredentialType[];
  canAdmin: boolean;
}) {
  const [state, action, pending] = useReliableActionState(
    addEmployeeCredential,
    initialState,
  );
  return (
    <form action={action} className="crm-form">
      <input name="employee_id" type="hidden" value={employeeId} />
      <Message state={state} />
      <div className="form-grid-two">
        <label>
          Credential type
          <select name="credential_type_id">
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Credential number
          <input name="credential_number" />
        </label>
      </div>
      <label>
        Issuing organization
        <input name="issuing_organization" />
      </label>
      <div className="form-grid-two">
        <label>
          Issue date
          <input name="issue_date" type="date" />
        </label>
        <label>
          Expiration date
          <input name="expiration_date" type="date" />
        </label>
      </div>
      <fieldset className="nested-fieldset">
        <legend>Optional card or certificate</legend>
        <label>
          Document title
          <input
            name="credential_document_title"
            placeholder="Credential card or training certificate"
          />
        </label>
        <label>
          Private file
          <input
            accept="application/pdf,image/jpeg,image/png,image/webp"
            name="credential_file"
            type="file"
          />
        </label>
        <label>
          Access classification
          <select name="credential_access_classification">
            <option value="employee_visible">Employee visible</option>
            <option value="supervisor_visible">Supervisor visible</option>
            {canAdmin ? (
              <>
                <option value="admin_only">Admin only</option>
                <option value="owner_only">Owner only</option>
              </>
            ) : null}
          </select>
        </label>
      </fieldset>
      <label>
        Notes
        <textarea name="notes" rows={2} />
      </label>
      <button disabled={pending} type="submit">
        <Award size={18} />
        {pending ? "Adding..." : "Add pending credential"}
      </button>
    </form>
  );
}

export function EmployeeDocumentForm({
  employeeId,
  canOwnerOnly,
}: {
  employeeId: string;
  canOwnerOnly: boolean;
}) {
  const [state, action, pending] = useReliableActionState(
    uploadEmployeeDocument,
    initialState,
  );
  return (
    <form action={action} className="crm-form">
      <input name="employee_id" type="hidden" value={employeeId} />
      <Message state={state} />
      <div className="form-grid-two">
        <label>
          Document title
          <input name="title" required />
        </label>
        <label>
          Document type
          <input
            name="document_type"
            placeholder="License, certificate, policy..."
          />
        </label>
      </div>
      <label>
        Access classification
        <select name="access_classification">
          <option value="employee_visible">Employee visible</option>
          <option value="supervisor_visible">Supervisor visible</option>
          {canOwnerOnly ? (
            <>
              <option value="admin_only">Admin only</option>
              <option value="owner_only">Owner only</option>
            </>
          ) : null}
        </select>
      </label>
      <div className="form-grid-two">
        <label>
          Issue date
          <input name="issue_date" type="date" />
        </label>
        <label>
          Expiration date
          <input name="expiration_date" type="date" />
        </label>
      </div>
      <label>
        Private file
        <input
          accept="application/pdf,image/jpeg,image/png,image/webp"
          name="file"
          required
          type="file"
        />
      </label>
      <label>
        Notes
        <textarea name="notes" rows={2} />
      </label>
      <button disabled={pending} type="submit">
        <FileUp size={18} />
        {pending ? "Uploading..." : "Upload private document"}
      </button>
    </form>
  );
}

export function EmployeeRolesForm({
  employeeId,
  authUserId,
  roles,
}: {
  employeeId: string;
  authUserId: string;
  roles: string[];
}) {
  const [state, action, pending] = useReliableActionState(
    updateEmployeeRoles,
    initialState,
  );
  return (
    <form action={action} className="crm-form">
      <input name="employee_id" type="hidden" value={employeeId} />
      <input name="auth_user_id" type="hidden" value={authUserId} />
      <Message state={state} />
      <fieldset className="role-checkbox-grid">
        <legend>Permissions</legend>
        {["crew", "estimator", "payroll_admin", "admin"].map((role) => (
          <label className="checkbox-field" key={role}>
            <input
              defaultChecked={roles.includes(role)}
              name="roles"
              type="checkbox"
              value={role}
            />
            {title(role)}
          </label>
        ))}
      </fieldset>
      <label>
        Manager approval note
        <textarea
          name="qualification_override_reason"
          placeholder="Required only if a qualification rule needs an exception"
          rows={2}
        />
      </label>
      <button disabled={pending} type="submit">
        <ShieldCheck size={18} />
        {pending ? "Saving roles..." : "Save permissions"}
      </button>
    </form>
  );
}

export function PromoteToAdminForm({
  employeeId,
  authUserId,
  roles,
}: {
  employeeId: string;
  authUserId: string;
  roles: string[];
}) {
  const [state, action, pending] = useReliableActionState(
    updateEmployeeRoles,
    initialState,
  );
  const nextRoles = Array.from(new Set([...roles, "admin"]));
  return (
    <form action={action} className="crm-form">
      <input name="employee_id" type="hidden" value={employeeId} />
      <input name="auth_user_id" type="hidden" value={authUserId} />
      {nextRoles.map((role) => (
        <input key={role} name="roles" type="hidden" value={role} />
      ))}
      <Message state={state} />
      <p className="field-note">
        Adds administrator permission without removing current permissions.
      </p>
      <button disabled={pending} type="submit">
        <ShieldCheck size={18} />
        {pending ? "Promoting..." : "Make admin"}
      </button>
    </form>
  );
}

export function LinkPlatformAccountForm({
  employeeId,
  accounts,
}: {
  employeeId: string;
  accounts: {
    id: string;
    full_name: string | null;
    email: string | null;
    status: string;
  }[];
}) {
  const [state, action, pending] = useReliableActionState(
    linkEmployeePlatformAccount,
    initialState,
  );
  return (
    <form action={action} className="crm-form">
      <input name="employee_id" type="hidden" value={employeeId} />
      <Message state={state} />
      <label>
        Existing sign-in account
        <select
          disabled={!accounts.length || pending}
          name="auth_user_id"
          required
        >
          <option value="">Choose an account</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.full_name || account.email || "Unnamed account"}
              {account.email && account.full_name ? `, ${account.email}` : ""} (
              {title(account.status)})
            </option>
          ))}
        </select>
      </label>
      <p className="field-note">
        Connect an existing sign-in account. Work assignments stay the same.
      </p>
      <button disabled={!accounts.length || pending} type="submit">
        <ShieldCheck size={18} />
        {pending ? "Linking..." : "Connect account"}
      </button>
      {!accounts.length ? (
        <p className="inline-empty">
          Every platform account is already linked to an employee record.
        </p>
      ) : null}
    </form>
  );
}

export function TrainingSessionForm({
  employees,
}: {
  employees: {
    id: string;
    preferred_name: string | null;
    legal_name: string | null;
  }[];
}) {
  const [state, action, pending] = useReliableActionState(
    createTrainingSession,
    initialState,
  );
  return (
    <form action={action} className="crm-form">
      <Message state={state} />
      <div className="form-grid-two">
        <label>
          Training title
          <input name="title" required />
        </label>
        <label>
          Training type
          <input
            name="training_type"
            placeholder="Chainsaw, first aid, orientation..."
          />
        </label>
      </div>
      <div className="form-grid-three">
        <label>
          Date and time
          <input name="starts_at" required type="datetime-local" />
        </label>
        <label>
          Duration minutes
          <input min="1" name="duration_minutes" type="number" />
        </label>
        <label>
          Refresher due
          <input name="refresher_due_at" type="datetime-local" />
        </label>
      </div>
      <div className="form-grid-two">
        <label>
          Instructor/provider
          <input name="provider_or_instructor" />
        </label>
        <label>
          Location
          <input name="location_label" />
        </label>
      </div>
      <label>
        Content/version identifier
        <input
          name="document_version"
          placeholder="Example: Chainsaw safety 2026-07"
        />
      </label>
      <label>
        Result for selected attendees
        <select name="result">
          <option value="completed">Completed</option>
          <option value="passed">Passed</option>
          <option value="incomplete">Incomplete</option>
          <option value="failed">Failed</option>
        </select>
      </label>
      <EmployeePicker
        employees={employees}
        name="employee_ids"
        title="Employees attending"
      />
      <label>
        Attachments
        <input
          accept="application/pdf,image/jpeg,image/png,image/webp"
          multiple
          name="training_attachments"
          type="file"
        />
      </label>
      <label>
        Instructor notes
        <textarea name="instructor_notes" rows={4} />
      </label>
      <button disabled={pending} type="submit">
        <UsersRound size={18} />
        {pending ? "Recording..." : "Record training session"}
      </button>
    </form>
  );
}

export function SafetyMeetingForm({
  employees,
}: {
  employees: {
    id: string;
    preferred_name: string | null;
    legal_name: string | null;
  }[];
}) {
  const [state, action, pending] = useReliableActionState(
    createSafetyMeeting,
    initialState,
  );
  return (
    <form action={action} className="crm-form">
      <Message state={state} />
      <div className="form-grid-two">
        <label>
          Topic/title
          <input name="title" required />
        </label>
        <label>
          Topic template
          <select name="topic_key">
            <option value="ppe">PPE</option>
            <option value="chainsaw_safety">Chainsaw safety</option>
            <option value="chipper_safety">Chipper safety</option>
            <option value="electrical_hazards">Electrical hazards</option>
            <option value="struck_by">Struck-by hazards</option>
            <option value="drop_zones">Drop zones</option>
            <option value="traffic_control">Traffic control</option>
            <option value="heat_stress">Heat stress</option>
            <option value="climbing_rigging">Climbing and rigging</option>
            <option value="emergency_response">Emergency response</option>
            <option value="equipment_inspection">Equipment inspection</option>
            <option value="storm_work">Storm work</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <div className="form-grid-three">
        <label>
          Date and time
          <input name="starts_at" required type="datetime-local" />
        </label>
        <label>
          Leader
          <input name="leader_name" />
        </label>
        <label>
          Location
          <input name="location_label" />
        </label>
      </div>
      <label>
        Content/version identifier
        <input
          name="document_version"
          placeholder="Example: Heat stress talk 2026-07"
        />
      </label>
      <EmployeePicker
        employees={employees}
        name="present_employee_ids"
        title="Present"
      />
      <EmployeePicker
        employees={employees}
        name="absent_employee_ids"
        title="Absent or excused"
      />
      <div className="form-grid-two">
        <label>
          Attachments
          <input
            accept="application/pdf,image/jpeg,image/png,image/webp"
            multiple
            name="safety_attachments"
            type="file"
          />
        </label>
        <label>
          Meeting photos
          <input
            accept="image/jpeg,image/png,image/webp"
            multiple
            name="safety_photos"
            type="file"
          />
        </label>
      </div>
      <label>
        Subject matter
        <textarea name="subject_matter" rows={3} />
      </label>
      <label>
        Meeting notes
        <textarea name="meeting_notes" rows={4} />
      </label>
      <label>
        Follow-up actions
        <textarea name="follow_up_actions" rows={3} />
      </label>
      <button disabled={pending} type="submit">
        <UserPlus size={18} />
        {pending ? "Saving..." : "Record safety meeting"}
      </button>
    </form>
  );
}

export function QualificationRequirementsForm({
  credentialTypes,
  requirements,
}: {
  credentialTypes: CredentialType[];
  requirements: {
    id: string;
    requirement_scope: string;
    scope_value: string;
    credential_type_id: string;
    warning_only: boolean;
    credential_types: { label?: string } | { label?: string }[] | null;
  }[];
}) {
  const [state, action, pending] = useReliableActionState(
    saveQualificationRequirement,
    initialState,
  );
  return (
    <div className="qualification-settings">
      <form action={action} className="crm-form">
        <Message state={state} />
        <div className="form-grid-three">
          <label>
            Applies to
            <select name="requirement_scope">
              <option value="job_assignment_role">Job assignment role</option>
              <option value="equipment_category">Equipment category</option>
              <option value="platform_role">Platform role</option>
            </select>
          </label>
          <label>
            Role or category value
            <input
              name="scope_value"
              placeholder="driver, climber, aerial_lift..."
              required
            />
          </label>
          <label>
            Credential warning
            <select name="credential_type_id" required>
              <option value="">Choose credential</option>
              {credentialTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="checkbox-field">
          <input name="requires_override" type="checkbox" />
          Require owner/admin override instead of warning only
        </label>
        <label>
          Operational note
          <input
            name="notes"
            placeholder="Company rule or supervisor guidance; not a legal determination"
          />
        </label>
        <button disabled={pending} type="submit">
          <ShieldCheck size={18} />
          {pending ? "Saving..." : "Add warning rule"}
        </button>
      </form>
      <div className="linked-record-list">
        {requirements.length ? (
          requirements.map((requirement) => {
            const relation = requirement.credential_types;
            const credentialLabel =
              (Array.isArray(relation)
                ? relation[0]?.label
                : relation?.label) || "Credential";
            return (
              <article className="linked-record" key={requirement.id}>
                <strong>
                  {title(requirement.scope_value)} requires {credentialLabel}
                </strong>
                <span>
                  {title(requirement.requirement_scope)} ·{" "}
                  {requirement.warning_only
                    ? "warning only"
                    : "owner/admin override required"}
                </span>
                <form action={deactivateQualificationRequirement}>
                  <input
                    name="requirement_id"
                    type="hidden"
                    value={requirement.id}
                  />
                  <button
                    className="icon-action"
                    title="Deactivate warning rule"
                    type="submit"
                  >
                    <Trash2 aria-hidden="true" size={17} />
                    <span className="sr-only">Deactivate warning rule</span>
                  </button>
                </form>
              </article>
            );
          })
        ) : (
          <p className="inline-empty">
            No qualification warning rules configured yet.
          </p>
        )}
      </div>
    </div>
  );
}

function EmployeePicker({
  employees,
  name,
  title: heading,
}: {
  employees: {
    id: string;
    preferred_name: string | null;
    legal_name: string | null;
  }[];
  name: string;
  title: string;
}) {
  return (
    <fieldset className="employee-picker">
      <legend>{heading}</legend>
      {employees.map((employee) => (
        <label className="checkbox-field" key={employee.id}>
          <input name={name} type="checkbox" value={employee.id} />
          {employee.preferred_name || employee.legal_name || "Employee"}
        </label>
      ))}
    </fieldset>
  );
}
function Message({ state }: { state: EmployeeActionState }) {
  return state.message ? (
    <p
      className={`form-message ${state.status}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  ) : null;
}
function title(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function formatDate(value: string) {
  return formatBusinessDate(value, { dateStyle: "medium" });
}
