export default function AdminLoading() {
  return (
    <main className="app-shell">
      <section className="app-main">
        <div className="shell app-content">
          <section className="page-heading">
            <p className="surface-label">Loading</p>
            <h1>Opening admin workspace</h1>
            <p>Loading customer, job, quote, and schedule data.</p>
          </section>
          <section className="empty-state">
            <h2>Please wait a moment</h2>
            <p>The admin CRM is preparing the current view.</p>
          </section>
        </div>
      </section>
    </main>
  );
}
