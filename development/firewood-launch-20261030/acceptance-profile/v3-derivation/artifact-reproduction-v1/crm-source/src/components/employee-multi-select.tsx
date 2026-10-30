"use client";

import { useId, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import {
  employeeSelectionLabel,
  filterEmployeeOptions,
  normalizeEmployeeSelection,
  toggleEmployeeSelection,
  type EmployeeSelectionOption,
} from "@/lib/schedule/employee-selection";

export function EmployeeMultiSelect({
  defaultSelectedIds = [],
  description,
  disabled = false,
  employees,
  label,
  name,
  onChange,
  selectedIds,
}: {
  defaultSelectedIds?: string[];
  description?: string;
  disabled?: boolean;
  employees: EmployeeSelectionOption[];
  label: string;
  name?: string;
  onChange?: (selectedIds: string[]) => void;
  selectedIds?: string[];
}) {
  const descriptionId = useId();
  const searchId = useId();
  const [internalSelection, setInternalSelection] = useState(() => normalizeEmployeeSelection(defaultSelectedIds));
  const [query, setQuery] = useState("");
  const selection = normalizeEmployeeSelection(selectedIds ?? internalSelection);
  const selectedSet = useMemo(() => new Set(selection), [selection]);
  const employeesById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const filteredEmployees = useMemo(() => filterEmployeeOptions(employees, query), [employees, query]);
  const unavailableSelectedIds = selection.filter((id) => !employeesById.has(id));

  function commit(nextIds: string[]) {
    const normalized = normalizeEmployeeSelection(nextIds);
    if (selectedIds === undefined) setInternalSelection(normalized);
    onChange?.(normalized);
  }

  function toggle(employeeId: string) {
    commit(toggleEmployeeSelection(selection, employeeId));
  }

  return (
    <fieldset aria-describedby={description ? descriptionId : undefined} className="employee-multi-select" disabled={disabled}>
      <legend>{label}</legend>
      {description ? <p className="employee-multi-select-description" id={descriptionId}>{description}</p> : null}

      <div className="employee-selection-summary">
        <strong aria-live="polite">{selection.length ? `${selection.length} selected` : "No employees selected"}</strong>
        {selection.length > 1 ? <button className="employee-selection-clear" onClick={() => commit([])} type="button">Clear all</button> : null}
      </div>

      {selection.length ? <div aria-label="Selected employees" className="employee-selection-chips">
        {selection.map((employeeId) => {
          const employee = employeesById.get(employeeId);
          const employeeLabel = employee ? employeeSelectionLabel(employee) : "Unavailable employee";
          return <span className="employee-selection-chip" key={employeeId}>
            <span>{employeeLabel}</span>
            <button aria-label={`Remove ${employeeLabel}`} disabled={disabled} onClick={() => toggle(employeeId)} title={`Remove ${employeeLabel}`} type="button"><X aria-hidden="true" size={15} /></button>
          </span>;
        })}
      </div> : null}

      {employees.length > 6 ? <label className="employee-selection-search" htmlFor={searchId}>
        <span className="sr-only">Search employees</span>
        <Search aria-hidden="true" size={17} />
        <input id={searchId} onChange={(event) => setQuery(event.target.value)} placeholder="Search employees" type="search" value={query} />
      </label> : null}

      {employees.length > 4 ? <div className="employee-selection-actions">
        <button disabled={disabled || employees.every((employee) => selectedSet.has(employee.id))} onClick={() => commit([...selection, ...employees.map((employee) => employee.id)])} type="button">Select all</button>
      </div> : null}

      <div className="employee-selection-options">
        {filteredEmployees.map((employee) => {
          const employeeLabel = employeeSelectionLabel(employee);
          const secondary = employee.email && employee.email !== employeeLabel
            ? employee.email
            : employee.role_names?.length
              ? employee.role_names.join(", ").replaceAll("_", " ")
              : null;
          return <label className="employee-selection-option" key={employee.id}>
            <input
              checked={selectedSet.has(employee.id)}
              name={name}
              onChange={() => toggle(employee.id)}
              type="checkbox"
              value={employee.id}
            />
            <span><strong>{employeeLabel}</strong>{secondary ? <small>{secondary}</small> : null}</span>
          </label>;
        })}
        {!employees.length ? <p className="employee-selection-empty">No active employees are available.</p> : null}
        {employees.length && !filteredEmployees.length ? <p className="employee-selection-empty">No employees match that search.</p> : null}
      </div>

      {name ? unavailableSelectedIds.map((employeeId) => <input key={employeeId} name={name} type="hidden" value={employeeId} />) : null}
    </fieldset>
  );
}
