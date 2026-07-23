import { createClient } from "@/lib/supabase/server";
import {
  getLatestTimeEntryReviewStatus,
  getTimeEntryHours,
  timeEntrySelect,
} from "@/lib/data/time-clock";
import type {
  DataResult,
  PayPeriod,
  PayrollEmployeeSummary,
  PayrollReviewData,
  PayrollReviewSummary,
  PayrollWarning,
  TimeEntryType,
  TimeEntryWithRelations,
} from "@/lib/types/database";

export async function getPayrollReviewData(selectedPayPeriodId?: string): Promise<DataResult<PayrollReviewData>> {
  const supabase = await createClient();

  if (!supabase) {
    return {
      data: emptyPayrollReviewData(),
      error: "Supabase is not configured.",
    };
  }

  const { data: payPeriods, error: payPeriodsError } = await supabase
    .from("pay_periods")
    .select("*")
    .order("starts_at", { ascending: false });

  if (payPeriodsError) {
    return {
      data: emptyPayrollReviewData(),
      error: payPeriodsError.message,
    };
  }

  const periodList = (payPeriods ?? []) as PayPeriod[];
  const selectedPayPeriod = selectPayPeriod(periodList, selectedPayPeriodId);

  if (!selectedPayPeriod) {
    return {
      data: {
        ...emptyPayrollReviewData(),
        pay_periods: periodList,
      },
      error: null,
    };
  }

  const { data: entries, error: entriesError } = await supabase
    .from("time_entries")
    .select(timeEntrySelect)
    .gte("clock_in_at", selectedPayPeriod.starts_at)
    .lte("clock_in_at", selectedPayPeriod.ends_at)
    .order("clock_in_at", { ascending: false });

  const timeEntries = (entries ?? []) as TimeEntryWithRelations[];

  return {
    data: {
      employee_summaries: buildEmployeeSummaries(timeEntries),
      entries: timeEntries,
      pay_periods: periodList,
      selected_pay_period: selectedPayPeriod,
      summary: buildPayrollSummary(timeEntries),
      warnings: buildPayrollWarnings(timeEntries),
    },
    error: entriesError?.message ?? null,
  };
}

export async function getPayrollExportCsv(payPeriodId: string): Promise<DataResult<{
  csv: string;
  filename: string;
  payPeriod: PayPeriod | null;
}>> {
  const payroll = await getPayrollReviewData(payPeriodId);

  if (!payroll.data.selected_pay_period) {
    return {
      data: {
        csv: "",
        filename: "angel-tree-payroll-export.csv",
        payPeriod: null,
      },
      error: payroll.error ?? "Pay period not found or no access.",
    };
  }

  const rows = [
    ["employee", "date", "clock_in", "clock_out", "total_hours", "job", "entry_type", "notes"],
    ...payroll.data.entries.map((entry) => [
      entry.profiles?.full_name || entry.profiles?.email || "Unnamed employee",
      formatCsvDate(entry.clock_in_at),
      entry.clock_in_at,
      entry.clock_out_at ?? "",
      entry.clock_out_at ? getTimeEntryHours(entry).toFixed(2) : "",
      entry.jobs?.organizations?.name || entry.jobs?.customers?.display_name || entry.schedule_events?.title || "",
      entry.entry_type,
      entry.notes ?? "",
    ]),
  ];

  return {
    data: {
      csv: serializeCsv(rows),
      filename: `angel-tree-payroll-${formatFileSafeDate(payroll.data.selected_pay_period.starts_at)}-to-${formatFileSafeDate(payroll.data.selected_pay_period.ends_at)}.csv`,
      payPeriod: payroll.data.selected_pay_period,
    },
    error: payroll.error,
  };
}

function emptyPayrollReviewData(): PayrollReviewData {
  return {
    employee_summaries: [],
    entries: [],
    pay_periods: [],
    selected_pay_period: null,
    summary: {
      adjusted_count: 0,
      admin_hours: 0,
      approved_count: 0,
      drive_hours: 0,
      entries_missing_clock_out: 0,
      job_hours: 0,
      maintenance_hours: 0,
      pending_review_count: 0,
      regular_hours: 0,
      shop_hours: 0,
      total_hours: 0,
    },
    warnings: [],
  };
}

function selectPayPeriod(payPeriods: PayPeriod[], selectedPayPeriodId?: string) {
  if (selectedPayPeriodId) {
    return payPeriods.find((period) => period.id === selectedPayPeriodId) ?? null;
  }

  const now = Date.now();
  const currentPeriod = payPeriods.find((period) => {
    const startsAt = new Date(period.starts_at).getTime();
    const endsAt = new Date(period.ends_at).getTime();
    return startsAt <= now && now <= endsAt;
  });

  return currentPeriod ?? payPeriods[0] ?? null;
}

function buildEmployeeSummaries(entries: TimeEntryWithRelations[]): PayrollEmployeeSummary[] {
  const byUser = new Map<string, TimeEntryWithRelations[]>();

  entries.forEach((entry) => {
    const group = byUser.get(entry.user_id) ?? [];
    group.push(entry);
    byUser.set(entry.user_id, group);
  });

  return [...byUser.entries()]
    .map(([userId, employeeEntries]) => {
      const totalsByType = createEntryTypeTotals();
      let totalHours = 0;
      let regularHours = 0;
      let missingClockOutCount = 0;
      let adjustedCount = 0;
      let pendingReviewCount = 0;
      let approvedCount = 0;
      let needsCorrectionCount = 0;
      let rejectedCount = 0;

      employeeEntries.forEach((entry) => {
        const hours = getTimeEntryHours(entry);
        const latestReview = getLatestTimeEntryReviewStatus(entry);

        totalHours += hours;
        if (entry.entry_type !== "break") {
          regularHours += hours;
        }

        totalsByType[entry.entry_type] += hours;

        if (!entry.clock_out_at) {
          missingClockOutCount += 1;
        }

        if (entry.status === "adjusted" || (entry.time_entry_adjustments?.length ?? 0) > 0) {
          adjustedCount += 1;
        }

        if (latestReview === "approved") {
          approvedCount += 1;
        } else if (latestReview === "needs_correction") {
          needsCorrectionCount += 1;
        } else if (latestReview === "rejected") {
          rejectedCount += 1;
        } else {
          pendingReviewCount += 1;
        }
      });

      const referenceEntry = employeeEntries[0];

      return {
        user_id: userId,
        employee_label: referenceEntry?.profiles?.full_name || referenceEntry?.profiles?.email || "Unnamed employee",
        entry_count: employeeEntries.length,
        total_hours: totalHours,
        regular_hours: regularHours,
        job_hours: totalsByType.job,
        drive_hours: totalsByType.drive,
        shop_hours: totalsByType.shop,
        maintenance_hours: totalsByType.maintenance,
        admin_hours: totalsByType.admin,
        missing_clock_out_count: missingClockOutCount,
        adjusted_count: adjustedCount,
        pending_review_count: pendingReviewCount,
        approved_count: approvedCount,
        needs_correction_count: needsCorrectionCount,
        rejected_count: rejectedCount,
        entries: employeeEntries.sort(
          (left, right) => new Date(right.clock_in_at).getTime() - new Date(left.clock_in_at).getTime(),
        ),
      };
    })
    .sort((left, right) => left.employee_label.localeCompare(right.employee_label));
}

function buildPayrollSummary(entries: TimeEntryWithRelations[]): PayrollReviewSummary {
  const totalsByType = createEntryTypeTotals();
  let totalHours = 0;
  let regularHours = 0;
  let adjustedCount = 0;
  let approvedCount = 0;
  let pendingReviewCount = 0;
  let entriesMissingClockOut = 0;

  entries.forEach((entry) => {
    const hours = getTimeEntryHours(entry);
    const latestReview = getLatestTimeEntryReviewStatus(entry);

    totalHours += hours;
    if (entry.entry_type !== "break") {
      regularHours += hours;
    }

    totalsByType[entry.entry_type] += hours;

    if (entry.status === "adjusted" || (entry.time_entry_adjustments?.length ?? 0) > 0) {
      adjustedCount += 1;
    }

    if (!entry.clock_out_at) {
      entriesMissingClockOut += 1;
    }

    if (latestReview === "approved") {
      approvedCount += 1;
    } else {
      pendingReviewCount += 1;
    }
  });

  return {
    adjusted_count: adjustedCount,
    admin_hours: totalsByType.admin,
    approved_count: approvedCount,
    drive_hours: totalsByType.drive,
    entries_missing_clock_out: entriesMissingClockOut,
    job_hours: totalsByType.job,
    maintenance_hours: totalsByType.maintenance,
    pending_review_count: pendingReviewCount,
    regular_hours: regularHours,
    shop_hours: totalsByType.shop,
    total_hours: totalHours,
  };
}

function buildPayrollWarnings(entries: TimeEntryWithRelations[]) {
  const warnings: PayrollWarning[] = [];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const byUser = new Map<string, TimeEntryWithRelations[]>();

  entries.forEach((entry) => {
    const employeeLabel = entry.profiles?.full_name || entry.profiles?.email || "Employee";
    const startedAt = new Date(entry.clock_in_at).getTime();
    const endedAt = entry.clock_out_at ? new Date(entry.clock_out_at).getTime() : null;
    const hours = getTimeEntryHours(entry);

    if (entry.status === "active" && !entry.clock_out_at && startedAt < todayStart.getTime()) {
      warnings.push({
        id: `${entry.id}-active_previous_day`,
        kind: "active_previous_day",
        title: `${employeeLabel} still has an active timer`,
        detail: "This timer started before today and never clocked out.",
        user_id: entry.user_id,
        time_entry_id: entry.id,
      });
    }

    if (hours > 12) {
      warnings.push({
        id: `${entry.id}-long_shift`,
        kind: "long_shift",
        title: `${employeeLabel} has a shift longer than 12 hours`,
        detail: `${hours.toFixed(2)} hours recorded on one entry.`,
        user_id: entry.user_id,
        time_entry_id: entry.id,
      });
    }

    if (entry.entry_type === "job" && !entry.job_id && !entry.schedule_event_id) {
      warnings.push({
        id: `${entry.id}-missing_linked_work`,
        kind: "missing_linked_work",
        title: `${employeeLabel} has job time without linked work`,
        detail: "Job time should point to a job or schedule event before payroll review.",
        user_id: entry.user_id,
        time_entry_id: entry.id,
      });
    }

    if (entry.clock_out_at && (!Number.isFinite(startedAt) || endedAt === null || !Number.isFinite(endedAt) || endedAt <= startedAt || hours <= 0)) {
      warnings.push({
        id: `${entry.id}-invalid_duration`,
        kind: "invalid_duration",
        title: `${employeeLabel} has an invalid duration`,
        detail: "Clock-out must be after clock-in and produce a positive duration.",
        user_id: entry.user_id,
        time_entry_id: entry.id,
      });
    }

    const group = byUser.get(entry.user_id) ?? [];
    group.push(entry);
    byUser.set(entry.user_id, group);
  });

  byUser.forEach((userEntries) => {
    const ordered = userEntries
      .slice()
      .sort((left, right) => new Date(left.clock_in_at).getTime() - new Date(right.clock_in_at).getTime());

    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      const previousEnd = previous.clock_out_at ? new Date(previous.clock_out_at).getTime() : null;
      const currentStart = new Date(current.clock_in_at).getTime();

      if (previousEnd && previousEnd > currentStart) {
        const employeeLabel = current.profiles?.full_name || current.profiles?.email || "Employee";
        warnings.push({
          id: `${previous.id}-${current.id}-overlap`,
          kind: "overlap",
          title: `${employeeLabel} has overlapping entries`,
          detail: "Two time entries overlap and need cleanup before export.",
          user_id: current.user_id,
          time_entry_id: current.id,
        });
      }
    }
  });

  return warnings;
}

function createEntryTypeTotals() {
  return {
    admin: 0,
    break: 0,
    drive: 0,
    job: 0,
    maintenance: 0,
    other: 0,
    shop: 0,
    training: 0,
  } satisfies Record<TimeEntryType, number>;
}

function formatCsvDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatFileSafeDate(value: string) {
  return value.slice(0, 10);
}

import { serializeCsv } from "@/lib/security/csv";
