-- Allow users to clock out of their own active timer even if timer access
-- was disabled after the clock-in began.

drop policy if exists "Users can update their own active time entries" on public.time_entries;

create policy "Users can update their own active time entries"
  on public.time_entries
  for update
  to authenticated
  using (
    auth.uid() = user_id
    and status = 'active'
    and clock_out_at is null
  )
  with check (
    auth.uid() = user_id
    and user_id = auth.uid()
    and status in ('active', 'completed')
  );
