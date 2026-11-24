import { createContext, useContext } from "react"
import type { Data } from "@/lib/model"
import type { OutboxItem, PublicSettings } from "@/lib/cloud"
import type { ConnStatus, GoogleArea } from "@/lib/google"
import type { ThemePref } from "@/lib/theme"

export type Tab = "home" | "shifts" | "log" | "summary" | "invoices" | "insights" | "expenses" | "tax" | "budget" | "clients" | "services" | "account" | "admin"
export type LogMode = "service" | "hours" | "journey"
export type EmailKind = "invoice" | "followup"
export type Me = { uid: string; email: string; name: string; emailVerified: boolean; viaGoogle: boolean }

export type CommitOptions = {
  /** Show "Undo" on the message for a few seconds (for deletions). */
  undo?: boolean
  /** Runs once the change can no longer be undone (e.g. delete a receipt photo for good). */
  onExpire?: () => void
}

export type AskOptions = {
  title: string
  message: string
  ok?: string
  danger?: boolean
  /** Ask the viewer to type this exact word before the confirm button works. */
  typeToConfirm?: string
  /** Ask for a value (for example a password); askFor resolves with it. */
  input?: { label: string; type?: "password" | "text"; autoComplete?: string }
}

export type AppApi = {
  data: Data
  me: Me
  /** Apply a change, save it, optionally toast. */
  commit: (fn: (d: Data) => void, message?: string, opts?: CommitOptions) => void
  replaceAll: (d: Data, message?: string) => void
  ask: (o: AskOptions) => Promise<boolean>
  /** Like ask, with a box to type into: resolves with what was typed, or null if cancelled. */
  askFor: (o: AskOptions & { input: NonNullable<AskOptions["input"]> }) => Promise<string | null>
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
  /** "Talk to an accountant" form. */
  openAccountant: () => void
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
  /** Check admin access again (after switching this session to Google). */
  recheckAdmin: () => Promise<void>
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
