-- Active la RLS sur toutes les tables publiques.
--
-- Accès qui contournent la RLS (inchangés) : Edge Functions et routes Next.js
-- qui utilisent la clé service_role.
-- Accès soumis à la RLS (rôle authenticated, JWT utilisateur) :
--   - group_users / groups : GET /groups, /groups/[id]/scores|yearly-scores|sleep-phases
--   - sleep                : /groups/[id]/scores|yearly-scores|sleep-phases
--   - garmin_users         : /garmin/status, /garmin/disconnect
-- Le rôle anon n'a plus accès à aucune donnée.

-- Helpers hors du schéma exposé par PostgREST, en security definer pour éviter
-- la récursion des policies sur group_users.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_users
    where group_id = gid and user_id = (select auth.uid())
  );
$$;

create or replace function private.shares_group_with(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_users mine
    join public.group_users theirs on theirs.group_id = mine.group_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = other_user
  );
$$;

revoke all on function private.is_group_member(uuid) from public, anon;
revoke all on function private.shares_group_with(uuid) from public, anon;
grant execute on function private.is_group_member(uuid) to authenticated;
grant execute on function private.shares_group_with(uuid) to authenticated;

alter table public.amazfit_webhooks_log enable row level security;
alter table public.garmin_webhooks_log  enable row level security;
alter table public.friendship           enable row level security;
alter table public.garmin_users         enable row level security;
alter table public.groups               enable row level security;
alter table public.group_users          enable row level security;
alter table public.sleep                enable row level security;

-- Logs et friendship : aucune policy, accès uniquement via service_role.

create policy "group_users: membres de mes groupes"
  on public.group_users for select to authenticated
  using ((select private.is_group_member(group_id)));

create policy "groups: mes groupes"
  on public.groups for select to authenticated
  using ((select private.is_group_member(id)));

create policy "sleep: moi et les membres de mes groupes"
  on public.sleep for select to authenticated
  using (
    local_user_id = (select auth.uid())
    or (select private.shares_group_with(local_user_id))
  );

create policy "garmin_users: ma connexion (lecture)"
  on public.garmin_users for select to authenticated
  using (local_user_id = (select auth.uid()));

create policy "garmin_users: ma connexion (suppression)"
  on public.garmin_users for delete to authenticated
  using (local_user_id = (select auth.uid()));

-- TRUNCATE n'est pas soumis à la RLS : on le retire aux rôles API.
revoke truncate on all tables in schema public from anon, authenticated;
