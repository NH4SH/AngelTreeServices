/** Office display models contain verified reads, not executable provider authority. */
export type FirewoodOfficeActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type FirewoodOfficeSubmitAction = (
  previous: FirewoodOfficeActionState,
  form: FormData,
) => Promise<FirewoodOfficeActionState>;

export type FirewoodOfficeIntent = "approve_price" | "revoke_price" | "save_delivery_window"
  | "request_cancellation" | "confirm_cancellation" | "credit_cancellation";

export type FirewoodOfficeEntry = {
  kind: "price_review" | "accepted_order";
  orderId: string;
  invoiceId?: string;
  reference: string;
  customerName: string;
  description: string;
  statusLabel: string;
  principalCents: number | null;
};

export type FirewoodOfficeContact = {
  name: string;
  email: string;
  phone: string;
  address: string;
  instructions?: string;
};

export type FirewoodOfficeApproval = {
  id: string;
  status: "available" | "revoked" | "expired" | "accepted";
  woodCents: number | null;
  stackingCents: number | null;
  expiresLabel: string;
  approvedByLabel?: string;
};

export type FirewoodOfficePriceReview = {
  kind: "price_review";
  orderId: string;
  reference: string;
  revision: number;
  draftHash: string;
  contact: FirewoodOfficeContact;
  quantityLabel: string;
  woodCents: number;
  stacking: boolean;
  stackingCents: number;
  approval: FirewoodOfficeApproval | null;
};

export type FirewoodOfficeCancellation = {
  status: "none" | "requested" | "confirmed";
  revision: number;
  reasonLabel?: string;
  policyLabel?: string;
  refundLabel?: string;
  refundDueCents?: number | null;
  blockers: string[];
  canConfirm: boolean;
  canCredit?: boolean;
  creditBlockers?: string[];
};

export type FirewoodOfficeAcceptedOrder = {
  kind: "accepted_order";
  orderId: string;
  invoiceId: string;
  reference: string;
  invoiceNumber: string;
  invoiceVoided?: boolean;
  revision: number;
  ledgerHash: string;
  contact: FirewoodOfficeContact;
  quantityLabel: string;
  stacking: boolean;
  woodCents: number;
  stackingCents: number;
  principalCents: number;
  moneyConfirmed: boolean;
  paymentLabel: string;
  paidPrincipalCents: number | null;
  surchargeCents: number | null;
  refundedCents: number | null;
  balanceDueCents: number | null;
  accounting?: { issuedAtLabel: string; rawBalanceDueCents: number; creditedPrincipalCents: number;
    collectibleBalanceCents: number; creditId: string | null };
  paymentWarnings: string[];
  deliveryWindow: null | { startLabel: string; endLabel: string; evidence: string };
  cancellation: FirewoodOfficeCancellation;
  history?: { id: string; atLabel: string; actorLabel: string; description: string }[];
};

export type FirewoodOfficeWorkspaceModel =
  | { status: "unavailable" | "error"; message: string }
  | {
      status: "ready";
      canManage: boolean;
      entries: FirewoodOfficeEntry[];
      page: number;
      hasMore: boolean;
      selected: FirewoodOfficePriceReview | FirewoodOfficeAcceptedOrder | null;
    };
