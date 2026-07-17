import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Boxes,
  Building2,
  CalendarDays,
  ClipboardList,
  Clock3,
  FilePlus2,
  Files,
  FileText,
  Forklift,
  GraduationCap,
  HardHat,
  LayoutDashboard,
  Megaphone,
  MessageSquareMore,
  ReceiptText,
  ShieldCheck,
  Sprout,
  UserCheck,
  UserPlus,
  UsersRound,
  Workflow,
} from "lucide-react";
import type { PlatformRoleName } from "@/lib/auth/roles";

export type NavigationSection =
  | "workflow"
  | "records"
  | "operations"
  | "team"
  | "business"
  | "crew";

export type NavigationPermission =
  | "internalStaff"
  | "reporting"
  | "timeClockReview"
  | "timeClockEligible"
  | "accessApproval"
  | "crewApp";

export type NavigationAudience = "admin" | "crew";

export type NavigationItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  section: NavigationSection;
  audience: NavigationAudience;
  permission?: NavigationPermission;
  activePatterns: string[];
  keywords: string[];
};

export type NavigationCommand = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  audience: NavigationAudience | "all";
  permission?: NavigationPermission;
  keywords: string[];
};

export const navigationSectionLabels: Record<NavigationSection, string> = {
  workflow: "Daily workflow",
  records: "Records",
  operations: "Operations",
  team: "Team",
  business: "Business",
  crew: "Crew tools",
};

const permissionRoles: Record<NavigationPermission, readonly PlatformRoleName[]> = {
  internalStaff: ["owner", "admin", "payroll_admin", "estimator"],
  reporting: ["owner", "admin", "payroll_admin", "estimator"],
  timeClockReview: ["owner", "admin", "payroll_admin"],
  timeClockEligible: ["owner", "admin", "payroll_admin", "estimator", "crew"],
  accessApproval: ["owner", "admin"],
  crewApp: ["owner", "admin", "payroll_admin", "estimator", "crew"],
};

export const navigationItems: NavigationItem[] = [
  { id: "admin", label: "Dashboard", href: "/admin", icon: LayoutDashboard, section: "workflow", audience: "admin", permission: "internalStaff", activePatterns: ["/admin"], keywords: ["home", "overview", "pipeline"] },
  { id: "communications", label: "Leads & Communications", href: "/admin/communications", icon: MessageSquareMore, section: "workflow", audience: "admin", permission: "internalStaff", activePatterns: ["/admin/communications/*"], keywords: ["leads", "inbox", "callbacks", "email", "messages", "estimates"] },
  { id: "quotes", label: "Quotes", href: "/admin/quotes", icon: FileText, section: "workflow", audience: "admin", permission: "internalStaff", activePatterns: ["/admin/quotes/*", "/admin/change-orders/*"], keywords: ["estimates", "proposals", "change orders"] },
  { id: "jobs", label: "Jobs", href: "/admin/jobs", icon: Workflow, section: "workflow", audience: "admin", permission: "internalStaff", activePatterns: ["/admin/jobs/*"], keywords: ["work orders", "closeouts", "field work"] },
  { id: "schedule", label: "Schedule", href: "/admin/schedule", icon: CalendarDays, section: "workflow", audience: "admin", permission: "internalStaff", activePatterns: ["/admin/schedule/*"], keywords: ["calendar", "appointments", "crew"] },
  { id: "invoices", label: "Invoices", href: "/admin/invoices", icon: ReceiptText, section: "workflow", audience: "admin", permission: "internalStaff", activePatterns: ["/admin/invoices/*"], keywords: ["billing", "payments", "accounts receivable"] },
  { id: "follow-ups", label: "Follow-ups", href: "/admin/follow-ups", icon: ClipboardList, section: "workflow", audience: "admin", permission: "internalStaff", activePatterns: ["/admin/follow-ups/*", "/admin/recurring/*"], keywords: ["callbacks", "reminders", "renewals", "recommendations", "recurring"] },

  { id: "customers", label: "Customers", href: "/admin/customers", icon: UsersRound, section: "records", audience: "admin", permission: "internalStaff", activePatterns: ["/admin/customers/*"], keywords: ["people", "homeowners", "contacts"] },
  { id: "organizations", label: "Organizations", href: "/admin/organizations", icon: Building2, section: "records", audience: "admin", permission: "internalStaff", activePatterns: ["/admin/organizations/*"], keywords: ["commercial", "hoa", "property manager", "accounts"] },
  { id: "documents", label: "Documents", href: "/admin/documents", icon: Files, section: "records", audience: "admin", permission: "internalStaff", activePatterns: ["/admin/documents/*"], keywords: ["files", "uploads", "library"] },

  { id: "equipment", label: "Equipment", href: "/admin/equipment", icon: Forklift, section: "operations", audience: "admin", permission: "internalStaff", activePatterns: ["/admin/equipment/*"], keywords: ["fleet", "vehicles", "maintenance", "inspections"] },
  { id: "materials", label: "Materials", href: "/admin/materials", icon: Boxes, section: "operations", audience: "admin", permission: "internalStaff", activePatterns: ["/admin/materials/*"], keywords: ["inventory", "disposal", "mulch"] },

  { id: "employees", label: "Employees", href: "/admin/employees", icon: UsersRound, section: "team", audience: "admin", permission: "internalStaff", activePatterns: ["/admin/employees/*"], keywords: ["staff", "crew", "onboarding"] },
  { id: "admin-time", label: "Time", href: "/admin/time", icon: Clock3, section: "team", audience: "admin", permission: "timeClockReview", activePatterns: ["/admin/time/*"], keywords: ["clock", "hours", "review"] },
  { id: "payroll", label: "Payroll", href: "/admin/payroll", icon: ReceiptText, section: "team", audience: "admin", permission: "timeClockReview", activePatterns: ["/admin/payroll/*"], keywords: ["pay periods", "labor"] },
  { id: "training", label: "Training", href: "/admin/training", icon: GraduationCap, section: "team", audience: "admin", permission: "internalStaff", activePatterns: ["/admin/training/*"], keywords: ["credentials", "development", "compliance"] },
  { id: "safety", label: "Safety", href: "/admin/safety", icon: ShieldCheck, section: "team", audience: "admin", permission: "internalStaff", activePatterns: ["/admin/safety/*"], keywords: ["meetings", "toolbox talks", "acknowledgments"] },
  { id: "access", label: "Access", href: "/admin/access", icon: UserCheck, section: "team", audience: "admin", permission: "accessApproval", activePatterns: ["/admin/access/*"], keywords: ["roles", "approval", "accounts", "password reset"] },

  { id: "reports", label: "Reports", href: "/admin/reports", icon: BarChart3, section: "business", audience: "admin", permission: "reporting", activePatterns: ["/admin/reports/*"], keywords: ["analytics", "profitability", "sales"] },

  { id: "crew", label: "Crew home", href: "/crew", icon: HardHat, section: "crew", audience: "crew", permission: "crewApp", activePatterns: ["/crew", "/crew/jobs/*"], keywords: ["today", "assigned jobs"] },
  { id: "crew-equipment", label: "Assigned equipment", href: "/crew/equipment", icon: Forklift, section: "crew", audience: "crew", permission: "crewApp", activePatterns: ["/crew/equipment/*"], keywords: ["vehicles", "tools", "inspection"] },
  { id: "crew-time", label: "Time clock", href: "/crew/time", icon: Clock3, section: "crew", audience: "crew", permission: "timeClockEligible", activePatterns: ["/crew/time/*"], keywords: ["clock in", "clock out", "hours"] },
  { id: "crew-team", label: "My crew", href: "/crew/team", icon: UsersRound, section: "crew", audience: "crew", permission: "timeClockEligible", activePatterns: ["/crew/team/*"], keywords: ["team", "supervisor"] },
  { id: "employee-self", label: "My employee profile", href: "/employee", icon: UserCheck, section: "team", audience: "crew", permission: "crewApp", activePatterns: ["/employee/*"], keywords: ["training", "credentials", "documents"] },
];

export const navigationCommands: NavigationCommand[] = [
  { id: "new-customer", label: "New customer", href: "/admin/customers#new-customer", icon: UserPlus, audience: "admin", permission: "internalStaff", keywords: ["add customer", "homeowner"] },
  { id: "new-organization", label: "New organization", href: "/admin/organizations#new-organization", icon: Building2, audience: "admin", permission: "internalStaff", keywords: ["add organization", "commercial", "hoa"] },
  { id: "new-quote", label: "New quote", href: "/admin/quotes?new=1", icon: FilePlus2, audience: "admin", permission: "internalStaff", keywords: ["proposal", "estimate"] },
  { id: "new-invoice", label: "New invoice", href: "/admin/invoices?new=1", icon: ReceiptText, audience: "admin", permission: "internalStaff", keywords: ["bill", "billing"] },
  { id: "upload-document", label: "Upload document", href: "/admin/documents#upload-document", icon: Files, audience: "admin", permission: "internalStaff", keywords: ["file", "attachment"] },
  { id: "record-payment", label: "Record payment", href: "/admin/invoices?status=sent", icon: ReceiptText, audience: "admin", permission: "accessApproval", keywords: ["cash", "check", "paid"] },
  { id: "change-orders", label: "Open change orders", href: "/admin/change-orders", icon: FilePlus2, audience: "admin", permission: "internalStaff", keywords: ["additional work", "scope"] },
  { id: "recurring-services", label: "Open recurring services", href: "/admin/recurring", icon: Sprout, audience: "admin", permission: "internalStaff", keywords: ["renewals", "plans", "maintenance"] },
  { id: "marketing", label: "Open marketing workspace", href: "/admin/marketing", icon: Megaphone, audience: "admin", permission: "internalStaff", keywords: ["photos", "completed jobs"] },
  { id: "report-equipment", label: "Report equipment issue", href: "/crew/equipment", icon: ShieldCheck, audience: "all", permission: "crewApp", keywords: ["problem", "unsafe", "maintenance"] },
];

export function canUseNavigationPermission(
  roles: readonly PlatformRoleName[],
  permission?: NavigationPermission,
) {
  return !permission || roles.some((role) => permissionRoles[permission].includes(role));
}

export function getVisibleNavigationItems(
  roles: readonly PlatformRoleName[],
  audience: NavigationAudience,
) {
  return navigationItems.filter(
    (item) => item.audience === audience && canUseNavigationPermission(roles, item.permission),
  );
}

export function getVisibleNavigationCommands(
  roles: readonly PlatformRoleName[],
  audience: NavigationAudience,
) {
  return navigationCommands.filter(
    (command) =>
      (command.audience === "all" || command.audience === audience) &&
      canUseNavigationPermission(roles, command.permission),
  );
}

export function isNavigationItemActive(pathname: string, item: NavigationItem) {
  return item.activePatterns.some((pattern) => {
    if (pattern.endsWith("/*")) {
      const base = pattern.slice(0, -2);
      return pathname === base || pathname.startsWith(`${base}/`);
    }

    return pathname === pattern;
  });
}
