import { createClient } from "@supabase/supabase-js"
import { NextRequest } from "next/server"
import { redirect } from "next/navigation"

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  })
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anonKey || !serviceRoleKey) {
    return json(
      { error: "Configuration Supabase manquante." },
      { status: 500 },
    )
  }

  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  // Récupérer local_user_id depuis le state (format: "state:user_id")
  let localUserId: string | null = null
  if (state && state.includes(":")) {
    const parts = state.split(":")
    localUserId = parts[1] || null
  }

  if (error) {
    return redirect(`/?error=garmin_oauth_error&message=${encodeURIComponent(error)}`)
  }

  if (!code) {
    return redirect(`/?error=garmin_oauth_missing_code`)
  }

  if (!localUserId) {
    return redirect(`/?error=garmin_oauth_missing_user_id`)
  }

  // Le code_verifier doit être récupéré depuis le client (sessionStorage)
  // On redirige vers une page client qui récupère le code_verifier et fait l'échange
  const redirectUrl = new URL("/garmin/oauth/exchange", req.nextUrl.origin)
  redirectUrl.searchParams.set("code", code)
  redirectUrl.searchParams.set("local_user_id", localUserId)
  redirectUrl.searchParams.set("state", state || "")
  
  return redirect(redirectUrl.toString())
}
