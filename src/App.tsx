import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { onAuthStateChanged, signOut, type User } from "firebase/auth"
import { CalendarDays, Calculator, ChartPie, Ellipsis, FileText, House, LogOut, MessageSquare, NotebookPen, Receipt, Settings as SettingsIcon, ShieldCheck, Store, Monitor, Moon, Sun, UserRound } from "lucide-react"
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
import { AppCtx, type AppApi, type AskOptions, type EmailKind, type LogMode, type Me, type Tab } from "@/app/ctx"
import { ConfirmDialog, EmailDialog, FeedbackDialog, FollowUpDialog, InvoiceDialog } from "@/app/dialogs"
import { AuthScreen } from "@/app/AuthScreen"
import { setErrorPage } from "@/lib/errors"
import { BRAND, CONTACT_EMAIL, PRIVACY_URL, TAGLINE, Wordmark } from "@/app/brand"
import { LogTab } from "@/app/LogTab"
import { HomeTab } from "@/app/HomeTab"
import { Welcome } from "@/app/Welcome"
import { InvoicesTab } from "@/app/InvoicesTab"

// Less-used sections load when first opened, keeping the first download small
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, k: K) => lazy(() => load().then((m) => ({ default: m[k] })))
const SummaryTab = named(() => import("@/app/SummaryTab"), "SummaryTab")
const ServicesTab = named(() => import("@/app/ServicesTab"), "ServicesTab")
const AccountTab = named(() => import("@/app/AccountTab"), "AccountTab")
const ClientsTab = named(() => import("@/app/ClientsTab"), "ClientsTab")
const ExpensesTab = named(() => import("@/app/ExpensesTab"), "ExpensesTab")
const TaxTab = named(() => import("@/app/TaxTab"), "TaxTab")
const BudgetTab = named(() => import("@/app/BudgetTab"), "BudgetTab")
const ShiftsTab = named(() => import("@/app/ShiftsTab"), "ShiftsTab")
const AdminTab = named(() => import("@/app/AdminTab"), "AdminTab")

const BASE_TABS: [Tab, string][] = [["home", "Home"], ["shifts", "Shifts"], ["log", "Log"], ["invoices", "Invoices"], ["expenses", "Expenses"], ["tax", "Tax"], ["budget", "Accounting"], ["clients", "Pharmacies"], ["account", "Settings"]]
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
        <a className={link} href={PRIVACY_URL} target="_blank" rel="noopener">Privacy & disclaimer</a>
        <a className={link} href={`${import.meta.env.BASE_URL}changelog.html`} target="_blank" rel="noopener">What’s new</a>
        <button type="button" className={link} onClick={onFeedback}>Send feedback</button>
        <a className={link} href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
      </nav>
    </footer>
  )
}

/** Phones: the four most-used sections and "More" in a bar at the bottom, within thumb reach. */
const MAIN_TABS: [Tab, string, React.ReactNode][] = [["home", "Home", <House />], ["shifts", "Shifts", <CalendarDays />], ["log", "Log", <NotebookPen />], ["invoices", "Invoices", <FileText />]]
function BottomNav({ tab, go, due, admin }: { tab: Tab; go: (t: Tab) => void; due: number; admin: boolean }) {
  const more: [Tab, string, React.ReactNode][] = [["expenses", "Expenses", <Receipt />], ["tax", "Tax", <Calculator />], ["budget", "Accounting", <ChartPie />], ["clients", "Pharmacies", <Store />], ["account", "Settings", <SettingsIcon />], ...(admin ? [["admin", "Admin", <ShieldCheck />] as [Tab, string, React.ReactNode]] : [])]
  const inMore = more.some(([k]) => k === tab)
  const item = "relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-[22px]"
  return (
    <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 px-2 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 sm:hidden">
      <div className="mx-auto flex max-w-md gap-1">
        {MAIN_TABS.map(([k, l, icon]) => (
          <button key={k} type="button" aria-current={tab === k ? "page" : undefined} onClick={() => go(k)} className={cn(item, tab === k ? "text-foreground" : "text-muted-foreground")}>
            <span className={cn("flex h-8 w-14 items-center justify-center rounded-full", tab === k && "bg-secondary")}>{icon}</span>
            {l}
            {k === "invoices" && due > 0 && <span className="absolute right-[calc(50%-22px)] top-1 inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground" aria-label={`${due} follow-ups due`}>{due}</span>}
          </button>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="More sections" className={cn(item, inMore ? "text-foreground" : "text-muted-foreground")}>
            <span className={cn("flex h-8 w-14 items-center justify-center rounded-full", inMore && "bg-secondary")}><Ellipsis /></span>
            {inMore ? more.find(([k]) => k === tab)?.[1] : "More"}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" sideOffset={10} className="w-52 rounded-xl">
            {more.map(([k, l, icon]) => (
              <DropdownMenuItem key={k} onSelect={() => go(k)} className={cn("gap-3 py-2.5 text-[14px]", tab === k && "bg-secondary")}>{icon}{l}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
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
  const [tab, setTab] = useState<Tab>("home")
  const [logMode, setLogMode] = useState<LogMode>("service")
  const [welcome, setWelcome] = useState(false)
  useEffect(() => { setErrorPage(tab) }, [tab])
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
  const [adminNeedsGoogle, setAdminNeedsGoogle] = useState(false)
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [outbox, setOutbox] = useState<OutboxItem[]>([])
  const [askReq, setAskReq] = useState<AskOptions | null>(null)
  const askResolve = useRef<((v: boolean) => void) | null>(null)
  const dataRef = useRef<Data | null>(null)
  const vaultRef = useRef<Vault | null>(null)
  const unwatch = useRef<(() => void) | null>(null)
  const lastProblem = useRef(0)

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
    }
    // Saves a new tracker, and keeps any one-off upgrades from loading (only changed parts are written).
    // Not awaited: with weak or no signal the save waits for the server, and the tracker should open anyway.
    vault.save(d).catch(() => {})
    dataRef.current = d
    setData(d)
    setMe(m)
    setTab("home")
    setWelcome(isNew)
    setPhase("ready")
    if (followUpsDue(d).length) setTimeout(() => setFollowOpen(true), 400)
    recordPerson(u.uid, { name: d.profile.fullName || m.name, email: m.email, isNew }).catch(() => {})
    unwatch.current?.()
    unwatch.current = vault.watch((next) => {
      dataRef.current = next
      setData(next)
    })
    // Admin only counts after logging in with Google (the database rules check the same thing)
    Promise.all([checkAdmin(u.uid), u.getIdTokenResult().then((t) => t.signInProvider).catch(() => null)]).then(([has, via]) => {
      setAdmin(has && via === "google.com")
      setAdminNeedsGoogle(has && via !== "google.com")
    })
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
        setAdminNeedsGoogle(false)
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
  // Fetch the other sections in the background once the tracker is open, so they still open with no signal later
  useEffect(() => {
    if (phase !== "ready") return
    const t = setTimeout(() => {
      for (const load of [() => import("@/app/SummaryTab"), () => import("@/app/AccountTab"), () => import("@/app/ClientsTab"), () => import("@/app/ExpensesTab"), () => import("@/app/TaxTab"), () => import("@/app/BudgetTab"), () => import("@/app/ShiftsTab"), () => import("@/app/ServicesTab"), () => import("@/lib/pdf")]) load().catch(() => {})
    }, 2500)
    return () => clearTimeout(t)
  }, [phase])
  const commit = useCallback<AppApi["commit"]>((fn, message, opts) => {
    if (!dataRef.current || !vaultRef.current) return
    const prev = dataRef.current
    const next = structuredClone(prev)
    fn(next)
    dataRef.current = next
    setData(next)
    vaultRef.current.save(next)
    if (!opts?.undo) {
      if (message) toast(message)
      return
    }
    // Deletions: offer Undo for a few seconds, then finish anything that can't be reversed
    let undone = false
    const expire = setTimeout(() => { if (!undone) opts.onExpire?.() }, 8000)
    toast(message || "Deleted", {
      duration: 7000,
      action: {
        label: "Undo",
        onClick: () => {
          // Only put things back if nothing else has changed since, so later edits are never lost
          if (dataRef.current !== next || !vaultRef.current) return void toast("Can’t undo now: something else has changed since.")
          undone = true
          clearTimeout(expire)
          dataRef.current = prev
          setData(prev)
          vaultRef.current.save(prev)
          toast("Undone ✓")
        },
      },
    })
  }, [])
  const replaceAll = useCallback<AppApi["replaceAll"]>((d, message) => {
    if (!vaultRef.current) return
    dataRef.current = d
    setData(d)
    vaultRef.current.save(d)
    if (message) toast(message)
  }, [])
  const go = useCallback((t: Tab, mode: LogMode = "service") => { setWelcome(false); setLogMode(mode); setTab(t); setClientView(null); window.scrollTo({ top: 0 }) }, [])
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
      data, me, commit, replaceAll, ask, go, google, connect, isAdmin: admin, adminNeedsGoogle, settings, setSettings, outbox, refreshOutbox, theme, setTheme, logMode,
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
  }, [data, me, commit, replaceAll, ask, go, google, connect, admin, settings, outbox, refreshOutbox, leave, clientView, theme, setTheme, logMode, adminNeedsGoogle])

  const confirm = <ConfirmDialog req={askReq} onDone={(ok) => { askResolve.current?.(ok); askResolve.current = null; setAskReq(null) }} />
  const toaster = <Toaster theme={resolvedTheme} position="bottom-center" mobileOffset={{ bottom: "calc(84px + env(safe-area-inset-bottom))" }} toastOptions={{ style: { fontFamily: "Inter, system-ui, sans-serif", borderRadius: 14 } }} />

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
      <div className="min-h-screen pb-28 sm:pb-12">
        <header className="sticky top-[env(safe-area-inset-top,0px)] z-40 bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
          <div className="wrap">
            <div className="flex items-center justify-between gap-3 pb-3 pt-4">
              <button type="button" onClick={() => go("home")} className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Wordmark tagline as="h1" />
                <span className="sr-only">(home)</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger className="flex min-w-0 items-center gap-2 rounded-full py-1 pl-3.5 pr-1 text-[13.5px] text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="hidden max-w-[180px] truncate sm:inline">{name}</span>
                  <span className="flex size-8 flex-none items-center justify-center rounded-full bg-secondary text-[12.5px] font-medium text-foreground">{initials(name)}</span>
                  <span className="sr-only">account menu</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 rounded-xl">
                  <DropdownMenuLabel className="font-normal">
                    <div className="truncate text-sm font-medium">{name}</div>
                    <div className="truncate text-xs text-muted-foreground">{me.email}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => go("home")}><House /> Home</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => go("account")}><UserRound /> Settings</DropdownMenuItem>
                  {admin && <DropdownMenuItem onSelect={() => go("admin")}><ShieldCheck /> Admin</DropdownMenuItem>}
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
            <nav className="-mx-1 hidden flex-wrap gap-1 px-1 pb-3 sm:flex" aria-label="Sections">
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
          <Suspense fallback={<p className="py-10 text-center text-[13px] text-muted-foreground">Loading…</p>}>
          {welcome ? <Welcome onDone={() => { setWelcome(false); go("home") }} /> : <>
          {tab === "home" && <HomeTab />}
          {tab === "shifts" && <ShiftsTab />}
          {tab === "log" && <LogTab />}
          {tab === "summary" && <SummaryTab />}
          {tab === "invoices" && <InvoicesTab />}
          {tab === "services" && <ServicesTab />}
          {tab === "clients" && <ClientsTab />}
          {tab === "expenses" && <ExpensesTab />}
          {tab === "tax" && <TaxTab />}
          {tab === "budget" && <BudgetTab />}
          {tab === "account" && <AccountTab />}
          {tab === "admin" && admin && <AdminTab />}
          </>}
          </Suspense>
        </main>
        <SiteFooter onFeedback={() => setFeedbackOpen(true)} onHome={() => go("home")} />
      </div>
      <BottomNav tab={SECTION[tab] ?? tab} go={go} due={due} admin={admin} />

      <InvoiceDialog id={invoiceView?.id ?? null} justCreated={!!invoiceView?.justCreated} onClose={() => setInvoiceView(null)} />
      <EmailDialog req={emailReq} onClose={() => setEmailReq(null)} onBack={emailReq?.fromFollowUps ? () => { setEmailReq(null); setFollowOpen(true) } : undefined} />
      <FollowUpDialog open={followOpen} onClose={() => setFollowOpen(false)} onFollowUp={(id) => { setFollowOpen(false); setEmailReq({ id, kind: "followup", fromFollowUps: true }) }} onView={() => { setFollowOpen(false); go("invoices") }} />
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      {confirm}
      {toaster}
    </AppCtx.Provider>
  )
}
