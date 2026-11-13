'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { SleepSource } from '@/lib/types/sleep'
import { SourceTag, SourcesNote } from '@/components/DataSource'

type MemberScore = {
  user_id: string
  email: string | null
  display_name: string | null
  scores: Array<{
    date: string
    score: number | null
    source: SleepSource | null
  }>
}

type Group = {
  id: string
  name: string
}

type YearlyScore = {
  date: string
  user_id: string
  score: number | null
  source: SleepSource | null
}

type SleepPhase = {
  type: string
  duration: number // en secondes
}

type MemberSleepPhases = {
  user_id: string
  email: string | null
  display_name: string | null
  sleepData: Array<{
    date: string
    phases: SleepPhase[]
    totalDuration: number
    source: SleepSource | null
  }>
}

type SearchUser = {
  id: string
  email: string | null
  display_name: string | null
}

// Phases de sommeil, dans l'ordre d'affichage des barres
const PHASES: Array<{ type: string; label: string; color: string }> = [
  { type: 'deep', label: 'Profond', color: '#1e3a8a' },
  { type: 'light', label: 'Léger', color: '#93c5fd' },
  { type: 'rem', label: 'Paradoxal', color: '#8b5cf6' },
  { type: 'awake', label: 'Éveil', color: '#f97316' },
]

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h${minutes > 0 ? ` ${minutes}min` : ''}`
  }
  return `${minutes}min`
}

function memberName(m: { user_id: string; email: string | null; display_name: string | null }): string {
  return m.display_name || m.email || m.user_id
}

// Les dates (YYYY-MM-DD) sont en UTC, comme dans les routes API
function formatDay(dateStr: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('fr-FR', { ...options, timeZone: 'UTC' })
}

function previousDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().split('T')[0]
}

function PhasesLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-400">
      {PHASES.map(p => (
        <span key={p.type} className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
          {p.label}
        </span>
      ))}
    </div>
  )
}

type NightRow = {
  user_id: string
  name: string
  isMe: boolean
  score: number | null
  source: SleepSource | null
  byType: Record<string, number>
  total: number
}

// Nuit dernière : podium des trois premiers, puis les phases de chaque membre
function LastNightPodium({
  dates,
  members,
  membersPhases,
  currentUserId,
}: {
  dates: string[] // du plus récent au plus ancien
  members: MemberScore[]
  membersPhases: MemberSleepPhases[]
  currentUserId: string | null
}) {
  const hasData = (date: string) =>
    members.some(m => m.scores.some(s => s.date === date && s.score !== null)) ||
    membersPhases.some(m => m.sleepData.some(d => d.date === date && d.phases.length > 0))

  // Par défaut : la nuit la plus récente qui contient des données
  const [index, setIndex] = useState(() => Math.max(0, dates.findIndex(hasData)))
  const date = dates[index]

  const rows: NightRow[] = members.map(member => {
    const scoreData = member.scores.find(s => s.date === date)
    const night = membersPhases.find(m => m.user_id === member.user_id)?.sleepData.find(d => d.date === date)
    const byType: Record<string, number> = {}
    let total = 0
    for (const phase of night?.phases ?? []) {
      const type = phase.type.toLowerCase()
      byType[type] = (byType[type] ?? 0) + phase.duration
      total += phase.duration
    }
    return {
      user_id: member.user_id,
      name: memberName(member),
      isMe: member.user_id === currentUserId,
      score: scoreData?.score ?? null,
      source: scoreData?.source ?? night?.source ?? null,
      byType,
      total,
    }
  })

  // Les membres avec un score d'abord (du meilleur au moins bon), puis ceux qui n'ont que des phases
  rows.sort((a, b) => {
    if (a.score !== null && b.score !== null) return b.score - a.score
    if (a.score !== null) return -1
    if (b.score !== null) return 1
    return b.total - a.total
  })

  const ranked = rows.filter(r => r.score !== null)
  const maxTotal = Math.max(0, ...rows.map(r => r.total))

  // Podium : 2e à gauche, 1er au centre, 3e à droite
  const podium = [
    { row: ranked[1], place: '2e', height: 'h-20', color: 'bg-indigo-100 text-indigo-950 dark:bg-indigo-900/60 dark:text-indigo-50' },
    { row: ranked[0], place: '1er', height: 'h-28', color: 'bg-indigo-700 text-white' },
    { row: ranked[2], place: '3e', height: 'h-14', color: 'bg-indigo-50 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-50' },
  ].filter(p => p.row)

  return (
    <div className="border rounded-lg p-6 bg-white dark:bg-gray-900">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-bold">Nuit dernière</h2>
          <SourcesNote className="mt-1" sources={rows.map(r => r.source)} />
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Nuit du {formatDay(previousDay(date), { weekday: 'short', day: 'numeric' })} au{' '}
            {formatDay(date, { weekday: 'short', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIndex(i => i + 1)}
            disabled={index >= dates.length - 1}
            aria-label="Nuit précédente"
            className="w-10 h-10 rounded-lg border inline-flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={() => setIndex(i => i - 1)}
            disabled={index <= 0}
            aria-label="Nuit suivante"
            className="w-10 h-10 rounded-lg border inline-flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {ranked.length === 0 && maxTotal === 0 ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
          Aucune donnée pour cette nuit.
        </div>
      ) : (
        <>
          {podium.length > 0 && (
            <div className="flex items-end justify-center gap-3 max-w-md mx-auto mb-6">
              {podium.map(({ row, place, height, color }) => (
                <div key={row.user_id} className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-100 flex items-center justify-center text-lg font-bold">
                    {row.name.charAt(0).toUpperCase()}
                  </div>
                  <div className={`text-sm truncate max-w-full ${row.isMe ? 'font-bold' : 'font-semibold'}`}>
                    {row.name}
                  </div>
                  <SourceTag source={row.source} />
                  <div className={`w-full ${height} ${color} rounded-t-lg flex flex-col items-center pt-2`}>
                    <div className="text-2xl font-bold leading-none">{row.score}</div>
                    <div className="text-xs font-semibold mt-1">{place}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="divide-y dark:divide-gray-800">
            {rows.map(row => {
              const rank = ranked.indexOf(row)
              const asleep = row.total - (row.byType.awake ?? 0)
              return (
                <div key={row.user_id} className="py-3">
                  <div className="flex items-baseline gap-3">
                    <span className="w-5 text-sm font-bold text-gray-500 dark:text-gray-400">
                      {rank >= 0 ? rank + 1 : ''}
                    </span>
                    <span className={`flex-1 min-w-0 truncate ${row.isMe ? 'font-bold' : 'font-medium'}`}>
                      {row.name}
                      {row.isMe && <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">(toi)</span>}
                    </span>
                    {row.total > 0 && (
                      <span className="text-sm text-gray-600 dark:text-gray-400">{formatDuration(asleep)}</span>
                    )}
                    <span className="w-8 text-right font-bold">{row.score ?? '—'}</span>
                  </div>
                  {row.total > 0 ? (
                    <div className="ml-8 mt-1.5">
                      <div
                        className="flex h-2.5 rounded-full overflow-hidden"
                        style={{ width: `${(row.total / maxTotal) * 100}%` }}
                      >
                        {PHASES.map(p =>
                          row.byType[p.type] ? (
                            <div
                              key={p.type}
                              style={{ width: `${(row.byType[p.type] / row.total) * 100}%`, backgroundColor: p.color }}
                              title={`${p.label} : ${formatDuration(row.byType[p.type])}`}
                            />
                          ) : null
                        )}
                      </div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {PHASES.filter(p => p.type !== 'light' && row.byType[p.type])
                          .map(p => `${p.label} ${formatDuration(row.byType[p.type])}`)
                          .join(' · ')}
                      </div>
                    </div>
                  ) : (
                    <div className="ml-8 mt-1 text-xs text-gray-400 dark:text-gray-500">
                      {row.score !== null ? 'Phases indisponibles' : 'Pas de données cette nuit'}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-3">
            <PhasesLegend />
          </div>
        </>
      )}
    </div>
  )
}

// Classement de la semaine : moyenne, mini-courbe des 7 nuits et écart avec la semaine précédente
function WeekRanking({
  dates,
  members,
  yearlyScores,
  currentUserId,
}: {
  dates: string[] // les 7 derniers jours, du plus récent au plus ancien
  members: MemberScore[]
  yearlyScores: YearlyScore[]
  currentUserId: string | null
}) {
  const [openId, setOpenId] = useState<string | null>(null)

  const chrono = [...dates].reverse()
  const weekStart = chrono[0]
  const previousStart = (() => {
    const d = new Date(`${weekStart}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 7)
    return d.toISOString().split('T')[0]
  })()

  const average = (values: number[]) =>
    values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null

  const rows = members
    .map(member => {
      const nights = chrono.map(date => {
        const s = member.scores.find(sc => sc.date === date)
        return { date, score: s?.score ?? null, source: s?.source ?? null }
      })
      const scored = nights.filter(n => n.score !== null)
      const avg = average(scored.map(n => n.score as number))
      // La semaine précédente vient des scores annuels (chargés à part) : pas d'écart tant qu'ils manquent
      const previous = average(
        yearlyScores
          .filter(s => s.user_id === member.user_id && s.score !== null && s.date >= previousStart && s.date < weekStart)
          .map(s => s.score as number)
      )
      return {
        user_id: member.user_id,
        name: memberName(member),
        isMe: member.user_id === currentUserId,
        nights,
        avg,
        delta: avg !== null && previous !== null ? Math.round(avg) - Math.round(previous) : null,
        source: scored.length > 0 ? scored[scored.length - 1].source : null,
      }
    })
    .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))

  // Même échelle verticale pour toutes les courbes, pour pouvoir les comparer
  const allScores = rows.flatMap(r => r.nights.map(n => n.score)).filter((s): s is number => s !== null)
  const lo = Math.min(...allScores, 100) - 3
  const hi = Math.max(...allScores, 0) + 3
  const W = 104
  const H = 36
  const point = (i: number, score: number) => ({
    x: 4 + (i * (W - 8)) / (chrono.length - 1),
    y: H - 4 - ((score - lo) / Math.max(1, hi - lo)) * (H - 8),
  })

  return (
    <div className="border rounded-lg p-6 bg-white dark:bg-gray-900">
      <h2 className="text-xl font-bold">Classement de la semaine</h2>
      <SourcesNote className="mt-1" sources={rows.flatMap(r => r.nights.map(n => n.source))} />
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 mb-2">
        Du {formatDay(chrono[0], { weekday: 'short', day: 'numeric' })} au{' '}
        {formatDay(chrono[chrono.length - 1], { weekday: 'short', day: 'numeric', month: 'long' })} · moyenne des scores
      </p>

      <div className="divide-y dark:divide-gray-800">
        {rows.map((row, i) => {
          const points = row.nights
            .map((n, k) => (n.score !== null ? point(k, n.score) : null))
            .filter((p): p is { x: number; y: number } => p !== null)
          const last = points[points.length - 1]
          const open = openId === row.user_id
          return (
            <div key={row.user_id}>
              <button
                onClick={() => setOpenId(open ? null : row.user_id)}
                aria-expanded={open}
                className="w-full flex items-center gap-3 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 rounded-lg"
              >
                <span className="w-5 text-sm font-bold text-gray-500 dark:text-gray-400">
                  {row.avg !== null ? i + 1 : ''}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className={`truncate ${row.isMe ? 'font-bold' : 'font-medium'}`}>{row.name}</span>
                    <SourceTag source={row.source} />
                  </span>
                  {row.delta !== null && (
                    <span
                      className={`block text-xs font-semibold mt-0.5 ${
                        row.delta > 0 ? 'text-green-700' : row.delta < 0 ? 'text-red-700' : 'text-gray-500'
                      }`}
                    >
                      {row.delta > 0 ? `↗ +${row.delta}` : row.delta < 0 ? `↘ ${row.delta}` : '→ stable'} vs sem. dernière
                    </span>
                  )}
                </span>
                <svg
                  width={W}
                  height={H}
                  viewBox={`0 0 ${W} ${H}`}
                  role="img"
                  aria-label={`Scores de ${row.name} sur 7 nuits`}
                  className="shrink-0"
                >
                  {points.length > 1 && (
                    <polyline
                      points={points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                      fill="none"
                      stroke={row.isMe ? '#4338ca' : '#9ca3af'}
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  )}
                  {last && <circle cx={last.x} cy={last.y} r="3.5" fill={row.isMe ? '#4338ca' : '#9ca3af'} />}
                </svg>
                <span className="w-12 text-right">
                  <span className="block text-2xl font-bold leading-none">
                    {row.avg !== null ? Math.round(row.avg) : '—'}
                  </span>
                  <span className="block text-[10px] text-gray-500 dark:text-gray-400 mt-1">moy.</span>
                </span>
              </button>

              {open && (
                <div className="grid grid-cols-7 gap-1 pb-3 pl-8">
                  {row.nights.map(n => (
                    <div key={n.date} className="flex flex-col items-center gap-1 rounded-md bg-gray-50 dark:bg-gray-800 py-2">
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">
                        {formatDay(n.date, { weekday: 'short' })}
                      </span>
                      <span className="text-sm font-semibold">{n.score ?? '—'}</span>
                      <SourceTag source={n.source} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Clique sur un membre pour voir ses nuits une par une.</p>
    </div>
  )
}

type WinsPeriod = 'month' | 'quarter' | 'year'

const WINS_PERIODS: Array<{ key: WinsPeriod; label: string }> = [
  { key: 'month', label: 'Ce mois' },
  { key: 'quarter', label: '3 mois' },
  { key: 'year', label: String(new Date().getFullYear()) },
]

// Nuits gagnées : qui a eu le meilleur score, combien de fois, et les séries en cours
function SeasonWins({
  yearlyScores,
  members,
  currentUserId,
}: {
  yearlyScores: YearlyScore[]
  members: MemberScore[]
  currentUserId: string | null
}) {
  const [period, setPeriod] = useState<WinsPeriod>('month')

  const today = new Date().toISOString().split('T')[0]
  const start = (() => {
    if (period === 'month') return `${today.slice(0, 7)}-01`
    if (period === 'year') return `${today.slice(0, 4)}-01-01`
    const d = new Date(`${today}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 90)
    return d.toISOString().split('T')[0]
  })()

  // Scores renseignés jusqu'à aujourd'hui, regroupés par date
  const byDate = new Map<string, YearlyScore[]>()
  for (const s of yearlyScores) {
    if (s.score === null || s.date > today) continue
    if (!byDate.has(s.date)) byDate.set(s.date, [])
    byDate.get(s.date)!.push(s)
  }

  // Une nuit compte quand au moins deux membres ont un score ; les ex æquo gagnent tous
  const contested = Array.from(byDate.entries())
    .filter(([, scores]) => scores.length >= 2)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, scores]) => {
      const best = Math.max(...scores.map(s => s.score as number))
      return { date, best, winners: scores.filter(s => s.score === best).map(s => s.user_id) }
    })

  const inPeriod = contested.filter(n => n.date >= start)
  const periodScores = yearlyScores.filter(s => s.score !== null && s.date >= start && s.date <= today)

  const nameOf = (userId: string) => {
    const m = members.find(m => m.user_id === userId)
    return m ? memberName(m) : userId
  }

  const rows = members
    .map(member => {
      const mine = periodScores.filter(s => s.user_id === member.user_id)
      return {
        user_id: member.user_id,
        name: memberName(member),
        isMe: member.user_id === currentUserId,
        wins: inPeriod.filter(n => n.winners.includes(member.user_id)).length,
        source: mine.length > 0 ? mine.reduce((a, b) => (a.date > b.date ? a : b)).source : null,
      }
    })
    .sort((a, b) => b.wins - a.wins)
  const maxWins = Math.max(0, ...rows.map(r => r.wins))

  // Séries : nuits gagnées d'affilée, en ne comptant que les nuits disputées
  let current: { user_id: string; length: number } | null = null
  let record: { user_id: string; length: number; endDate: string } | null = null
  const running = new Map<string, number>()
  for (const night of contested) {
    for (const userId of Array.from(running.keys())) {
      if (!night.winners.includes(userId)) running.delete(userId)
    }
    for (const userId of night.winners) {
      const length = (running.get(userId) ?? 0) + 1
      running.set(userId, length)
      if (!record || length > record.length) record = { user_id: userId, length, endDate: night.date }
    }
  }
  for (const [userId, length] of Array.from(running)) {
    if (!current || length > current.length) current = { user_id: userId, length }
  }

  // Meilleur score et meilleure moyenne (au moins 3 nuits) sur la période
  const bestNight = periodScores.reduce<YearlyScore | null>(
    (best, s) => (!best || (s.score as number) > (best.score as number) ? s : best),
    null
  )
  const bestAverage = members
    .map(member => {
      const mine = periodScores.filter(s => s.user_id === member.user_id)
      const avg = mine.length >= 3 ? mine.reduce((sum, s) => sum + (s.score as number), 0) / mine.length : null
      return { user_id: member.user_id, avg }
    })
    .filter((m): m is { user_id: string; avg: number } => m.avg !== null)
    .sort((a, b) => b.avg - a.avg)[0]

  return (
    <div className="border rounded-lg p-6 bg-white dark:bg-gray-900">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-bold">Nuits gagnées</h2>
          <SourcesNote className="mt-1" sources={periodScores.map(s => s.source)} />
        </div>
        <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
          {WINS_PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              aria-pressed={period === p.key}
              className={`px-3 py-1.5 rounded-md text-sm ${
                period === p.key
                  ? 'bg-white dark:bg-gray-700 font-semibold shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {inPeriod.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
          Pas encore de nuit à départager sur cette période (il faut au moins deux scores le même jour).
        </div>
      ) : (
        <div className="space-y-3 max-w-2xl">
          {rows.map(row => (
            <div key={row.user_id} className="grid grid-cols-[minmax(0,8rem)_1fr_4rem] items-center gap-3">
              <div className="min-w-0">
                <div className={`truncate text-sm ${row.isMe ? 'font-bold' : 'font-medium'}`}>{row.name}</div>
                <SourceTag source={row.source} />
              </div>
              <div className="h-5 rounded-md bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div
                  className={`h-full rounded-md ${row.isMe ? 'bg-indigo-700' : 'bg-indigo-300 dark:bg-indigo-400'}`}
                  style={{ width: `${maxWins > 0 ? (row.wins / maxWins) * 100 : 0}%` }}
                />
              </div>
              <div className="text-right text-sm text-gray-600 dark:text-gray-400">
                <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{row.wins}</span> / {inPeriod.length}
              </div>
            </div>
          ))}
        </div>
      )}

      {(current && current.length >= 2) || (record && record.length >= 2) ? (
        <div className="mt-5 flex items-center gap-3 rounded-xl bg-orange-50 dark:bg-orange-950/40 p-3 max-w-2xl">
          <div className="w-10 h-10 shrink-0 rounded-full bg-white dark:bg-gray-900 text-orange-700 dark:text-orange-400 flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-6 1-9.5z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            {current && current.length >= 2 && (
              <div className="text-sm font-bold">
                {nameOf(current.user_id)} : {current.length} nuits gagnées d&apos;affilée
              </div>
            )}
            {record && record.length >= 2 && (
              <div className="text-xs text-orange-900 dark:text-orange-200 mt-0.5">
                Record depuis le {formatDay(contested[0].date, { day: 'numeric', month: 'long' })} : {record.length} nuits (
                {nameOf(record.user_id)}, {formatDay(record.endDate, { month: 'long' })})
              </div>
            )}
          </div>
        </div>
      ) : null}

      {bestNight && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
          <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">Meilleur score</div>
            <div className="text-sm font-bold mt-0.5">
              {bestNight.score} · {nameOf(bestNight.user_id)}, {formatDay(bestNight.date, { day: 'numeric', month: 'short' })}
            </div>
          </div>
          {bestAverage && (
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">Meilleure moyenne</div>
              <div className="text-sm font-bold mt-0.5">
                {Math.round(bestAverage.avg)} · {nameOf(bestAverage.user_id)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Modal pour ajouter des membres au groupe
function AddMembersModal(props: {
  open: boolean
  onClose: () => void
  onAdded: () => void
  groupId: string
  existingMemberIds: string[]
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchUser[]>([])
  const [selected, setSelected] = useState<SearchUser[]>([])
  const [friends, setFriends] = useState<SearchUser[]>([])
  const [busy, setBusy] = useState<null | 'search' | 'add' | 'loadFriends'>(null)
  const [message, setMessage] = useState('')
  const [modalError, setModalError] = useState('')

  useEffect(() => {
    if (props.open) {
      setQuery('')
      setResults([])
      setSelected([])
      setBusy(null)
      setMessage('')
      setModalError('')
      loadFriends()
    }
  }, [props.open])

  async function loadFriends() {
    setBusy('loadFriends')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Non connecté.')

      const res = await fetch('/friendships', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || `Erreur API (${res.status})`)

      const friendsList = Array.isArray(body?.friends) ? body.friends : []
      // Filtrer pour exclure les membres déjà dans le groupe
      const existingIds = new Set(props.existingMemberIds)
      const filteredFriends = friendsList
        .filter((f: any) => !existingIds.has(f.id))
        .map((f: any) => ({
          id: f.id,
          email: f.email,
          display_name: f.display_name,
        }))
      setFriends(filteredFriends)
    } catch (e: any) {
      setModalError(e?.message || 'Impossible de charger la liste des amis.')
      setFriends([])
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    if (!props.open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [props.open, props.onClose])

  useEffect(() => {
    if (!props.open) return
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }

    const t = window.setTimeout(async () => {
      setBusy('search')
      setModalError('')
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token) throw new Error('Non connecté.')

        const res = await fetch(`/users/search?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || `Erreur API (${res.status})`)

        const users = Array.isArray(body?.users) ? body.users : []
        // Filtrer pour ne garder que les amis qui ne sont pas déjà dans le groupe
        const friendIds = new Set(friends.map(f => f.id))
        const existingIds = new Set(props.existingMemberIds)
        const filteredUsers = users.filter(
          (u: SearchUser) => friendIds.has(u.id) && !existingIds.has(u.id)
        )
        setResults(filteredUsers)
      } catch (e: any) {
        setModalError(e?.message || 'Impossible de rechercher des utilisateurs.')
        setResults([])
      } finally {
        setBusy(null)
      }
    }, 300)

    return () => window.clearTimeout(t)
  }, [props.open, query, friends, props.existingMemberIds])

  function addUser(u: SearchUser) {
    if (selected.some(s => s.id === u.id)) return
    setSelected(prev => [...prev, u])
  }

  function removeUser(id: string) {
    setSelected(prev => prev.filter(u => u.id !== id))
  }

  async function addMembers() {
    setBusy('add')
    setModalError('')
    setMessage('')
    try {
      if (selected.length === 0) {
        throw new Error('Veuillez sélectionner au moins un membre à ajouter.')
      }

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Non connecté.')

      const res = await fetch(`/groups/${props.groupId}/members`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          member_user_ids: selected.map(u => u.id),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || `Erreur API (${res.status})`)

      setMessage(`${body.added_count || selected.length} membre(s) ajouté(s).`)
      setTimeout(() => {
        props.onAdded()
        props.onClose()
      }, 1000)
    } catch (e: any) {
      setModalError(e?.message || 'Impossible d\'ajouter les membres.')
    } finally {
      setBusy(null)
    }
  }

  if (!props.open) return null

  const canAdd = selected.length > 0 && busy === null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/40" aria-label="Fermer" onClick={props.onClose} />

      <div className="relative w-full max-w-2xl mx-4 rounded-2xl bg-white dark:bg-gray-900 border dark:border-gray-800 shadow-xl p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="text-lg font-semibold">Ajouter des membres</div>
            <div className="text-sm text-gray-600 dark:text-gray-300">
              Sélectionnez des amis à ajouter au groupe.
            </div>
          </div>
          <button onClick={props.onClose} className="px-3 py-2 rounded border hover:bg-gray-50 dark:hover:bg-gray-800">
            Fermer
          </button>
        </div>

        {modalError && (
          <div className="mb-4 border border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200 p-3 rounded">
            {modalError}
          </div>
        )}
        {message && (
          <div className="mb-4 border border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200 p-3 rounded">
            {message}
          </div>
        )}

        <div className="grid gap-4">
          <div className="border rounded-xl p-4">
            <div className="font-semibold mb-2">Rechercher des amis</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Vous ne pouvez ajouter que vos amis dans un groupe.
            </div>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher par email ou display name…"
              className="w-full px-3 py-2 rounded border bg-white dark:bg-gray-800 mb-3"
              disabled={busy !== null}
            />

            {busy === 'search' || busy === 'loadFriends' ? (
              <div className="text-sm text-gray-600 dark:text-gray-300">Recherche…</div>
            ) : results.length === 0 ? (
              <div className="text-sm text-gray-600 dark:text-gray-300">
                {query.trim().length >= 2
                  ? 'Aucun ami trouvé correspondant à votre recherche.'
                  : 'Tapez au moins 2 caractères pour rechercher parmi vos amis.'}
              </div>
            ) : (
              <div className="grid gap-2">
                {results.map(u => {
                  const already = selected.some(s => s.id === u.id)
                  return (
                    <div key={u.id} className="flex items-center justify-between gap-3 border rounded-lg p-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{u.display_name || u.email || u.id}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {u.email || '—'} {u.display_name ? `· ${u.display_name}` : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => addUser(u)}
                        className="px-3 py-2 rounded border hover:bg-gray-50 dark:hover:bg-gray-800"
                        disabled={busy !== null || already}
                      >
                        {already ? 'Ajouté' : 'Ajouter'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="border rounded-xl p-4">
            <div className="font-semibold mb-2">Membres sélectionnés</div>
            {selected.length === 0 ? (
              <div className="text-sm text-gray-600 dark:text-gray-300">Aucun membre sélectionné.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selected.map(u => (
                  <button
                    key={u.id}
                    onClick={() => removeUser(u.id)}
                    className="text-sm px-3 py-2 rounded-full border hover:bg-gray-50 dark:hover:bg-gray-800"
                    disabled={busy !== null}
                    title="Retirer"
                  >
                    {u.display_name || u.email || u.id} ×
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={props.onClose}
              className="px-3 py-2 rounded border hover:bg-gray-50 dark:hover:bg-gray-800"
              disabled={busy !== null}
            >
              Annuler
            </button>
            <button
              onClick={addMembers}
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400"
              disabled={!canAdd}
            >
              Ajouter les membres
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function GroupScoresPage() {
  const router = useRouter()
  const params = useParams()
  const groupId = params?.groupId as string

  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<MemberScore[]>([])
  const [yearlyScores, setYearlyScores] = useState<YearlyScore[]>([])
  const [membersPhases, setMembersPhases] = useState<MemberSleepPhases[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingYearly, setLoadingYearly] = useState(true)
  const [loadingPhases, setLoadingPhases] = useState(true)
  const [error, setError] = useState('')
  const [addMembersModalOpen, setAddMembersModalOpen] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    if (!groupId) {
      router.replace('/')
      return
    }

    let cancelled = false

    async function loadData() {
      setLoading(true)
      setError('')

      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const session = sessionData.session
        const token = session?.access_token

        if (!token) {
          router.replace('/login')
          return
        }
        setCurrentUserId(session.user.id)

        // Les quatre appels sont indépendants : on les lance en parallèle.
        // L'annuel et les phases sont facultatifs et s'affichent dès qu'ils arrivent.
        const headers = { Authorization: `Bearer ${token}` }
        const yearlyLoad = fetch(`/groups/${groupId}/yearly-scores`, { headers })
          .then(async res => {
            const yearlyBody = await res.json().catch(() => ({}))
            if (res.ok && !cancelled) {
              setYearlyScores(Array.isArray(yearlyBody?.scores) ? yearlyBody.scores : [])
            }
          })
          .catch(() => {})
          .finally(() => { if (!cancelled) setLoadingYearly(false) })
        const phasesLoad = fetch(`/groups/${groupId}/sleep-phases`, { headers })
          .then(async res => {
            const phasesBody = await res.json().catch(() => ({}))
            if (res.ok && !cancelled) {
              setMembersPhases(Array.isArray(phasesBody?.members) ? phasesBody.members : [])
            }
          })
          .catch(() => {})
          .finally(() => { if (!cancelled) setLoadingPhases(false) })

        const [groupsRes, scoresRes] = await Promise.all([
          fetch('/groups', { headers }),
          fetch(`/groups/${groupId}/scores`, { headers }),
        ])

        const groupsBody = await groupsRes.json().catch(() => ({}))
        if (!groupsRes.ok) {
          throw new Error(groupsBody?.error || `Erreur API (${groupsRes.status})`)
        }

        const groups = Array.isArray(groupsBody?.groups) ? groupsBody.groups : []
        const foundGroup = groups.find((g: Group) => g.id === groupId)

        if (!foundGroup) {
          throw new Error('Groupe introuvable ou accès non autorisé.')
        }

        if (!cancelled) {
          setGroup(foundGroup)
        }

        const scoresBody = await scoresRes.json().catch(() => ({}))
        if (!scoresRes.ok) {
          throw new Error(scoresBody?.error || `Erreur API (${scoresRes.status})`)
        }

        if (!cancelled) {
          setMembers(Array.isArray(scoresBody?.members) ? scoresBody.members : [])
          setLoading(false)
        }

        await Promise.all([yearlyLoad, phasesLoad])
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Impossible de charger les données.')
          setMembers([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setLoadingYearly(false)
          setLoadingPhases(false)
        }
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [groupId, router])

  // Générer les dates des 7 derniers jours (du plus récent au plus ancien)
  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    dates.push(date.toISOString().split('T')[0])
  }
  dates.sort((a, b) => b.localeCompare(a))

  return (
    <main className="p-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <button
            onClick={() => router.push('/')}
            className="mb-2 px-3 py-2 rounded border hover:bg-gray-50 dark:hover:bg-gray-800 inline-flex items-center gap-2 text-sm"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M19 12H5M12 19l-7-7 7-7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Retour
          </button>
          <h1 className="text-2xl font-bold">
            {group ? `Scores du groupe : ${group.name}` : 'Chargement...'}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Scores de sommeil des 7 derniers jours
          </p>
        </div>
        {!loading && group && (
          <button
            onClick={() => setAddMembersModalOpen(true)}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-2 text-sm"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Ajouter des membres
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 border border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200 p-3 rounded">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-gray-600 dark:text-gray-300">Chargement des scores…</div>
      ) : members.length === 0 ? (
        <div className="text-gray-600 dark:text-gray-300">Aucun membre dans ce groupe.</div>
      ) : (
        <div className="space-y-6">
          {/* Widget de la nuit dernière (podium et phases) */}
          {!loadingPhases && (
            <LastNightPodium
              dates={dates}
              members={members}
              membersPhases={membersPhases}
              currentUserId={currentUserId}
            />
          )}

          {/* Widget du classement de la semaine */}
          <WeekRanking dates={dates} members={members} yearlyScores={yearlyScores} currentUserId={currentUserId} />

          {/* Widget des nuits gagnées */}
          {!loadingYearly && members.length >= 2 && yearlyScores.length > 0 && (
            <SeasonWins yearlyScores={yearlyScores} members={members} currentUserId={currentUserId} />
          )}
        </div>
      )}

      <AddMembersModal
        open={addMembersModalOpen}
        onClose={() => setAddMembersModalOpen(false)}
        onAdded={() => {
          // Recharger les données du groupe
          const loadData = async () => {
            try {
              const { data: sessionData } = await supabase.auth.getSession()
              const token = sessionData.session?.access_token
              if (!token) return

              const scoresRes = await fetch(`/groups/${groupId}/scores`, {
                headers: { Authorization: `Bearer ${token}` },
              })
              const scoresBody = await scoresRes.json().catch(() => ({}))
              if (scoresRes.ok) {
                setMembers(Array.isArray(scoresBody?.members) ? scoresBody.members : [])
              }
            } catch (e) {
              console.error('Erreur lors du rechargement:', e)
            }
          }
          loadData()
        }}
        groupId={groupId}
        existingMemberIds={members.map(m => m.user_id)}
      />
    </main>
  )
}
