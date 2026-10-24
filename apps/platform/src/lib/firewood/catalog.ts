// Keep these defaults in parity with the owner's public-firewood.json.
// They are starting prices, never overrides of an already saved invoice.
export const firewoodProducts = {
  full: { name: "Firewood — full cord, delivered", price: "450.00", description: "One full cord of red oak, hickory and white oak. Seasoned for at least 12 months after splitting; logs generally about 14 inches. Delivery included." },
  half: { name: "Firewood — half cord, delivered", price: "300.00", description: "One half cord of red oak, hickory and white oak. Seasoned for at least 12 months after splitting; logs generally about 14 inches. Delivery included." },
  stacking: { name: "Firewood stacking", price: "150.00", description: "Optional stacking, priced per delivery, not per cord. The stacking location must be accessible by wheelbarrow and within a reasonable distance of the truck." },
} as const;
export type FirewoodProduct = keyof typeof firewoodProducts;
export const firewoodSellerLocality = "Spotsylvania County, Virginia";
export const firewoodTaxBasis = "Household-use firewood: Virginia domestic-fuel exemption and Spotsylvania local exemption. Sales tax $0.";
export function firewoodLine(product: FirewoodProduct) {
  const item = firewoodProducts[product];
  return { name: item.name, description: item.description, serviceCategoryId: "", quantity: "1", unitPrice: item.price };
}
