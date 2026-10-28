-- Synchronisation automatique Amazfit via l'API privée Zepp (Edge Function zeppSync).
--
-- zepp_sync_state : une ligne par utilisateur synchronisé. Contient le jeton Zepp
-- (valable ~30 jours) et l'état du dernier login. Accessible uniquement par service_role.
-- Si un login échoue, login_failed_at est renseigné et la fonction ne retente plus
-- (Zepp bloque le compte après 10 échecs) : remettre à null à la main après vérification.

create table public.zepp_sync_state (
  local_user_id   uuid primary key references auth.users(id) on delete cascade,
  device_id       uuid not null default gen_random_uuid(),
  zepp_user_id    text,
  app_token       text,
  host            text,
  token_expires_at timestamptz,
  login_failed_at timestamptz,
  last_error      text,
  last_sync_at    timestamptz,
  last_sync_nights integer
);

alter table public.zepp_sync_state enable row level security;
revoke all on table public.zepp_sync_state from anon, authenticated;

-- Planification : appelle zeppSync plusieurs fois le matin (heure UTC), le temps
-- que la montre se synchronise avec le téléphone. Le secret d'appel est lu dans le
-- Vault (nom : zepp_sync_secret), il n'est jamais écrit dans les migrations.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'zepp-sync',
  '15 5,7,9,11,17 * * *',
  $$
  select net.http_post(
    url := 'https://gqksrbfmpnmgjuxhycsd.supabase.co/functions/v1/zeppSync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'zepp_sync_secret')
    ),
    body := '{"days": 3}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
