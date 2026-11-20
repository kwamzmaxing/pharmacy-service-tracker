// Each person's own Google account: Gmail (send), Calendar (events), and for the
// admin, Google Sheets. Uses Google Identity Services in the browser; the access
// token stays in this tab and lasts about an hour.
import { emulator, googleClientId } from "@/config"

export const SCOPES = {
  gmail: "https://www.googleapis.com/auth/gmail.send",
  calendar: "https://www.googleapis.com/auth/calendar.events",
  sheets: "https://www.googleapis.com/auth/drive.file",
} as const
export type GoogleArea = keyof typeof SCOPES
export type ConnStatus = "unavailable" | "not_connected" | "ready"

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google?: any
  }
}

let scriptPromise: Promise<void> | null = null
function loadScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  scriptPromise ??= new Promise<void>((res, rej) => {
    const s = document.createElement("script")
    s.src = "https://accounts.google.com/gsi/client"
    s.async = true
    s.onload = () => res()
    s.onerror = () => { scriptPromise = null; rej(new Error("Google sign-in couldn’t load")) }
    document.head.appendChild(s)
  })
  return scriptPromise
}

type Token = { token: string; exp: number; scopes: string[] }
const KEY = "pst_google_token"
const CONNECTED = "pst_google_connected"
const readToken = (): Token | null => {
  try {
    const t = JSON.parse(sessionStorage.getItem(KEY) || "null") as Token | null
    return t && t.exp > Date.now() + 60_000 ? t : null
  } catch {
    return null
  }
}
const connectedAreas = (): GoogleArea[] => {
  try {
    return JSON.parse(localStorage.getItem(CONNECTED) || "[]")
  } catch {
    return []
  }
}
const setConnected = (areas: GoogleArea[]) => {
  try { localStorage.setItem(CONNECTED, JSON.stringify([...new Set(areas)])) } catch { /* ignore */ }
}

export const googleAvailable = () => emulator || !!googleClientId
/** A token for `area` from earlier in this visit, without asking Google again. */
export const hasToken = (area: GoogleArea) => !!readToken()?.scopes.includes(SCOPES[area])
/** Whether this person has connected an area on this device (the token itself may need refreshing). */
export const status = (area: GoogleArea): ConnStatus => (!googleAvailable() ? "unavailable" : connectedAreas().includes(area) ? "ready" : "not_connected")
export function disconnect() {
  try {
    const t = readToken()
    if (t && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(t.token, () => {})
    sessionStorage.removeItem(KEY)
    localStorage.removeItem(CONNECTED)
  } catch { /* ignore */ }
}

export class GoogleError extends Error {
  kind: "cancelled" | "unavailable" | "denied" | "failed"
  constructor(kind: GoogleError["kind"], message?: string) {
    super(message || kind)
    this.kind = kind
  }
}

/**
 * Get an access token covering `area`. Call from a click: Google may show a pop-up.
 * The first time, the person picks their Google account and agrees; later it's usually instant.
 */
export async function token(area: GoogleArea, hint?: string): Promise<string> {
  const have = readToken()
  if (have?.scopes.includes(SCOPES[area])) return have.token
  if (!googleAvailable()) throw new GoogleError("unavailable")
  await loadScript().catch(() => { throw new GoogleError("unavailable", "Google sign-in couldn’t load. Check your connection.") })
  const scopes = [...new Set([...(have?.scopes || []), ...connectedAreas().map((a) => SCOPES[a]), SCOPES[area]])]
  return new Promise<string>((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId || "emulator",
      scope: scopes.join(" "),
      include_granted_scopes: true,
      login_hint: hint,
      callback: (r: any) => {
        if (r.error) return reject(new GoogleError(r.error === "access_denied" ? "denied" : "failed", r.error_description || r.error))
        const granted: string[] = (r.scope || "").split(" ")
        if (!granted.includes(SCOPES[area])) return reject(new GoogleError("denied", "Access wasn’t allowed. Tick the box for it on Google’s screen."))
        try { sessionStorage.setItem(KEY, JSON.stringify({ token: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000, scopes: granted })) } catch { /* ignore */ }
        setConnected([...connectedAreas(), ...(Object.keys(SCOPES) as GoogleArea[]).filter((a) => granted.includes(SCOPES[a]))])
        resolve(r.access_token)
      },
      error_callback: (e: any) => reject(new GoogleError(e?.type === "popup_closed" ? "cancelled" : "failed", e?.message)),
    })
    client.requestAccessToken({ prompt: "" })
  })
}

async function api(area: GoogleArea, url: string, init: RequestInit & { json?: unknown }, hint?: string) {
  const t = await token(area, hint)
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${t}`, ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  })
  if (res.status === 401) {
    try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
    throw new GoogleError("failed", "Google asked to sign in again. Try once more.")
  }
  if (!res.ok) {
    let msg = res.statusText
    try { msg = (await res.json())?.error?.message || msg } catch { /* ignore */ }
    throw new GoogleError("failed", msg)
  }
  return res.status === 204 ? null : res.json()
}

/* ---------- Gmail ---------- */
export type Attachment = { filename: string; mimeType: string; content: string /* base64 */ }
export type Mail = { to: string; subject: string; body: string; attachments?: Attachment[]; replyTo?: string }
/** Header values can't carry line breaks (which would let someone add their own headers). */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim()
const b64utf8 = (t: string) => {
  const bytes = new TextEncoder().encode(t)
  let s = ""
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
const wrap = (b64: string) => b64.replace(/.{1,76}/g, "$&\r\n").trim()
export function mime(m: Mail) {
  const to = oneLine(m.to).split(/[,;\s]+/).filter(Boolean).join(", ")
  const head = [`To: ${to}`, ...(m.replyTo ? [`Reply-To: ${oneLine(m.replyTo)}`] : []), `Subject: =?UTF-8?B?${b64utf8(oneLine(m.subject))}?=`, "MIME-Version: 1.0"]
  const text = ["Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap(b64utf8(m.body))]
  if (!m.attachments?.length) return [...head, ...text].join("\r\n")
  const boundary = "pst_" + Math.random().toString(36).slice(2)
  const parts = [
    `--${boundary}`, ...text,
    ...m.attachments.flatMap((a) => [
      `--${boundary}`,
      `Content-Type: ${oneLine(a.mimeType)}; name="${oneLine(a.filename).replace(/"/g, "")}"`,
      `Content-Disposition: attachment; filename="${oneLine(a.filename).replace(/"/g, "")}"`,
      "Content-Transfer-Encoding: base64",
      "",
      wrap(a.content),
    ]),
    `--${boundary}--`,
  ]
  return [...head, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", ...parts].join("\r\n")
}
const base64url = (s: string) => b64utf8(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
export const sendMail = (m: Mail, hint?: string) =>
  api("gmail", "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", json: { raw: base64url(mime(m)) } }, hint)

/* ---------- Calendar ---------- */
export function nextDay(date: string) {
  const d = new Date(date + "T00:00:00")
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
export const addCalendarEvent = (ev: { title: string; date: string; details: string }, hint?: string) =>
  api("calendar", "https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    json: { summary: ev.title, description: ev.details, start: { date: ev.date }, end: { date: nextDay(ev.date) }, transparency: "transparent" },
  }, hint)
/** Opens Google Calendar with the event filled in — works without connecting anything. */
export function calendarLink(title: string, date: string, details: string) {
  const q = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${date.replace(/-/g, "")}/${nextDay(date).replace(/-/g, "")}`, details })
  return "https://calendar.google.com/calendar/render?" + q.toString()
}

/* ---------- Sheets (admin) ---------- */
export type Tab = { title: string; rows: (string | number)[][] }
export async function writeSheet(existingId: string | undefined, title: string, tabs: Tab[], hint?: string) {
  let id = existingId
  let url: string | undefined
  if (id) {
    // Make sure each tab exists, then clear and rewrite it
    try {
      const meta = await api("sheets", `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=spreadsheetUrl,sheets.properties.title`, { method: "GET" }, hint)
      url = meta.spreadsheetUrl
      const have = new Set((meta.sheets || []).map((s: any) => s.properties.title))
      const add = tabs.filter((t) => !have.has(t.title)).map((t) => ({ addSheet: { properties: { title: t.title } } }))
      if (add.length) await api("sheets", `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, { method: "POST", json: { requests: add } }, hint)
    } catch {
      id = undefined // deleted or no longer reachable: make a new one
    }
  }
  if (!id) {
    const made = await api("sheets", "https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      json: { properties: { title }, sheets: tabs.map((t) => ({ properties: { title: t.title } })) },
    }, hint)
    if (!made?.spreadsheetId) throw new GoogleError("failed", "Google Sheets didn’t create the sheet.")
    id = made.spreadsheetId as string
    url = made.spreadsheetUrl
  }
  const ranges = tabs.map((t) => `'${t.title}'`)
  await api("sheets", `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchClear`, { method: "POST", json: { ranges } }, hint)
  await api("sheets", `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`, {
    method: "POST",
    json: { valueInputOption: "RAW", data: tabs.map((t) => ({ range: `'${t.title}'!A1`, values: t.rows })) },
  }, hint)
  return { id: id!, url: url || `https://docs.google.com/spreadsheets/d/${id}` }
}

export const GOOGLE_HELP: Record<GoogleError["kind"], string> = {
  cancelled: "The Google window was closed before finishing.",
  unavailable: "Google connections aren’t set up on this site yet.",
  denied: "Google access wasn’t allowed.",
  failed: "Google reported a problem.",
}

/* ---------- Calendar: booked shifts ---------- */
const EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
const localZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London" } catch { return "Europe/London" } }
const localStamp = (t: Date) =>
  `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}T${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}:00`
export type ShiftEvent = { shiftId: string; title: string; details: string; location: string; start: Date; end: Date }
/** Add the shift to Google Calendar, or update the event it already has. Returns the event id. */
export async function putShiftEvent(ev: ShiftEvent, existingId?: string, hint?: string): Promise<string> {
  const zone = localZone()
  const body = {
    summary: ev.title, description: ev.details, location: ev.location || undefined,
    start: { dateTime: localStamp(ev.start), timeZone: zone }, end: { dateTime: localStamp(ev.end), timeZone: zone },
    extendedProperties: { private: { kasaShift: ev.shiftId } },
  }
  if (existingId) {
    try {
      const r = await api("calendar", `${EVENTS}/${encodeURIComponent(existingId)}`, { method: "PATCH", json: body }, hint)
      return (r as { id: string }).id
    } catch (e) {
      // Deleted in Google meanwhile: make it again
      if (!(e instanceof GoogleError) || !/not found|deleted/i.test(e.message)) throw e
    }
  }
  const r = await api("calendar", EVENTS, { method: "POST", json: body }, hint)
  return (r as { id: string }).id
}
export async function deleteShiftEvent(id: string, hint?: string) {
  try { await api("calendar", `${EVENTS}/${encodeURIComponent(id)}`, { method: "DELETE" }, hint) }
  catch (e) { if (!(e instanceof GoogleError) || !/not found|deleted|gone/i.test(e.message)) throw e }
}
export type GoogleEvent = { id: string; title: string; date: string; start: string; end: string; allDay: boolean; endDate: string }
/** The person's own events between two dates (not the ones this app added), for showing next to shifts. */
export async function listEvents(from: string, to: string, hint?: string): Promise<GoogleEvent[]> {
  const q = new URLSearchParams({ timeMin: new Date(from + "T00:00:00").toISOString(), timeMax: new Date(to + "T23:59:59").toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250" })
  const r = (await api("calendar", `${EVENTS}?${q}`, { method: "GET" }, hint)) as { items?: any[] }
  const hhmm = (iso: string) => localStamp(new Date(iso)).slice(11, 16)
  const day = (iso: string) => localStamp(new Date(iso)).slice(0, 10)
  return (r.items || [])
    .filter((e) => e.status !== "cancelled" && !e.extendedProperties?.private?.kasaShift)
    .map((e) => {
      const allDay = !!e.start?.date
      return {
        id: e.id, title: e.summary || "(No title)", allDay,
        date: allDay ? e.start.date : day(e.start.dateTime), endDate: allDay ? e.end.date : day(e.end.dateTime),
        start: allDay ? "" : hhmm(e.start.dateTime), end: allDay ? "" : hhmm(e.end.dateTime),
      }
    })
}
