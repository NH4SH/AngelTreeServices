export type ChangeOrderActionState = {
  status: "idle" | "success" | "error";
  message: string;
  portalUrl?: string;
};

export const initialChangeOrderActionState: ChangeOrderActionState = {
  status: "idle",
  message: "",
};
