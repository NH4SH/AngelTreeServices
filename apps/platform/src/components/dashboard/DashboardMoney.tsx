import {getDashboardMoney} from "@/lib/data/dashboard-money";
import type {DashboardPeriod} from "@/lib/dashboard/cash-series";
import {DashboardMoneyView} from "./DashboardMoneyView";
export {DashboardMoneyLoading} from "./DashboardMoneyView";
export async function DashboardMoney({period}:{period:DashboardPeriod}) {
 const result=await getDashboardMoney(period);
 return <DashboardMoneyView result={result} period={period} />;
}
