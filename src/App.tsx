import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { LogOut, MessageSquare, UserRound } from "lucide-react"
import { Toaster } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { followUpsDue, initials, newData, normalize, type Data } from "@/lib/model"
import { connect, type Connection } from "@/lib/store"
import { exportDek, forgetSession, openVault, recallSession, rememberSession, type SaveProblem, type Session, type Vault } from "@/lib/accounts"
import { getConfig, myItems as loadMyItems, recordAccount, type AdminConfig, type InboxItem } from "@/lib/admin"
import { CALENDAR, connectorStatus, gmailStatus, type ConnStatus } from "@/lib/gmail"
import { AppCtx, type AppApi, type AskOptions, type EmailKind, type Tab } from "@/app/ctx"
import { ConfirmDialog, EmailDialog, FeedbackDialog, FollowUpDialog, InvoiceDialog } from "@/app/dialogs"
import { AdminTab, processRequests } from "@/app/AdminTab"
import { AuthScreen } from "@/app/AuthScreen"
import { LogTab } from "@/app/LogTab"
import { SummaryTab } from "@/app/SummaryTab"
import { InvoicesTab } from "@/app/InvoicesTab"
import { ServicesTab } from "@/app/ServicesTab"
import { AccountTab } from "@/app/AccountTab"

const BASE_TABS: [Tab, string][] = [["log", "Log"], ["summary", "Summary"], ["invoices", "Invoices"], ["services", "Services"], ["account", "Account"]]
const PROBLEM_TEXT: Record<SaveProblem, string> = {
  blocked: "Your changes can’t be saved. Ask the page owner for Contributor access.",
  offline: "Couldn’t save just now. Check your connection.",
  full: "Storage is full. Delete some old invoices or entries.",
  failed: "Couldn’t save. Try again.",
}
const LEGACY_DONE = "pst_legacy_offered"

function Splash({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="min-h-screen bg-header">
      <div className="wrap flex min-h-screen flex-col justify-center gap-5 py-10 text-header-fg">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-[11px] border border-white/20 bg-white/10 font-display text-[23px] font-bold">℞</div>
          <h1 className="font-display text-[19px] font-bold text-white">Service Tracker</h1>
        </div>
        <p className="max-w-sm text-[14px]">{message}</p>
        {onRetry && <div><Button className="bg-white text-[hsl(var(--header))] hover:bg-white/90" onClick={onRetry}>Try again</Button></div>}
      </div>
    </div>
  )
}

export default function App() {
  const [conn, setConn] = useState<Connection | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [data, setData] = useState<Data | null>(null)
  const [phase, setPhase] = useState<"connecting" | "auth" | "loading" | "ready" | "error">("connecting")
  const [authNotice, setAuthNotice] = useState("")
  const [blocked, setBlocked] = useState(false)
  const [tab, setTab] = useState<Tab>("log")
  const [invoiceView, setInvoiceView] = useState<{ id: string; justCreated: boolean } | null>(null)
  const [emailReq, setEmailReq] = useState<{ id: string; kind: EmailKind; fromFollowUps: boolean } | null>(null)
  const [followOpen, setFollowOpen] = useState(false)
  const [gmail, setGmail] = useState<ConnStatus>("unavailable")
  const [calendar, setCalendar] = useState<ConnStatus>("unavailable")
  const [cfg, setCfg] = useState<AdminConfig | null>(null)
  const [items, setItems] = useState<InboxItem[]>([])
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const autoSent = useRef(false)
  const startMode = typeof location !== "undefined" && location.hash === "#reset" ? "reset" : "in"
  const [askReq, setAskReq] = useState<AskOptions | null>(null)
  const askResolve = useRef<((v: boolean) => void) | null>(null)
  const dataRef = useRef<Data | null>(null)
  const vaultRef = useRef<Vault | null>(null)
  const shownProblem = useRef<SaveProblem | null>(null)

  const ask = useCallback((o: AskOptions) => new Promise<boolean>((res) => { askResolve.current = res; setAskReq(o) }), [])
  const onProblem = useCallback((p: SaveProblem) => {
    if (p === "blocked") setBlocked(true)
    if (shownProblem.current === "blocked") return
    shownProblem.current = p
    toast.error(PROBLEM_TEXT[p])
    setTimeout(() => { if (shownProblem.current !== "blocked") shownProblem.current = null }, 4000)
  }, [])

  const refreshGmail = useCallback(async () => {
    const st = await gmailStatus(conn?.mcp, conn?.permissions)
    setGmail(st)
    return st
  }, [conn])
  const refreshCalendar = useCallback(async () => {
    const st = await connectorStatus(conn?.mcp, conn?.permissions, CALENDAR)
    setCalendar(st)
    return st
  }, [conn])

  const openSession = useCallback(async (c: Connection, s: Session, isNew: boolean, name: string) => {
    setPhase("loading")
    const vault = openVault(c.kv, s, onProblem)
    vaultRef.current = vault
    let d: Data | null
    try {
      d = await vault.load()
    } catch {
      setPhase("error")
      return
    }
    let created = false
    if (!d) {
      created = true
      d = newData(name)
      d.profile.email = s.email
      // Offer to bring over what the earlier version of the tracker saved for this person
      let offered = false
      try { offered = !!localStorage.getItem(LEGACY_DONE) } catch { /* ignore */ }
      const old = offered ? null : await c.legacy()
      if (old && (old.entries.length || old.invoices.length || old.profile.billToName)) {
        const move = await ask({
          title: "Bring over your earlier data?",
          message: `This device has tracker data saved before accounts were added (${old.entries.length} entries, ${old.invoices.length} invoices). Move it into ${s.email}?`,
          ok: "Move it in",
        })
        try { localStorage.setItem(LEGACY_DONE, "1") } catch { /* ignore */ }
        if (move) {
          d = normalize({ ...old, profile: { ...old.profile, fullName: old.profile.fullName || name, email: old.profile.email || s.email } })
        }
      }
      await vault.save(d)
    }
    dataRef.current = d
    setData(d)
    setSession(s)
    setBlocked(false)
    // Tell the admin's directory this account exists (name, email, recovery key) — never the password
    if (c.uid) {
      const config = await getConfig(c.kv)
      setCfg(config)
      recordAccount(c.kv, c.uid, s.id, { name: d.profile.fullName || name, email: s.email, ...(created ? { created: new Date().toISOString() } : {}) }, await exportDek(s), config).catch(() => {})
    }
    setTab(created && isNew ? "account" : "log")
    setPhase("ready")
    if (created && isNew) toast("Account created. Add your invoice details to get started.")
    if (followUpsDue(d).length) setTimeout(() => setFollowOpen(true), 400)
  }, [ask, onProblem])

  const start = useCallback(async () => {
    setPhase("connecting")
    try {
      const c = conn ?? (await connect())
      setConn(c)
      getConfig(c.kv).then(setCfg)
      const s = await recallSession()
      if (s) await openSession(c, s, false, "")
      else setPhase("auth")
    } catch {
      setPhase("error")
    }
  }, [conn, openSession])

  useEffect(() => {
    start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const refreshItems = useCallback(async () => {
    if (!conn?.uid) return
    const list = await loadMyItems(conn.kv, conn.uid).catch(() => [] as InboxItem[])
    setItems(list)
    // Emails the admin has sent for this account: mark those invoices as emailed
    const sent = list.filter((i): i is Extract<InboxItem, { type: "email" }> => i.type === "email" && i.kind === "invoice" && i.status === "done" && i.acctId === session?.id)
    const missing = sent.filter((i) => dataRef.current?.invoices.some((v) => v.id === i.invoiceId && !v.sentAt))
    if (missing.length && dataRef.current && vaultRef.current) {
      const next = structuredClone(dataRef.current)
      for (const m of missing) { const v = next.invoices.find((x) => x.id === m.invoiceId); if (v) v.sentAt = m.doneAt || m.at }
      dataRef.current = next
      setData(next)
      vaultRef.current.save(next)
    }
  }, [conn, session])
  useEffect(() => {
    if (phase !== "ready") return
    refreshGmail()
    refreshCalendar()
    refreshItems()
  }, [phase, refreshGmail, refreshCalendar, refreshItems])
  // The owner can have waiting emails sent automatically when they open the tracker
  useEffect(() => {
    if (phase !== "ready" || !conn?.isOwner || !cfg?.autoSend || gmail !== "ready" || autoSent.current) return
    autoSent.current = true
    processRequests(conn, cfg).then((r) => { if (r.done || r.failed) toast(`Sent ${r.done} waiting email${r.done === 1 ? "" : "s"}${r.failed ? `, ${r.failed} couldn’t be sent` : ""}`) }).catch(() => {})
  }, [phase, conn, cfg, gmail])

  // Pick up changes made on another device when the page comes back into view.
  useEffect(() => {
    if (phase !== "ready" || conn?.kv.kind !== "cloud") return
    const onVis = async () => {
      if (document.visibilityState !== "visible" || document.querySelector("[role=dialog]") || !vaultRef.current) return
      try {
        const d = await vaultRef.current.refresh()
        if (d) {
          dataRef.current = d
          setData(d)
          toast("Updated with changes from another device")
        }
      } catch { /* keep what's on screen */ }
    }
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [phase, conn])

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
  const leave = useCallback((notice: string) => {
    forgetSession()
    vaultRef.current = null
    dataRef.current = null
    setData(null)
    setSession(null)
    setInvoiceView(null); setEmailReq(null); setFollowOpen(false); setFeedbackOpen(false); setItems([])
    setAuthNotice(notice)
    setPhase("auth")
  }, [])

  const api = useMemo<AppApi | null>(() => {
    if (!data || !conn || !session) return null
    return {
      data, conn, session, commit, replaceAll, ask, go,
      canSave: !blocked,
      gmail, refreshGmail, calendar, refreshCalendar, cfg, setCfg,
      myItems: items, refreshItems,
      openFeedback: () => setFeedbackOpen(true),
      viewInvoice: (id, justCreated = false) => setInvoiceView({ id, justCreated }),
      email: (id, kind) => { setInvoiceView(null); setEmailReq({ id, kind, fromFollowUps: false }) },
      showFollowUps: () => setFollowOpen(true),
      logOut: () => leave("You’ve logged out."),
      accountDeleted: () => leave("Your account was deleted."),
    }
  }, [data, conn, session, commit, replaceAll, ask, go, blocked, gmail, refreshGmail, calendar, refreshCalendar, cfg, items, refreshItems, leave])

  const confirm = <ConfirmDialog req={askReq} onDone={(ok) => { askResolve.current?.(ok); askResolve.current = null; setAskReq(null) }} />
  const toaster = <Toaster position="bottom-center" toastOptions={{ style: { fontFamily: "Figtree, system-ui, sans-serif" } }} />

  if (phase === "error") return <><Splash message="Your tracker can’t be reached right now. Check your connection and try again." onRetry={start} />{toaster}</>
  if (phase === "auth" && conn)
    return (
      <>
        <AuthScreen
          kv={conn.kv}
          viewer={conn.uid}
          cfg={cfg}
          startMode={startMode}
          notice={authNotice}
          onSignedIn={async (s, keep, isNew, name) => { setAuthNotice(""); await rememberSession(s, keep); await openSession(conn, s, isNew, name) }}
        />
        {confirm}
        {toaster}
      </>
    )
  if (phase !== "ready" || !api || !data || !session) return <><Splash message={phase === "loading" ? "Unlocking your tracker…" : "Opening the tracker…"} />{confirm}</>

  const name = data.profile.fullName || session.email
  const due = followUpsDue(data).length
  const TABS: [Tab, string][] = conn?.isOwner && conn.kv.kind === "cloud" ? [...BASE_TABS, ["admin", "Admin"]] : BASE_TABS

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
                <DropdownMenuTrigger
                  aria-label="Account menu"
                  className="flex size-[38px] flex-none items-center justify-center rounded-full bg-white text-[13.5px] font-bold text-[hsl(var(--header))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  {initials(data.profile.fullName || session.email)}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="font-normal">
                    <div className="truncate text-sm font-semibold">{name}</div>
                    <div className="truncate text-xs text-muted-foreground">{session.email}</div>
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
                <button
                  key={k}
                  type="button"
                  aria-current={tab === k ? "page" : undefined}
                  onClick={() => go(k)}
                  className={cn(
                    "flex flex-[1_0_auto] items-center justify-center gap-1.5 rounded-[9px] px-3 py-2 text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                    tab === k ? "bg-white text-[hsl(var(--header))]" : "bg-white/10 text-header-muted hover:bg-white/20",
                  )}
                >
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
          {blocked && (
            <div className="mb-4 rounded-[9px] bg-warn-tint px-3.5 py-3 text-[13px] text-warn">
              You’re using this tracker without permission to save. Ask the person who shared it for Contributor access.
            </div>
          )}
          {tab === "log" && <LogTab />}
          {tab === "summary" && <SummaryTab />}
          {tab === "invoices" && <InvoicesTab />}
          {tab === "services" && <ServicesTab />}
          {tab === "account" && <AccountTab />}
          {tab === "admin" && conn?.isOwner && <AdminTab />}
        </main>
      </div>

      <InvoiceDialog id={invoiceView?.id ?? null} justCreated={!!invoiceView?.justCreated} onClose={() => setInvoiceView(null)} />
      <EmailDialog
        req={emailReq}
        onClose={() => setEmailReq(null)}
        onBack={emailReq?.fromFollowUps ? () => { setEmailReq(null); setFollowOpen(true) } : undefined}
      />
      <FollowUpDialog
        open={followOpen}
        onClose={() => setFollowOpen(false)}
        onFollowUp={(id) => { setFollowOpen(false); setEmailReq({ id, kind: "followup", fromFollowUps: true }) }}
        onView={() => { setFollowOpen(false); go("invoices") }}
      />
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      {confirm}
      {toaster}
    </AppCtx.Provider>
  )
}
