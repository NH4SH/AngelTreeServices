"use client";

import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { completionChecklistItems } from "@/lib/crew/completion-checklist";

export function CompletionChecklist() {
  const [checkedItems, setCheckedItems] = useState<string[]>([]);
  const completeCount = checkedItems.length;
  const progress = Math.round((completeCount / completionChecklistItems.length) * 100);
  const summary = useMemo(
    () => `${completeCount} of ${completionChecklistItems.length} complete`,
    [completeCount],
  );

  return (
    <section className="crew-panel">
      <div className="crew-panel-heading">
        <span className="crew-panel-icon" aria-hidden="true">
          <CheckCircle2 size={19} />
        </span>
        <div>
          <h2>Completion checklist</h2>
          <p>{summary}</p>
        </div>
      </div>
      <div aria-hidden="true" className="checklist-progress">
        <div style={{ width: `${progress}%` }} />
      </div>
      <div className="checklist-controls">
        {completionChecklistItems.map((item) => {
          const checked = checkedItems.includes(item);

          return (
            <label key={item}>
              <input
                checked={checked}
                onChange={() =>
                  setCheckedItems((current) =>
                    current.includes(item)
                      ? current.filter((value) => value !== item)
                      : [...current, item],
                  )
                }
                type="checkbox"
              />
              <span className="checklist-item-copy">
                <strong>{item}</strong>
                <small>{checked ? "Complete" : "Tap when finished"}</small>
              </span>
            </label>
          );
        })}
      </div>
      <p className="field-note">
        Checklist progress is local for now. Persist it later with a `job_checklist_items` table.
      </p>
    </section>
  );
}
