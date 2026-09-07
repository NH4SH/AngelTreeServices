const pendingReads = new Map<string, Promise<void>>();

export function persistNotificationRead(id: string, request: typeof fetch = fetch): Promise<void> {
  const existing = pendingReads.get(id);
  if (existing) return existing;
  const pending = Promise.resolve().then(async () => {
    const response = await request("/api/admin/notifications", {
      body: JSON.stringify({ id, read: true }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
      keepalive: true,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("The notification could not be marked as read.");
  }).finally(() => { pendingReads.delete(id); });
  pendingReads.set(id, pending);
  return pending;
}
