import { createContext, useContext } from "react"
import type { Data } from "@/lib/model"
import type { Connection } from "@/lib/store"
import type { Session } from "@/lib/accounts"
import type { ConnStatus } from "@/lib/gmail"
import type { AdminConfig, InboxItem } from "@/lib/admin"

export type Tab = "log" | "summary" | "invoices" | "services" | "account" | "admin"
export type EmailKind = "invoice" | "followup"

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
  conn: Connection
  session: Session
  /** Apply a change, save it, optionally toast. */
  commit: (fn: (d: Data) => void, message?: string) => void
  replaceAll: (d: Data, message?: string) => void
  ask: (o: AskOptions) => Promise<boolean>
  go: (t: Tab) => void
  viewInvoice: (id: string, justCreated?: boolean) => void
  email: (id: string, kind: EmailKind) => void
  showFollowUps: () => void
  logOut: () => void
  accountDeleted: () => void
  canSave: boolean
  gmail: ConnStatus
  refreshGmail: () => Promise<ConnStatus>
  calendar: ConnStatus
  refreshCalendar: () => Promise<ConnStatus>
  /** The owner's admin settings, if the owner has turned admin tools on. */
  cfg: AdminConfig | null
  setCfg: (c: AdminConfig | null) => void
  /** This viewer's requests to the admin (queued emails, resets, feedback). */
  myItems: InboxItem[]
  refreshItems: () => Promise<void>
  openFeedback: () => void
}

export const AppCtx = createContext<AppApi | null>(null)
export const useApp = () => {
  const v = useContext(AppCtx)
  if (!v) throw new Error("useApp outside provider")
  return v
}
