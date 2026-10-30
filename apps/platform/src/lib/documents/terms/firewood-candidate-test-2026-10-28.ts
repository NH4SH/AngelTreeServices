import type {DocumentTerm} from './legacy-2026-10-22.ts';
export const FIREWOOD_CANDIDATE_TEST_TERMS_VERSION='firewood-candidate-test-2026-10-28' as const;
// Separate accepted Website policy; older invoice families keep their exact text.
export const firewoodCandidateTestTerms:readonly DocumentTerm[]=Object.freeze([
 {label:'Sandbox receipt',text:'This is a test-only record of payment already made at Website checkout, not another request for payment. Payment does not complete delivery.'},
 {label:'Delivery',text:'Delivery is included. Angel Tree Services will contact you with a delivery date within seven days of ordering; this is not a promise to deliver within seven days.'},
 {label:'Stacking and pricing',text:'Optional stacking is charged once per delivery as listed. Any office-approved residential price was agreed before payment; only one discount applies.'},
 {label:'Cancellation',text:'A full refund applies before a delivery is scheduled, or if you cancel at least 48 hours before the delivery window begins. Later customer cancellations are non-refundable.'},
 {label:'Angel cancellation or rescheduling',text:'A full refund applies if Angel cancels or cannot fulfill the order, or if you decline an Angel-requested reschedule.'},
 {label:'Household use',text:'The accepted order confirms personal household use at the delivery address and records the Virginia domestic-fuel and local exemption with zero sales tax. Business purchases require office review.'},
 {label:'Payment and questions',text:'Refunds and disputes are reviewed against the original payment; they do not authorize another charge or automatic unpaid reminder. Contact Angel Tree Services at (540) 388-8715. Accepted Website policy: firewood-20261028-household-v2. Times use America/New_York.'},
].map(term=>Object.freeze(term)));
