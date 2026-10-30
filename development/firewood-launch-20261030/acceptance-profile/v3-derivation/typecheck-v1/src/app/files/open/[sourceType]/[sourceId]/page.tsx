import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { PrivateFileViewer } from "./viewer";
import "../../../files.css";
export default async function OpenFilePage({ params }: { params: Promise<{ sourceType: string; sourceId: string }> }) {
  const context = await getAuthenticatedPlatformContext("/files"); const { sourceType, sourceId } = await params;
  if (!context.configured) return <SetupRequired title="Configure Supabase before opening files"/>;
  return <PlatformFrame active="documents" roles={context.roles} userEmail={context.user?.email}>
    <div className="shell app-content file-checks"><PrivateFileViewer path={`/files/${sourceType}/${sourceId}`}/></div>
  </PlatformFrame>;
}
