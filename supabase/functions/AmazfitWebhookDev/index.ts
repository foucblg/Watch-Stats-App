import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/* =======================
   Types
======================= */

type AmazfitStageType = "LIGHT" | "DEEP" | "REM" | "WAKE";
type DbPhaseType = "light" | "deep" | "rem" | "awake";

interface AmazfitSleepStage {
  stage: AmazfitStageType;
  start: number; // minutes
  stop: number;  // minutes
}

interface AmazfitSleepPayload {
  score: number;
  startTime: number;
  endTime: number;
  totalTime: number;
  utc: number;
  stages: AmazfitSleepStage[];
  user_id: string;
}

/* =======================
   Utils
======================= */

const STAGE_MAP: Record<AmazfitStageType, DbPhaseType> = {
  LIGHT: "light",
  DEEP: "deep",
  REM: "rem",
  WAKE: "awake",
};

function minutesToSeconds(min: number) {
  return min * 60;
}

function computeSleepDateAndStartTime(utc: number, startTimeMinutes: number) {
  const reference = new Date(utc);

  const hours = Math.floor(startTimeMinutes / 60) % 24;
  const minutes = startTimeMinutes % 60;

  // On clone la date UTC et on met juste l'heure et les minutes
  const startDateTime = new Date(reference);
  startDateTime.setUTCHours(hours, minutes, 0, 0);

  // La date reste toujours celle du UTC
  const sleepDate = reference.toISOString().split("T")[0];

  return {
    date: sleepDate,
    start_time: startDateTime.toISOString().substring(11, 19),
  };
}

/* =======================
   Edge Function
======================= */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-amazfit-secret",
      },
    });
  }

  /* ========= Secret partagé avec l'app Zepp ========= */
  // Exigé dès que le secret AMAZFIT_WEBHOOK_SECRET est défini côté Supabase.
  const expectedSecret = Deno.env.get("AMAZFIT_WEBHOOK_SECRET");
  if (expectedSecret && req.headers.get("x-amazfit-secret") !== expectedSecret) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  try {
    const payload: AmazfitSleepPayload = await req.json();
    console.log("📥 Payload reçu:", payload);

    /* ========= Validation minimale ========= */
    if (
      !payload.user_id ||
      !payload.utc ||
      !payload.stages?.length ||
      typeof payload.score !== "number"
    ) {
      return new Response(
        JSON.stringify({ error: "Payload invalide" }),
        { status: 400 }
      );
    }

    /* ========= Transformation des phases ========= */
    const phase_type: DbPhaseType[] = [];
    const phase_duration: number[] = [];

    for (const stage of payload.stages) {
      const dbStage = STAGE_MAP[stage.stage];
      phase_type.push(dbStage);

      const durationMinutes = stage.stop - stage.start + 1;
      phase_duration.push(minutesToSeconds(durationMinutes));
    }

    /* ========= Dates ========= */
    const { date, start_time } = computeSleepDateAndStartTime(
      payload.utc,
      payload.startTime
    );

    /* ========= Score Amazfit natif ========= */
    const score = payload.score;

    console.log("📊 Score Amazfit:", score);

    /* ========= Supabase ========= */
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await supabase.from("amazfit_webhooks_log").insert({
      payload: payload,
      received_at: new Date().toISOString(),
    });

    const summary_id = `amazfit_${payload.utc}_${payload.user_id}`;

    const { data, error } = await supabase
      .from("sleep")
      .upsert({
        summary_id,
        date,
        score,
        local_user_id: payload.user_id,
        start_time,
        phase_type,
        phase_duration,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("❌ Supabase error:", error);
      throw error;
    }

    return new Response(
      JSON.stringify({
        status: "success",
        sleep_id: data.summary_id,
        score,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err: any) {
    console.error("❌ Server error:", err);
    return new Response(
      JSON.stringify({
        status: "error",
        message: err.message,
      }),
      { status: 500 }
    );
  }
});
