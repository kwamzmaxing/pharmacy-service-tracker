import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { sendPasswordResetEmail } from "firebase/auth"
import { Copy, ExternalLink, RefreshCw, Send, Sheet, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { fmtDate, isoOf } from "@/lib/model"
import { auth } from "@/lib/firebase"
import { listFeedback, listOutbox, listPeople, markOutbox, saveSettings, type Feedback, type OutboxItem, type Person, type PublicSettings } from "@/lib/cloud"
import { GOOGLE_HELP, GoogleError, sendMail, writeSheet } from "@/lib/google"
import { useApp } from "./ctx"
import { Empty, Field, Panel } from "./bits"

const when = (iso?: string) => (iso ? fmtDate(isoOf(new Date(iso))) : "—")
const label = (o: OutboxItem) => `${o.kind === "invoice" ? "Invoice" : "Follow-up"} ${o.invoiceNumber} → ${o.to}`

/** The line added to every email sent for someone else, so the pharmacy knows who it's really from. */
const onBehalf = (o: OutboxItem) => `\n\n—\nSent by ${o.name} (${o.email}) using KASA.Rx. Reply to this email to reach ${o.name}.`

/** Send one reviewed email from the admin's Gmail, with replies going to the account holder. */
async function sendOne(o: OutboxItem, hint: string) {
  await sendMail({ to: o.to, subject: o.subject, body: o.body + onBehalf(o), replyTo: o.email, attachments: o.attachment ? [o.attachment] : undefined }, hint)
  await markOutbox(o.id, { status: "done" })
}

export function AdminTab() {
  const { me, settings, setSettings, google, connect, data } = useApp()
  const [people, setPeople] = useState<Person[]>([])
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [outbox, setOutbox] = useState<OutboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState("")

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [p, f, o] = await Promise.all([listPeople(), listFeedback(), listOutbox()])
      setPeople(p); setFeedback(f); setOutbox(o)
    } catch {
      toast.error("Couldn’t load admin data. Check your connection, and that your admin entry exists (see SETUP.md).")
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { reload() }, [reload])

  async function update(patch: Partial<PublicSettings>, quiet = false) {
    const next = { adminName: data.profile.fullName || me.name || "Admin", relay: true, ...(settings || {}), ...patch }
    try {
      await saveSettings(next)
      setSettings(next)
      if (!quiet) toast("Saved ✓")
    } catch {
      toast.error("Couldn’t save. Check your connection.")
    }
  }
  async function send(o: OutboxItem) {
    setBusy(o.id)
    try {
      await sendOne(o, me.email)
      toast.success(`Sent to ${o.to} ✓`)
    } catch (e) {
      if (!(e instanceof GoogleError && e.kind === "cancelled")) toast.error("Gmail didn’t send it. " + GOOGLE_HELP[e instanceof GoogleError ? e.kind : "failed"] + (e instanceof Error ? ` ${e.message}` : ""))
    } finally {
      setBusy("")
      reload()
    }
  }
  async function reject(o: OutboxItem) {
    setBusy(o.id)
    try {
      await markOutbox(o.id, { status: "failed", error: "Not sent: rejected by the admin" })
      toast(`Rejected. ${o.name} will see it wasn’t sent.`)
    } catch {
      toast.error("Couldn’t update it. Check your connection.")
    } finally {
      setBusy("")
      reload()
    }
  }
  async function resetFor(p: Person) {
    setBusy("reset-" + p.uid)
    try {
      await sendPasswordResetEmail(auth, p.email)
      toast.success(`Password-reset link sent to ${p.email}`)
    } catch {
      toast.error("Couldn’t send the reset link. Check the address and your connection.")
    } finally {
      setBusy("")
    }
  }
  async function syncSheet() {
    setBusy("sheet")
    try {
      const [p, f, o] = await Promise.all([listPeople(), listFeedback(), listOutbox()])
      const r = await writeSheet(settings?.sheetId, "KASA.Rx — account holders & feedback", [
        { title: "Account holders", rows: [["Name", "Email", "Created", "Last log-in"], ...p.map((x) => [x.name || "", x.email || "", x.created?.slice(0, 10) || "", x.lastLogin?.slice(0, 10) || ""])] },
        { title: "Feedback", rows: [["Date", "Name", "Email", "Topic", "Rating", "Message"], ...f.map((x) => [x.at.slice(0, 10), x.name, x.email, x.topic, x.rating || "", x.message])] },
        { title: "Emails sent for others", rows: [["Date", "From", "Email", "What", "Status", "Note"], ...o.map((x) => [x.at.slice(0, 10), x.name, x.email, label(x), x.status, x.error || ""])] },
      ], me.email)
      await update({ sheetId: r.id, sheetUrl: r.url, sheetUpdatedAt: new Date().toISOString() }, true)
      toast.success("Google Sheet updated ✓")
    } catch (e) {
      if (!(e instanceof GoogleError && e.kind === "cancelled")) toast.error("Couldn’t update the Google Sheet. " + (e instanceof Error ? e.message : ""))
    } finally {
      setBusy("")
    }
  }
  async function copyUid() {
    try { await navigator.clipboard.writeText(me.uid); toast("Copied") } catch { toast(me.uid) }
  }

  const waiting = outbox.filter((o) => o.status === "new")
  const recent = outbox.filter((o) => o.status !== "new").slice(0, 12)
  const s = settings

  return (
    <div className="grid gap-5 sm:gap-6">
      <p className="rounded-xl bg-secondary/60 px-4 py-3 text-[12.5px] text-muted-foreground">
        Admin only works when you log in with Google, so your Google 2-Step Verification protects it. Logging in with a password gives an ordinary account.
      </p>
      <div className="grid grid-cols-3 gap-2.5">
        {([["Account holders", people.length], ["Waiting to send", waiting.length], ["Feedback", feedback.length]] as const).map(([k, v]) => (
          <div key={k} className={cn("min-w-0 rounded-2xl border bg-card px-3.5 py-3", k === "Waiting to send" && v > 0 && "border-destructive/40 bg-danger-tint")}>
            <div className="truncate text-[11.5px] font-semibold text-muted-foreground">{k}</div>
            <div className="num font-display text-[21px] font-medium">{v}</div>
          </div>
        ))}
      </div>

      {!s && (
        <Panel title="Finish setting up">
          <p className="mb-3 max-w-[62ch] text-[13px] text-muted-foreground">Choose the name account holders see, then they can send feedback and send emails through your Gmail.</p>
          <Field id="adm-name" label="Name shown to account holders" defaultValue={data.profile.fullName || me.name} className="max-w-sm" onBlur={(e) => update({ adminName: e.target.value.trim() || "Admin", relay: true })} />
        </Panel>
      )}

      <Panel title="Waiting to send" aside={<Button size="sm" variant="ghost" className="h-7" onClick={reload} disabled={loading}><RefreshCw /> Refresh</Button>}>
        {google.gmail !== "ready" && (
          <p className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-warn-tint px-3 py-2.5 text-[12.5px] text-warn">
            Connect your Gmail to send these.
            <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={() => connect("gmail")}>Connect Gmail</button>
          </p>
        )}
        <p className="mb-3 max-w-[64ch] text-[12.5px] text-muted-foreground">
          These go out from your Gmail, so read each one before sending. Replies go to the account holder, and a line at the end says who it’s from. Reject anything that looks wrong, such as links or requests you wouldn’t send yourself.
        </p>
        {!waiting.length ? (
          <Empty title="Nothing waiting">Invoice and follow-up emails that account holders send through you appear here for you to check.</Empty>
        ) : (
          <ul className="grid gap-3">
            {waiting.map((o) => (
              <li key={o.id} className="rounded-xl bg-secondary/60 p-4 text-[13px]">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">{o.kind === "invoice" ? "Invoice" : "Follow-up"} {o.invoiceNumber}</div>
                    <div className="text-[12.5px] text-muted-foreground">From {o.name} · {o.email} · {when(o.at)}</div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => reject(o)}>Reject</Button>
                    <Button size="sm" disabled={!!busy || google.gmail !== "ready"} onClick={() => send(o)}><Send /> {busy === o.id ? "Sending…" : "Send"}</Button>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
                  <dt className="text-muted-foreground">To</dt><dd className="min-w-0 break-all font-medium">{o.to}</dd>
                  <dt className="text-muted-foreground">Subject</dt><dd className="min-w-0 break-words">{o.subject}</dd>
                  {o.attachment && <><dt className="text-muted-foreground">Attached</dt><dd className="min-w-0 break-all">{o.attachment.filename}</dd></>}
                </dl>
                <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-3 font-sans text-[12.5px] leading-relaxed">{o.body + onBehalf(o)}</pre>
              </li>
            ))}
          </ul>
        )}
        {recent.length > 0 && (
          <details className="mt-3 text-[12.5px] text-muted-foreground">
            <summary className="cursor-pointer font-semibold">Recently sent</summary>
            <ul className="mt-2 grid gap-1">
              {recent.map((o) => (
                <li key={o.id}>{when(o.doneAt)} · {label(o)} · {o.name} {o.status === "failed" ? <span className="font-semibold text-danger-ink">failed: {o.error}</span> : "sent"}</li>
              ))}
            </ul>
          </details>
        )}
      </Panel>

      <Panel title="Account holders" aside={`${people.length} total`}>
        {loading ? <p className="text-[13px] text-muted-foreground">Loading…</p> : !people.length ? (
          <Empty title="No accounts yet">People appear here when they create an account or next log in.</Empty>
        ) : (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[480px] text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  <th className="px-1 py-2 font-bold">Name</th><th className="px-1 py-2 font-bold">Email</th><th className="px-1 py-2 font-bold">Last log-in</th><th />
                </tr>
              </thead>
              <tbody className="divide-y">
                {people.map((p) => (
                  <tr key={p.uid}>
                    <td className="px-1 py-2 font-semibold">{p.name || "—"}</td>
                    <td className="px-1 py-2">{p.email}</td>
                    <td className="num px-1 py-2">{when(p.lastLogin)}</td>
                    <td className="px-1 py-2 text-right">
                      <Button size="sm" variant="ghost" className="h-7 text-brand-ink" disabled={!!busy || !p.email} onClick={() => resetFor(p)}>{busy === "reset-" + p.uid ? "Sending…" : "Send reset link"}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[12.5px] text-muted-foreground">Passwords are never stored or shown. A reset link lets the person choose a new password; their data is kept.</p>
      </Panel>

      <Panel title="Feedback" aside={`${feedback.length} total`}>
        {!feedback.length ? <Empty title="No feedback yet">Account holders send feedback from their account menu.</Empty> : (
          <ul className="divide-y">
            {feedback.slice(0, 25).map((f) => (
              <li key={f.id} className="py-2.5 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{f.name}</span>
                  <span className="text-muted-foreground">{f.email} · {when(f.at)} · {f.topic}</span>
                  {f.rating > 0 && <span className="flex items-center gap-0.5 text-warn"><Star className="size-3.5 fill-warn" />{f.rating}</span>}
                </div>
                <p className="mt-1 whitespace-pre-line">{f.message}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Google Sheet" aside={s?.sheetUpdatedAt ? `updated ${when(s.sheetUpdatedAt)}` : undefined}>
        <p className="mb-3 max-w-[62ch] text-[13px] text-muted-foreground">
          Keeps one Google Sheet in your Drive with every account holder (name, email, sign-up and last log-in), all feedback and the emails you sent for others. Each update rewrites the same sheet. Passwords are never included.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy === "sheet"} onClick={syncSheet}><Sheet /> {busy === "sheet" ? "Updating…" : s?.sheetId ? "Update Google Sheet" : "Create Google Sheet"}</Button>
          {s?.sheetUrl && <Button variant="outline" asChild><a href={s.sheetUrl} target="_blank" rel="noopener noreferrer"><ExternalLink /> Open sheet</a></Button>}
        </div>
      </Panel>

      <Panel title="Admin settings">
        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="adm-relay" className="text-[13px]">
              <span className="font-semibold">Let account holders send emails through my Gmail</span>
              <span className="block text-muted-foreground">Their invoice and follow-up emails wait here until you send them.</span>
            </label>
            <Switch id="adm-relay" checked={s?.relay ?? true} onCheckedChange={(v) => update({ relay: v })} />
          </div>
          {s && <Field id="adm-name2" key={s.adminName} label="Name shown to account holders" defaultValue={s.adminName} className="max-w-sm"
            onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== s.adminName && update({ adminName: e.target.value.trim() })} />}
          <div className="text-[12.5px] text-muted-foreground">
            Your user ID (used to make you admin in Firebase): <code className="rounded bg-secondary px-1.5 py-0.5">{me.uid}</code>{" "}
            <button type="button" className="inline-flex items-center gap-1 font-semibold text-brand-ink" onClick={copyUid}><Copy className="size-3.5" /> Copy</button>
          </div>
        </div>
      </Panel>
    </div>
  )
}
