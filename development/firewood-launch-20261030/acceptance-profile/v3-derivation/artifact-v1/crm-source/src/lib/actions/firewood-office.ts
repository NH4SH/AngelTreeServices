"use server";
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserRoles } from '@/lib/auth/roles';
import { getFirewoodOfficeRuntime } from '@/lib/firewood/office-runtime';
import { runFirewoodOfficeCommand } from '@/lib/firewood/office-command';
import type { FirewoodOfficeActionState } from '@/lib/firewood/office-ui-types';

export async function submitFirewoodOfficeAction(_previous: FirewoodOfficeActionState, form: FormData): Promise<FirewoodOfficeActionState> {
  if (!getFirewoodOfficeRuntime()) return { status: 'error', message: 'Website order management is not active yet. Existing firewood invoices remain available.' };
  const client = await createClient();
  if (!client) return { status: 'error', message: 'The office session could not be confirmed. Sign in again before continuing.' };
  const { data: { user } } = await client.auth.getUser();
  const roles = user ? await getUserRoles(client, user.id) : [];
  const result = await runFirewoodOfficeCommand(form, { client, userId: user?.id ?? null, roles, admitted: true });
  if (result.status === 'success') { revalidatePath('/admin/firewood/office'); revalidatePath('/admin/firewood'); }
  return result;
}
