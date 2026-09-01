-- These policies are exact subsets of newer read policies and only add
-- repeated predicate evaluation. Removing them does not broaden or narrow
-- access: authenticated users can already read role names, and users retain
-- the optimized self-membership policy.
drop policy if exists "Platform admins can read roles" on public.roles;
drop policy if exists "Users can read roles assigned to them" on public.roles;
drop policy if exists "Users can read their own role assignments" on public.user_roles;
