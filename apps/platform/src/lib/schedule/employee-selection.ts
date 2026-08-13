export type EmployeeSelectionOption = {
  email: string | null;
  full_name: string | null;
  id: string;
  role_names?: string[];
};

export function normalizeEmployeeSelection(ids: readonly string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

export function toggleEmployeeSelection(selectedIds: readonly string[], employeeId: string) {
  const normalized = normalizeEmployeeSelection(selectedIds);
  return normalized.includes(employeeId)
    ? normalized.filter((id) => id !== employeeId)
    : [...normalized, employeeId];
}

export function filterEmployeeOptions(
  employees: readonly EmployeeSelectionOption[],
  query: string,
) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [...employees];
  return employees.filter((employee) => {
    const searchable = [employee.full_name, employee.email, ...(employee.role_names ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}

export function employeeSelectionLabel(employee: EmployeeSelectionOption) {
  return employee.full_name || employee.email || "Unnamed employee";
}
