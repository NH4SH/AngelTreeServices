// Distinct versioned path: an older server must return 404 rather than silently
// ignore the new request identity and record an unsafe duplicate installment.
export { POST } from "../route";
