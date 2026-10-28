import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TARGET_ENDPOINT =
  "https://gqksrbfmpnmgjuxhycsd.supabase.co/functions/v1/garminWebhookDev";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("🔁 Replay Garmin webhooks – démarrage");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );

    /* --------------------------------------------------
     * 1️⃣ Récupération de tous les logs Garmin
     * -------------------------------------------------- */
    const { data: logs, error } = await supabase
      .from("garmin_webhooks_log")
      .select("id, payload")
      .order("received_at", { ascending: true });

    if (error) {
      console.error("❌ Erreur récupération logs:", error);
      throw error;
    }

    console.log(`📦 ${logs.length} webhook(s) à rejouer`);

    let successCount = 0;
    let errorCount = 0;

    /* --------------------------------------------------
     * 2️⃣ Replay vers la nouvelle edge function
     * -------------------------------------------------- */
    for (const log of logs) {
      try {
        const res = await fetch(TARGET_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(log.payload),
        });

        if (!res.ok) {
          const text = await res.text();
          console.error(
            `❌ Échec replay log ${log.id} – ${res.status}`,
            text
          );
          errorCount++;
          continue;
        }

        successCount++;
      } catch (err) {
        console.error(`❌ Exception replay log ${log.id}`, err);
        errorCount++;
      }
    }

    /* --------------------------------------------------
     * 3️⃣ Résumé
     * -------------------------------------------------- */
    console.log(
      `✅ Replay terminé — succès: ${successCount}, erreurs: ${errorCount}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        total: logs.length,
        successCount,
        errorCount,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ Erreur replay Garmin:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
