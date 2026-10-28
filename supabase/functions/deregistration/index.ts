import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const payload = await req.json();
    console.log(payload);

    if (!payload?.deregistrations || !Array.isArray(payload.deregistrations)) {
      return new Response("Invalid payload", { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! // obligatoire pour update/delete
    );

    for (const dereg of payload.deregistrations) {
      const garminUserId = dereg.userId;

      if (!garminUserId) continue;

      const { error } = await supabase
        .from("garmin_users")
        .delete()
        .eq("garmin_user_id", garminUserId);

      if (error) {
        console.error("Error deregistering user:", garminUserId, error);
      }
    }

    // Garmin attend juste un 200
    return new Response("OK", { status: 200 });

  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});