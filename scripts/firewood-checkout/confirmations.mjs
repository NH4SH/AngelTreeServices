const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

// Local previews capture these messages; the isolated hosted worker sends only
// controlled copies to the fixed owner address, never to entered recipients.
export function confirmationMessages(record, { controlledEmail = false } = {}) {
  const { quote: q, contact: c, order_number: number } = record;
  const details = [
    `Test order ${number}`, `${q.label}: ${money(q.woodCents)}`,
    'Delivery: included (free)', `Stacking: ${q.stacking ? money(q.stackingCents) : 'not selected'}`,
    `Test total: ${money(q.totalCents)}`, 'Tax is not calculated in this test.',
    '', `Name: ${c.name}`, `Email: ${c.email}`, `Phone: ${c.phone}`,
    `Delivery address: ${[c.address, c.address2, c.city, c.state, c.postal].filter(Boolean).join(', ')}`,
    ...(c.notes ? [`Instructions: ${c.notes}`] : []),
    '', 'We’ll contact you with a delivery date within one week of ordering. Call 540-388-8715 for more specific scheduling.',
    'Cancel at least 48 hours before scheduled delivery for a full refund. Cancellations with less than 48 hours’ notice are non-refundable.',
    ...(q.stacking ? ['Stacking requires wheelbarrow access and reasonable carrying distance from the truck.'] : []),
  ].join('\n');
  return [
    { audience: 'customer', to: c.email, subject: `[TEST] Firewood order ${number}`, text: `${controlledEmail ? "This is a controlled test confirmation. No real money was charged and no delivery was ordered." : "This is a saved test confirmation. No email was sent, no real money was charged and no delivery was ordered."}\n\n${details}` },
    { audience: 'owner', to: 'info@angeltreeservice.org', subject: `[TEST] New Firewood order ${number}`, text: `Test order for review only. Do not dispatch a delivery.\n\n${details}` },
  ];
}
