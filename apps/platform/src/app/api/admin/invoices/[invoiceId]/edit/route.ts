import { updateInvoice } from "@/app/admin/invoices/actions";
import { privateNoStoreHeaders } from "@/lib/security/headers";

export const dynamic = "force-dynamic";
const invoiceUuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const headers = Object.fromEntries(privateNoStoreHeaders.map(({ key, value }) => [key, value]));
// Match the existing Server Action ceiling; the invoice command still validates all lines.
const limit = 26 * 1024 * 1024;

/** Receipt-only transport for the existing cookie-authenticated web command. No alternate write path. */
export async function POST(request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  // Bind to deployment configuration behind trusted ingress; do not trust a
  // browser-supplied forwarded-host header or the proxy's internal listen port.
  const expectedOrigin = new URL(process.env.APP_BASE_URL || request.url).origin;
  if (request.headers.get("origin") !== expectedOrigin) {
    return Response.json({ error: "Invalid request origin." }, { status: 403, headers });
  }
  const { invoiceId } = await context.params;
  if (!invoiceUuid(invoiceId) || !request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) {
    return Response.json({ error: "Invalid invoice submission." }, { status: 400, headers });
  }
  if (Number(request.headers.get("content-length")) > limit) {
    return Response.json({ error: "Invoice submission is too large." }, { status: 413, headers });
  }
  let form: FormData;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw Error("Missing body");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); return Response.json({ error: "Invoice submission is too large." }, { status: 413, headers }); }
      chunks.push(value);
    }
    const body = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    form = await new Response(body, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
    if (form.getAll("invoice_id").length !== 1 || form.get("invoice_id") !== invoiceId || [...form.values()].some(value => typeof value !== "string")) throw Error("Invalid fields");
  } catch {
    return Response.json({ error: "Invalid invoice submission." }, { status: 400, headers });
  }
  form.set("submit_intent", "save");
  form.set("client_navigation", "1");
  try {
    // updateInvoice performs fresh Auth/RLS preflight, calls save_invoice_details once,
    // validates its receipt and invalidates the same paths. Payment/checkout
    // checks remain inside the unchanged invoice transaction.
    // Route-handler invalidation does not attach a full editor render to the receipt.
    const result = await updateInvoice({ status: "idle", message: "" }, form);
    return Response.json(result, { headers });
  } catch {
    // The write may have committed. Never retry automatically or imply rollback.
    return Response.json({ error: "The save could not be confirmed. Keep your changes and compare the saved invoice before retrying." }, { status: 503, headers });
  }
}
