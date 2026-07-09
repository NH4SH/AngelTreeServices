-- Record how a quote entered the sent state without changing the existing
-- quote status workflow or exposing any additional customer data.

alter table public.quotes
  add column if not exists sent_method text
    check (sent_method in ('crm_email', 'manual', 'printed', 'text', 'other')),
  add column if not exists sent_by_user_id uuid
    references public.profiles(id) on delete set null;

comment on column public.quotes.sent_method is
  'Delivery path used when the quote was most recently marked sent.';

comment on column public.quotes.sent_by_user_id is
  'Authenticated staff user who most recently marked or sent the quote.';
