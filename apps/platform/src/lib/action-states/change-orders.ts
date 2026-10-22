export type ChangeOrderActionState = {
  responseRejected?: boolean;
  saveRejected?: boolean;
  reviewRequired?: boolean;
  savedRevision?: number;
  savedLineIds?: string[];
  saveDestination?: string;
  status: "idle" | "success" | "error";
  message: string;
  portalUrl?: string;
};

export const initialChangeOrderActionState: ChangeOrderActionState = {
  status: "idle",
  message: "",
};
