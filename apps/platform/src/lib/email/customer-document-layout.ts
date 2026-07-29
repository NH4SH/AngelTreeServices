import type { CustomerDocumentEmailDraft } from "@/lib/documents/email-drafts";

const companyName = "Angel Tree Services";

export function renderCustomerDocumentEmailHtml(
  draft: CustomerDocumentEmailDraft,
  options: { logoUrl?: string | null } = {},
) {
  const logo = options.logoUrl
    ? `<img alt="${companyName}" src="${escapeAttribute(options.logoUrl)}" width="92" style="display:block;width:92px;max-width:92px;height:auto;border:0;" />`
    : `<div style="font-size:20px;line-height:1.2;font-weight:800;color:#ffffff;">${companyName}</div>`;
  const action = draft.portalUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 14px;"><tr><td bgcolor="#174b32" style="border-radius:6px;"><a href="${escapeAttribute(draft.portalUrl)}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-size:16px;line-height:1.2;font-weight:700;">${escapeHtml(draft.ctaLabel)}</a></td></tr></table>
       <p style="margin:0 0 24px;color:#5c675f;font-size:12px;line-height:1.55;overflow-wrap:anywhere;">If the button does not open, use this secure link:<br /><a href="${escapeAttribute(draft.portalUrl)}" style="color:#174b32;">${escapeHtml(draft.portalUrl)}</a></p>`
    : "";
  const notes = draft.customerNotes
    ? `<tr><td style="padding:0 28px 24px;">
         <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f8f5;border:1px solid #d7e3da;border-radius:6px;">
           <tr><td style="padding:16px 18px;">
             <p style="margin:0 0 7px;color:#174b32;font-size:13px;line-height:1.3;font-weight:800;text-transform:uppercase;">Important notes</p>
             <div style="color:#303934;font-size:15px;line-height:1.55;white-space:pre-wrap;">${formatPlainText(draft.customerNotes)}</div>
           </td></tr>
         </table>
       </td></tr>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <title>${escapeHtml(draft.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f2;color:#27312b;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f1f5f2;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#fbfdfb;border:1px solid #d7e3da;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:20px 28px;background:#174b32;">${logo}</td></tr>
        <tr><td style="padding:28px 28px 18px;">
          <p style="margin:0 0 18px;color:#27312b;font-size:17px;line-height:1.55;">${escapeHtml(draft.greeting)}</p>
          <p style="margin:0;color:#303934;font-size:16px;line-height:1.65;">${formatPlainText(draft.intro)}</p>
        </td></tr>
        <tr><td style="padding:0 28px 24px;">
          <p style="margin:0 0 10px;color:#174b32;font-size:13px;line-height:1.3;font-weight:800;text-transform:uppercase;">${escapeHtml(draft.scopeHeading)}</p>
          <div style="padding:16px 18px;background:#f4f8f5;border:1px solid #d7e3da;border-radius:6px;color:#27312b;font-size:15px;line-height:1.55;white-space:pre-wrap;">${formatPlainText(draft.scopeText)}</div>
        </td></tr>
        <tr><td style="padding:0 28px 24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;border:1px solid #cad8ce;border-radius:6px;">
            <tr>
              <td style="padding:15px 16px;border-bottom:1px solid #d7e3da;color:#5c675f;font-size:13px;">${escapeHtml(draft.summaryLabel)}</td>
              <td align="right" style="padding:15px 16px;border-bottom:1px solid #d7e3da;color:#174b32;font-size:19px;font-weight:800;">${escapeHtml(draft.summaryValue)}</td>
            </tr>
            <tr>
              <td style="padding:13px 16px;color:#5c675f;font-size:13px;">${escapeHtml(draft.timingLabel)}</td>
              <td align="right" style="padding:13px 16px;color:#27312b;font-size:14px;font-weight:700;">${escapeHtml(draft.timingValue)}</td>
            </tr>
          </table>
        </td></tr>
        ${notes}
        <tr><td style="padding:0 28px 28px;">
          ${action}
          <p style="margin:0;color:#303934;font-size:15px;line-height:1.65;">${formatPlainText(draft.closing)}</p>
          <p style="margin:20px 0 0;color:#27312b;font-size:15px;line-height:1.55;">Thank you,<br /><strong>${companyName}</strong></p>
        </td></tr>
        <tr><td style="padding:18px 28px;background:#edf4ef;border-top:1px solid #d7e3da;color:#536158;font-size:13px;line-height:1.65;">
          <strong style="color:#174b32;">${companyName}</strong><br />
          <a href="tel:+15403888715" style="color:#174b32;text-decoration:none;">(540) 388-8715</a><br />
          <a href="mailto:info@angeltreeservice.org" style="color:#174b32;text-decoration:none;">info@angeltreeservice.org</a><br />
          <a href="https://angeltreeservices.org/" style="color:#174b32;text-decoration:none;">angeltreeservices.org</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function formatPlainText(value: string) {
  return escapeHtml(value).replaceAll("\n", "<br />");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
