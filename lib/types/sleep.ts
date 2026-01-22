/**
 * Types pour la table public.sleep.
 * Clé primaire : summary_id
 */

/** Ligne sleep telle que retournée par la DB. Clé primaire : summary_id. */
export type Sleep = {
  summary_id: string
  local_user_id: string
  date: string
  score: number | null
  total_sleep?: number
  deep_sleep?: number
  rem_sleep?: number
  phase_type?: string[]
  phase_duration?: number[]
}

/** Sous-ensemble utilisé par les routes scores / yearly-scores. */
export type SleepScoreRow = Pick<Sleep, "local_user_id" | "date" | "score">

/** Sous-ensemble utilisé par la route sleep-phases. */
export type SleepPhasesRow = Pick<Sleep, "local_user_id" | "date" | "phase_type" | "phase_duration">
