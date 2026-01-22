"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { Sleep } from "@/lib/types/sleep"

export default function Home() {
  const [sleep, setSleep] = useState<Sleep[]>([])

  useEffect(() => {
    supabase
      .from("sleep")
      .select("*")
      .order("date", { ascending: false })
      .limit(7)
      .then(({ data }) => setSleep(data ?? []))
  }, [])

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">🛌 Sleep stats</h1>

      {sleep.map((s) => (
        <div key={s.summary_id} className="border p-3 mb-2 rounded">
          <div>Date: {s.date}</div>
          <div>Total: {Math.round(s.total_sleep / 3600)} h</div>
          <div>Deep: {Math.round(s.deep_sleep / 60)} min</div>
          <div>REM: {Math.round(s.rem_sleep / 60)} min</div>
        </div>
      ))}
    </main>
  )
}