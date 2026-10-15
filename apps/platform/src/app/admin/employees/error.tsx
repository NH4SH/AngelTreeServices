"use client";

export default function EmployeeError({ reset }: { reset: () => void }) {
  return (
    <main className="employee-workspace">
      <h1>Couldn’t load this page</h1>
      <p role="alert">
        Your changes may already be saved. Try loading the employee record again
        before repeating an action.
      </p>
      <button className="employee-button" onClick={reset} type="button">
        Try again
      </button>
    </main>
  );
}
