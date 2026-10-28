import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

type SleepPhaseType = "awake" | "light" | "deep" | "rem";

type SleepLevelSegment = {
  startTimeInSeconds: number;
  endTimeInSeconds: number;
};

type SleepLevelsMap = {
  awake?: SleepLevelSegment[];
  light?: SleepLevelSegment[];
  deep?: SleepLevelSegment[];
  rem?: SleepLevelSegment[];
};

/**
 * Timeline chronologique des phases de sommeil
 */
function buildSleepTimeline(
  sleepLevelsMap: SleepLevelsMap
): { phases: SleepPhaseType[]; durations: number[] } {
  const all: {
    type: SleepPhaseType;
    start: number;
    end: number;
  }[] = [];

  (["awake", "light", "deep", "rem"] as SleepPhaseType[]).forEach((type) => {
    (sleepLevelsMap[type] ?? []).forEach((s) => {
      all.push({
        type,
        start: s.startTimeInSeconds,
        end: s.endTimeInSeconds,
      });
    });
  });

  all.sort((a, b) => a.start - b.start);

  const phases: SleepPhaseType[] = [];
  const durations: number[] = [];

  for (const seg of all) {
    const d = seg.end - seg.start;
    if (d > 0) {
      phases.push(seg.type);
      durations.push(d);
    }
  }

  return { phases, durations };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-garmin-signature",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);

    console.log(
      "📥 Webhook Garmin reçu",
      JSON.stringify(body),
      JSON.stringify(Object.fromEntries(req.headers))
    );

    /* --------------------------------------------------
     * 1️⃣ Vérification signature Garmin (HMAC)
     * -------------------------------------------------- */
    const signature = req.headers.get("x-garmin-signature");
    const consumerSecret = Deno.env.get("CLIENT_SECRET");

    if (signature && consumerSecret) {
      const hmac = createHmac("sha256", consumerSecret);
      hmac.update(rawBody);
      const calculatedSignature = hmac.digest("hex");

      if (signature !== calculatedSignature) {
        console.error("❌ Signature Garmin invalide");
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      console.log("✅ Signature Garmin validée");
    }

    /* --------------------------------------------------
     * 2️⃣ Client Supabase (Service Role = bypass RLS)
     * -------------------------------------------------- */
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );

    await supabase.from("garmin_webhooks_log").insert({
      payload: body,
      received_at: new Date().toISOString(),
    });

    /* --------------------------------------------------
     * 3️⃣ PING Garmin
     * -------------------------------------------------- */
    if (body.type === "PING") {
      console.log("🏓 PING Garmin reçu");

      await supabase.from("garmin_webhooks_log").insert({
        payload: body,
        received_at: new Date().toISOString(),
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* --------------------------------------------------
     * 4️⃣ SLEEP WEBHOOK
     * -------------------------------------------------- */
    if (body.sleeps) {
      console.log(`🛌 ${body.sleeps.length} sleep(s) reçu(s)`);

      for (const sleep of body.sleeps) {
        const garminUserId = sleep.userId;

        const { data: user, error: userError } = await supabase
          .from("garmin_users")
          .select("local_user_id")
          .eq("garmin_user_id", garminUserId)
          .single();

        if (userError || !user) {
          console.error("❌ User Garmin inconnu:", garminUserId);

          await supabase.from("garmin_webhooks_log").insert({
            payload: sleep,
            error: "User not found",
            received_at: new Date().toISOString(),
          });

          continue;
        }

        const sleepLevelsMap: SleepLevelsMap = sleep.sleepLevelsMap ?? {};

        // 1️⃣ Score Garmin natif
        const score: number | null =
          sleep.overallSleepScore?.value ?? null;

        // 2️⃣ Timeline des phases
        const { phases, durations } = buildSleepTimeline(sleepLevelsMap);

        // 3️⃣ Heure de début (timestamp → HH:mm:ss)
        const startDate = new Date(sleep.startTimeInSeconds * 1000);
        const startTime = startDate.toISOString().substring(11, 19);

        // 4️⃣ Insertion / mise à jour en base
        await supabase.from("sleep").upsert({
          summary_id: sleep.summaryId,
          date: sleep.calendarDate,
          score,
          local_user_id: user.local_user_id,
          start_time: startTime,
          phase_type: phases,
          phase_duration: durations,
          updated_at: new Date().toISOString(),
        });

        console.log(
          `✅ Sleep sauvegardé (${sleep.calendarDate}) - Score Garmin: ${score}`
        );
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ Erreur webhook:", error);

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
