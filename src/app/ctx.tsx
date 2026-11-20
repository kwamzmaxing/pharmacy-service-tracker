import { createContext, useContext } from "react"
import type { Data } from "@/lib/model"
import type { OutboxItem, PublicSettings } from "@/lib/cloud"
import type { ConnStatus, GoogleArea } from "@/lib/google"
import type { ThemePref } from "@/lib/theme"

export type Tab = "home" | "log" | "summary" | "invoices" | "expenses" | "tax" | "clients" | "services" | "account" | "admin"
export type LogMode = "service" | "hours" | "journey"
export type EmailKind = "invoice" | "followup"
export type Me = { uid: string; email: string; name: string; emailVerified: boolean; viaGoogle: boolean }

export type AskOptions = {
  title: string
  message: string
  ok?: string
  danger?: boolean
  /** Ask the viewer to type this exact word before the confirm button works. */
  typeToConfirm?: string
}

export type AppApi = {
  data: Data
  me: Me
  /** Apply a change, save it, optionally toast. */
  commit: (fn: (d: Data) => void, message?: string) => void
  replaceAll: (d: Data, message?: string) => void
  ask: (o: AskOptions) => Promise<boolean>
  /** Open a section; for the log, optionally which form to start on. */
  go: (t: Tab, logMode?: LogMode) => void
  logMode: LogMode
  viewInvoice: (id: string, justCreated?: boolean) => void
  /** Open a pharmacy's profile on the Pharmacies tab. */
  openClient: (id: string) => void
  /** The pharmacy whose profile is open, if any. */
  clientView: string | null
  email: (id: string, kind: EmailKind) => void
  showFollowUps: () => void
  openFeedback: () => void
  logOut: () => void
  accountDeleted: () => void
  /** Connection state of this person's Google services on this device. */
  google: Record<GoogleArea, ConnStatus>
  /** Connect a Google service (call from a click). Resolves true when connected. */
  connect: (area: GoogleArea) => Promise<boolean>
  disconnectGoogle: () => void
  isAdmin: boolean
  /** This account is an admin, but logged in without Google, so admin is switched off for now. */
  adminNeedsGoogle: boolean
  settings: PublicSettings | null
  setSettings: (s: PublicSettings | null) => void
  theme: ThemePref
  setTheme: (t: ThemePref) => void
  /** Emails this person queued to go out from the admin's Gmail. */
  outbox: OutboxItem[]
  refreshOutbox: () => Promise<void>
}

export const AppCtx = createContext<AppApi | null>(null)
export const useApp = () => {
  const v = useContext(AppCtx)
  if (!v) throw new Error("useApp outside provider")
  return v
}
