import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import { CalendarDays, LogOut, Mail, MessageSquare } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  entryAmt, invStatus, nextNumber, normalize, plural, today, uid, FOLLOW_UP_DAYS, FOLLOW_UP_REPEAT, TERMS_OPTIONS,
  type Data, type Entry, type Profile, type Terms,
} from "@/lib/model"
import { saveFile } from "@/lib/store"
import { AuthError, changePassword, deleteAccount } from "@/lib/accounts"
import { allowConnector, allowGmail, CALENDAR, GMAIL_HELP, type ConnStatus } from "@/lib/gmail"
import { forgetAccount } from "@/lib/admin"
import { useApp } from "./ctx"
import { AreaField, Callout, Field, Panel, Pill } from "./bits"

const STATUS_LABEL = { paid: "Paid", unpaid: "Unpaid", overdue: "Overdue" }

export function AccountTab() {
  const { data, commit, conn, session, canSave, ask, replaceAll, logOut, accountDeleted, gmail, refreshGmail, calendar, refreshCalendar, cfg, openFeedback } = useApp()
  const p = data.profile
  const cloud = conn.kv.kind === "cloud"
  const canDownload = !!conn.downloads || !window.claude
  const restoreRef = useRef<HTMLInputElement>(null)
  const combineRef = useRef<HTMLInputElement>(null)

  const set = (k: keyof Profile, v: string | number) => {
    if (p[k] === v) return
    commit((d) => void ((d.profile as Record<string, unknown>)[k] = v), "Saved ✓")
  }
  const text = (k: keyof Profile, label: string, o: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {}) => (
    <Field key={k + String(p[k])} id={"p-" + k} label={label} defaultValue={String(p[k] ?? "")} onBlur={(e) => set(k, e.target.value.trim())} {...o} />
  )
  const area = (k: keyof Profile, label: string) => (
    <AreaField key={k + String(p[k])} id={"p-" + k} label={label} className="sm:col-span-2" defaultValue={String(p[k] ?? "")} onBlur={(e) => set(k, e.target.value.trim())} />
  )
  const choose = <T extends string | number>(k: keyof Profile, label: string, options: [T, string][]) => (
    <div className="grid gap-1.5">
      <Label htmlFor={"p-" + k} className="text-xs font-semibold text-muted-foreground">{label}</Label>
      <Select value={String(p[k])} onValueChange={(v) => set(k, typeof options[0][0] === "number" ? Number(v) : v)}>
        <SelectTrigger id={"p-" + k} className="h-10 bg-field text-[14.5px] shadow-none"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([v, l]) => <SelectItem key={String(v)} value={String(v)}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  )
  const name = p.fullName || session.email
  const tag = (p.fullName || session.email.split("@")[0] || "user").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

  /* ---------- password ---------- */
  const [pwCur, setPwCur] = useState("")
  const [pwNew, setPwNew] = useState("")
  const [pwNew2, setPwNew2] = useState("")
  const [pwBusy, setPwBusy] = useState(false)
  async function updatePassword(e: React.FormEvent) {
    e.preventDefault()
    if (pwNew.length < 8) return toast.error("Use a new password of at least 8 characters.")
    if (pwNew !== pwNew2) return toast.error("The new passwords don’t match.")
    setPwBusy(true)
    try {
      await changePassword(conn.kv, session, pwCur, pwNew)
      setPwCur(""); setPwNew(""); setPwNew2("")
      toast.success("Password changed ✓")
    } catch (x) {
      toast.error(x instanceof AuthError && x.code === "wrong_password" ? "Your current password isn’t right." : "The password couldn’t be changed. Check your connection.")
    } finally {
      setPwBusy(false)
    }
  }

  /* ---------- Gmail ---------- */
  const [gmailBusy, setGmailBusy] = useState(false)
  useEffect(() => {
    refreshGmail()
    refreshCalendar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [calBusy, setCalBusy] = useState(false)
  async function connectCalendar() {
    setCalBusy(true)
    const ok = await allowConnector(conn.permissions, CALENDAR)
    const st = await refreshCalendar()
    setCalBusy(false)
    if (!ok) toast.error(GMAIL_HELP.denied)
    else if (st === "ready") toast.success("Google Calendar is ready. New invoices will add their payment date.")
    else toast(GMAIL_HELP[st])
  }
  async function connectGmail() {
    setGmailBusy(true)
    const ok = await allowGmail(conn.permissions)
    const st = await refreshGmail()
    setGmailBusy(false)
    if (!ok) toast.error(GMAIL_HELP.denied)
    else if (st === "ready") toast.success("Gmail is ready. Invoices and follow-ups can now go to your Gmail drafts.")
    else toast(GMAIL_HELP[st])
  }

  /* ---------- files ---------- */
  async function offer(fname: string, blob: Blob, ok: string) {
    const r = await saveFile(conn, fname, blob)
    if (r === "saved") toast.success(ok)
    else if (r === "failed") toast.error("That file couldn’t be saved here.")
  }
  function backup() {
    offer(`pharmacy-tracker-${tag}-${today()}.json`, new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "Back-up saved ✓")
  }
  function excel() {
    if (!data.entries.length && !data.invoices.length) return toast("Nothing to export yet.")
    const svc = (id: string) => data.services.find((s) => s.id === id)?.name ?? ""
    const log = [...data.entries].sort((a, b) => b.date.localeCompare(a.date)).map((e) => ({
      Date: e.date, Service: svc(e.serviceId), Qty: Number(e.qty) || 0, Fee: Number(e.fee) || 0, Amount: entryAmt(e),
      Description: e.desc || "", "Logged by": name, Invoice: data.invoices.find((i) => i.id === e.invoiceId)?.number ?? (e.invoiced ? "Yes" : ""),
    }))
    const sums: Record<string, { Qty: number; Amount: number }> = {}
    for (const e of data.entries) {
      const k = svc(e.serviceId) || "—"
      sums[k] ??= { Qty: 0, Amount: 0 }
      sums[k].Qty += Number(e.qty) || 0
      sums[k].Amount += entryAmt(e)
    }
    const summary = Object.entries(sums).map(([Service, v]) => ({ Service, ...v }))
    summary.push({ Service: "TOTAL", Qty: summary.reduce((a, r) => a + r.Qty, 0), Amount: summary.reduce((a, r) => a + r.Amount, 0) })
    const invs = [...data.invoices].sort((a, b) => b.issued.localeCompare(a.issued)).map((i) => ({
      Invoice: i.number, Issued: i.issued, Due: i.due, "Billed to": i.to.name || "", Period: i.period, Total: Number(i.total) || 0,
      Status: STATUS_LABEL[invStatus(i)], "Emailed on": i.sentAt ? i.sentAt.slice(0, 10) : "", "Paid on": i.paidDate || "", "Follow-ups sent": i.reminders.length,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(log), "Log")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary")
    if (invs.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invs), "Invoices")
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" })
    offer(`pharmacy-services-${tag}-${today()}.xlsx`, new Blob([out]), "Excel file saved ✓")
  }
  async function restore(file: File) {
    try {
      const raw = JSON.parse(await file.text())
      if (!raw || !Array.isArray(raw.services) || !Array.isArray(raw.entries)) throw new Error("not a back-up")
      const ok = await ask({ title: "Restore back-up?", message: "This replaces everything currently in your tracker with the back-up file.", ok: "Restore", danger: true })
      if (!ok) return
      if (!raw.profile) raw.profile = p
      replaceAll(normalize(raw), "Restored ✓")
    } catch {
      toast.error("That file couldn’t be read as a back-up.")
    }
  }
  async function combine(files: File[]) {
    let added = 0, bad = 0
    const incoming: { r: Entry; name: string }[] = []
    for (const f of files) {
      try {
        const raw = JSON.parse(await f.text())
        const names: Record<string, string> = {}
        for (const s of raw.services || []) names[s.id] = s.name
        for (const e of raw.entries || (Array.isArray(raw) ? raw : [])) incoming.push({ r: e, name: e.serviceName || names[e.serviceId] || "(unknown)" })
      } catch {
        bad++
      }
    }
    commit((d: Data) => {
      const ids = new Set(d.entries.map((e) => e.id))
      for (const { r, name: svcName } of incoming) {
        if (r.id && ids.has(r.id)) continue
        let s = d.services.find((x) => x.name.toLowerCase() === svcName.toLowerCase())
        if (!s) d.services.push((s = { id: uid(), name: svcName, fee: Number(r.fee) || 0 }))
        d.entries.push({ id: r.id || uid(), serviceId: s.id, date: r.date, qty: Number(r.qty) || 1, fee: Number(r.fee) || 0, desc: r.desc || "", invoiced: false, hours: r.hours || undefined })
        if (r.id) ids.add(r.id)
        added++
      }
    }, `Combined ${plural(files.length, "file")}: ${plural(added, "new entry", "new entries")}${bad ? ` · ${bad} not read` : ""}`)
  }
  async function removeAccount() {
    const ok = await ask({
      title: "Delete account",
      message: `This permanently deletes the account ${session.email} and all its entries, invoices and details${cloud ? ", on every device" : ""}.`,
      ok: "Delete account",
      danger: true,
      typeToConfirm: "DELETE",
    })
    if (!ok) return
    try {
      await deleteAccount(conn.kv, session)
      if (conn.uid) await forgetAccount(conn.kv, conn.uid, session.id).catch(() => {})
      accountDeleted()
    } catch {
      toast.error("The account couldn’t be deleted. Check your connection and try again.")
    }
  }

  const tone = (s: ConnStatus) => (s === "ready" ? "done" : s === "unavailable" ? "pending" : "overdue")
  const label = (s: ConnStatus) => ({ ready: "Connected", not_connected: "Not connected", needs_reauth: "Reconnect needed", denied: "Turned off", unavailable: "Unavailable" })[s]
  const gmailTone = tone(gmail), gmailLabel = label(gmail)
  const relay = !!cfg?.relay && !!conn.uid && !conn.isOwner

  return (
    <div className="grid gap-4">
      <Panel title="Logged in" aside={cloud ? (canSave ? "saved online" : "changes not saving") : "saved in this browser"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">{name}</div>
            <div className="truncate text-[12.5px] text-muted-foreground">{session.email}</div>
          </div>
          <Button variant="outline" onClick={logOut}><LogOut /> Log out</Button>
        </div>
        <p className="mt-2 max-w-[62ch] text-[12.5px] text-muted-foreground">
          Log out to switch to a different account. {cloud ? "Your data is locked with your password and saved online, so you can log in from any device that opens this page." : ""}
        </p>
        {!canSave && <div className="mt-3"><Callout>Your changes can’t be saved because you only have view access to this page. Ask the person who shared it for Contributor access.</Callout></div>}
      </Panel>

      <Panel title="Email" aside={<Pill tone={gmailTone}>{gmailLabel}</Pill>}>
        <div className="grid gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-[56ch] text-[13px] text-muted-foreground">
              Connect Gmail to put invoice emails and follow-ups straight into your Gmail drafts, ready to send.
              {gmail !== "ready" && gmail !== "unavailable" && <> {GMAIL_HELP[gmail]}</>}
              {gmail === "unavailable" && <> {GMAIL_HELP.unavailable} You can still copy each email and paste it.</>}
            </p>
            {gmail !== "unavailable" && (
              <Button variant={gmail === "ready" ? "outline" : "default"} disabled={gmailBusy} onClick={gmail === "denied" ? () => conn.permissions?.manage().then(refreshGmail).catch(() => toast(GMAIL_HELP.denied)) : connectGmail}>
                <Mail /> {gmail === "ready" ? "Check connection" : gmail === "denied" ? "Open permissions" : "Connect Gmail"}
              </Button>
            )}
          </div>
          {relay && (
            <div className="grid gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Send invoice and follow-up emails from</span>
              <div role="radiogroup" aria-label="Send emails from" className="grid gap-2 sm:grid-cols-2">
                {([["mine", "My own Gmail", "Sent straight away, from your address."], ["admin", `${cfg?.adminName || "The admin"}’s email`, "Queued and sent from their Gmail."]] as const).map(([v, t, d]) => (
                  <button key={v} type="button" role="radio" aria-checked={p.sendVia === v} onClick={() => set("sendVia", v)}
                    className={`rounded-[10px] border px-3.5 py-2.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${p.sendVia === v ? "border-primary bg-accent" : "bg-field"}`}>
                    <span className="block font-semibold">{t}</span>
                    <span className="text-[12px] text-muted-foreground">{d}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {choose("followUpDays", "First follow-up", FOLLOW_UP_DAYS)}
            {choose("followUpRepeat", "Then, while still unpaid", FOLLOW_UP_REPEAT)}
          </div>
          <p className="text-[12.5px] text-muted-foreground">When you open the tracker and a follow-up is due, it shows the invoices with the follow-up email ready to send.</p>
        </div>
      </Panel>

      <Panel title="Calendar" aside={<Pill tone={tone(calendar)}>{label(calendar)}</Pill>}>
        <div className="grid gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-[56ch] text-[13px] text-muted-foreground">
              Put each invoice’s expected payment date in your Google Calendar, so you know when money should arrive.
              {calendar !== "ready" && calendar !== "unavailable" && <> {GMAIL_HELP[calendar]} Until then, each invoice has an “Add to Google Calendar” link.</>}
            </p>
            {calendar !== "unavailable" && calendar !== "ready" && (
              <Button disabled={calBusy} onClick={calendar === "denied" ? () => conn.permissions?.manage().then(refreshCalendar).catch(() => toast(GMAIL_HELP.denied)) : connectCalendar}>
                <CalendarDays /> {calendar === "denied" ? "Open permissions" : "Connect Google Calendar"}
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="p-calendar" className="text-[13px]">Add the payment date automatically when I create an invoice</label>
            <Switch id="p-calendar" checked={!!p.calendar} onCheckedChange={(v) => commit((d) => void (d.profile.calendar = v), "Saved ✓")} />
          </div>
        </div>
      </Panel>

      <Panel title="Invoice details" aside="saved when you leave a box · used on every new invoice">
        <div className="grid gap-5">
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">From (you)</legend>
            {text("fullName", "Full name", { autoComplete: "name" })}
            {text("tradingName", "Trading / business name (optional)", { autoComplete: "organization" })}
            {text("email", "Email shown on invoices", { type: "email", autoComplete: "email" })}
            {text("phone", "Phone", { type: "tel", autoComplete: "tel" })}
            {text("gphc", "GPhC registration no. (optional)")}
            {area("address", "Address")}
          </fieldset>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Bill to (pharmacy)</legend>
            {text("billToName", "Pharmacy / company name", { placeholder: "e.g. High St Pharmacy" })}
            {text("billToEmail", "Accounts email (invoices go here)", { type: "email", placeholder: "accounts@pharmacy.co.uk" })}
            {area("billToAddress", "Pharmacy address")}
          </fieldset>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Getting paid</legend>
            {text("accountName", "Account name")}
            {text("bankName", "Bank (optional)")}
            {text("sortCode", "Sort code", { placeholder: "00-00-00", inputMode: "numeric" })}
            {text("accountNumber", "Account number", { placeholder: "12345678", inputMode: "numeric" })}
            {choose<Terms>("terms", "Payment terms", TERMS_OPTIONS)}
            <div className="grid grid-cols-2 gap-2">
              {text("prefix", "Invoice prefix", { onBlur: (e) => set("prefix", e.target.value.trim() || "INV") })}
              {text("nextNo", "Next number", { type: "number", min: 1, step: 1, onBlur: (e) => set("nextNo", Math.max(1, parseInt(e.target.value) || 1)) })}
            </div>
          </fieldset>
          <p className="text-[12.5px] text-muted-foreground">Next invoice will be <b className="text-foreground">{nextNumber(p)}</b>. Invoices you’ve already created keep the details they were made with.</p>
        </div>
      </Panel>

      <Panel title="Change password">
        <form onSubmit={updatePassword} className="grid gap-3">
          <input type="email" autoComplete="username" value={session.email} readOnly hidden />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="pw-cur" label="Current password" type="password" autoComplete="current-password" value={pwCur} onChange={(e) => setPwCur(e.target.value)} />
            <Field id="pw-new" label="New password" type="password" autoComplete="new-password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} />
            <Field id="pw-new2" label="Confirm new password" type="password" autoComplete="new-password" value={pwNew2} onChange={(e) => setPwNew2(e.target.value)} />
          </div>
          <div><Button type="submit" variant="outline" disabled={pwBusy || !pwCur || !pwNew}>{pwBusy ? "Changing…" : "Change password"}</Button></div>
        </form>
      </Panel>

      <Panel title="Your data">
        <p className="mb-3 max-w-[62ch] text-[13px] text-muted-foreground">
          {cloud ? "Your data is saved online. A back-up file is an extra copy you keep yourself, and the only way back in if you forget your password." : "Back up regularly: if this browser’s storage is cleared, a back-up file brings everything back."}{" "}
          Combine merges daily back-up files into this account without counting an entry twice.
        </p>
        <div className="flex flex-wrap gap-2">
          {canDownload && <Button onClick={excel}>Export to Excel</Button>}
          {canDownload && <Button variant="outline" onClick={backup}>Back up to file</Button>}
          <Button variant="outline" onClick={() => restoreRef.current?.click()}>Restore from file</Button>
          <Button variant="outline" onClick={() => combineRef.current?.click()}>Combine back-ups</Button>
          <input ref={restoreRef} id="restore-input" type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = "" }} />
          <input ref={combineRef} id="combine-input" type="file" accept="application/json,.json" multiple hidden onChange={(e) => { const fs = [...(e.target.files || [])]; if (fs.length) combine(fs); e.target.value = "" }} />
        </div>
        {!canDownload && <p className="mt-2.5 text-[12.5px] text-muted-foreground">File downloads aren’t allowed on this page, so Excel export and back-ups are unavailable.</p>}
      </Panel>

      <Panel title="Feedback">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-[56ch] text-[13px] text-muted-foreground">Tell {cfg?.adminName || "the person who runs this tracker"} what’s working, what isn’t, or what you’d like added.</p>
          <Button variant="outline" onClick={openFeedback}><MessageSquare /> Send feedback</Button>
        </div>
      </Panel>

      <Panel title="Delete account">
        <p className="mb-3 text-[13px] text-muted-foreground">Permanently removes this account and all its entries, invoices and details. Back up first if you might need them.</p>
        <Button variant="outline" className="border-destructive/40 text-danger-ink hover:text-danger-ink" onClick={removeAccount}>Delete my account</Button>
      </Panel>
    </div>
  )
}
