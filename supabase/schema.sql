-- Slotwise sync schema. Paste into Supabase: SQL Editor -> New query -> Run.
-- One row per synced item (task, project, recurring rule, personal block,
-- preferences, calendar snapshot). Row level security keeps every user's
-- rows private to them.

create table if not exists public.items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

create index if not exists items_user_updated on public.items (user_id, updated_at);

alter table public.items enable row level security;

drop policy if exists "own items" on public.items;
create policy "own items" on public.items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The server clock decides ordering, so devices with a wrong clock still sync.
create or replace function public.items_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists items_touch on public.items;
create trigger items_touch before insert or update on public.items
  for each row execute function public.items_touch();
