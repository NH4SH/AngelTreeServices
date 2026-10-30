import { getFirewoodTestImportDependencies } from "@/lib/firewood/import-config";
import { handleFirewoodTestImport } from "@/lib/firewood/import-handler";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const dependencies = getFirewoodTestImportDependencies();
  if (!dependencies) return Response.json({ code: "test_import_unavailable", retryable: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return handleFirewoodTestImport(request, dependencies);
}
