import "./portal-recovery.css";
import { companyBrand } from "../lib/company-brand.ts";

export function PortalContact({ showLinkHelp = false }: { showLinkHelp?: boolean }) {
  return (
    <div className="customer-portal-contact">
      <p>Need help? Reply to the email containing your secure link, or call our office.</p>
      <a href={companyBrand.phoneHref}>Call {companyBrand.phone}</a>
      {showLinkHelp ? (
        // The browser owns `open`; a customer may toggle this before hydration.
        <details className="customer-link-help" suppressHydrationWarning>
          <summary>Can’t find or open your link?</summary>
          <p>Check your inbox and spam or junk folder for the latest email from Angel Tree Services. Open the document link in that email.</p>
          <p>If the email is missing or the link no longer opens, ask our office for a current link. Have your name and service address ready so we can help you find the right document.</p>
          <p>You do not need to sign in to open a secure document link. Keep that link private.</p>
        </details>
      ) : null}
    </div>
  );
}
