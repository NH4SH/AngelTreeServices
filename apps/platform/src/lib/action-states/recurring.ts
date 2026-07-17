export type RecurringActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialRecurringActionState: RecurringActionState = {
  status: "idle",
  message: "",
};
