import type { ServiceLocation } from "@/lib/types/database";

export function getDirectionsUrl(
  location: Pick<ServiceLocation, "street" | "city" | "state" | "postal_code"> | null | undefined,
) {
  if (!location) {
    return null;
  }

  const address = [location.street, location.city, location.state, location.postal_code].filter(Boolean).join(", ");
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
}

