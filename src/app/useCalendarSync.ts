// Keeps Google Calendar in step with booked shifts from anywhere in the app, not just the Shifts page.
// Google's permission lasts about an hour and only for this visit, so when it has run out, changes wait
// in a queue until the person presses Update (which asks Google again).
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { plural, type Data } from "@/lib/model"
import { deleteShiftEvent, GOOGLE_HELP, GoogleError, hasToken, putShiftEvent, type GoogleArea } from "@/lib/google"
import { eventText, needsSync, shiftKey, shiftTimes } from "@/lib/shifts"
import type { AppApi } from "./ctx"

export type CalendarSync = {
  /** Shift changes not yet in Google Calendar (new, edited or deleted). */
  waiting: number
  syncing: boolean
  /** Send waiting changes; `interactive` (from a click) asks Google for permission if needed and always reports back. */
  sync: (interactive: boolean) => Promise<void>
  /** Whether changes go over by themselves right now (sync on and Google permission still valid). */
  live: boolean
}

const recent = (end: Date) => end.getTime() > Date.now() - 30 * 86400000

export function useCalendarSync(data: Data | null, commit: AppApi["commit"], connect: (a: GoogleArea) => Promise<boolean>, email: string, googleState: unknown): CalendarSync {
  const [syncing, setSyncing] = useState(false)
  const running = useRef(false)
  const waiting = data ? data.shifts.filter((s) => recent(shiftTimes(s).end) && needsSync(data, s)).length + data.shiftCal.deletes.length : 0
  const on = !!data?.shiftCal.sync

  const sync = useCallback(async (interactive: boolean) => {
    if (!data || running.current) return
    if (!hasToken("calendar")) {
      if (!interactive) return
      if (!(await connect("calendar"))) return
    }
    running.current = true
    setSyncing(true)
    const done: Record<string, { id: string; key: string }> = {}
    const deleted: string[] = []
    let failed = 0
    try {
      for (const id of data.shiftCal.deletes) {
        try { await deleteShiftEvent(id, email); deleted.push(id) } catch { failed++ }
      }
      for (const s of data.shifts.filter((x) => recent(shiftTimes(x).end) && needsSync(data, x))) {
        const { start, end } = shiftTimes(s)
        try { done[s.id] = { id: await putShiftEvent({ shiftId: s.id, ...eventText(data, s), start, end }, s.gcalId, email), key: shiftKey(data, s) } }
        catch (e) { failed++; if (e instanceof GoogleError && e.kind !== "failed") throw e }
      }
      if (Object.keys(done).length || deleted.length) {
        commit((d) => {
          for (const s of d.shifts) if (done[s.id]) { s.gcalId = done[s.id].id; s.gcalSent = done[s.id].key }
          d.shiftCal.deletes = d.shiftCal.deletes.filter((id) => !deleted.includes(id))
        })
      }
      const n = Object.keys(done).length + deleted.length
      if (failed) toast.error(`${plural(failed, "shift")} couldn’t be updated in Google Calendar. Try again later.`)
      else if (interactive) toast.success(n ? `Google Calendar is up to date (${plural(n, "change")}) ✓` : "Google Calendar is already up to date ✓")
      else if (n) toast(`Google Calendar updated (${plural(n, "change")}) ✓`)
    } catch (e) {
      if (interactive || !(e instanceof GoogleError && e.kind === "cancelled"))
        toast.error(e instanceof GoogleError ? GOOGLE_HELP[e.kind] : "Couldn’t reach Google Calendar.")
    } finally {
      running.current = false
      setSyncing(false)
    }
  }, [data, connect, commit, email])

  // While turned on and Google's permission is still valid, send changes a moment after they're made, from any page
  useEffect(() => {
    if (!on || !waiting || !hasToken("calendar")) return
    const t = setTimeout(() => sync(false), 800)
    return () => clearTimeout(t)
  }, [on, waiting, sync, googleState])

  return { waiting, syncing, sync, live: on && hasToken("calendar") }
}
