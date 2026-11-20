import { useRef, useState } from "react"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import {
  deleteUser, EmailAuthProvider, GoogleAuthProvider, OAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, sendEmailVerification, updatePassword,
} from "firebase/auth"
import { Copy, LogOut, MessageSquare } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  entryAmt, invStatus, nextNumber, normalize, plural, today, uid, FOLLOW_UP_DAYS, FOLLOW_UP_REPEAT, TERMS_OPTIONS,
  type Data, type Entry, type Profile, type Terms,
} from "@/lib/model"
import { auth } from "@/lib/firebase"
import { forgetPerson, wipeReceipts, wipeVault } from "@/lib/cloud"
import { shrinkImage } from "@/lib/images"
import { saveFile } from "@/lib/store"
import type { ConnStatus } from "@/lib/google"
import { CONTACT_EMAIL, GoogleLogo, MicrosoftLogo } from "./brand"
import { NAMES, PROVIDERS, type Service } from "@/lib/accounts"
import { useApp } from "./ctx"
import { AreaField, Chips, Field, Panel, Pill } from "./bits"
import type { ThemePref } from "@/lib/theme"

const STATUS_LABEL = { paid: "Paid", unpaid: "Unpaid", overdue: "Overdue" }
const connLabel = (s: ConnStatus) => ({ ready: "Connected", not_connected: "Not connected", unavailable: "Not set up" })[s]
/** Google and Microsoft side by side for one service: connect, choose which to use, disconnect. */
function Connections({ service }: { service: Service }) {
  const { conn, connectTo, disconnectFrom, commit, mailWith, calendarWith } = useApp()
  const using = service === "mail" ? mailWith : calendarWith
  const key = service === "mail" ? "mailWith" : "calendarWith"
  const shown = PROVIDERS.filter((p) => conn[p][service] !== "unavailable")
  if (!shown.length) return null
  return (
    <div className="grid gap-2">
      {shown.map((p) => {
        const ready = conn[p][service] === "ready"
        return (
          <div key={p} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary/60 px-4 py-3">
            <span className="flex min-w-0 items-center gap-3">
              {p === "google" ? <GoogleLogo /> : <MicrosoftLogo />}
              <span className="min-w-0">
                <span className="block text-[14px] font-medium">{NAMES[p][service]}</span>
                <span className="block text-[12px] text-muted-foreground">{!ready ? "Not connected" : using === p ? (service === "mail" ? "Connected · emails are sent from here" : "Connected · payment dates go here") : "Connected"}</span>
              </span>
            </span>
            <span className="flex flex-wrap gap-1.5">
              {ready && using !== p && <Button size="sm" variant="outline" onClick={() => commit((d) => void (d.profile[key] = p), `Now using ${NAMES[p][service]} ✓`)}>Use this</Button>}
              {ready
                ? <Button size="sm" variant="ghost" onClick={() => disconnectFrom(p)}>Disconnect</Button>
                : <Button size="sm" onClick={() => connectTo(p, service)}>Connect</Button>}
            </span>
          </div>
        )
      })}
      {shown.some((p) => conn[p][service] === "ready") && <p className="text-[12px] text-muted-foreground">Disconnecting {shown.length > 1 ? "an account" : "it"} also disconnects its {service === "mail" ? "calendar" : "email"} on this device.</p>}
    </div>
  )
}

const connTone = (s: ConnStatus) => (s === "ready" ? "done" : s === "unavailable" ? "pending" : "overdue") as "done" | "pending" | "overdue"

export function AccountTab() {
  const { data, commit, me, ask, replaceAll, logOut, accountDeleted, conn, mailWith, calendarWith, settings, isAdmin, openFeedback, go, theme, setTheme } = useApp()
  const anyMail = conn.google.mail !== "unavailable" || conn.microsoft.mail !== "unavailable"
  const anyCal = conn.google.calendar !== "unavailable" || conn.microsoft.calendar !== "unavailable"
  const p = data.profile
  const restoreRef = useRef<HTMLInputElement>(null)
  const combineRef = useRef<HTMLInputElement>(null)

  const set = (k: keyof Profile, v: string | number | boolean) => {
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
      <Label htmlFor={"p-" + k} className="text-[12.5px] font-normal text-muted-foreground">{label}</Label>
      <Select value={String(p[k])} onValueChange={(v) => set(k, typeof options[0][0] === "number" ? Number(v) : v)}>
        <SelectTrigger id={"p-" + k} className="h-11 bg-field text-[15px]"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([v, l]) => <SelectItem key={String(v)} value={String(v)}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  )
  const name = p.fullName || me.name || me.email
  const tag = (p.fullName || me.email.split("@")[0] || "user").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const relay = !!settings?.relay && !isAdmin

  /* ---------- password ---------- */
  const [pwCur, setPwCur] = useState("")
  const [pwNew, setPwNew] = useState("")
  const [pwNew2, setPwNew2] = useState("")
  const [pwBusy, setPwBusy] = useState(false)
  async function changePw(e: React.FormEvent) {
    e.preventDefault()
    const u = auth.currentUser
    if (!u?.email) return
    if (pwNew.length < 8) return toast.error("Use a new password of at least 8 characters.")
    if (pwNew !== pwNew2) return toast.error("The new passwords don’t match.")
    setPwBusy(true)
    try {
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, pwCur))
      await updatePassword(u, pwNew)
      setPwCur(""); setPwNew(""); setPwNew2("")
      toast.success("Password changed ✓")
    } catch (x) {
      toast.error(/invalid-credential|wrong-password/.test((x as { code?: string })?.code || "") ? "Your current password isn’t right." : "The password couldn’t be changed. Check your connection.")
    } finally {
      setPwBusy(false)
    }
  }
  async function resendVerify() {
    if (!auth.currentUser) return
    try { await sendEmailVerification(auth.currentUser); toast("Verification email sent. Check your inbox.") } catch { toast.error("Couldn’t send it right now. Try again later.") }
  }

  /* ---------- files ---------- */
  function backup() {
    saveFile(`pharmacy-tracker-${tag}-${today()}.json`, new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
    toast.success("Back-up saved ✓")
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
    XLSX.writeFile(wb, `pharmacy-services-${tag}-${today()}.xlsx`)
    toast.success("Excel file saved ✓")
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
      message: `This permanently deletes the account ${me.email} and all its entries, invoices and details, on every device.`,
      ok: "Delete account", danger: true, typeToConfirm: "DELETE",
    })
    if (!ok) return
    const u = auth.currentUser
    if (!u) return
    try {
      await wipeVault(u.uid)
      await wipeReceipts(u.uid).catch(() => {})
      await forgetPerson(u.uid).catch(() => {})
      try {
        await deleteUser(u)
      } catch (x) {
        if (!/requires-recent-login/.test((x as { code?: string })?.code || "")) throw x
        // Firebase asks for a fresh log-in before deleting an account
        if (me.viaGoogle) await reauthenticateWithPopup(u, new GoogleAuthProvider())
        else if (me.viaMicrosoft) await reauthenticateWithPopup(u, new OAuthProvider("microsoft.com"))
        else {
          const pw = window.prompt("To delete your account, enter your password once more:")
          if (!pw) return toast("Your data was deleted, but the account is still there. Try again to remove it.")
          await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email || "", pw))
        }
        await deleteUser(u)
      }
      accountDeleted()
    } catch {
      toast.error("The account couldn’t be deleted. Check your connection and try again.")
    }
  }
  async function copyUid() {
    try { await navigator.clipboard.writeText(me.uid); toast("User ID copied") } catch { toast(me.uid) }
  }

  return (
    <div className="grid gap-5 sm:gap-6">
      <button type="button" onClick={() => go("services")}
        className="flex items-center justify-between gap-3 rounded-xl border bg-card px-5 py-4 text-left hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span>
          <span className="block font-display text-[16px] font-medium">Services & rates</span>
          <span className="text-[13px] text-muted-foreground">{data.services.length} services · {data.services.map((s) => s.name).slice(0, 3).join(", ")}{data.services.length > 3 ? "…" : ""}</span>
        </span>
        <span aria-hidden className="text-muted-foreground">→</span>
      </button>

      <Panel title="Appearance">
        <Chips<ThemePref> label="Appearance" value={theme} onChange={setTheme} options={[["dark", "Dark"], ["light", "Light"], ["system", "Match my device"]]} />
      </Panel>

      <Panel title="Logged in" aside={me.viaGoogle ? "with Google" : me.viaMicrosoft ? "with Microsoft" : me.emailVerified ? "email verified" : "email not verified yet"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">{name}</div>
            <div className="truncate text-[12.5px] text-muted-foreground">{me.email}</div>
          </div>
          <Button variant="outline" onClick={logOut}><LogOut /> Log out</Button>
        </div>
        <p className="mt-2 max-w-[62ch] text-[12.5px] text-muted-foreground">Log out to switch to a different account. Your tracker is saved online: log in on any phone or computer to see it.</p>
        {!me.viaGoogle && !me.viaMicrosoft && !me.emailVerified && (
          <p className="mt-2 text-[12.5px] text-muted-foreground">Please confirm your email so password resets reach you. <button type="button" className="font-semibold text-brand-ink hover:underline" onClick={resendVerify}>Resend the confirmation email</button></p>
        )}
        <p className="mt-2 text-[12px] text-muted-foreground">
          User ID <code className="rounded bg-secondary px-1.5 py-0.5">{me.uid}</code>{" "}
          <button type="button" aria-label="Copy user ID" className="inline-flex translate-y-0.5 items-center text-brand-ink" onClick={copyUid}><Copy className="size-3.5" /></button>
        </p>
      </Panel>

      <Panel title="Email" aside={<Pill tone={connTone(mailWith ? "ready" : anyMail ? "not_connected" : "unavailable")}>{mailWith ? `Using ${NAMES[mailWith].mail}` : connLabel(anyMail ? "not_connected" : "unavailable")}</Pill>}>
        <div className="grid gap-4">
          <p className="max-w-[60ch] text-[13px] text-muted-foreground">
            {anyMail
              ? "Connect Gmail or Outlook to send invoices and follow-ups straight from your own address, with the invoice attached. You agree once in Google’s or Microsoft’s window."
              : "Sending from your own email isn’t set up on this site yet. You can still copy each email, or open it in your email app."}
          </p>
          <Connections service="mail" />
          {relay && (
            <div className="grid gap-1.5">
              <span className="text-[12.5px] font-normal text-muted-foreground">Send invoice and follow-up emails from</span>
              <div role="radiogroup" aria-label="Send emails from" className="grid gap-2 sm:grid-cols-2">
                {([["mine", "My own email", "Sent straight away, from your address."], ["admin", `${settings?.adminName || "The admin"}’s email`, "Queued and sent from their email."]] as const).map(([v, t, d]) => (
                  <button key={v} type="button" role="radio" aria-checked={p.sendVia === v} onClick={() => set("sendVia", v)}
                    className={`rounded-xl border px-3.5 py-2.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${p.sendVia === v ? "border-primary bg-accent" : "bg-field"}`}>
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

      <Panel title="Calendar" aside={<Pill tone={connTone(calendarWith ? "ready" : anyCal ? "not_connected" : "unavailable")}>{calendarWith ? `Using ${NAMES[calendarWith].calendar}` : connLabel(anyCal ? "not_connected" : "unavailable")}</Pill>}>
        <div className="grid gap-3">
          <p className="max-w-[60ch] text-[13px] text-muted-foreground">
            Put each invoice’s expected payment date in your calendar, so you know when money should arrive.
            {!calendarWith && " Without connecting, every invoice still has “Add to Google Calendar” and “Outlook” links."}
          </p>
          <Connections service="calendar" />
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="p-calendar" className="text-[13px]">Add the payment date automatically when I create an invoice</label>
            <Switch id="p-calendar" checked={!!p.calendar} onCheckedChange={(v) => set("calendar", v)} />
          </div>
        </div>
      </Panel>

      <Panel title="Invoice details" aside="saved when you leave a box · used on every new invoice">
        <div className="grid gap-5">
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">From (you)</legend>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              {p.logo ? <img src={p.logo} alt="Your invoice logo" className="h-12 max-w-[160px] rounded border bg-white object-contain p-1" /> : <span className="flex h-12 w-24 items-center justify-center rounded border border-dashed text-[12px] text-muted-foreground">No logo</span>}
              <input id="p-logo" type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async (e) => {
                const f = e.target.files?.[0]; e.target.value = ""
                if (!f) return
                try { set("logo", await shrinkImage(f, 480, "image/png")) } catch { toast.error("That image couldn’t be used as a logo.") }
              }} />
              <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById("p-logo")?.click()}>{p.logo ? "Change logo" : "Add a logo"}</Button>
              {p.logo && <Button type="button" variant="ghost" size="sm" onClick={() => commit((d) => void delete d.profile.logo, "Logo removed")}>Remove</Button>}
              <span className="text-[12px] text-muted-foreground">Shown at the top of your invoices.</span>
            </div>
            {text("fullName", "Full name", { autoComplete: "name" })}
            {text("tradingName", "Trading / business name (optional)", { autoComplete: "organization" })}
            {text("email", "Email shown on invoices", { type: "email", autoComplete: "email" })}
            {text("phone", "Phone", { type: "tel", autoComplete: "tel" })}
            {text("gphc", "GPhC registration no. (optional)")}
            {area("address", "Address")}
          </fieldset>
          <p className="rounded-lg bg-secondary px-3.5 py-3 text-[13px] text-muted-foreground">
            The pharmacies you invoice are saved on the <button type="button" className="font-semibold text-brand-ink hover:underline" onClick={() => go("clients")}>Pharmacies</button> tab, each with its own details.
          </p>
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

      {!me.viaGoogle && !me.viaMicrosoft && (
        <Panel title="Change password">
          <form onSubmit={changePw} className="grid gap-3">
            <input type="email" autoComplete="username" value={me.email} readOnly hidden />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field id="pw-cur" label="Current password" type="password" autoComplete="current-password" value={pwCur} onChange={(e) => setPwCur(e.target.value)} />
              <Field id="pw-new" label="New password" type="password" autoComplete="new-password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} />
              <Field id="pw-new2" label="Confirm new password" type="password" autoComplete="new-password" value={pwNew2} onChange={(e) => setPwNew2(e.target.value)} />
            </div>
            <div><Button type="submit" variant="outline" disabled={pwBusy || !pwCur || !pwNew}>{pwBusy ? "Changing…" : "Change password"}</Button></div>
          </form>
        </Panel>
      )}

      <Panel title="Your data">
        <p className="mb-3 max-w-[62ch] text-[13px] text-muted-foreground">
          Your tracker is saved online. A back-up file is an extra copy you keep yourself. Combine merges daily back-up files, including ones from the earlier claude.ai version, without counting an entry twice. Read how your information is handled in the <a href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noopener" className="font-medium text-brand-ink hover:underline">privacy policy</a>.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={excel}>Export to Excel</Button>
          <Button variant="outline" onClick={backup}>Back up to file</Button>
          <Button variant="outline" onClick={() => restoreRef.current?.click()}>Restore from file</Button>
          <Button variant="outline" onClick={() => combineRef.current?.click()}>Combine back-ups</Button>
          <input ref={restoreRef} id="restore-input" type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = "" }} />
          <input ref={combineRef} id="combine-input" type="file" accept="application/json,.json" multiple hidden onChange={(e) => { const fs = [...(e.target.files || [])]; if (fs.length) combine(fs); e.target.value = "" }} />
        </div>
      </Panel>

      <Panel title="Feedback">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-[56ch] text-[13px] text-muted-foreground">Tell {settings?.adminName || "KASA"} what’s working, what isn’t, or what you’d like added. You can also email <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-brand-ink hover:underline">{CONTACT_EMAIL}</a>.</p>
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
