export default function LoadingEmployees() {
  return (
    <main className="employee-workspace" aria-busy="true">
      <h1>Employees</h1>
      <p role="status">Loading your team…</p>
    </main>
  );
}
