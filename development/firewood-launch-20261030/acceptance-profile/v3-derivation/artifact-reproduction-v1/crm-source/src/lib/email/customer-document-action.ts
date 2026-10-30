/** Shared email-safe document button and copyable fallback. URLs come from authorized document-link callers. */
export function renderCustomerDocumentAction(portalUrl: string | null, ctaLabel: string, secondaryFontSize: 12 | 14 = 12) {
  if (!portalUrl) return "";
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 14px;"><tr><td bgcolor="#174b32" style="border-radius:6px;"><a href="${escapeAttribute(portalUrl)}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-size:16px;line-height:1.2;font-weight:700;">${escapeEmailHtml(ctaLabel)}</a></td></tr></table>
       <p style="margin:0 0 24px;color:#667169;font-size:${secondaryFontSize}px;line-height:1.55;overflow-wrap:anywhere;word-break:break-word;">If the button does not open, copy and paste this secure link into your browser.<br /><a href="${escapeAttribute(portalUrl)}" style="color:#496356;text-decoration:underline;overflow-wrap:anywhere;word-break:break-word;">${escapeEmailHtml(portalUrl)}</a></p>`;
}

function escapeAttribute(value: string) {
  return escapeEmailHtml(value).replaceAll("`", "&#096;");
}

export function escapeEmailHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
