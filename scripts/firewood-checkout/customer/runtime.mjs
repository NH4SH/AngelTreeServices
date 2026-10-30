// The production route remains unavailable until actual guarded dependencies
// and recovery admission have been separately installed and reviewed.
export function getCustomerRuntimeDependencies() { return null; }
export async function handleCustomerRuntimeRequest() {
  return Response.json({ code: 'checkout_unavailable', payment_retry_required: false }, {
    status: 503, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
