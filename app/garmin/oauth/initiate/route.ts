import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  })
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!header) return null

  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

// Générer un code verifier pour PKCE
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url")
}

// Générer un code challenge à partir du code verifier
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url")
}

export async function POST(req: Request): Promise<Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return json(
      { error: "Configuration Supabase manquante (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)." },
      { status: 500 },
    )
  }

  const token = getBearerToken(req)
  if (!token) {
    return json({ error: "Non autorisé: token Bearer manquant." }, { status: 401 })
  }

  const supabase = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  })

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token)

  if (userError || !user) {
    return json({ error: "Non autorisé: token invalide ou expiré." }, { status: 401 })
  }

  // Vérifier les variables d'environnement Garmin
  const garminClientId = process.env.GARMIN_CLIENT_ID
  const garminClientSecret = process.env.GARMIN_CLIENT_SECRET

  if (!garminClientId || !garminClientSecret) {
    return json(
      { error: "Configuration Garmin manquante (GARMIN_CLIENT_ID / GARMIN_CLIENT_SECRET)." },
      { status: 500 },
    )
  }

  // Générer le code verifier et challenge pour PKCE
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  
  // Générer un state unique pour la sécurité
  const state = crypto.randomBytes(32).toString("base64url")

  // Stocker le code_verifier et state dans la session (on peut utiliser Supabase pour ça)
  // Pour simplifier, on les stocke dans un cookie ou on les retourne au client
  // Ici, on va les stocker temporairement dans Supabase avec une table temporaire ou utiliser les cookies
  // Pour l'instant, on les retourne au client qui devra les renvoyer lors du callback

  // Construire l'URL d'autorisation Garmin
  // Inclure local_user_id dans le state pour le récupérer dans le callback
  const stateWithUserId = `${state}:${user.id}`
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || req.headers.get("origin") || "http://localhost:3000"}/garmin/oauth/callback`
  
  const authUrl = new URL("https://connect.garmin.com/oauth2Confirm")
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("client_id", garminClientId)
  authUrl.searchParams.set("code_challenge", codeChallenge)
  authUrl.searchParams.set("code_challenge_method", "S256")
  authUrl.searchParams.set("redirect_uri", redirectUri)
  authUrl.searchParams.set("state", stateWithUserId)

  // Stocker temporairement code_verifier et state associés à l'utilisateur
  // On peut utiliser une table Supabase ou des cookies sécurisés
  // Pour l'instant, on les retourne au client qui devra les renvoyer
  // En production, il faudrait les stocker côté serveur de manière sécurisée

  return json({
    authUrl: authUrl.toString(),
    codeVerifier,
    state: stateWithUserId, // Retourner le state complet avec user_id
  })
}
