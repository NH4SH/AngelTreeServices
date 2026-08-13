export type GoogleCalendarActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialGoogleCalendarActionState: GoogleCalendarActionState = {
  message: "",
  status: "idle",
};
