/** Bound the complete operation, including a slow response body. Never expose transport diagnostics. */
export async function withDeadline(work, timeoutMs, parent) {
    const controller = new AbortController();
    let timer;
    const abort = () => controller.abort();
    const cancelled = new Promise((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("Operation deadline or cancellation reached.")), { once: true });
    });
    parent?.addEventListener("abort", abort, { once: true });
    if (parent?.aborted)
        controller.abort();
    timer = setTimeout(abort, Math.max(1, timeoutMs));
    try {
        if (controller.signal.aborted)
            return await cancelled;
        return await Promise.race([Promise.resolve().then(() => work(controller.signal)), cancelled]);
    }
    finally {
        clearTimeout(timer);
        parent?.removeEventListener("abort", abort);
    }
}
export async function mapBounded(values, concurrency, work) {
    const result = new Array(values.length);
    let next = 0;
    const count = Math.min(values.length, Math.max(1, Math.min(5, Math.floor(concurrency) || 1)));
    await Promise.all(Array.from({ length: count }, async () => {
        while (next < values.length) {
            const index = next++;
            result[index] = await work(values[index]);
        }
    }));
    return result;
}
