import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { onAuthStateChanged, signOut, type User } from "firebase/auth"
import { LogOut, MessageSquare, UserRound } from "lucide-react"
import { Toaster } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { isConfigured } from "@/config"
import { auth } from "@/lib/firebase"
import { followUpsDue, initials, newData, type Data } from "@/lib/model"
import { getSettings, isAdmin as checkAdmin, myOutbox, openVault, recordPerson, type OutboxItem, type PublicSettings, type SaveProblem, type Vault } from "@/lib/cloud"
import { disconnect, GOOGLE_HELP, GoogleError, status as googleStatus, token as googleToken, type ConnStatus, type GoogleArea } from "@/lib/google"
import { AppCtx, type AppApi, type AskOptions, type EmailKind, type Me, type Tab } from "@/app/ctx"
import { ConfirmDialog, EmailDialog, FeedbackDialog, FollowUpDialog, InvoiceDialog } from "@/app/dialogs"
import { AuthScreen } from "@/app/AuthScreen"
import { LogTab } from "@/app/LogTab"
import { SummaryTab } from "@/app/SummaryTab"
import { InvoicesTab } from "@/app/InvoicesTab"
import { ServicesTab } from "@/app/ServicesTab"
import { AccountTab } from "@/app/AccountTab"
import { AdminTab, processOutbox } from "@/app/AdminTab"

const BASE_TABS: [Tab, string][] = [["log", "Log"], ["summary", "Summary"], ["invoices", "Invoices"], ["services", "Services"], ["account", "Account"]]
const PROBLEM_TEXT: Record<SaveProblem, string> = {
  offline: "You’re offline. Changes are kept on this device and saved when you reconnect.",
  full: "Storage is full. Delete some old invoices or entries.",
  failed: "Couldn’t save. Try again.",
}

function Splash({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-header">
      <div className="wrap flex min-h-screen flex-col justify-center gap-5 py-10 text-header-fg">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-[11px] border border-white/20 bg-white/10 font-display text-[23px] font-bold">℞</div>
          <h1 className="font-display text-[19px] font-bold text-white">Service Tracker</h1>
        </div>
        <p className="max-w-md text-[14px]">{message}</p>
        {children}
      </div>
    </div>
  )
}

const meFrom = (u: User): Me => ({
  uid: u.uid,
  email: u.email || "",
  name: u.displayName || "",
  emailVerified: u.emailVerified,
  viaGoogle: u.providerData.some((p) => p.providerId === "google.com"),
})

export default function App() {
  const [me, setMe] = useState<Me | null>(null)
  const [data, setData] = useState<Data | null>(null)
  const [phase, setPhase] = useState<"starting" | "auth" | "loading" | "ready" | "error">("starting")
  const [authNotice, setAuthNotice] = useState("")
  const [tab, setTab] = useState<Tab>("log")
  const [invoiceView, setInvoiceView] = useState<{ id: string; justCreated: boolean } | null>(null)
  const [emailReq, setEmailReq] = useState<{ id: string; kind: EmailKind; fromFollowUps: boolean } | null>(null)
  const [followOpen, setFollowOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [google, setGoogle] = useState<Record<GoogleArea, ConnStatus>>({ gmail: googleStatus("gmail"), calendar: googleStatus("calendar"), sheets: googleStatus("sheets") })
  const [admin, setAdmin] = useState(false)
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [outbox, setOutbox] = useState<OutboxItem[]>([])
  const [askReq, setAskReq] = useState<AskOptions | null>(null)
  const askResolve = useRef<((v: boolean) => void) | null>(null)
  const dataRef = useRef<Data | null>(null)
  const vaultRef = useRef<Vault | null>(null)
  const unwatch = useRef<(() => void) | null>(null)
  const lastProblem = useRef(0)
  const autoSent = useRef(false)

  const ask = useCallback((o: AskOptions) => new Promise<boolean>((res) => { askResolve.current = res; setAskReq(o) }), [])
  const onProblem = useCallback((p: SaveProblem) => {
    if (Date.now() - lastProblem.current < 5000) return
    lastProblem.current = Date.now()
    toast.error(PROBLEM_TEXT[p])
  }, [])
  const refreshGoogle = () => setGoogle({ gmail: googleStatus("gmail"), calendar: googleStatus("calendar"), sheets: googleStatus("sheets") })

  const openUser = useCallback(async (u: User) => {
    setPhase("loading")
    const m = meFrom(u)
    const newName = sessionStorage.getItem("pst_new_name") || ""
    sessionStorage.removeItem("pst_new_name")
    if (newName && !m.name) m.name = newName
    const vault = openVault(u.uid, onProblem)
    vaultRef.current = vault
    let d: Data | null
    try {
      d = await vault.load()
    } catch {
      setPhase("error")
      return
    }
    const isNew = !d
    if (!d) {
      d = newData(m.name)
      d.profile.email = m.email
      await vault.save(d)
    }
    dataRef.current = d
    setData(d)
    setMe(m)
    setTab(isNew ? "account" : "log")
    setPhase("ready")
    if (isNew) toast("Welcome. Add your invoice details to get started.")
    if (followUpsDue(d).length) setTimeout(() => setFollowOpen(true), 400)
    recordPerson(u.uid, { name: d.profile.fullName || m.name, email: m.email, isNew }).catch(() => {})
    unwatch.current?.()
    unwatch.current = vault.watch((next) => {
      dataRef.current = next
      setData(next)
    })
    checkAdmin(u.uid).then(setAdmin)
    getSettings().then(setSettings)
  }, [onProblem])

  useEffect(() => {
    if (!isConfigured) return
    return onAuthStateChanged(auth, (u) => {
      if (u) openUser(u)
      else {
        unwatch.current?.()
        unwatch.current = null
        vaultRef.current = null
        dataRef.current = null
        setData(null)
        setMe(null)
        setAdmin(false)
        setPhase("auth")
        getSettings().then(setSettings)
      }
    })
  }, [openUser])

  const refreshOutbox = useCallback(async () => {
    if (!me) return
    const list = await myOutbox(me.uid).catch(() => [] as OutboxItem[])
    setOutbox(list)
    // Invoices the admin has emailed for this person: mark them as emailed
    const sent = list.filter((i) => i.kind === "invoice" && i.status === "done")
    const missing = sent.filter((i) => dataRef.current?.invoices.some((v) => v.id === i.invoiceId && !v.sentAt))
    if (missing.length && dataRef.current && vaultRef.current) {
      const next = structuredClone(dataRef.current)
      for (const o of missing) { const v = next.invoices.find((x) => x.id === o.invoiceId); if (v) v.sentAt = o.doneAt || o.at }
      dataRef.current = next
      setData(next)
      vaultRef.current.save(next)
    }
  }, [me])
  useEffect(() => { if (phase === "ready") refreshOutbox() }, [phase, refreshOutbox])
  // The admin can have waiting emails sent when they open the tracker (needs a Gmail token from this visit)
  useEffect(() => {
    if (phase !== "ready" || !admin || !settings?.autoSend || autoSent.current || !me) return
    autoSent.current = true
    processOutbox(me.email, true).then((r) => { if (r.done || r.failed) toast(`Sent ${r.done} waiting email${r.done === 1 ? "" : "s"}${r.failed ? `, ${r.failed} couldn’t be sent` : ""}`) }).catch(() => {})
  }, [phase, admin, settings, me])

  const commit = useCallback<AppApi["commit"]>((fn, message) => {
    if (!dataRef.current || !vaultRef.current) return
    const next = structuredClone(dataRef.current)
    fn(next)
    dataRef.current = next
    setData(next)
    vaultRef.current.save(next)
    if (message) toast(message)
  }, [])
  const replaceAll = useCallback<AppApi["replaceAll"]>((d, message) => {
    if (!vaultRef.current) return
    dataRef.current = d
    setData(d)
    vaultRef.current.save(d)
    if (message) toast(message)
  }, [])
  const go = useCallback((t: Tab) => { setTab(t); window.scrollTo({ top: 0 }) }, [])
  const leave = useCallback(async (notice: string) => {
    setInvoiceView(null); setEmailReq(null); setFollowOpen(false); setFeedbackOpen(false); setOutbox([])
    disconnect()
    refreshGoogle()
    setAuthNotice(notice)
    await signOut(auth).catch(() => {})
  }, [])
  const connect = useCallback(async (area: GoogleArea) => {
    try {
      await googleToken(area, me?.email)
      refreshGoogle()
      return true
    } catch (e) {
      const k = e instanceof GoogleError ? e.kind : "failed"
      if (k !== "cancelled") toast.error(GOOGLE_HELP[k] + (e instanceof Error && e.message !== k ? ` ${e.message}` : ""))
      refreshGoogle()
      return false
    }
  }, [me])

  const api = useMemo<AppApi | null>(() => {
    if (!data || !me) return null
    return {
      data, me, commit, replaceAll, ask, go, google, connect, isAdmin: admin, settings, setSettings, outbox, refreshOutbox,
      disconnectGoogle: () => { disconnect(); refreshGoogle(); toast("Google disconnected on this device") },
      viewInvoice: (id, justCreated = false) => setInvoiceView({ id, justCreated }),
      email: (id, kind) => { setInvoiceView(null); setEmailReq({ id, kind, fromFollowUps: false }) },
      showFollowUps: () => setFollowOpen(true),
      openFeedback: () => setFeedbackOpen(true),
      logOut: () => leave("You’ve logged out."),
      accountDeleted: () => leave("Your account was deleted."),
    }
  }, [data, me, commit, replaceAll, ask, go, google, connect, admin, settings, outbox, refreshOutbox, leave])

  const confirm = <ConfirmDialog req={askReq} onDone={(ok) => { askResolve.current?.(ok); askResolve.current = null; setAskReq(null) }} />
  const toaster = <Toaster position="bottom-center" toastOptions={{ style: { fontFamily: "Figtree, system-ui, sans-serif" } }} />

  if (!isConfigured)
    return <Splash message="This copy of the tracker isn’t connected to Firebase yet. Fill in src/config.ts with your Firebase project’s web settings (see SETUP.md), then rebuild." />
  if (phase === "error")
    return <><Splash message="Your tracker can’t be reached right now. Check your connection and try again."><div><Button className="bg-white text-[hsl(var(--header))] hover:bg-white/90" onClick={() => auth.currentUser && openUser(auth.currentUser)}>Try again</Button></div></Splash>{toaster}</>
  if (phase === "auth") return <><AuthScreen notice={authNotice} />{toaster}</>
  if (phase !== "ready" || !api || !data || !me) return <Splash message={phase === "loading" ? "Opening your tracker…" : "Starting…"} />

  const name = data.profile.fullName || me.name || me.email
  const due = followUpsDue(data).length
  const TABS: [Tab, string][] = admin ? [...BASE_TABS, ["admin", "Admin"]] : BASE_TABS

  return (
    <AppCtx.Provider value={api}>
      <div className="min-h-screen pb-12">
        <header className="sticky top-[env(safe-area-inset-top,0px)] z-40 bg-header pb-3.5 pt-4 shadow-[0_1px_0_rgba(0,0,0,.06)]">
          <div className="wrap">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 flex-none items-center justify-center rounded-[11px] border border-white/20 bg-white/10 font-display text-[23px] font-bold text-header-fg">℞</div>
                <div className="min-w-0">
                  <h1 className="font-display text-[19px] font-bold leading-tight tracking-[-0.01em] text-white">Service Tracker</h1>
                  <p className="truncate text-[12.5px] font-medium text-header-muted">Logged in as {name}</p>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger aria-label="Account menu" className="flex size-[38px] flex-none items-center justify-center rounded-full bg-white text-[13.5px] font-bold text-[hsl(var(--header))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
                  {initials(name)}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="font-normal">
                    <div className="truncate text-sm font-semibold">{name}</div>
                    <div className="truncate text-xs text-muted-foreground">{me.email}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => go("account")}><UserRound /> Account & email</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setFeedbackOpen(true)}><MessageSquare /> Send feedback</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => api.logOut()}><LogOut /> Log out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <nav className="-mx-1 mt-3.5 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none]" aria-label="Sections">
              {TABS.map(([k, l]) => (
                <button key={k} type="button" aria-current={tab === k ? "page" : undefined} onClick={() => go(k)}
                  className={cn(
                    "flex flex-[1_0_auto] items-center justify-center gap-1.5 rounded-[9px] px-3 py-2 text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                    tab === k ? "bg-white text-[hsl(var(--header))]" : "bg-white/10 text-header-muted hover:bg-white/20",
                  )}>
                  {l}
                  {k === "invoices" && due > 0 && (
                    <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#E5534B] px-1.5 text-[11px] font-bold text-white" aria-label={`${due} follow-ups due`}>{due}</span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        </header>

        <main className="wrap pt-4">
          {tab === "log" && <LogTab />}
          {tab === "summary" && <SummaryTab />}
          {tab === "invoices" && <InvoicesTab />}
          {tab === "services" && <ServicesTab />}
          {tab === "account" && <AccountTab />}
          {tab === "admin" && admin && <AdminTab />}
        </main>
      </div>

      <InvoiceDialog id={invoiceView?.id ?? null} justCreated={!!invoiceView?.justCreated} onClose={() => setInvoiceView(null)} />
      <EmailDialog req={emailReq} onClose={() => setEmailReq(null)} onBack={emailReq?.fromFollowUps ? () => { setEmailReq(null); setFollowOpen(true) } : undefined} />
      <FollowUpDialog open={followOpen} onClose={() => setFollowOpen(false)} onFollowUp={(id) => { setFollowOpen(false); setEmailReq({ id, kind: "followup", fromFollowUps: true }) }} onView={() => { setFollowOpen(false); go("invoices") }} />
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      {confirm}
      {toaster}
    </AppCtx.Provider>
  )
}
