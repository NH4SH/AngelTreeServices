// Keep all provider/database work comfortably inside the two-minute DB lease.
export const invoiceCheckoutBudgetMs = 60_000;
export const invoiceCheckoutRequestMs = 8_000;

export function createCheckoutBudget(now = () => performance.now(), limitMs = invoiceCheckoutBudgetMs) {
  const deadline = now() + limitMs;
  function remaining() {
    const ms = Math.floor(deadline - now());
    if (ms <= 0) throw new Error("checkout_time_budget_exhausted");
    return Math.min(ms, invoiceCheckoutRequestMs);
  }
  return {
    requestOptions() { return { timeout: remaining(), maxNetworkRetries: 0 }; },
    async run<T>(operation: () => PromiseLike<T>): Promise<T> {
      const ms = remaining();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          Promise.resolve().then(operation),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("checkout_time_budget_exhausted")), ms); }),
        ]);
      } finally { clearTimeout(timer); }
    },
  };
}
export type CheckoutBudget = ReturnType<typeof createCheckoutBudget>;
