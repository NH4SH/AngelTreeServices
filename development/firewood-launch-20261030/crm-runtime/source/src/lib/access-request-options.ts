export const employeeRequestedRoleOptions = [
  { label: "Crew", value: "crew" },
  { label: "Estimator", value: "estimator" },
  { label: "Admin assistant", value: "admin_assistant" },
  { label: "Payroll / time clock only", value: "payroll_time_clock_only" },
  { label: "Other", value: "other" },
] as const;

export type EmployeeRequestedRoleValue =
  (typeof employeeRequestedRoleOptions)[number]["value"];
