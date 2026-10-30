// The companion is review code only; it has no activation or private loader.
export function getOfficeRuntimeDependencies() { return null; }
export async function handleOfficeRuntimeRequest() {
  return Response.json({ code: 'office_workflow_unavailable', payment_retry_required: false }, {
    status: 503, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' },
  });
}
