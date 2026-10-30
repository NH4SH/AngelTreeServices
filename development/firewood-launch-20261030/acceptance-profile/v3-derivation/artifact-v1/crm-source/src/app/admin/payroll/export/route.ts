import { NextResponse } from "next/server";
import { getCurrentUserRoles } from "@/lib/auth/roles";
import { canReviewTimeClock } from "@/lib/auth/time-clock";
import { getPayrollExportCsv } from "@/lib/data/payroll";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in before exporting payroll CSV files." }, { status: 401 });
  }

  const roles = await getCurrentUserRoles();

  if (!canReviewTimeClock(roles)) {
    return NextResponse.json({ error: "Only owners, admins, and payroll admins can export payroll review data." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const payPeriodId = searchParams.get("pay_period_id")?.trim();

  if (!payPeriodId) {
    return NextResponse.json({ error: "Missing pay_period_id." }, { status: 400 });
  }

  const exportResult = await getPayrollExportCsv(payPeriodId);

  if (exportResult.error || !exportResult.data.payPeriod) {
    return NextResponse.json({ error: exportResult.error ?? "Pay period not found or no access." }, { status: 404 });
  }

  return new NextResponse(exportResult.data.csv, {
    headers: {
      "Content-Disposition": `attachment; filename="${exportResult.data.filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
