import Link from "next/link";

export function ListPagination({
  basePath,
  count,
  page,
  pageSize,
  params,
}: {
  basePath: string;
  count: number;
  page: number;
  pageSize: number;
  params: Record<string, string | undefined>;
}) {
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Results pages" className="list-pagination">
      <Link aria-disabled={page <= 1} href={href(Math.max(1, page - 1))}>Previous</Link>
      <span>Page {Math.min(page, totalPages)} of {totalPages}</span>
      <Link aria-disabled={page >= totalPages} href={href(Math.min(totalPages, page + 1))}>Next</Link>
    </nav>
  );

  function href(nextPage: number) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    query.set("page", String(nextPage));
    return `${basePath}?${query.toString()}`;
  }
}
