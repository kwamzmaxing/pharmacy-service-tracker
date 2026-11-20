import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { onAuthStateChanged, signOut, type User } from "firebase/auth"
import { House, LogOut, MessageSquare, Monitor, Moon, Sun, UserRound } from "lucide-react"
import { Toaster } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { applyTheme, resolveTheme, themePref, type ThemePref } from "@/lib/theme"
import { cn } from "@/lib/utils"
import { isConfigured } from "@/config"
import { auth } from "@/lib/firebase"
import { followUpsDue, initials, newData, type Data } from "@/lib/model"
import { getSettings, isAdmin as checkAdmin, myOutbox, openVault, recordPerson, type OutboxItem, type PublicSettings, type SaveProblem, type Vault } from "@/lib/cloud"
import { disconnect, GOOGLE_HELP, GoogleError, status as googleStatus, token as googleToken, type ConnStatus, type GoogleArea } from "@/lib/google"
import { connStatus, NAMES, pick, problem, isCancel, type Conn, type Provider, type Service } from "@/lib/accounts"
import { msConnect, msDisconnect, warmUp as warmUpMicrosoft } from "@/lib/microsoft"
import { AppCtx, type AppApi, type AskOptions, type EmailKind, type LogMode, type Me, type Tab } from "@/app/ctx"
import { ConfirmDialog, EmailDialog, FeedbackDialog, FollowUpDialog, InvoiceDialog } from "@/app/dialogs"
import { AuthScreen } from "@/app/AuthScreen"
import { BRAND, CONTACT_EMAIL, PRIVACY_URL, TAGLINE, Wordmark } from "@/app/brand"
import { LogTab } from "@/app/LogTab"
import { HomeTab } from "@/app/HomeTab"
import { SummaryTab } from "@/app/SummaryTab"
import { InvoicesTab } from "@/app/InvoicesTab"
import { ServicesTab } from "@/app/ServicesTab"
import { AccountTab } from "@/app/AccountTab"
import { ClientsTab } from "@/app/ClientsTab"
import { ExpensesTab } from "@/app/ExpensesTab"
import { TaxTab } from "@/app/TaxTab"
import { AdminTab, processOutbox } from "@/app/AdminTab"

const BASE_TABS: [Tab, string][] = [["home", "Home"], ["log", "Log"], ["invoices", "Invoices"], ["expenses", "Expenses"], ["tax", "Tax"], ["clients", "Pharmacies"], ["account", "Settings"]]
/** Pages without their own tab light up the tab they belong to. */
const SECTION: Partial<Record<Tab, Tab>> = { summary: "invoices", services: "account" }
const PROBLEM_TEXT: Record<SaveProblem, string> = {
  offline: "You’re offline. Changes are kept on this device and saved when you reconnect.",
  full: "Storage is full. Delete some old invoices or entries.",
  failed: "Couldn’t save. Try again.",
}

function Splash({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="wrap flex min-h-screen flex-col justify-center gap-5 py-10">
        <Wordmark size="lg" tagline as="h1" />
        <p className="max-w-md text-[15px] text-muted-foreground">{message}</p>
        {children}
      </div>
    </div>
  )
}

function SiteFooter({ onFeedback, onHome }: { onFeedback: () => void; onHome: () => void }) {
  const link = "rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  return (
    <footer className="wrap mt-14 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border/60 pt-6 text-[12.5px] text-muted-foreground">
      <span>{BRAND} · {TAGLINE}</span>
      <nav aria-label="Site" className="flex flex-wrap gap-x-5 gap-y-1">
        <button type="button" className={link} onClick={onHome}>Home</button>
        <a className={link} href={PRIVACY_URL} target="_blank" rel="noopener">Privacy policy</a>
        <button type="button" className={link} onClick={onFeedback}>Send feedback</button>
        <a className={link} href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
      </nav>
    </footer>
  )
}

const meFrom = (u: User): Me => ({
  uid: u.uid,
  email: u.email || "",
  name: u.displayName || "",
  emailVerified: u.emailVerified,
  viaGoogle: u.providerData.some((p) => p.providerId === "google.com"),
  viaMicrosoft: u.providerData.some((p) => p.providerId === "microsoft.com"),
})

export default function App() {
  const [me, setMe] = useState<Me | null>(null)
  const [data, setData] = useState<Data | null>(null)
  const [phase, setPhase] = useState<"starting" | "auth" | "loading" | "ready" | "error">("starting")
  const [authNotice, setAuthNotice] = useState("")
  const [tab, setTab] = useState<Tab>("home")
  const [logMode, setLogMode] = useState<LogMode>("service")
  const [invoiceView, setInvoiceView] = useState<{ id: string; justCreated: boolean } | null>(null)
  const [emailReq, setEmailReq] = useState<{ id: string; kind: EmailKind; fromFollowUps: boolean } | null>(null)
  const [followOpen, setFollowOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [theme, setThemeState] = useState<ThemePref>(themePref)
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">(() => resolveTheme(themePref()))
  const setTheme = useCallback((p: ThemePref) => { setThemeState(p); setResolvedTheme(applyTheme(p)) }, [])
  // "Match my device" follows the device when it switches between light and dark
  useEffect(() => {
    if (theme !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const on = () => setResolvedTheme(applyTheme("system"))
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [theme])
  const [clientView, setClientView] = useState<string | null>(null)
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
  const [conn, setConn] = useState<Conn>(connStatus)
  const refreshGoogle = () => { setGoogle({ gmail: googleStatus("gmail"), calendar: googleStatus("calendar"), sheets: googleStatus("sheets") }); setConn(connStatus()) }
  useEffect(() => { warmUpMicrosoft() }, [])

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
    }
    // Saves a new tracker, and keeps any one-off upgrades from loading (only changed parts are written)
    await vault.save(d)
    dataRef.current = d
    setData(d)
    setMe(m)
    setTab(isNew ? "account" : "home")
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
  const go = useCallback((t: Tab, mode: LogMode = "service") => { setLogMode(mode); setTab(t); setClientView(null); window.scrollTo({ top: 0 }) }, [])
  const leave = useCallback(async (notice: string) => {
    setInvoiceView(null); setEmailReq(null); setFollowOpen(false); setFeedbackOpen(false); setOutbox([])
    disconnect()
    await msDisconnect()
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

  const connectTo = useCallback(async (p: Provider, s: Service) => {
    try {
      if (p === "google") await googleToken(s === "mail" ? "gmail" : "calendar", me?.email)
      else await msConnect(s, me?.email)
      refreshGoogle()
      // Use the account just connected from now on
      if (dataRef.current && vaultRef.current) {
        const next = structuredClone(dataRef.current)
        next.profile[s === "mail" ? "mailWith" : "calendarWith"] = p
        dataRef.current = next
        setData(next)
        vaultRef.current.save(next)
      }
      toast.success(`${NAMES[p][s]} connected ✓`)
      return true
    } catch (e) {
      if (!isCancel(e)) toast.error(problem(e))
      refreshGoogle()
      return false
    }
  }, [me])
  const disconnectFrom = useCallback((p: Provider) => {
    if (p === "google") disconnect()
    else msDisconnect()
    setTimeout(refreshGoogle, 0)
    toast(`${NAMES[p].company} disconnected on this device`)
  }, [])

  const api = useMemo<AppApi | null>(() => {
    if (!data || !me) return null
    return {
      conn, connectTo, disconnectFrom,
      mailWith: pick(conn, "mail", data.profile.mailWith), calendarWith: pick(conn, "calendar", data.profile.calendarWith),
      data, me, commit, replaceAll, ask, go, google, connect, isAdmin: admin, settings, setSettings, outbox, refreshOutbox, theme, setTheme, logMode,
      disconnectGoogle: () => { disconnect(); refreshGoogle(); toast("Google disconnected on this device") },
      viewInvoice: (id, justCreated = false) => setInvoiceView({ id, justCreated }),
      openClient: (id) => { setClientView(id); setTab("clients"); window.scrollTo({ top: 0 }) },
      clientView,
      email: (id, kind) => { setInvoiceView(null); setEmailReq({ id, kind, fromFollowUps: false }) },
      showFollowUps: () => setFollowOpen(true),
      openFeedback: () => setFeedbackOpen(true),
      logOut: () => leave("You’ve logged out."),
      accountDeleted: () => leave("Your account was deleted."),
    }
  }, [data, me, commit, replaceAll, ask, go, google, connect, admin, settings, outbox, refreshOutbox, leave, clientView, theme, setTheme, logMode, conn, connectTo, disconnectFrom])

  const confirm = <ConfirmDialog req={askReq} onDone={(ok) => { askResolve.current?.(ok); askResolve.current = null; setAskReq(null) }} />
  const toaster = <Toaster theme={resolvedTheme} position="bottom-center" toastOptions={{ style: { fontFamily: "Inter, system-ui, sans-serif", borderRadius: 14 } }} />

  if (!isConfigured)
    return <Splash message="This copy of the tracker isn’t connected to Firebase yet. Fill in src/config.ts with your Firebase project’s web settings (see SETUP.md), then rebuild." />
  if (phase === "error")
    return <><Splash message="Your tracker can’t be reached right now. Check your connection and try again."><div><Button onClick={() => auth.currentUser && openUser(auth.currentUser)}>Try again</Button></div></Splash>{toaster}</>
  if (phase === "auth") return <><AuthScreen notice={authNotice} />{toaster}</>
  if (phase !== "ready" || !api || !data || !me) return <Splash message={phase === "loading" ? "Opening your tracker…" : "Starting…"} />

  const name = data.profile.fullName || me.name || me.email
  const due = followUpsDue(data).length
  const TABS: [Tab, string][] = admin ? [...BASE_TABS, ["admin", "Admin"]] : BASE_TABS

  return (
    <AppCtx.Provider value={api}>
      <div className="min-h-screen pb-12">
        <header className="sticky top-[env(safe-area-inset-top,0px)] z-40 bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
          <div className="wrap">
            <div className="flex items-center justify-between gap-3 pb-3 pt-4">
              <button type="button" onClick={() => go("home")} aria-label={`${BRAND} home`} className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Wordmark tagline as="h1" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger aria-label="Account menu" className="flex min-w-0 items-center gap-2 rounded-full py-1 pl-3.5 pr-1 text-[13.5px] text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="hidden max-w-[180px] truncate sm:inline">{name}</span>
                  <span className="flex size-8 flex-none items-center justify-center rounded-full bg-secondary text-[12.5px] font-medium text-foreground">{initials(name)}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 rounded-xl">
                  <DropdownMenuLabel className="font-normal">
                    <div className="truncate text-sm font-medium">{name}</div>
                    <div className="truncate text-xs text-muted-foreground">{me.email}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => go("home")}><House /> Home</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => go("account")}><UserRound /> Settings</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setFeedbackOpen(true)}><MessageSquare /> Send feedback</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="pb-1 text-xs font-normal text-muted-foreground">Appearance</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePref)}>
                    <DropdownMenuRadioItem value="dark" onSelect={(e) => e.preventDefault()}><Moon /> Dark</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="light" onSelect={(e) => e.preventDefault()}><Sun /> Light</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="system" onSelect={(e) => e.preventDefault()}><Monitor /> Match my device</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => api.logOut()}><LogOut /> Log out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-3 [scrollbar-width:none]" aria-label="Sections">
              {TABS.map(([k, l]) => {
                const on = (SECTION[tab] ?? tab) === k
                return (
                  <button key={k} type="button" aria-current={on ? "page" : undefined} onClick={() => go(k)}
                    className={cn(
                      "flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}>
                    {l}
                    {k === "invoices" && due > 0 && (
                      <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-medium text-destructive-foreground" aria-label={`${due} follow-ups due`}>{due}</span>
                    )}
                  </button>
                )
              })}
            </nav>
          </div>
        </header>

        <main className="wrap pt-4">
          {tab === "home" && <HomeTab />}
          {tab === "log" && <LogTab />}
          {tab === "summary" && <SummaryTab />}
          {tab === "invoices" && <InvoicesTab />}
          {tab === "services" && <ServicesTab />}
          {tab === "clients" && <ClientsTab />}
          {tab === "expenses" && <ExpensesTab />}
          {tab === "tax" && <TaxTab />}
          {tab === "account" && <AccountTab />}
          {tab === "admin" && admin && <AdminTab />}
        </main>
        <SiteFooter onFeedback={() => setFeedbackOpen(true)} onHome={() => go("home")} />
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
