// Getting to a shift: where from and to, how long it takes, when to leave, and links to open the
// journey in Google Maps, Waze or Apple Maps. Driving times come from the same free routing as the
// journey calculator (no live traffic); public transport times are the person's own.
import { postcodeIn, type Data, type Shift, type TravelMode } from "./model"
import { placeAddress, placeName, shiftTimes } from "./shifts"

export const EARLY_OPTIONS: [string, string][] = [["5", "5 min"], ["10", "10 min"], ["15", "15 min"], ["20", "20 min"]]
export const modeOf = (d: Data, s: Shift): TravelMode => s.travel || d.profile.travelMode || "drive"
export const earlyOf = (d: Data) => d.profile.arriveEarly ?? 10

/** Where the journey starts: this shift's own starting point, or the home postcode. */
export const originOf = (d: Data, s: Shift) => (s.from || "").trim() || (d.profile.homePostcode || "").trim()
/** Where the shift is, as something maps can find: the pharmacy's postcode, else its address, else the place typed. */
export function destinationOf(d: Data, s: Shift) {
  const addr = placeAddress(d, s)
  const name = placeName(d, s)
  const pc = postcodeIn(addr)
  return { query: pc || addr || (s.clientId ? name : s.place || ""), label: name, full: addr ? `${name}, ${addr}` : name }
}
export const tripKey = (from: string, to: string) => `${from.trim().toUpperCase()}→${to.trim().toUpperCase()}`

/** Minutes door to door: what they typed, else the driving estimate when driving. */
export function journeyMins(d: Data, s: Shift): number | null {
  if (s.travelMins && s.travelMins > 0) return s.travelMins
  if (modeOf(d, s) !== "drive") return null
  const from = originOf(d, s), to = destinationOf(d, s).query
  return s.trip && !s.trip.failed && s.trip.key === tripKey(from, to) && s.trip.mins ? s.trip.mins : null
}

/** When to leave to arrive `early` minutes before the start, rounded down to 5 minutes. */
export function leaveBy(s: Shift, mins: number, early: number) {
  const t = new Date(shiftTimes(s).start.getTime() - (mins + early) * 60_000)
  t.setMinutes(Math.floor(t.getMinutes() / 5) * 5, 0, 0)
  return t
}
export const hhmm = (t: Date) => `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`
export const minsText = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ""}`)

/** Directions links. Waze always starts from where the phone is. */
export function mapLinks(d: Data, s: Shift) {
  const from = originOf(d, s), to = destinationOf(d, s), mode = modeOf(d, s)
  const e = encodeURIComponent
  const dest = to.full || to.query
  const google = `https://www.google.com/maps/dir/?api=1${from ? `&origin=${e(from)}` : ""}&destination=${e(dest)}&travelmode=${mode === "transit" ? "transit" : "driving"}`
  const apple = `https://maps.apple.com/?${from ? `saddr=${e(from)}&` : ""}daddr=${e(dest)}&dirflg=${mode === "transit" ? "r" : "d"}`
  const ll = s.trip && s.trip.lat !== undefined && s.trip.lng !== undefined ? `ll=${s.trip.lat},${s.trip.lng}` : `q=${e(dest)}`
  const waze = `https://waze.com/ul?${ll}&navigate=yes`
  return { google, apple, waze: mode === "drive" ? waze : null }
}

/** Upcoming shifts (next 14 days) whose driving estimate is missing or out of date. */
export function tripsToWorkOut(d: Data, now = new Date()) {
  const soon = now.getTime() + 14 * 86_400_000
  return d.shifts.filter((s) => {
    const { start } = shiftTimes(s)
    if (start.getTime() < now.getTime() || start.getTime() > soon) return false
    if (modeOf(d, s) !== "drive" || s.travelMins) return false
    const from = originOf(d, s), to = destinationOf(d, s).query
    return !!from && !!to && s.trip?.key !== tripKey(from, to)
  })
}
