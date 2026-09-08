export type ManagerEmailKind = "handoff" | "digest";

export function managerEmailClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const value = (key: string) => parts.find(part => part.type === key)!.value;
  return { date: `${value("year")}-${value("month")}-${value("day")}`, hour: Number(value("hour")) };
}

export function managerEmailWindow(kind: ManagerEmailKind, now: Date, digestHour = 7) {
  const { hour } = managerEmailClock(now);
  return kind === "digest" ? hour >= digestHour && hour < 12 : hour >= 7 && hour < 20;
}

export function canRetryManagerEmail(attempts: number, firstAttempt: string | null, now: Date) {
  return attempts < 3 && (!firstAttempt || now.getTime() - Date.parse(firstAttempt) < 20 * 60 * 60 * 1000);
}

export function managerDigestKey(userId: string, now: Date) {
  return `manager-digest:${userId}:${managerEmailClock(now).date}`;
}

export function managerEmailHtml(text: string, links: { label: string; href: string }[] = []) {
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const actions = links.filter(link => /^https?:\/\//.test(link.href)).map(link => `<p><a href="${escape(link.href)}" style="display:inline-block;padding:12px 0;color:#103e26;font-weight:bold;text-decoration:underline">${escape(link.label)}</a></p>`).join("");
  return `<div style="background:#ffffff;font-family:Arial,sans-serif;color:#26332b;font-size:16px;line-height:1.6;overflow-wrap:anywhere"><h1 style="font-size:22px;color:#103e26">Angel Tree Services</h1><p>${escape(text).replaceAll("\n", "<br />")}</p>${actions}</div>`;
}
