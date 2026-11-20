// One way to send email and add calendar events, whichever account the person connected:
// Google (Gmail, Google Calendar) or Microsoft (Outlook, Outlook Calendar).
import { addCalendarEvent, GOOGLE_HELP, GoogleError, hasToken, sendMail, status as gStatus, type ConnStatus, type Mail } from "./google"
import { MicrosoftError, MS_HELP, msAddEvent, msSendMail, msStatus } from "./microsoft"

export type Provider = "google" | "microsoft"
export type Service = "mail" | "calendar"
export type Conn = Record<Provider, Record<Service, ConnStatus>>
export const PROVIDERS: Provider[] = ["google", "microsoft"]
export const NAMES: Record<Provider, { mail: string; calendar: string; company: string }> = {
  google: { mail: "Gmail", calendar: "Google Calendar", company: "Google" },
  microsoft: { mail: "Outlook", calendar: "Outlook Calendar", company: "Microsoft" },
}

export const connStatus = (): Conn => ({
  google: { mail: gStatus("gmail"), calendar: gStatus("calendar") },
  microsoft: { mail: msStatus("mail"), calendar: msStatus("calendar") },
})
/** The connected account to use for a service: the person's choice if it's connected, else whichever is. */
export function pick(conn: Conn, s: Service, pref?: Provider): Provider | null {
  if (pref && conn[pref][s] === "ready") return pref
  return PROVIDERS.find((p) => conn[p][s] === "ready") ?? null
}

export const sendWith = (p: Provider, m: Mail, hint?: string) => (p === "google" ? sendMail(m, hint) : msSendMail(m, hint))
export const addEventWith = (p: Provider, ev: { title: string; date: string; details: string }, hint?: string) =>
  p === "google" ? addCalendarEvent(ev, hint) : msAddEvent(ev, hint)
/** Whether a calendar event can be added without showing a window (used when creating an invoice). */
export const canAddQuietly = (p: Provider) => (p === "google" ? hasToken("calendar") : true)

export const isCancel = (e: unknown) => (e instanceof GoogleError || e instanceof MicrosoftError) && e.kind === "cancelled"
export function problem(e: unknown) {
  if (e instanceof MicrosoftError) return MS_HELP[e.kind] + (e.message && e.message !== e.kind ? ` ${e.message}` : "")
  const k = e instanceof GoogleError ? e.kind : "failed"
  return GOOGLE_HELP[k] + (e instanceof Error && e.message && e.message !== k ? ` ${e.message}` : "")
}
