export function emailDeliveryLabel(status:string|null|undefined,fallback='Accepted by email provider') {
  return ({pending:'Not sent',accepted:'Accepted by email provider',delayed:'Delivery delayed',delivered:'Delivery reported',failed:'Delivery failed',bounced:'Bounced — review recipient',complained:'Reported as spam — sending stopped',suppressed:'Sending suppressed — review recipient'} as Record<string,string>)[status??'']??fallback;
}
