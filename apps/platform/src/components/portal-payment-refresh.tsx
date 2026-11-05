"use client";

import { useState } from "react";

export function PortalPaymentRefresh() {
  const [refreshing, setRefreshing] = useState(false);

  return (
    <button
      aria-busy={refreshing}
      className="customer-payment-refresh"
      disabled={refreshing}
      onClick={() => {
        setRefreshing(true);
        window.location.reload();
      }}
      type="button"
    >
      {refreshing ? "Refreshing payment status…" : "Refresh payment status"}
    </button>
  );
}
