create table if not exists public.app_state (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

drop policy if exists "Public app state read" on public.app_state;
create policy "Public app state read"
on public.app_state
for select
to anon
using (true);

drop policy if exists "Public app state insert" on public.app_state;
create policy "Public app state insert"
on public.app_state
for insert
to anon
with check (true);

drop policy if exists "Public app state update" on public.app_state;
create policy "Public app state update"
on public.app_state
for update
to anon
using (true)
with check (true);
