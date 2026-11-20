// Booked shifts: times, pay, and calendar links and files. Pure helpers, no network.
import { addDays, money, parseISO, today, uid, type Data, type Entry, type Shift } from "./model"

const toMin = (hhmm: string) => {
  const [h, m] = (hhmm || "0:0").split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}
/** Minutes from start to end; an end at or before the start means the shift runs past midnight. */
export function spanMins(s: Pick<Shift, "start" | "end">) {
  const a = toMin(s.start), b = toMin(s.end)
  return b > a ? b - a : b + 24 * 60 - a
}
/** Paid hours (the unpaid break taken off). */
export const shiftHours = (s: Pick<Shift, "start" | "end" | "breakMins">) =>
  Math.max(0, spanMins(s) - Math.max(0, Number(s.breakMins) || 0)) / 60
/** What the shift should pay. */
export const shiftPay = (s: Pick<Shift, "start" | "end" | "breakMins" | "pay" | "rate">) =>
  s.pay === "fixed" ? Math.max(0, Number(s.rate) || 0) : Math.round(shiftHours(s) * Math.max(0, Number(s.rate) || 0) * 100) / 100
export const overnight = (s: Pick<Shift, "start" | "end">) => toMin(s.end) <= toMin(s.start)
export const endDate = (s: Pick<Shift, "date" | "start" | "end">) => (overnight(s) ? addDays(s.date, 1) : s.date)

/** Local start and end as Date objects (the browser's own time zone). */
export function shiftTimes(s: Pick<Shift, "date" | "start" | "end">) {
  const start = new Date(`${s.date}T${s.start || "00:00"}:00`)
  const end = new Date(`${endDate(s)}T${s.end || "00:00"}:00`)
  return { start, end }
}
export const placeName = (d: Data, s: Pick<Shift, "clientId" | "place">) =>
  (s.clientId && d.clients.find((c) => c.id === s.clientId)?.name) || s.place?.trim() || "Shift"
export const placeAddress = (d: Data, s: Pick<Shift, "clientId">) =>
  (s.clientId && d.clients.find((c) => c.id === s.clientId)?.address?.replace(/\s*\n\s*/g, ", ")) || ""
export const timeText = (s: Pick<Shift, "start" | "end">) => `${s.start}–${s.end}${overnight(s) ? " (next day)" : ""}`
export const hoursText = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(2).replace(/0$/, "")} ${h === 1 ? "hr" : "hrs"}`
export const payText = (s: Shift) => (s.pay === "fixed" ? `${money(s.rate)} for the shift` : `${money(s.rate)}/hr`)

/* ---------- lists and totals ---------- */
const byTime = (a: Shift, b: Shift) => (a.date + a.start).localeCompare(b.date + b.start)
/** Shifts that haven't finished yet, soonest first. */
export function upcoming(d: Data, now = new Date()) {
  return d.shifts.filter((s) => shiftTimes(s).end > now).sort(byTime)
}
/** Finished shifts that haven't been added to the log yet. */
export function toLog(d: Data, now = new Date()) {
  return d.shifts.filter((s) => !s.entryId && shiftTimes(s).end <= now).sort(byTime)
}
export const onDay = (d: Data, date: string) => d.shifts.filter((s) => s.date === date).sort(byTime)
/** Monday of the week containing a date. */
export function weekStart(date: string) {
  const d = parseISO(date)
  return addDays(date, -((d.getDay() + 6) % 7))
}
export function totals(d: Data, from: string, to: string) {
  const list = d.shifts.filter((s) => s.date >= from && s.date <= to)
  return { count: list.length, hours: list.reduce((a, s) => a + shiftHours(s), 0), pay: list.reduce((a, s) => a + shiftPay(s), 0) }
}
/** Other shifts on the same day whose times overlap this one. */
export function clashes(d: Data, s: Pick<Shift, "id" | "date" | "start" | "end">) {
  const a = shiftTimes(s)
  return d.shifts.filter((o) => {
    if (o.id === s.id) return false
    if (o.date < addDays(s.date, -1) || o.date > addDays(s.date, 1)) return false
    const b = shiftTimes(o)
    return a.start < b.end && b.start < a.end
  })
}
/** Has the shift changed since it was last sent to Google Calendar? */
export const shiftKey = (d: Data, s: Shift) => JSON.stringify([s.date, s.start, s.end, s.breakMins, s.pay, s.rate, placeName(d, s), placeAddress(d, s), s.notes])
export const needsSync = (d: Data, s: Shift) => !s.gcalId || s.gcalSent !== shiftKey(d, s)

/* ---------- calendar text, links and files ---------- */
export function eventText(d: Data, s: Shift) {
  const where = placeName(d, s)
  const title = `Shift: ${where}`
  const details = [
    `${timeText(s)} · ${hoursText(shiftHours(s))} paid${s.breakMins ? ` (${s.breakMins} min unpaid break)` : ""}`,
    `Pay: ${payText(s)} · about ${money(shiftPay(s))}`,
    s.notes?.trim(),
    "Added from KASA.Rx",
  ].filter(Boolean).join("\n")
  return { title, details, location: placeAddress(d, s) || (s.clientId ? where : s.place || "") }
}
const utcStamp = (t: Date) => t.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
/** Opens Google Calendar with the shift filled in (no connection needed). */
export function googleLink(d: Data, s: Shift) {
  const { start, end } = shiftTimes(s)
  const e = eventText(d, s)
  const q = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${utcStamp(start)}/${utcStamp(end)}`, details: e.details, location: e.location })
  return "https://calendar.google.com/calendar/render?" + q.toString()
}
/** iCalendar text needs commas, semicolons, backslashes and line breaks escaped, and long lines folded. */
const icsText = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")
function fold(line: string) {
  const out: string[] = []
  const bytes = new TextEncoder()
  let cur = ""
  for (const ch of line) {
    if (bytes.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ch }
    else cur += ch
  }
  out.push(cur)
  return out.join("\r\n ")
}
/** A calendar file (.ics) any calendar app can import, such as Apple Calendar. */
export function icsFile(d: Data, list: Shift[]) {
  const now = utcStamp(new Date())
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//KASA//KASA.Rx shifts//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:KASA.Rx shifts"]
  for (const s of list) {
    const { start, end } = shiftTimes(s)
    const e = eventText(d, s)
    lines.push(
      "BEGIN:VEVENT",
      `UID:${s.id}@kasa-rx`,
      `DTSTAMP:${now}`,
      `DTSTART:${utcStamp(start)}`,
      `DTEND:${utcStamp(end)}`,
      `SUMMARY:${icsText(e.title)}`,
      `DESCRIPTION:${icsText(e.details)}`,
      ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
      "END:VEVENT",
    )
  }
  lines.push("END:VCALENDAR")
  return lines.map(fold).join("\r\n") + "\r\n"
}

/* ---------- month grid ---------- */
/** The weeks (Monday first) covering a month, as YYYY-MM-DD strings. */
export function monthGrid(ym: string) {
  const first = `${ym}-01`
  const start = weekStart(first)
  const [y, m] = ym.split("-").map(Number)
  const last = new Date(y, m, 0).getDate()
  const weeks: string[][] = []
  let day = start
  while (weeks.length < 6) {
    const week = Array.from({ length: 7 }, (_, i) => addDays(day, i))
    weeks.push(week)
    day = addDays(day, 7)
    if (day > `${ym}-${String(last).padStart(2, "0")}`) break
  }
  return weeks
}
export const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
export const thisMonth = () => today().slice(0, 7)

/* ---------- into the log ---------- */
/** Turn a finished shift into a log entry (hours at the rate, or a fixed amount), ready to invoice. */
export function logShift(d: Data, shiftId: string) {
  const s = d.shifts.find((x) => x.id === shiftId)
  if (!s || s.entryId) return
  const where = placeName(d, s)
  const desc = `Shift ${timeText(s)}${s.clientId ? "" : ` at ${where}`}`.slice(0, 120)
  let entry: Entry
  if (s.pay === "hourly") {
    let svc = d.services.find((x) => /hour/i.test(x.name))
    if (!svc) d.services.push((svc = { id: uid(), name: "Hours Worked", fee: s.rate, unit: "hour" }))
    // The Log's hours form keeps one "hours" entry per day: only claim it if the day is free
    const dayTaken = d.entries.some((e) => e.hours && e.date === s.date)
    entry = { id: uid(), serviceId: svc.id, date: s.date, qty: Math.round(shiftHours(s) * 100) / 100, fee: s.rate, desc, invoiced: false, ...(dayTaken ? {} : { hours: true }), ...(s.clientId ? { clientId: s.clientId } : {}) }
  } else {
    let svc = d.services.find((x) => /shift|day rate/i.test(x.name) && (x.unit ?? "each") === "each")
    if (!svc) d.services.push((svc = { id: uid(), name: "Shift (fixed pay)", fee: s.rate, unit: "each" }))
    entry = { id: uid(), serviceId: svc.id, date: s.date, qty: 1, fee: s.rate, desc, invoiced: false, ...(s.clientId ? { clientId: s.clientId } : {}) }
  }
  d.entries.push(entry)
  s.entryId = entry.id
}

