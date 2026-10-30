import { AppLoadingShell } from "@/components/AppLoadingShell";

export default function CrewLoading() {
  return (
    <AppLoadingShell
      statusLabel="Preparing your workspace..."
      subtitle="Loading crew schedule… assigned jobs, photos, and time clock details are getting ready."
      title="Loading crew schedule…"
      variant="crew"
    />
  );
}
