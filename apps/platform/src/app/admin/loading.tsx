import { AppLoadingShell } from "@/components/AppLoadingShell";

export default function AdminLoading() {
  return (
    <AppLoadingShell
      statusLabel="Preparing your workspace..."
      subtitle="Loading operations… customer records, jobs, quotes, and schedule details are on the way."
      title="Loading operations…"
      variant="admin"
    />
  );
}
