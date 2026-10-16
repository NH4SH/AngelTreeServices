export const recordSearchTypes = ['customer', 'organization', 'job', 'quote', 'invoice'] as const;
export type RecordSearchType = typeof recordSearchTypes[number];
export type RecordSearchResult = { id: string; recordType: RecordSearchType; title: string; detail: string; href: string };
export function normalizeAdminSearchTerm(value?: string) {
  const query = (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 160);
  // A street, quote number or mixed name is not a phone number.
  const digits = query.replace(/\D/g, '');
  return /^[+().\d\s-]+$/.test(query) && digits.length >= 4 ? digits : query;
}
export function escapeSearchLike(value: string) { return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_'); }
export function commandSearchTerm(value: string) { return normalizeAdminSearchTerm(value.slice(0, 80)); }
export function recordSearchHref(type: RecordSearchType, id: string) {
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) return null;
  const routes = { customer:'customers', organization:'organizations', job:'jobs', quote:'quotes', invoice:'invoices' };
  return `/admin/${routes[type]}/${id}`;
}
