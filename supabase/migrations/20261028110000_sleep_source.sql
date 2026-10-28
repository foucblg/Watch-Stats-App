-- Source de chaque nuit, nécessaire pour l'attribution Garmin (API Brand Guidelines).
-- Déduite de summary_id : AmazfitWebhookDev préfixe ses ids par "amazfit_",
-- garminWebhookDev utilise le summaryId Garmin.
alter table public.sleep
  add column source text
  generated always as (
    case when summary_id like 'amazfit\_%' then 'amazfit' else 'garmin' end
  ) stored;

comment on column public.sleep.source is
  'garmin | amazfit — calculé depuis summary_id, sert à l''attribution « Garmin » dans le front';
