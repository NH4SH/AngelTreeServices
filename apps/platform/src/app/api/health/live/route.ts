export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { ok: true, service: "angel-tree-platform" },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
