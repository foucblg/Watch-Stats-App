import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const payload = await req.json();
    console.log(payload);

    if (
      !payload?.userPermissionsChange ||
      !Array.isArray(payload.userPermissionsChange)
    ) {
      return new Response("Invalid payload", { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    for (const change of payload.userPermissionsChange) {
      const garminUserId = change.userId;
      const permissions = change.permissions ?? [];

      if (!garminUserId) continue;

      const { error } = await supabase
        .from("garmin_users")
        .update({
          permissions,
          updated_at: new Date().toISOString(),
        })
        .eq("garmin_user_id", garminUserId);

      if (error) {
        console.error(
          "Failed to update permissions for user:",
          garminUserId,
          error
        );
      }
    }

    return new Response("OK", { status: 200 });

  } catch (err) {
    console.error("Permission webhook error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});