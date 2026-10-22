import { Leaf, ShieldCheck } from "lucide-react";
import { PortalContact } from "@/components/portal-contact";

export function CustomerDocumentEntry({ organization = false, signedInAs }: { organization?: boolean; signedInAs?: string | null }) {
  return (
    <main className="customer-portal-page customer-portal-home customer-document-entry">
      <header className="customer-portal-header">
        <div className="customer-portal-brand">
          <span><Leaf aria-hidden="true" size={22} /></span>
          <div><strong>Angel Tree Services</strong><small>Fredericksburg, Virginia</small></div>
        </div>
        <p><ShieldCheck aria-hidden="true" size={17} /> Customer documents</p>
      </header>

      <section className="customer-portal-intro" aria-labelledby="customer-entry-title">
        <h1 id="customer-entry-title">{organization ? "Open your property documents" : "Open your customer documents"}</h1>
        <p>Your proposal, invoice and additional-work details are available through the secure links we email to you.</p>
        {organization ? <p>For multiple properties, use the separate document link in each email.</p> : null}
        <ol className="customer-document-steps">
          <li><strong>Find the latest Angel Tree email.</strong><p>Check the inbox where you receive messages from our office, including your spam or junk folder.</p></li>
          <li><strong>Open the document link.</strong><p>Review the work, check an invoice’s payment status, or print and save a copy from the document page.</p></li>
        </ol>
      </section>

      <section className="customer-document-entry-help" aria-labelledby="customer-entry-help-title">
        <h2 id="customer-entry-help-title">Need another copy?</h2>
        <p>Our office can help you find the right document or get a current link.</p>
        <PortalContact showLinkHelp />
      </section>

      <footer className="customer-portal-footer">
        <strong>Angel Tree Services</strong>
        {signedInAs ? <span className="customer-document-account">Signed in as {signedInAs}</span> : <span>Keep your secure document links private.</span>}
      </footer>
    </main>
  );
}
