// Each person's own Microsoft account: Outlook (send) and Outlook Calendar (events),
// through Microsoft Graph. Uses MSAL in the browser: personal Outlook.com / Hotmail /
// Live accounts and work or school Microsoft 365 accounts both work.
import type { IPublicClientApplication } from "@azure/msal-browser"
import { emulator, microsoftClientId } from "@/config"
import type { Attachment, Mail } from "./google"
import { nextDay } from "./google"

export const MS_SCOPES = { mail: "Mail.Send", calendar: "Calendars.ReadWrite" } as const
export type MsArea = keyof typeof MS_SCOPES
export type MsStatus = "unavailable" | "not_connected" | "ready"

const CONNECTED = "pst_ms_connected"
const connectedAreas = (): MsArea[] => {
  try { return JSON.parse(localStorage.getItem(CONNECTED) || "[]") } catch { return [] }
}
const setConnected = (areas: MsArea[]) => {
  try { localStorage.setItem(CONNECTED, JSON.stringify([...new Set(areas)])) } catch { /* ignore */ }
}

export const microsoftAvailable = () => emulator || !!microsoftClientId
export const msStatus = (area: MsArea): MsStatus => (!microsoftAvailable() ? "unavailable" : connectedAreas().includes(area) ? "ready" : "not_connected")

export class MicrosoftError extends Error {
  kind: "cancelled" | "unavailable" | "denied" | "failed" | "signin"
  constructor(kind: MicrosoftError["kind"], message?: string) {
    super(message || kind)
    this.kind = kind
  }
}
export const MS_HELP: Record<MicrosoftError["kind"], string> = {
  cancelled: "The Microsoft window was closed before finishing.",
  unavailable: "Microsoft connections aren’t set up on this site yet.",
  denied: "Microsoft access wasn’t allowed.",
  failed: "Microsoft reported a problem.",
  signin: "Microsoft needs you to sign in again. Click the button once more.",
}

/* ---------- MSAL ---------- */
let pca: Promise<IPublicClientApplication> | null = null
/** Popups land on a tiny page that hands the answer back to this tab (auth-redirect.html). */
const redirectUri = () => new URL("auth-redirect.html", window.location.origin + import.meta.env.BASE_URL).href
function client() {
  pca ??= import("@azure/msal-browser").then(({ createStandardPublicClientApplication }) =>
    createStandardPublicClientApplication({
      auth: { clientId: microsoftClientId, authority: "https://login.microsoftonline.com/common", redirectUri: redirectUri() },
      cache: { cacheLocation: "localStorage" },
    }),
  )
  return pca
}
/** Load MSAL ahead of time, so a click can open Microsoft's window straight away (no pop-up blocking). */
export function warmUp() {
  if (microsoftClientId && connectedAreas().length) client().catch(() => {})
}

const wanted = (area: MsArea) => [...new Set([...connectedAreas().map((a) => MS_SCOPES[a]), MS_SCOPES[area]])]
function toMsError(e: unknown): MicrosoftError {
  if (e instanceof MicrosoftError) return e
  const code = (e as { errorCode?: string })?.errorCode || ""
  const msg = (e as Error)?.message || ""
  if (/user_cancelled|popup_window_closed/.test(code)) return new MicrosoftError("cancelled")
  if (/access_denied|consent_required/.test(code + msg)) return new MicrosoftError("denied", "Access wasn’t allowed. Accept Microsoft’s request to continue.")
  if (/popup_window_error|empty_window_error/.test(code)) return new MicrosoftError("failed", "Your browser blocked Microsoft’s window. Allow pop-ups for this site and try again.")
  return new MicrosoftError("failed", msg)
}

/** Ask Microsoft for access (call from a click: may show a window). */
export async function msConnect(area: MsArea, hint?: string): Promise<string> {
  if (emulator && !microsoftClientId) { setConnected([...connectedAreas(), area]); return "emulator-token" }
  if (!microsoftClientId) throw new MicrosoftError("unavailable")
  try {
    const app = await client()
    const r = await app.acquireTokenPopup({ scopes: wanted(area), loginHint: hint, prompt: "select_account" })
    setConnected([...connectedAreas(), ...(Object.keys(MS_SCOPES) as MsArea[]).filter((a) => r.scopes.map((s) => s.toLowerCase()).some((s) => s.endsWith(MS_SCOPES[a].toLowerCase())))])
    return r.accessToken
  } catch (e) {
    throw toMsError(e)
  }
}

async function token(area: MsArea, hint?: string): Promise<string> {
  if (emulator && !microsoftClientId) return "emulator-token"
  if (!microsoftClientId) throw new MicrosoftError("unavailable")
  const app = await client()
  const account = app.getAllAccounts()[0]
  if (account) {
    try {
      return (await app.acquireTokenSilent({ scopes: wanted(area), account })).accessToken
    } catch { /* fall through to a window */ }
  }
  try {
    return (await app.acquireTokenPopup({ scopes: wanted(area), loginHint: account?.username || hint })).accessToken
  } catch (e) {
    const err = toMsError(e)
    // The window was blocked because it didn't open straight from the click: the next click works
    throw /blocked/.test(err.message) ? new MicrosoftError("signin") : err
  }
}

export async function msDisconnect() {
  try { localStorage.removeItem(CONNECTED) } catch { /* ignore */ }
  if (!microsoftClientId || !pca) return
  try {
    const app = await client()
    for (const a of app.getAllAccounts()) await app.clearCache({ account: a })
  } catch { /* ignore */ }
}

async function graph(area: MsArea, path: string, json: unknown, hint?: string) {
  const t = await token(area, hint)
  const res = await fetch("https://graph.microsoft.com/v1.0" + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify(json),
  })
  if (res.status === 401) throw new MicrosoftError("signin")
  if (!res.ok) {
    let msg = res.statusText
    try { msg = (await res.json())?.error?.message || msg } catch { /* ignore */ }
    throw new MicrosoftError("failed", msg)
  }
  return res.status === 202 || res.status === 204 ? null : res.json()
}

/* ---------- Outlook mail ---------- */
const att = (a: Attachment) => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: a.filename, contentType: a.mimeType, contentBytes: a.content })
export const msSendMail = (m: Mail, hint?: string) =>
  graph("mail", "/me/sendMail", {
    message: {
      subject: m.subject,
      body: { contentType: "Text", content: m.body },
      toRecipients: m.to.split(/[,;\s]+/).filter(Boolean).map((address) => ({ emailAddress: { address } })),
      attachments: (m.attachments || []).map(att),
    },
    saveToSentItems: true,
  }, hint)

/* ---------- Outlook calendar ---------- */
export const msAddEvent = (ev: { title: string; date: string; details: string }, hint?: string) =>
  graph("calendar", "/me/events", {
    subject: ev.title,
    body: { contentType: "Text", content: ev.details },
    start: { dateTime: `${ev.date}T00:00:00`, timeZone: "Europe/London" },
    end: { dateTime: `${nextDay(ev.date)}T00:00:00`, timeZone: "Europe/London" },
    isAllDay: true,
    showAs: "free",
    isReminderOn: true,
    reminderMinutesBeforeStart: 9 * 60,
  }, hint)

/** Opens Outlook on the web with the event filled in — works without connecting anything. */
export function outlookCalendarLink(title: string, date: string, details: string) {
  const q = new URLSearchParams({ subject: title, body: details, startdt: date, enddt: nextDay(date), allday: "true", path: "/calendar/action/compose", rru: "addevent" })
  return "https://outlook.live.com/calendar/0/deeplink/compose?" + q.toString()
}
