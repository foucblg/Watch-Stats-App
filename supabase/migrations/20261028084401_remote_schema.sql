CREATE SEQUENCE "public"."amazfit_webhooks_log_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."friendship_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."garmin_users_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."garmin_webhooks_log_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE TABLE "public"."amazfit_webhooks_log" (
  "id"          bigint                   NOT NULL DEFAULT nextval('public.amazfit_webhooks_log_id_seq'::regclass),
  "user_id"     text,
  "payload"     jsonb,
  "received_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "amazfit_webhooks_log_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."friendship" (
  "id"           bigint NOT NULL DEFAULT nextval('public.friendship_id_seq'::regclass),
  "requester_id" uuid   NOT NULL,
  "addressee_id" uuid   NOT NULL,
  CONSTRAINT "friendship_pkey" PRIMARY KEY (id),
  CONSTRAINT "users_diff" CHECK ((requester_id <> addressee_id))
);

CREATE TABLE "public"."garmin_users" (
  "id"                   bigint                      NOT NULL DEFAULT nextval('public.garmin_users_id_seq'::regclass),
  "local_user_id"        uuid                        NOT NULL,
  "garmin_user_id"       uuid                        NOT NULL,
  "garmin_access_token"  text                        NOT NULL,
  "garmin_refresh_token" text                        NOT NULL,
  "created_at"           timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  "permissions"          text[],
  CONSTRAINT "garmin_users_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."garmin_webhooks_log" (
  "id"          bigint                   NOT NULL DEFAULT nextval('public.garmin_webhooks_log_id_seq'::regclass),
  "user_id"     text,
  "payload"     jsonb,
  "signature"   text,
  "received_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "garmin_webhooks_log_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."group_users" (
  "group_id" uuid NOT NULL,
  "user_id"  uuid NOT NULL,
  CONSTRAINT "group_users_pkey" PRIMARY KEY (group_id, user_id)
);

CREATE TABLE "public"."groups" (
  "id"   uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  CONSTRAINT "groups_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."sleep" (
  "summary_id"    text                     NOT NULL,
  "date"          date,
  "created_at"    timestamp with time zone DEFAULT now(),
  "updated_at"    timestamp with time zone DEFAULT now(),
  "score"         bigint,
  "local_user_id" uuid                     NOT NULL,
  "start_time"    time without time zone   NOT NULL,
  CONSTRAINT "sleep_pkey" PRIMARY KEY (summary_id)
);

ALTER SEQUENCE "public"."amazfit_webhooks_log_id_seq" OWNED BY "public"."amazfit_webhooks_log"."id";

ALTER SEQUENCE "public"."friendship_id_seq" OWNED BY "public"."friendship"."id";

ALTER SEQUENCE "public"."garmin_users_id_seq" OWNED BY "public"."garmin_users"."id";

ALTER SEQUENCE "public"."garmin_webhooks_log_id_seq" OWNED BY "public"."garmin_webhooks_log"."id";

CREATE TYPE "public"."friendship_status" AS ENUM (
  'pending',
  'accepted',
  'refused'
);

ALTER TABLE "public"."friendship"
  ADD COLUMN "status" public.friendship_status NOT NULL DEFAULT 'pending'::public.friendship_status;

ALTER TABLE "public"."friendship"
  ADD COLUMN "created_at" timestamp WITHOUT time zone NOT NULL DEFAULT now();

ALTER TABLE "public"."friendship"
  ADD COLUMN "updated_at" timestamp WITHOUT time zone;

CREATE TYPE "public"."phase_type" AS ENUM (
  'awake',
  'light',
  'deep',
  'rem'
);

ALTER TABLE "public"."sleep"
  ADD COLUMN "phase_type" public.phase_type[] NOT NULL;

ALTER TABLE "public"."sleep"
  ADD COLUMN "phase_duration" bigint[] NOT NULL;

ALTER TABLE "public"."group_users"
  ADD CONSTRAINT "group_users_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."group_users"
  ADD CONSTRAINT "group_users_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."amazfit_webhooks_log_id_seq" TO "anon", "authenticated";

REVOKE ALL ON SEQUENCE "public"."amazfit_webhooks_log_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."amazfit_webhooks_log_id_seq" TO "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."amazfit_webhooks_log_id_seq" TO "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."friendship_id_seq" TO "anon", "authenticated";

REVOKE ALL ON SEQUENCE "public"."friendship_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."friendship_id_seq" TO "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."friendship_id_seq" TO "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."garmin_users_id_seq" TO "anon", "authenticated";

REVOKE ALL ON SEQUENCE "public"."garmin_users_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."garmin_users_id_seq" TO "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."garmin_users_id_seq" TO "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."garmin_webhooks_log_id_seq" TO "anon", "authenticated";

REVOKE ALL ON SEQUENCE "public"."garmin_webhooks_log_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."garmin_webhooks_log_id_seq" TO "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."garmin_webhooks_log_id_seq" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."amazfit_webhooks_log" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."amazfit_webhooks_log" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."amazfit_webhooks_log" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."amazfit_webhooks_log" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."friendship" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."friendship" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."friendship" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."friendship" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."garmin_users" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."garmin_users" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."garmin_users" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."garmin_users" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."garmin_webhooks_log" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."garmin_webhooks_log" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."garmin_webhooks_log" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."garmin_webhooks_log" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."group_users" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."group_users" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."group_users" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."group_users" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."groups" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."groups" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."groups" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."groups" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sleep" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."sleep" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sleep" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sleep" TO "service_role";

