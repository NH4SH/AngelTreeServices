"use client";

import { useState } from "react";
import { Clipboard, Printer } from "lucide-react";

export function DailyCrewScheduleActions({ shareText }: { shareText: string }) {
  const [feedback, setFeedback] = useState("");

  async function copySchedule() {
    try {
      await navigator.clipboard.writeText(shareText);
      setFeedback("Crew schedule copied.");
    } catch {
      setFeedback("Copy failed. Select the text manually.");
    }
  }

  return (
    <div className="daily-schedule-actions print-hidden">
      <button onClick={() => window.print()} type="button">
        <Printer aria-hidden="true" size={16} />
        Print day sheet
      </button>
      <button onClick={copySchedule} type="button">
        <Clipboard aria-hidden="true" size={16} />
        Copy share draft
      </button>
      {feedback ? <p role="status">{feedback}</p> : null}
    </div>
  );
}
