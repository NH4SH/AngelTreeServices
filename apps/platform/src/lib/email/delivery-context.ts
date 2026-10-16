import type { SendEmailInput } from "@/lib/email/send";
import type { DeliveryContext } from "@/lib/email/delivery";

export function emailDeliveryContext(input: SendEmailInput): DeliveryContext {
  return {
    kind:input.sentByUserId&&['quote','invoice','change_order'].includes(input.emailType)?input.emailType:'other',email_type:input.emailType,
    actor_id:input.sentByUserId??null,quote_ids:[...new Set(input.deliveryQuoteIds??(input.relatedQuoteId?[input.relatedQuoteId]:[]))].sort(),
    invoice_id:input.relatedInvoiceId??null,change_order_id:input.relatedChangeOrderId??null,job_id:input.relatedJobId??null,
    customer_id:input.relatedCustomerId??null,organization_id:input.relatedOrganizationId??null,communication_id:input.relatedCommunicationId??null,
    schedule_event_id:input.relatedScheduleEventId??null,appointment_id:input.relatedAppointmentId??null,payment_id:input.relatedPaymentId??null,
    expected_versions:input.expectedSourceVersions??{},portal_tokens:[...(input.deliveryPortalTokens??[])].sort((a,b)=>a.id.localeCompare(b.id)),
    ...(input.confirmedAdditionalCopy?{confirmed_copy:true,copy_request_id:input.additionalCopyRequestId??''}:{}),
  };
}
