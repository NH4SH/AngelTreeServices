"use server";
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserRoles } from '@/lib/auth/roles';
import { getFirewoodOfficeRuntime } from '@/lib/firewood/office-runtime';
import { runFirewoodOfficeCommand } from '@/lib/firewood/office-command';
import type { FirewoodOfficeActionState } from '@/lib/firewood/office-ui-types';
import { withClosedInvoiceCheckouts } from '@/lib/payments/invoice-void';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { getStripeServerConfig } from '@/lib/stripe/server';

export async function submitFirewoodOfficeAction(_previous: FirewoodOfficeActionState, form: FormData): Promise<FirewoodOfficeActionState> {
  if (!getFirewoodOfficeRuntime()) return { status: 'error', message: 'Website order management is not active yet. Existing firewood invoices remain available.' };
  const client = await createClient();
  if (!client) return { status: 'error', message: 'The office session could not be confirmed. Sign in again before continuing.' };
  const { data: { user } } = await client.auth.getUser();
  const roles = user ? await getUserRoles(client, user.id) : [];
  const result = await runFirewoodOfficeCommand(form, { client, userId: user?.id ?? null, roles, admitted: true,
    reviewCheckouts: (invoiceId, finish) => withClosedInvoiceCheckouts({ invoiceId, staffSupabase: client,
      correlationId: crypto.randomUUID(), getPaymentContext: () => {
        const supabase = getServiceRoleClient(); if (!supabase) return null;
        const config = getStripeServerConfig();
        return { supabase, stripe: config.configured ? config.stripe : null, livemode: config.configured ? config.livemode : false };
      } }, finish),
  });
  // A hold or checkout closure may have committed before a later step needs
  // review. Refresh both records so the screen reflects that durable progress.
  revalidatePath('/admin/firewood/office'); revalidatePath('/admin/firewood'); revalidatePath('/admin/invoices');
  const invoice = form.get('invoice_id'); if (typeof invoice === 'string' && /^[a-f0-9-]{36}$/.test(invoice)) revalidatePath(`/admin/invoices/${invoice}`);
  return result;
}
