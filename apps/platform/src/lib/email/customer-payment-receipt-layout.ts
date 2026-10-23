import { companyBrand } from "../company-brand.ts";
import { escapeEmailHtml } from "./customer-document-action.ts";

type ReceiptContent = {
  subject: string;
  greeting: string;
  intro: string;
  details: { label: string; value: string }[];
};

/** Presentation only. This never loads records, creates links, queues or sends. */
export function renderCustomerPaymentReceiptHtml(input: ReceiptContent) {
  const rows = input.details.map(item => `<tr><th scope="row" style="width:44%;padding:12px 12px 12px 0;border-bottom:1px solid #d7e3da;color:#536158;font-size:16px;line-height:1.5;font-weight:400;text-align:left;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;">${escapeEmailHtml(item.label)}</th><td style="padding:12px 0;border-bottom:1px solid #d7e3da;color:#27312b;font-size:16px;line-height:1.5;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;">${escapeEmailHtml(item.value)}</td></tr>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1" /><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /><title>${escapeEmailHtml(input.subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f2;color:#27312b;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f1f5f2;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#fbfdfb;border:1px solid #d7e3da;table-layout:fixed;">
<tr><td style="padding:20px 24px;background:#174b32;color:#ffffff;font-size:20px;line-height:1.3;font-weight:700;">${companyBrand.name}</td></tr>
<tr><td style="padding:28px 24px;overflow-wrap:anywhere;word-break:break-word;">
<h1 style="margin:0 0 20px;color:#174b32;font-size:26px;line-height:1.3;">Payment received</h1>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">${escapeEmailHtml(input.greeting)}</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">${escapeEmailHtml(input.intro)}</p>
<table aria-label="Payment details" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;">${rows}</table>
<p style="margin:24px 0 0;font-size:16px;line-height:1.6;">Keep this receipt for your records. The remaining invoice balance reflects our records when this receipt was prepared.</p>
<p style="margin:20px 0 0;font-size:16px;line-height:1.6;">Thank you,<br /><strong>${companyBrand.name}</strong></p>
</td></tr>
<tr><td style="padding:16px 24px;background:#edf4ef;border-top:1px solid #d7e3da;color:#536158;font-size:16px;line-height:1.6;">
Billing questions? Reply to this email or call our office.<br />
<a href="${companyBrand.phoneHref}" style="display:inline-block;padding:12px 0;color:#174b32;font-size:16px;font-weight:700;text-decoration:underline;">Call ${companyBrand.phone}</a><br />
${companyBrand.services}.
</td></tr></table></td></tr></table></body></html>`;
}
