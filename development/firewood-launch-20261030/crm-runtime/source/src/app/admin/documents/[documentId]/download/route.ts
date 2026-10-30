import { privateFileResponse } from "@/lib/files/private-file-response";
export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  return privateFileResponse(request, "platform_document", documentId);
}
