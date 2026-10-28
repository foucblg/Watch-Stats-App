/**
 * Types pour la table public.sleep.
 * Clé primaire : summary_id
 */

/** Origine d'une nuit (colonne générée depuis summary_id). */
export type SleepSource = "garmin" | "amazfit"

/** Ligne sleep telle que retournée par la DB. Clé primaire : summary_id. */
export type Sleep = {
  summary_id: string
  local_user_id: string
  date: string | null
  score: number | null
  start_time: string
  phase_type: string[]
  phase_duration: number[]
  source: SleepSource
  created_at: string | null
  updated_at: string | null
}

/** Sous-ensemble utilisé par les routes leaderboard / scores / yearly-scores. */
export type SleepScoreRow = Pick<Sleep, "local_user_id" | "date" | "score" | "source">

/** Sous-ensemble utilisé par la route sleep-phases. */
export type SleepPhasesRow = Pick<Sleep, "local_user_id" | "date" | "phase_type" | "phase_duration" | "source">
