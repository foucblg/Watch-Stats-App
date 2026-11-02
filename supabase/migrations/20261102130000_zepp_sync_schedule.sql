-- Synchro Zepp toutes les 30 min le matin, plus un passage le soir en filet de sécurité.
-- pg_cron est en UTC : 6h-11h30 UTC couvre 8h-12h à Paris toute l'année
-- (7h-12h30 en hiver, 8h-13h30 en été).
select cron.schedule(
  'zepp-sync',
  '*/30 6-11 * * *',
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

select cron.schedule(
  'zepp-sync-evening',
  '15 17 * * *',
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
