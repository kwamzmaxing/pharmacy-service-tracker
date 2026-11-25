// Works out driving times for shifts in the next 14 days, one at a time, and saves them on each shift
// so they're only looked up again when the start or end point changes. Uses the free services the
// journey calculator uses (postcodes.io, OpenStreetMap Nominatim, OSRM); nothing here has live traffic.
import { useEffect, useRef } from "react"
import { drivingRoute, findPlace } from "@/lib/geo"
import type { Data, Place, Trip } from "@/lib/model"
import { destinationOf, originOf, tripKey, tripsToWorkOut } from "@/lib/trip"
import type { AppApi } from "./ctx"

const places = new Map<string, Promise<Place>>()
const find = (q: string) => {
  const k = q.trim().toUpperCase()
  if (!places.has(k)) places.set(k, findPlace(q).catch((e) => { places.delete(k); throw e }))
  return places.get(k)!
}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function useTrips(data: Data | null, commit: AppApi["commit"]) {
  const busy = useRef(false)
  const latest = useRef(data)
  latest.current = data
  const waiting = data ? tripsToWorkOut(data).length : 0
  useEffect(() => {
    if (!waiting || busy.current || !navigator.onLine) return
    busy.current = true
    const tried = new Set<string>()
    ;(async () => {
      // Keep going until nothing is left, reading the latest data each time (saving a trip changes it)
      for (;;) {
        const d = latest.current
        if (!d) break
        const s = tripsToWorkOut(d).find((x) => !tried.has(x.id + tripKey(originOf(d, x), destinationOf(d, x).query)))
        if (!s) break
        const from = originOf(d, s), to = destinationOf(d, s).query, key = tripKey(from, to)
        tried.add(s.id + key)
        let trip: Trip
        try {
          const [a, b] = await Promise.all([find(from), find(to)])
          const r = await drivingRoute(a, b)
          trip = { key, mins: r.approximate ? undefined : r.minutes, miles: r.miles, approximate: r.approximate, lat: b.lat, lng: b.lng, failed: r.approximate || !r.minutes }
        } catch {
          trip = { key, failed: true }
        }
        commit((x) => { const y = x.shifts.find((z) => z.id === s.id); if (y) y.trip = trip })
        await pause(1100) // OpenStreetMap's place search asks for no more than one request a second
      }
    })().finally(() => { busy.current = false })
  }, [waiting, commit])
}
