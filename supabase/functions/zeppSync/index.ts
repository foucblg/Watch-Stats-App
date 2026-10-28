import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

/*
 * Synchronise le sommeil Amazfit depuis l'API privée Zepp vers public.sleep.
 *
 * Login et endpoints repris de zepp_sync.py (projet Stats), lui-même basé sur
 * github.com/DhavalBhimani44/zepp-mcp (MIT). API non officielle : peut casser
 * si Zepp change ses serveurs.
 *
 * Appel : POST { "days": 3 } avec le header x-sync-secret (= ZEPP_SYNC_SECRET).
 * Planifié par pg_cron (job "zepp-sync"). Backfill : { "days": 365 }.
 *
 * Secrets : ZEPP_EMAIL, ZEPP_PASSWORD, ZEPP_COUNTRY (FR par défaut),
 * ZEPP_LOCAL_USER_ID (auth.users.id), ZEPP_SYNC_SECRET.
 *
 * Sécurité du compte : Zepp bloque le compte après 10 échecs de login. Un seul
 * login par appel, et après un échec plus aucun login tant que
 * zepp_sync_state.login_failed_at n'est pas remis à null à la main.
 */

/* =======================
   Constantes Zepp
======================= */

const AES_KEY = new TextEncoder().encode("xeNtBVqzDc6tuNTh");
const AES_IV = new TextEncoder().encode("MAAAYAAAAAAAAABg");
const REDIRECT = "https://s3-us-west-2.amazonaws.com/hm-registration/successsignin.html";
const AUTH_HOST = "api-user.zepp.com";
const DATA_HOST = "api-mifit.zepp.com";

const STEP1_HEADERS = {
  "app_name": "com.huami.midong", "appname": "com.huami.midong",
  "cv": "151689_9.12.5", "v": "2.0", "appplatform": "android_phone",
  "vb": "202509151347", "vn": "9.12.5", "x-hm-ekv": "1",
  "user-agent": "Zepp/9.12.5 (Pixel 4; Android 12; Density/2.75)",
  "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
};
const STEP2_HEADERS = {
  "app_name": "com.huami.webapp", "appname": "com.huami.webapp",
  "origin": "https://user.zepp.com", "referer": "https://user.zepp.com/",
  "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
  "user-agent": "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
};

type DbPhaseType = "light" | "deep" | "rem" | "awake";
const SLEEP_MODES: Record<number, DbPhaseType> = { 4: "light", 5: "deep", 7: "awake", 8: "rem" };

const MAX_DAYS = 400;

/* =======================
   Types
======================= */

interface SyncState {
  local_user_id: string;
  device_id: string;
  zepp_user_id: string | null;
  app_token: string | null;
  host: string | null;
  token_expires_at: string | null;
  login_failed_at: string | null;
}

interface Credential {
  appToken: string;
  zeppUserId: string;
  host: string;
}

interface ZeppStage {
  start: number; // minutes
  stop: number;  // minutes (inclus)
  mode: number;
}

interface ZeppSleep {
  st?: number;  // coucher, epoch s
  ed?: number;  // lever, epoch s
  ss?: number;  // score
  stage?: ZeppStage[];
}

type LoginResult = Credential & { ttl: number }; // ttl en secondes (~30 jours)

class LoginError extends Error {}

/* =======================
   Auth Zepp
======================= */

async function encryptLoginBody(body: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", AES_KEY, "AES-CBC", false, ["encrypt"]);
  // AES-CBC de WebCrypto applique le padding PKCS#7, comme pad(body, 16) en Python.
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv: AES_IV },
    key,
    new TextEncoder().encode(body),
  );
  return new Uint8Array(encrypted);
}

async function login(state: SyncState): Promise<LoginResult> {
  const email = Deno.env.get("ZEPP_EMAIL");
  const password = Deno.env.get("ZEPP_PASSWORD");
  const country = Deno.env.get("ZEPP_COUNTRY") ?? "FR";
  if (!email || !password) {
    throw new Error("ZEPP_EMAIL / ZEPP_PASSWORD absents des secrets Supabase");
  }

  const params = new URLSearchParams({
    emailOrPhone: email, password,
    state: "REDIRECTION", client_id: "HuaMi",
    redirect_uri: REDIRECT, region: "us-west-2",
    country_code: country,
  });
  params.append("token", "access");
  params.append("token", "refresh");

  const step1 = await fetch(`https://${AUTH_HOST}/v2/registrations/tokens`, {
    method: "POST",
    headers: STEP1_HEADERS,
    body: await encryptLoginBody(params.toString()),
    redirect: "manual",
  });
  await step1.body?.cancel();
  const location = new URL(step1.headers.get("location") ?? "about:blank");
  const code = location.searchParams.get("access");
  if (!code) {
    const err = location.searchParams.get("error") ?? `HTTP ${step1.status}`;
    const attempts = location.searchParams.get("attempts") ?? "?";
    const max = location.searchParams.get("max_attempts") ?? "?";
    throw new LoginError(`Login refusé : ${err} (tentative ${attempts}/${max})`);
  }

  const step2 = await fetch(`https://${DATA_HOST}/v2/client/login`, {
    method: "POST",
    headers: STEP2_HEADERS,
    body: new URLSearchParams({
      code, device_id: state.device_id,
      grant_type: "access_token", third_name: "huami",
      // Identité de l'ancienne app Mi Fit : ne déconnecte pas l'app Zepp du téléphone.
      app_name: "com.xiaomi.hm.health", country_code: country,
      device_model: "android_phone", app_version: "9.12.5",
      allow_registration: "false", lang: "fr",
      dn: "api-mifit.zepp.com,api-user.zepp.com,api-watch.zepp.com,auth.zepp.com",
      source: "com.huami.watch.hmwatchmanager:9.12.5:151689",
    }),
  });
  const data = await step2.json().catch(() => ({}));
  const info = data?.token_info ?? {};
  if (!info.app_token) {
    throw new LoginError(`Échange de jeton échoué (HTTP ${step2.status}, result=${data?.result})`);
  }

  let host = DATA_HOST;
  for (const entry of data?.domains ?? []) {
    if (entry?.host === DATA_HOST && entry?.cnames?.length) host = entry.cnames[0];
  }

  return {
    appToken: info.app_token,
    zeppUserId: String(info.user_id ?? ""),
    host,
    ttl: Number(info.app_ttl) || 2592000,
  };
}

/* =======================
   Données
======================= */

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function* chunks(start: Date, end: Date, size: number): Generator<[string, string]> {
  const cur = new Date(start);
  while (cur <= end) {
    const stop = new Date(cur);
    stop.setUTCDate(stop.getUTCDate() + size - 1);
    const last = stop < end ? stop : end;
    yield [isoDate(cur), isoDate(last)];
    cur.setTime(last.getTime());
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}

async function fetchBandData(cred: Credential, from: string, to: string): Promise<Response> {
  const url = new URL(`https://${cred.host}/v1/data/band_data.json`);
  url.search = new URLSearchParams({
    query_type: "detail", device_type: "android_phone",
    userid: cred.zeppUserId, from_date: from, to_date: to,
  }).toString();
  return await fetch(url, { headers: { apptoken: cred.appToken } });
}

function decodeSummary(row: Record<string, unknown>): { slp?: ZeppSleep; tz?: number } {
  try {
    return JSON.parse(atob(String(row.summary ?? "")));
  } catch {
    return {};
  }
}

/**
 * Transforme une journée Zepp en ligne sleep.
 * La ligne du jour J contient la nuit qui se termine le matin de J (comme le
 * calendarDate Garmin). Zepp classe parfois une sieste du soir en sommeil
 * principal : on ne garde que les sommeils qui se terminent entre 3 h et 14 h
 * (heure locale) le jour J.
 */
function toSleepRow(localUserId: string, row: Record<string, unknown>) {
  const date = String(row.date_time ?? "");
  const summary = decodeSummary(row);
  const slp = summary.slp;
  if (!date || !slp?.stage?.length || !slp.ed) return null;

  const tzSeconds = Number(summary.tz) || 0;
  const wake = new Date((slp.ed + tzSeconds) * 1000); // heure locale exprimée en UTC
  const wakeHour = wake.getUTCHours();
  if (isoDate(wake) !== date || wakeHour < 3 || wakeHour >= 14) return null;

  const phase_type: DbPhaseType[] = [];
  const phase_duration: number[] = [];
  for (const stage of [...slp.stage].sort((a, b) => a.start - b.start)) {
    const type = SLEEP_MODES[stage.mode];
    if (!type) continue;
    phase_type.push(type);
    phase_duration.push((stage.stop - stage.start + 1) * 60);
  }
  if (!phase_type.length) return null;

  return {
    summary_id: `amazfit_zepp_${date}_${localUserId}`,
    date,
    score: slp.ss && slp.ss > 0 ? slp.ss : null,
    local_user_id: localUserId,
    // start_time en UTC, comme garminWebhookDev
    start_time: new Date((slp.st ?? slp.ed) * 1000).toISOString().substring(11, 19),
    phase_type,
    phase_duration,
    updated_at: new Date().toISOString(),
  };
}

/* =======================
   État
======================= */

async function loadState(supabase: SupabaseClient, localUserId: string): Promise<SyncState> {
  const { data, error } = await supabase
    .from("zepp_sync_state")
    .select("*")
    .eq("local_user_id", localUserId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as SyncState;

  const { data: created, error: insertError } = await supabase
    .from("zepp_sync_state")
    .insert({ local_user_id: localUserId })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return created as SyncState;
}

async function credential(supabase: SupabaseClient, state: SyncState, force: boolean): Promise<Credential> {
  const expires = state.token_expires_at ? Date.parse(state.token_expires_at) : 0;
  if (!force && state.app_token && state.host && state.zepp_user_id && expires - 3600_000 > Date.now()) {
    return { appToken: state.app_token, zeppUserId: state.zepp_user_id, host: state.host };
  }

  if (state.login_failed_at) {
    throw new LoginError(
      "Login suspendu après un échec précédent : vérifier les identifiants puis remettre " +
        "zepp_sync_state.login_failed_at à null.",
    );
  }

  try {
    const cred = await login(state);
    await supabase.from("zepp_sync_state").update({
      app_token: cred.appToken,
      zepp_user_id: cred.zeppUserId,
      host: cred.host,
      token_expires_at: new Date(Date.now() + cred.ttl * 1000).toISOString(),
      last_error: null,
    }).eq("local_user_id", state.local_user_id);
    return cred;
  } catch (err) {
    if (err instanceof LoginError) {
      await supabase.from("zepp_sync_state").update({
        login_failed_at: new Date().toISOString(),
        last_error: err.message,
      }).eq("local_user_id", state.local_user_id);
    }
    throw err;
  }
}

/* =======================
   Edge Function
======================= */

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("ZEPP_SYNC_SECRET");
  if (!secret || req.headers.get("x-sync-secret") !== secret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const localUserId = Deno.env.get("ZEPP_LOCAL_USER_ID");
  if (!localUserId) return json({ error: "ZEPP_LOCAL_USER_ID manquant" }, 500);

  const body = await req.json().catch(() => ({}));
  const days = Math.min(Math.max(Number(body?.days) || 3, 1), MAX_DAYS);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let state: SyncState;
  try {
    state = await loadState(supabase, localUserId);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }

  try {
    let cred = await credential(supabase, state, false);
    let relogged = false;

    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days + 1);

    const rows: NonNullable<ReturnType<typeof toSleepRow>>[] = [];
    for (const [from, to] of chunks(start, end, 30)) {
      let res = await fetchBandData(cred, from, to);
      if (res.status === 401 && !relogged) {
        // Jeton expiré côté Zepp : un seul nouveau login.
        await res.body?.cancel();
        relogged = true;
        cred = await credential(supabase, state, true);
        res = await fetchBandData(cred, from, to);
      }
      if (!res.ok) {
        await res.body?.cancel();
        throw new Error(`band_data HTTP ${res.status} (${from} → ${to})`);
      }
      const data = await res.json();
      for (const row of data?.data ?? []) {
        if (row && typeof row === "object") {
          const sleep = toSleepRow(localUserId, row);
          if (sleep) rows.push(sleep);
        }
      }
    }

    if (rows.length) {
      const { error } = await supabase.from("sleep").upsert(rows);
      if (error) throw error;

      // Supprime les nuits envoyées par l'ancienne app montre pour les mêmes dates
      // (summary_id amazfit_<utc>_<user>), pour ne pas compter deux fois une nuit.
      const { error: cleanupError } = await supabase
        .from("sleep")
        .delete()
        .eq("local_user_id", localUserId)
        .eq("source", "amazfit")
        .in("date", rows.map((r) => r.date))
        .not("summary_id", "like", "amazfit_zepp_%");
      if (cleanupError) throw cleanupError;
    }

    await supabase.from("zepp_sync_state").update({
      last_sync_at: new Date().toISOString(),
      last_sync_nights: rows.length,
      last_error: null,
    }).eq("local_user_id", localUserId);

    return json({
      status: "success",
      days,
      nights: rows.length,
      first: rows.map((r) => r.date).sort()[0] ?? null,
      last: rows.map((r) => r.date).sort().at(-1) ?? null,
    });
  } catch (err) {
    const message = (err as Error).message;
    console.error("❌ zeppSync:", message);
    await supabase.from("zepp_sync_state").update({ last_error: message })
      .eq("local_user_id", localUserId);
    return json({ status: "error", message }, 500);
  }
});
