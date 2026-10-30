import { privateFileResponse } from "@/lib/files/private-file-response";
export async function GET(request: Request, { params }: { params: Promise<{ sourceType: string; sourceId: string }> }) {
  const { sourceType, sourceId } = await params;
  return privateFileResponse(request, sourceType, sourceId);
}
