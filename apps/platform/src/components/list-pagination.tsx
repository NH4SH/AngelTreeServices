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
      {page <= 1
        ? <span aria-disabled="true" className="pagination-disabled">Previous</span>
        : <Link href={href(page - 1)}>Previous</Link>}
      <span className="pagination-position">Page {Math.min(page, totalPages)} of {totalPages}</span>
      {page >= totalPages
        ? <span aria-disabled="true" className="pagination-disabled">Next</span>
        : <Link href={href(page + 1)}>Next</Link>}
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
