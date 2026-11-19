import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import { ExternalLink, KeyRound, RefreshCw, Send, Sheet, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { fmtDate, isoOf, plural } from "@/lib/model"
import { createReset, newResetCode } from "@/lib/accounts"
import {
  listAccounts, listInbox, loadPrivateKey, markItem, RESET_URL, saveConfig, setUpAdmin, unlockForReset,
  type AccountRow, type AdminConfig, type InboxRow,
} from "@/lib/admin"
import { allowConnector, connectorStatus, DRIVE, GmailError, GMAIL_HELP, sendMail, trashFile, uploadSheet, type ConnStatus } from "@/lib/gmail"
import type { Connection } from "@/lib/store"
import { useApp } from "./ctx"
import { Empty, Field, Panel, Pill } from "./bits"

const when = (iso?: string) => (iso ? fmtDate(isoOf(new Date(iso))) : "—")
const itemLabel = (i: InboxRow) =>
  i.type === "reset" ? "Password reset" : i.type === "email" ? `${i.kind === "invoice" ? "Invoice" : "Follow-up"} ${i.invoiceNumber} → ${i.to}` : "Feedback"

function resetEmail(name: string, email: string, code: string, expires: string, adminName: string) {
  return {
    subject: "Reset your Service Tracker password",
    body: [
      `Hi ${name || "there"},`,
      "",
      `We received a request to reset the password for ${email}.`,
      "",
      `1. Open the tracker: ${RESET_URL}`,
      `2. Choose “I have a reset code” and enter your email and this code:`,
      "",
      `    ${code}`,
      "",
      `The code works once and expires on ${when(expires)}. Your entries and invoices are kept.`,
      "If you didn’t ask for this, you can ignore this email.",
      "",
      adminName,
    ].join("\n"),
  }
}

/** Process password resets and queued emails, sending from the admin's own Gmail. */
export async function processRequests(conn: Connection, cfg: AdminConfig, onlyIds?: Set<string>) {
  const items = (await listInbox(conn.kv)).filter((i) => i.status === "new" && i.type !== "feedback" && (!onlyIds || onlyIds.has(i.id)))
  if (!items.length) return { done: 0, failed: 0 }
  const accounts = await listAccounts(conn.kv)
  const priv = conn.uid ? await loadPrivateKey(conn.kv, conn.uid) : null
  let done = 0, failed = 0
  for (const it of items) {
    try {
      if (it.type === "reset") {
        // Always send to the address on the account, never to an address typed into the request
        const acct = accounts.find((a) => a.acctId === it.acctId)
        if (!acct) { await markItem(conn.kv, it.viewer, it.id, { status: "failed", error: "No account uses that email." }); failed++; continue }
        if (!acct.recovery || !priv) { await markItem(conn.kv, it.viewer, it.id, { status: "failed", error: "This account has no recovery key yet. They need to log in once after admin tools were turned on." }); failed++; continue }
        const code = newResetCode()
        const expires = await createReset(conn.kv, acct.acctId, await unlockForReset(priv, acct.recovery), code)
        await sendMail(conn.mcp, { to: acct.email, ...resetEmail(acct.name, acct.email, code, expires, cfg.adminName) })
        await markItem(conn.kv, it.viewer, it.id, { status: "done" })
      } else if (it.type === "email") {
        await sendMail(conn.mcp, { to: it.to, subject: it.subject, body: it.body, attachments: it.attachment ? [it.attachment] : undefined })
        await markItem(conn.kv, it.viewer, it.id, { status: "done" })
      }
      done++
    } catch (e) {
      const k = e instanceof GmailError ? e.kind : "failed"
      if (k === "not_connected" || k === "needs_reauth" || k === "not_allowed") throw e // stop: nothing else will send either
      await markItem(conn.kv, it.viewer, it.id, { status: "failed", error: GMAIL_HELP[k] }).catch(() => {})
      failed++
    }
  }
  return { done, failed }
}

export function AdminTab() {
  const { conn, cfg, setCfg, data, gmail, refreshGmail } = useApp()
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [inbox, setInbox] = useState<InboxRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState("")
  const [drive, setDrive] = useState<ConnStatus>("unavailable")
  const [adminName, setAdminName] = useState(data.profile.fullName || "")

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [a, i] = await Promise.all([listAccounts(conn.kv), listInbox(conn.kv)])
      setAccounts(a)
      setInbox(i)
    } catch {
      toast.error("Couldn’t load account holders. Check your connection.")
    } finally {
      setLoading(false)
    }
  }, [conn])
  useEffect(() => {
    reload()
    connectorStatus(conn.mcp, conn.permissions, DRIVE).then(setDrive)
    refreshGmail()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function setUp() {
    if (!conn.uid) return toast.error("Admin tools need you to be signed in to claude.ai.")
    setBusy("setup")
    try {
      setCfg(await setUpAdmin(conn.kv, conn.uid, adminName.trim() || "Admin"))
      toast.success("Admin tools are on. Account holders get recovery the next time they log in.")
    } catch {
      toast.error("Couldn’t turn on admin tools. Check your connection and try again.")
    } finally {
      setBusy("")
    }
  }
  async function updateCfg(patch: Partial<AdminConfig>) {
    if (!cfg) return
    const next = { ...cfg, ...patch }
    try {
      await saveConfig(conn.kv, next)
      setCfg(next)
      toast("Saved ✓")
    } catch {
      toast.error("Couldn’t save. Check your connection.")
    }
  }
  async function runRequests(only?: InboxRow) {
    if (!cfg) return
    if (gmail !== "ready") return toast.error("Connect Gmail first (Account → Email). " + GMAIL_HELP[gmail])
    setBusy(only ? only.id : "process")
    try {
      const r = await processRequests(conn, cfg, only ? new Set([only.id]) : undefined)
      toast(r.done || r.failed ? `Sent ${plural(r.done, "email")}${r.failed ? `, ${r.failed} couldn’t be sent` : ""}` : "Nothing waiting to send")
    } catch (e) {
      toast.error("Gmail stopped the send. " + GMAIL_HELP[e instanceof GmailError ? e.kind : "failed"])
      refreshGmail()
    } finally {
      setBusy("")
      reload()
    }
  }
  async function sendResetTo(a: AccountRow) {
    if (!cfg || !conn.uid) return
    if (gmail !== "ready") return toast.error("Connect Gmail first (Account → Email).")
    if (!a.recovery) return toast.error(`${a.name || a.email} needs to log in once before you can reset their password.`)
    setBusy("reset-" + a.acctId)
    try {
      const priv = await loadPrivateKey(conn.kv, conn.uid)
      if (!priv) throw new Error("no key")
      const code = newResetCode()
      const expires = await createReset(conn.kv, a.acctId, await unlockForReset(priv, a.recovery), code)
      await sendMail(conn.mcp, { to: a.email, ...resetEmail(a.name, a.email, code, expires, cfg.adminName) })
      toast.success(`Reset code sent to ${a.email}`)
    } catch (e) {
      toast.error(e instanceof GmailError ? "Gmail didn’t send it. " + GMAIL_HELP[e.kind] : "Couldn’t create the reset. Your admin key may be missing.")
    } finally {
      setBusy("")
    }
  }
  async function syncSheet() {
    if (!cfg) return
    setBusy("sheet")
    try {
      if (drive !== "ready") {
        await allowConnector(conn.permissions, DRIVE)
        const st = await connectorStatus(conn.mcp, conn.permissions, DRIVE)
        setDrive(st)
        if (st !== "ready") { toast.error("Google Drive: " + GMAIL_HELP[st]); return }
      }
      const [a, i] = await Promise.all([listAccounts(conn.kv), listInbox(conn.kv)])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(a.map((x) => ({
        Name: x.name, Email: x.email, "Created": x.created?.slice(0, 10) || "", "Last log-in": x.lastLogin?.slice(0, 10) || "", "Password recovery": x.recovery ? "On" : "Not yet",
      }))), "Account holders")
      const fb = i.filter((x) => x.type === "feedback")
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fb.map((x) => x.type === "feedback" ? ({
        Date: x.at.slice(0, 10), Name: x.name, Email: x.email, Topic: x.topic, Rating: x.rating || "", Message: x.message,
      }) : {})), "Feedback")
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(i.filter((x) => x.type !== "feedback").map((x) => ({
        Date: x.at.slice(0, 10), Type: x.type === "reset" ? "Password reset" : x.type === "email" ? `Email (${x.kind})` : "Feedback",
        Name: x.name, Email: x.email, To: x.type === "email" ? x.to : "", Status: x.status, Note: x.error || "",
      }))), "Requests")
      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer
      const r = await uploadSheet(conn.mcp, "Service Tracker — account holders & feedback", out)
      if (cfg.sheet?.id && r.id && cfg.sheet.id !== r.id) await trashFile(conn.mcp, cfg.sheet.id).catch(() => {})
      await updateCfg({ sheet: { id: r.id, url: r.url, updatedAt: new Date().toISOString() } })
      toast.success("Google Sheet updated ✓")
    } catch (e) {
      toast.error("Couldn’t update the Google Sheet. " + GMAIL_HELP[e instanceof GmailError ? e.kind : "failed"])
    } finally {
      setBusy("")
    }
  }

  if (!cfg) {
    return (
      <div className="grid gap-4">
        <Panel title="Turn on admin tools">
          <div className="grid gap-3 text-[13px] text-muted-foreground">
            <p className="max-w-[62ch]">As the owner of this page you can see every account holder, send password-reset codes from your Gmail, send account holders’ invoice emails from your Gmail, and keep a Google Sheet of accounts and feedback.</p>
            <p className="max-w-[62ch]">Passwords are never stored or shown to you. Instead each account’s data key is also locked to a recovery key that only your Claude account can open, so you can issue resets without seeing anyone’s password.</p>
            <Field id="adm-name" label="Name shown to account holders" value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="e.g. Kwame at Service Tracker" className="max-w-sm" />
            <div><Button disabled={busy === "setup"} onClick={setUp}><KeyRound /> {busy === "setup" ? "Setting up…" : "Turn on admin tools"}</Button></div>
          </div>
        </Panel>
      </div>
    )
  }

  const pending = inbox.filter((i) => i.status === "new" && i.type !== "feedback")
  const feedback = inbox.filter((i) => i.type === "feedback")
  const recent = inbox.filter((i) => i.type !== "feedback" && i.status !== "new").slice(0, 12)

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 gap-2.5">
        {[["Account holders", accounts.length], ["Waiting to send", pending.length], ["Feedback", feedback.length]].map(([k, v]) => (
          <div key={k} className={cn("rounded-[14px] border bg-card px-3.5 py-3", k === "Waiting to send" && Number(v) > 0 && "border-destructive/40 bg-danger-tint")}>
            <div className="text-[11.5px] font-semibold text-muted-foreground">{k}</div>
            <div className="num font-display text-[21px] font-bold">{v}</div>
          </div>
        ))}
      </div>

      <Panel title="Waiting to send" aside={<Button size="sm" variant="ghost" className="h-7" onClick={reload} disabled={loading}><RefreshCw /> Refresh</Button>}>
        {gmail !== "ready" && <p className="mb-3 rounded-[9px] bg-warn-tint px-3 py-2.5 text-[12.5px] text-warn">Connect your Gmail on the Account tab to send these. {GMAIL_HELP[gmail]}</p>}
        {!pending.length ? (
          <Empty title="Nothing waiting">Password resets and emails that account holders send through you appear here.</Empty>
        ) : (
          <>
            <ul className="divide-y">
              {pending.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0 text-[13px]">
                    <div className="font-semibold">{itemLabel(i)}</div>
                    <div className="text-[12.5px] text-muted-foreground">{i.name || i.email} · {i.email} · {when(i.at)}</div>
                  </div>
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => runRequests(i)}><Send /> Send</Button>
                </li>
              ))}
            </ul>
            <Button className="mt-3" disabled={!!busy} onClick={() => runRequests()}><Send /> {busy === "process" ? "Sending…" : `Send all ${pending.length} from my Gmail`}</Button>
          </>
        )}
        <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3">
          <label htmlFor="adm-auto" className="text-[13px] text-muted-foreground">Send waiting emails automatically whenever I open the tracker</label>
          <Switch id="adm-auto" checked={!!cfg.autoSend} onCheckedChange={(v) => updateCfg({ autoSend: v })} />
        </div>
        {recent.length > 0 && (
          <details className="mt-3 text-[12.5px] text-muted-foreground">
            <summary className="cursor-pointer font-semibold">Recently sent</summary>
            <ul className="mt-2 grid gap-1">
              {recent.map((i) => (
                <li key={i.id}>
                  {when(i.doneAt)} · {itemLabel(i)} · {i.name || i.email}{" "}
                  {i.status === "failed" ? <span className="font-semibold text-danger-ink">failed: {i.error}</span> : "sent"}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Panel>

      <Panel title="Account holders" aside={`${accounts.length} total`}>
        {loading ? <p className="text-[13px] text-muted-foreground">Loading…</p> : !accounts.length ? (
          <Empty title="No accounts yet">People appear here when they create an account or next log in.</Empty>
        ) : (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  <th className="px-1 py-2 font-bold">Name</th><th className="px-1 py-2 font-bold">Email</th><th className="px-1 py-2 font-bold">Last log-in</th><th className="px-1 py-2 font-bold">Recovery</th><th />
                </tr>
              </thead>
              <tbody className="divide-y">
                {accounts.map((a) => (
                  <tr key={a.acctId}>
                    <td className="px-1 py-2 font-semibold">{a.name || "—"}</td>
                    <td className="px-1 py-2">{a.email}</td>
                    <td className="num px-1 py-2">{when(a.lastLogin)}</td>
                    <td className="px-1 py-2"><Pill tone={a.recovery ? "done" : "pending"}>{a.recovery ? "On" : "Not yet"}</Pill></td>
                    <td className="px-1 py-2 text-right">
                      <Button size="sm" variant="ghost" className="h-7 text-brand-ink" disabled={!!busy || !a.recovery} onClick={() => sendResetTo(a)}>{busy === "reset-" + a.acctId ? "Sending…" : "Send reset code"}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[12.5px] text-muted-foreground">Passwords are never stored. A reset code lets the person choose a new password and keeps all their data.</p>
      </Panel>

      <Panel title="Feedback" aside={`${feedback.length} total`}>
        {!feedback.length ? <Empty title="No feedback yet">Account holders can send feedback from their account menu.</Empty> : (
          <ul className="divide-y">
            {feedback.slice(0, 20).map((f) => f.type === "feedback" && (
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

      <Panel title="Google Sheet" aside={cfg.sheet?.updatedAt ? `updated ${when(cfg.sheet.updatedAt)}` : undefined}>
        <p className="mb-3 max-w-[62ch] text-[13px] text-muted-foreground">
          Puts every account holder (name, email, sign-up and last log-in), all feedback and the request log into one Google Sheet in your Drive. Each update replaces the previous sheet, which moves to your Drive’s bin. Passwords are never included.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy === "sheet"} onClick={syncSheet}><Sheet /> {busy === "sheet" ? "Updating…" : cfg.sheet ? "Update Google Sheet" : "Create Google Sheet"}</Button>
          {cfg.sheet?.url && <Button variant="outline" asChild><a href={cfg.sheet.url} target="_blank" rel="noopener noreferrer"><ExternalLink /> Open sheet</a></Button>}
        </div>
        {drive !== "ready" && drive !== "unavailable" && <p className="mt-2 text-[12.5px] text-muted-foreground">Google Drive: {GMAIL_HELP[drive]}</p>}
      </Panel>

      <Panel title="Admin settings">
        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="adm-relay" className="text-[13px]">
              <span className="font-semibold">Let account holders send emails through my Gmail</span>
              <span className="block text-muted-foreground">Their invoice and follow-up emails wait here until you send them.</span>
            </label>
            <Switch id="adm-relay" checked={cfg.relay} onCheckedChange={(v) => updateCfg({ relay: v })} />
          </div>
          <Field id="adm-name2" key={cfg.adminName} label="Name shown to account holders" defaultValue={cfg.adminName} className="max-w-sm"
            onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== cfg.adminName && updateCfg({ adminName: e.target.value.trim() })} />
        </div>
      </Panel>
    </div>
  )
}
