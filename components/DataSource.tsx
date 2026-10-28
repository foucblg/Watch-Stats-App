import type { SleepSource } from "@/lib/types/sleep"

/**
 * Attribution des données selon les Garmin API Brand Guidelines (v6.30.2025) :
 * - chaque donnée issue d'un appareil Garmin porte la mention « Garmin » (le modèle
 *   n'est pas fourni par les résumés de sommeil, d'où « Garmin » seul) ;
 * - les vues qui combinent Garmin et d'autres sources affichent, sous le titre,
 *   une note qui cite Garmin comme source contributrice, sans laisser croire que
 *   Garmin cautionne les autres données.
 * Ne jamais cacher ces mentions dans une infobulle ni sous la ligne de flottaison.
 */

const SOURCE_LABEL: Record<SleepSource, string> = {
  garmin: "Garmin",
  amazfit: "Amazfit",
}

/** Mention de source à placer à côté d'une donnée (score, nuit, phases). */
export function SourceTag({ source }: { source: SleepSource | null | undefined }) {
  if (!source) return null
  return (
    <span className="inline-block rounded border border-gray-300 dark:border-gray-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300 align-middle">
      {SOURCE_LABEL[source]}
    </span>
  )
}

/**
 * Note de source à placer directement sous le titre d'une vue.
 * N'affiche rien si aucune donnée Garmin n'est présente.
 */
export function SourcesNote({
  sources,
  className = "-mt-2 mb-4",
}: {
  sources: Array<SleepSource | null | undefined>
  className?: string
}) {
  const present = new Set(sources.filter((s): s is SleepSource => !!s))
  if (!present.has("garmin")) return null

  const text =
    present.size > 1
      ? "Calculé en partie à partir de données d'appareils Garmin."
      : "Données issues d'appareils Garmin."

  return <p className={`${className} text-xs text-gray-500 dark:text-gray-400`}>{text}</p>
}
