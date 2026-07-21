-- Invoices may be created directly for a customer or organization without a
-- work order. Existing job-linked invoices and their foreign keys are intact.

alter table public.invoices
  alter column job_id drop not null;
