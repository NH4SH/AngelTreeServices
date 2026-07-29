import { buildDaySheetEntries, formatDaySheetDate } from "@/lib/schedule/day-sheet";
import type { CalendarEntry } from "@/lib/types/database";

export function ScheduleDaySheet({ date, entries }: { date: Date; entries: CalendarEntry[] }) {
  const rows = buildDaySheetEntries(entries);

  return (
    <section className="document-print-region schedule-print-region" aria-label="Printable day sheet">
      <header className="schedule-print-header">
        <div>
          <span>Angel Tree Services</span>
          <h1>Day Sheet</h1>
        </div>
        <strong>{formatDaySheetDate(date)}</strong>
      </header>

      {rows.length ? (
        <div className="schedule-print-list">
          {rows.map((entry, index) => (
            <article className="schedule-print-entry" key={`${entry.title}-${entry.time}-${index}`}>
              <header>
                <div className="schedule-print-time">
                  <strong>{entry.time}</strong>
                  <span>{entry.duration}</span>
                </div>
                <div>
                  <h2>{entry.title}</h2>
                  <p>{entry.customer}</p>
                </div>
                <div className="schedule-print-tags">
                  <span>{entry.type}</span>
                  <span>{entry.status}</span>
                </div>
              </header>

              <dl className="schedule-print-facts">
                <div><dt>Service address</dt><dd>{entry.location}</dd></div>
                <div><dt>Primary phone</dt><dd>{entry.phone}</dd></div>
                <div><dt>Assigned</dt><dd>{entry.assignees}</dd></div>
              </dl>

              <section>
                <h3>Work summary</h3>
                <p className="pre-wrap">{entry.summary}</p>
              </section>

              {entry.accessInstructions || entry.notes ? (
                <section className="schedule-print-operations">
                  <h3>Operational notes and instructions</h3>
                  {entry.accessInstructions ? <p className="pre-wrap"><strong>Access:</strong> {entry.accessInstructions}</p> : null}
                  {entry.notes ? <p className="pre-wrap">{entry.notes}</p> : null}
                </section>
              ) : null}

              {entry.equipment.length || entry.materials.length ? (
                <dl className="schedule-print-resources">
                  {entry.equipment.length ? <div><dt>Equipment</dt><dd>{entry.equipment.join(", ")}</dd></div> : null}
                  {entry.materials.length ? <div><dt>Materials</dt><dd>{entry.materials.join(", ")}</dd></div> : null}
                </dl>
              ) : null}

              <div className="schedule-print-field-notes">
                <strong>Field notes</strong>
                <span />
                <span />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="schedule-print-empty">
          <h2>No estimates or jobs scheduled</h2>
          <p>This day is currently clear. Use this space for dispatch or field notes.</p>
          <span />
          <span />
          <span />
        </section>
      )}

      <footer>Angel Tree Services · Crew and office day sheet</footer>
    </section>
  );
}
