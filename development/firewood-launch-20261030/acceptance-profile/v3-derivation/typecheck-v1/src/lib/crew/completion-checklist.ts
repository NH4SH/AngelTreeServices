export const completionChecklistItems = [
  "Before photos uploaded",
  "Agreed scope reviewed",
  "Debris cleaned",
  "Work area blown/raked",
  "After photos uploaded",
  "Customer notified if needed",
  "Notes added",
  "Ready for invoice",
] as const;

export type CompletionChecklistItem = (typeof completionChecklistItems)[number];
