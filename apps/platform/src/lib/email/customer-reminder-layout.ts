import { companyBrand } from "../company-brand.ts";
import { escapeEmailHtml, renderCustomerDocumentAction } from "./customer-document-action.ts";

type ReminderContent = {
  subject: string;
  title: string;
  greeting: string;
  intro: string;
  details: { label: string; value: string; emphasis?: boolean }[];
  scope: string[];
  portalUrl: string;
  ctaLabel: string;
  guidance: string;
};

/** Presentation only: does not mint links, load records, enqueue, send or reconcile deliveries. */
export function renderCustomerReminderEmailHtml(input: ReminderContent) {
  // These become clickable links. Reject unsafe schemes without logging a capability URL.
  let url: URL;
  try { url = new URL(input.portalUrl); } catch { throw new Error("A secure reminder document link is required."); }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || url.username || url.password) {
    throw new Error("A secure reminder document link is required.");
  }
  const details = input.details.map(item => `<tr><td width="34%" style="width:34%;padding:12px 12px 12px 0;border-bottom:1px solid #d7e3da;color:#536158;font-size:14px;line-height:1.5;vertical-align:top;">${escapeEmailHtml(item.label)}</td><td style="padding:12px 0;border-bottom:1px solid #d7e3da;color:#27312b;font-size:${item.emphasis ? "24" : "16"}px;line-height:1.5;font-weight:${item.emphasis ? "700" : "400"};overflow-wrap:anywhere;word-break:break-word;">${escapeEmailHtml(item.value)}</td></tr>`).join("");
  const scope = input.scope.length ? `<h2 style="margin:28px 0 10px;color:#174b32;font-size:18px;line-height:1.4;">Proposed work</h2><ul style="margin:0;padding-left:20px;color:#303934;font-size:16px;line-height:1.6;">${input.scope.map(item => `<li style="margin-bottom:8px;overflow-wrap:anywhere;word-break:break-word;">${escapeEmailHtml(item)}</li>`).join("")}</ul>` : "";
  return `<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1" /><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /><title>${escapeEmailHtml(input.subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f2;color:#27312b;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f1f5f2;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#fbfdfb;border:1px solid #d7e3da;table-layout:fixed;">
<tr><td style="padding:20px 24px;background:#174b32;color:#ffffff;font-size:20px;line-height:1.3;font-weight:700;">${companyBrand.name}</td></tr>
<tr><td style="padding:28px 24px;overflow-wrap:anywhere;word-break:break-word;">
<h1 style="margin:0 0 20px;color:#174b32;font-size:26px;line-height:1.3;">${escapeEmailHtml(input.title)}</h1>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">${escapeEmailHtml(input.greeting)}</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">${escapeEmailHtml(input.intro)}</p>
${details ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;">${details}</table>` : ""}
${renderCustomerDocumentAction(input.portalUrl, input.ctaLabel, 14)}
<p style="margin:0;font-size:16px;line-height:1.6;">${escapeEmailHtml(input.guidance)}</p>
${scope}
<p style="margin:28px 0 0;font-size:16px;line-height:1.6;">Thank you,<br /><strong>${companyBrand.name}</strong></p>
</td></tr>
<tr><td style="padding:16px 24px;background:#edf4ef;border-top:1px solid #d7e3da;color:#536158;font-size:14px;line-height:1.6;">
Need help or a new link? Reply to this email or call our office.<br />
<a href="${companyBrand.phoneHref}" style="display:inline-block;padding:12px 0;color:#174b32;font-size:16px;font-weight:700;text-decoration:underline;">Call ${companyBrand.phone}</a>
</td></tr></table></td></tr></table></body></html>`;
}
