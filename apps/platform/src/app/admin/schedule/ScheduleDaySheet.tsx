import { buildDaySheetEntries, formatDaySheetDate } from "@/lib/schedule/day-sheet";
import type { CalendarEntry } from "@/lib/types/database";

export function ScheduleDaySheet({ date, entries }: { date: Date; entries: CalendarEntry[] }) {
  const rows = buildDaySheetEntries(entries);

  return (
    <section className="document-print-region schedule-print-region" aria-label="Printable day sheet">
      <header className="schedule-print-header">
        <div className="schedule-print-title">
          <span>Angel Tree Services · Operations</span>
          <h1>Day sheet</h1>
        </div>
        <div className="schedule-print-date">
          <span>Schedule for</span>
          <strong>{formatDaySheetDate(date)}</strong>
          <small>{rows.length} scheduled {rows.length === 1 ? "stop" : "stops"}</small>
        </div>
      </header>

      {rows.length ? (
        <div className="schedule-print-list">
          {rows.map((entry, index) => (
            <article className="schedule-print-entry" key={`${entry.title}-${entry.time}-${index}`}>
              <header>
                <b className="schedule-print-sequence" aria-label={`Stop ${index + 1}`}>{index + 1}</b>
                <div className="schedule-print-time">
                  <strong>{entry.time}</strong>
                  <span>{entry.duration}</span>
                </div>
                <div>
                  <h2>{entry.title}</h2>
                  <p>{entry.customer}</p>
                </div>
                <div className="schedule-print-tags">
                  <span><small>Type</small>{entry.type}</span>
                  <span><small>Status</small>{entry.status}</span>
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
                  <h3>Dispatch instructions</h3>
                  <div>
                    {entry.accessInstructions ? <p className="pre-wrap"><strong>Access and property</strong>{entry.accessInstructions}</p> : null}
                    {entry.notes ? <p className="pre-wrap"><strong>Schedule notes</strong>{entry.notes}</p> : null}
                  </div>
                </section>
              ) : null}

              {entry.equipment.length || entry.materials.length ? (
                <dl className="schedule-print-resources">
                  {entry.equipment.length ? <div><dt>Equipment</dt><dd>{entry.equipment.join(" · ")}</dd></div> : null}
                  {entry.materials.length ? <div><dt>Materials</dt><dd>{entry.materials.join(" · ")}</dd></div> : null}
                </dl>
              ) : null}

              <div className="schedule-print-field-notes">
                <strong>Field notes</strong>
                <span />
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

      <footer>Angel Tree Services · Internal crew and office schedule · {formatDaySheetDate(date)}</footer>
    </section>
  );
}
