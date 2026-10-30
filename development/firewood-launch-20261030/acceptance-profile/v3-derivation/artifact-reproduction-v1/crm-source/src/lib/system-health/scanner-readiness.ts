import { createHash } from "node:crypto";
import { request } from "node:https";
import { TLSSocket } from "node:tls";
import type { HealthCheckResult } from "./core";

type Reply = { status: number; payload: unknown; certificateExpiresAt: string };
const marker = Buffer.from("Angel Tree synthetic production scanner readiness check.");

/** No business bytes or record identifiers; no redirects or certificate bypass. */
async function exchange(url: URL, token: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    // A resumed TLS session can omit the peer certificate. This infrequent
    // expiry check needs a fresh handshake, while retaining normal CA validation.
    const req = request(url, { method: "POST", rejectUnauthorized: true, agent: false,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/octet-stream", "content-length": marker.length } }, res => {
      const certificateExpiresAt = res.socket instanceof TLSSocket ? res.socket.getPeerCertificate().valid_to : "";
      let bytes = 0;
      const parts: Buffer[] = [];
      res.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 1024) { res.destroy(); reject(Error("Invalid scanner response")); return; }
        parts.push(chunk);
      });
      res.on("error", reject);
      res.on("end", () => {
        try { resolve({ status: res.statusCode ?? 0, payload: JSON.parse(Buffer.concat(parts).toString("utf8")), certificateExpiresAt }); }
        catch { reject(Error("Invalid scanner response")); }
      });
    });
    const timer = setTimeout(() => req.destroy(Error("Scanner readiness timed out")), 12_000);
    req.once("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end(marker);
  });
}

export function classifyScannerReadiness(reply: Reply, now = Date.now()): HealthCheckResult {
  const data = reply.payload as Record<string, unknown> | null;
  const age = data?.signatureAgeSeconds;
  const certificateDays = (Date.parse(reply.certificateExpiresAt) - now) / 86_400_000;
  if (reply.status !== 200 || !data || data.status !== "clean" || data.engine !== "clamav"
    || data.sha256 !== createHash("sha256").update(marker).digest("hex")
    || typeof age !== "number" || !Number.isSafeInteger(age) || age < 0 || age > 48 * 3600
    || !Number.isFinite(certificateDays) || certificateDays <= 0) {
    return { status: "outage", summary: "The private scanner did not confirm a current, trusted clean scan." };
  }
  const details = { signatureAgeHours: Math.floor(age / 3600), certificateDaysRemaining: Math.floor(certificateDays) };
  if (age >= 36 * 3600 || certificateDays < 7) return { status: "outage", summary: "Urgent scanner definition or TLS renewal maintenance is required.", details };
  if (age >= 24 * 3600 || certificateDays < 21) return { status: "degraded", summary: "Scanner definitions or the TLS certificate need renewal review.", details };
  return { status: "operational", summary: "Trusted synthetic scan, current loaded definitions and TLS certificate confirmed.", details };
}

export async function checkPrivateScanner(env = process.env, transport = exchange): Promise<HealthCheckResult> {
  if (!env.DOCUMENT_SCANNER_URL || !env.DOCUMENT_SCANNER_TOKEN) return { status: "not_configured", summary: "The private scanner is not configured." };
  try {
    const url = new URL(env.DOCUMENT_SCANNER_URL);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/scan"
      || env.DOCUMENT_SCANNER_TOKEN.length < 32 || /\s/.test(env.DOCUMENT_SCANNER_TOKEN)) throw Error("Invalid scanner configuration");
    const started = performance.now();
    return { ...classifyScannerReadiness(await transport(url, env.DOCUMENT_SCANNER_TOKEN)), latencyMs: Math.round(performance.now() - started) };
  } catch {
    // Never copy endpoint, credentials, provider response or document bytes into alerts.
    return { status: "outage", summary: "The private scanner could not complete a trusted readiness check." };
  }
}
