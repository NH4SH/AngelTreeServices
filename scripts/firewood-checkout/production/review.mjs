// Offline review checker. It cannot start a service, load secrets, call a
// provider, change DNS, create a database or activate production settings.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {priceOrder} from '../model.mjs';

const check=(condition,code)=>{if(!condition)throw new Error(code);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function validateReview(value,facts) {
  check(value?.schemaVersion===1&&value.purpose==='review-only','review_only_required');
  const switches=['ordersEnabled','livePaymentsEnabled','customerEmailEnabled','crmEnabled','dnsChangesApproved','schedulesEnabled','productionReleaseApproved'];
  check(value.activation&&same(Object.keys(value.activation).sort(),switches.sort())&&Object.values(value.activation).every(v=>v===false),'activation_forbidden');
  const a=value.address,origin='https://checkout.angeltreeservices.org';
  check(a?.origin===origin&&a.informationUrl==='https://angeltreeservices.org/firewood/','permanent_origin_required');
  for(const [key,path] of Object.entries({checkoutPath:'/firewood/checkout/',resultPath:'/firewood/checkout/result/',cancelPath:'/firewood/checkout/?canceled=1',webhookPath:'/firewood/checkout/webhook'}))
    check(a[key]===path&&new URL(a[key],origin).origin===origin,'pinned_checkout_paths_required');
  check(a.cookieDomain===null&&a.cookieSecure===true&&a.cookieHttpOnly===true&&a.cookieSameSite==='Lax'&&a.includeInSitemap===false&&a.robots==='noindex, nofollow','private_checkout_boundary_required');
  const route=value.routing;
  check(route?.strategy==='existing-home-caddy-separate-hostname'&&route.nameserverMigration===false&&route.newHostingSubscription===false&&route.routerRuleChange===false&&route.templateServesOrders===false,'existing_infrastructure_required');
  check(route.candidateDnsRecord?.name==='checkout'&&route.candidateDnsRecord.type==='CNAME'&&route.candidateDnsRecord.target==='scanner.angeltreeservices.org'&&route.candidateDnsRecord.applied===false,'unapplied_dns_proposal_required');
  check(same(route.existingScannerHostnames,['scanner-staging.angeltreeservices.org','scanner.angeltreeservices.org'])&&/^[a-f0-9]{64}$/u.test(route.currentIngressConfigSha256),'scanner_preservation_required');
  check(route.privateBackend==='review-required'&&same(route.privateHopRequirements,['pinned-peer','verified-tls','client-certificate-authentication','no-public-database'])&&route.certificateIssueAndRenewalVerified===false&&route.liveScannerRegressionChecksPassed===false,'unverified_transport_must_stay_pending');
  const o=value.orders;
  check(o?.currency==='usd'&&o.maximumOnlineCords===2&&o.deliveryCents===0&&o.deliveryEligibilityGate===false&&o.stackingCents===15000&&o.stackingBasis==='once-per-delivery','confirmed_delivery_rules_required');
  check(o.stackingAccess===facts.stacking_access&&same(o.coverageInformation,facts.delivery_areas),'confirmed_scope_required');
  check(o.options.length===3&&same(o.options.map(x=>x.id),['half','full','two'])&&same(o.options.map(x=>x.cords),[0.5,1,2]),'confirmed_quantities_required');
  const amounts=[];
  for(const option of o.options) {
    const base=30000*(option.cords/0.5),saving=base-option.deliveredCents;
    check(Number.isSafeInteger(option.deliveredCents)&&Number.isSafeInteger(option.stackedCents)&&option.stackedCents===option.deliveredCents+15000,'integer_prices_required');
    check(option.savingCents===saving&&option.savingPercent===saving*100/base,'same_volume_savings_required');
    for(const stacking of [false,true]) {
      const quote=priceOrder({quantity:option.id,stacking});const amount=stacking?option.stackedCents:option.deliveredCents;
      check(quote.totalCents===amount&&quote.deliveryCents===0&&quote.stackingCents===(stacking?15000:0),'review_and_test_prices_must_match');amounts.push(amount);
    }
  }
  check(same(amounts,[30000,45000,45000,60000,84000,99000]),'owner_approved_prices_required');
  check(o.deliveryDateNotificationDays===7&&o.deliveryCompletionDaysGuaranteed===null&&o.schedulingTimezone==='America/New_York','confirmed_scheduling_required');
  check(o.cancellation.fullRefundMinimumHoursBeforeDelivery===48&&o.cancellation.lessThan48Hours==='non-refundable'&&o.cancellation.refundProcessingPromise===null&&o.cancellation.cutoffBasisApproved===true&&o.cancellation.automaticRefunds===false,'confirmed_cancellation_rules_required');
  check(o.cancellation.cutoffBasis==='scheduled-delivery-window-start'&&same(o.cancellation.confirmedScenarios,[
    {case:'before-delivery-is-scheduled',outcome:'full-refund',approved:true},
    {case:'angel-cancels-or-cannot-fulfill',outcome:'full-refund',approved:true},
    {case:'customer-declines-angel-reschedule',outcome:'full-refund',approved:true},
  ]),'owner_confirmed_refund_scenarios_required');
  check(o.availability.initialStatus==='paused'&&o.availability.automaticInventoryClaim===false,'paused_owner_availability_required');
  check(o.tax.productionTreatment==='review-required'&&o.tax.ownerConfirmedNoTaxForServiceAreas===true&&o.tax.intendedTaxRateBasisPoints===0&&o.tax.zeroTaxLegallyVerified===false&&o.tax.stripeAutomaticTaxEnabled===false,'owner_tax_instruction_requires_separate_verification');
  const v=o.veterans;check(v.percent===5&&v.residentialOnly===true&&v.base==='wood-plus-stacking-before-tax-and-other-fees'&&v.combineWithOtherDiscounts===false&&v.checkbox===false&&v.automaticDiscount===false&&v.idUploads===false&&v.redemptionApproved===true&&v.redemption==='notify-before-purchase-owner-assisted'&&v.quantityPriceHandling==='owner-quote-before-payment-no-automatic-combination','veterans_terms_must_be_preserved');
  const p=value.payments;
  check(p.intendedMerchantAccount==='acct_1Tv92EI7tY6VHUvU'&&p.qaAccountNeverUseForLiveOrders==='acct_1UU9U8RAZXGe6tX0'&&p.intendedMerchantAccount!==p.qaAccountNeverUseForLiveOrders&&p.keyRequirement==='separate-restricted-live-key-not-provided','separate_live_account_required');
  check(p.webhookRequired===true&&p.fulfillmentRequiresVerifiedPaidState===true&&p.returnPageMayCreateFulfillment===false&&p.liveWebhookConfigured===false&&p.lifecycleEventContractApproved===false&&p.promotionCodesEnabled===false,'reviewed_paid_event_boundary_required');
  check(same(p.fulfillmentEvents,['checkout.session.completed','checkout.session.async_payment_succeeded']),'fulfillment_events_required');
  check(same(p.proposedLifecycleEvents,['checkout.session.async_payment_failed','checkout.session.expired','charge.refunded','refund.created','refund.updated','refund.failed','charge.dispute.created','charge.dispute.updated','charge.dispute.closed']),'complete_lifecycle_events_required');
  const s=value.storage;check(s.proposedDatabase==='firewood_orders'&&s.proposedClusterPort===56388&&s.databaseBind==='127.0.0.1'&&s.separateProductionCluster===true&&s.reuseQaOrdersOrQueues===false&&s.created===false&&s.migrated===false&&s.backupAndMonitoringTargetUpdated===false&&s.restoreVerified===false&&s.privateOwnerAccess==='existing-private-vpn-only'&&s.retentionPolicy==='existing-business-record-policy-implementation-review','separate_uncreated_production_storage_required');
  const n=value.notifications;check(n.ownerEmail==='info@angeltreeservice.org'&&n.replyTo===n.ownerEmail&&n.from==='Angel Tree Services Firewood <orders@firewood.angeltreeservice.org>'&&n.customerSendingApproved===false&&n.customerReceiptCopies===1&&n.ownerOrderCopies===1&&n.idempotentDurableOutbox===true&&n.paidOrderSurvivesEmailFailure===true,'controlled_sending_required');
  check(n.keepStripeAccountReceiptSettingsUnchanged===true&&n.proposedReceiptExperience==='one-angel-order-confirmation-existing-stripe-receipts-unchanged','existing_stripe_receipts_must_be_preserved');
  const c=value.crm;check(c.productionEndpoint===null&&c.productionContract===null&&c.reuseTestImportEndpoint===false&&c.sendInvoiceAgainAutomatically===false,'crm_production_contract_required');
  check(same(value.releaseGates?.map(g=>g.id),['routing','tls-private-hop','production-runtime','operations','tax','veterans','communications-policy','crm-contract','release'])&&value.releaseGates.every(g=>g.status===(g.id==='veterans'?'implementation-pending':'pending')),'release_gates_must_stay_pending');
  check(!/(?:sk|rk|rkcs)_(?:live|test)_[A-Za-z0-9]{24,}|-----BEGIN .*PRIVATE KEY-----/u.test(JSON.stringify(value)),'no_credentials_in_review');
  return {reviewValid:true,activationAllowed:false,checkoutUrl:origin+a.checkoutPath,amountsCents:amounts,openGates:value.releaseGates.map(g=>g.id)};
}
export async function loadReview() {
  const value=JSON.parse(await readFile(new URL('./settings.review.json',import.meta.url),'utf8'));
  const facts=JSON.parse(await readFile(new URL('../../../public-firewood.json',import.meta.url),'utf8'));
  return {value,facts};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{check(process.argv.length===3&&process.argv[2]==='--check','only_offline_review_check_supported');const {value,facts}=await loadReview();console.log(JSON.stringify(validateReview(value,facts),null,2));}
  catch(error){console.error('Firewood review refused: '+error.message);process.exitCode=1;}
}
