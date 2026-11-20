import { useEffect, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, CalendarDays, Copy, Download, Inbox, Mail, Printer, Send, Star } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import {
  daysBetween, fmtDate, followUpsDue, invStatus, invoiceEmailText, isoOf, money, plural, reminderText, today, type Data, type Invoice,
} from "@/lib/model"
import { saveFile } from "@/lib/store"
import { invoicePdf, pdfBase64, pdfBlob } from "@/lib/pdf"
import { queueEmail, sendFeedback } from "@/lib/cloud"
import { addCalendarEvent, calendarLink, GOOGLE_HELP, GoogleError, sendMail } from "@/lib/google"
import { useApp, type AskOptions, type EmailKind } from "./ctx"
import { InvoiceDoc, invoiceFile } from "./invoice"
import { Pill } from "./bits"

const STATUS_LABEL = { paid: "Paid", unpaid: "Unpaid", overdue: "Overdue" } as const

/* ---------- confirm ---------- */
export function ConfirmDialog({ req: live, onDone }: { req: AskOptions | null; onDone: (ok: boolean) => void }) {
  const [typed, setTyped] = useState("")
  // keep showing the last request while the dialog animates closed
  const [shown, setShown] = useState<AskOptions | null>(live)
  useEffect(() => {
    if (live) setShown(live)
    setTyped("")
  }, [live])
  const req = shown
  const ready = !req?.typeToConfirm || typed.trim() === req.typeToConfirm
  return (
    <Dialog open={!!live} onOpenChange={(o) => !o && onDone(false)}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">{req?.title}</DialogTitle>
          <DialogDescription className="whitespace-pre-line text-[13.5px] text-foreground">{req?.message}</DialogDescription>
        </DialogHeader>
        {req?.typeToConfirm && (
          <div className="grid gap-1.5">
            <Label htmlFor="confirm-type" className="text-[12.5px] font-normal text-muted-foreground">Type {req.typeToConfirm} to confirm</Label>
            <Input id="confirm-type" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ready && onDone(true)} />
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onDone(false)}>Cancel</Button>
          <Button variant={req?.danger ? "destructive" : "default"} disabled={!ready} onClick={() => onDone(true)}>{req?.ok || "Continue"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------- invoice preview ---------- */
export function invoiceAttachment(inv: Invoice, logo?: string) {
  return { filename: `${inv.number}.pdf`, mimeType: "application/pdf", content: pdfBase64(invoicePdf(inv, logo)) }
}
const calDetails = (inv: Invoice) => `Expected payment for ${inv.number} from ${inv.to.name || "the pharmacy"}: ${money(inv.total)}. Logged in Service Tracker.`
const calTitle = (inv: Invoice) => `Payment due: ${inv.number} · ${money(inv.total)}`
const googleMsg = (e: unknown) => {
  const k = e instanceof GoogleError ? e.kind : "failed"
  return GOOGLE_HELP[k] + (e instanceof Error && e.message && e.message !== k ? ` ${e.message}` : "")
}

export function InvoiceDialog({ id, justCreated, onClose }: { id: string | null; justCreated: boolean; onClose: () => void }) {
  const { data, me, email, google, commit } = useApp()
  const inv = id ? data.invoices.find((i) => i.id === id) : null
  const st = inv ? invStatus(inv) : "unpaid"
  const [calBusy, setCalBusy] = useState(false)

  async function addToCalendar() {
    if (!inv) return
    setCalBusy(true)
    try {
      await addCalendarEvent({ title: calTitle(inv), date: inv.due, details: calDetails(inv) }, me.email)
      commit((d) => void (d.invoices.find((x) => x.id === inv.id)!.calendarAt = new Date().toISOString()), `Added ${fmtDate(inv.due)} to your Google Calendar ✓`)
    } catch (e) {
      if (!(e instanceof GoogleError && e.kind === "cancelled")) toast.error("Couldn’t add it to Google Calendar. " + googleMsg(e))
    } finally {
      setCalBusy(false)
    }
  }
  function download() {
    if (!inv) return
    saveFile(inv.number + ".pdf", pdfBlob(invoicePdf(inv, data.profile.logo)))
    toast.success(`${inv.number}.pdf saved ✓`)
  }
  function print() {
    if (!inv) return
    const w = window.open("", "_blank")
    if (!w) return toast.error("Allow pop-ups to print, or use Download instead.")
    w.document.write(invoiceFile(inv))
    w.document.close()
    w.onload = () => w.print()
  }
  const emailed = !!inv?.sentAt || inv?.sentVia === "admin"
  return (
    <Dialog open={!!inv} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-[720px] overflow-y-auto rounded-2xl p-5">
        {inv && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5 font-display">
                {inv.number} <Pill tone={st}>{STATUS_LABEL[st]}</Pill>
              </DialogTitle>
              <DialogDescription>
                Billed to {inv.to.name || "no recipient"} · {money(inv.total)} ·{" "}
                {inv.sentAt ? `emailed ${fmtDate(isoOf(new Date(inv.sentAt)))}` : inv.sentVia === "admin" ? "queued to send" : "not emailed yet"}
              </DialogDescription>
            </DialogHeader>
            {justCreated && !emailed && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ok-tint px-3.5 py-3 text-[13px] text-brand-ink">
                <span><b>Invoice saved.</b> Send it to {inv.to.name || "the pharmacy"} now?</span>
                <Button size="sm" onClick={() => email(inv.id, "invoice")}><Send /> Email invoice</Button>
              </div>
            )}
            <div data-theme="light" className="min-w-0 rounded-xl bg-white p-5 sm:p-7">
              <InvoiceDoc inv={inv} logo={data.profile.logo} />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
              <CalendarDays className="size-4" />
              {inv.calendarAt ? <>Payment date is in your Google Calendar.</> : <>Payment expected {fmtDate(inv.due)}.</>}
              {!inv.calendarAt && st !== "paid" && (
                google.calendar === "ready" ? (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-brand-ink" disabled={calBusy} onClick={addToCalendar}>{calBusy ? "Adding…" : "Add to Google Calendar"}</Button>
                ) : (
                  <a className="font-semibold text-brand-ink hover:underline" href={calendarLink(calTitle(inv), inv.due, calDetails(inv))} target="_blank" rel="noopener noreferrer">Add to Google Calendar ↗</a>
                )
              )}
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center">
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button variant="outline" onClick={download}><Download /> Download PDF</Button>
              <Button variant="outline" onClick={print}><Printer /> Print</Button>
              {(!justCreated || emailed) && st !== "paid" && (
                <Button onClick={() => email(inv.id, emailed && st === "overdue" ? "followup" : "invoice")}>
                  <Send /> {emailed && st === "overdue" ? "Send follow-up" : inv.sentAt ? "Email again" : "Email invoice"}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ---------- compose: invoice email or follow-up ---------- */
async function copy(text: string, el?: HTMLTextAreaElement | HTMLInputElement | null) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    el?.select()
    return false
  }
}
type Route = "send" | "admin" | "copy"
export function EmailDialog({ req, onClose, onBack }: { req: { id: string; kind: EmailKind } | null; onClose: () => void; onBack?: () => void }) {
  const { data, commit, me, google, connect, go, settings, isAdmin, refreshOutbox } = useApp()
  const inv = req ? data.invoices.find((i) => i.id === req.id) : null
  const kind = req?.kind ?? "invoice"
  const [to, setTo] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [attach, setAttach] = useState(true)
  const [busy, setBusy] = useState<Route | null>(null)
  const [note, setNote] = useState("")
  const relay = !!settings?.relay && !isAdmin
  const mine = google.gmail === "ready"
  const preferred: Route = data.profile.sendVia === "admin" && relay ? "admin" : mine ? "send" : relay ? "admin" : "copy"
  useEffect(() => {
    if (!inv) return
    const t = kind === "invoice" ? invoiceEmailText(inv, data.profile) : reminderText(inv, data.profile)
    setTo(inv.to.email || data.clients.find((c) => c.id === inv.clientId)?.email || data.profile.billToEmail || "")
    setSubject(t.subject)
    setBody(t.body)
    setAttach(kind === "invoice")
    setNote("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req?.id, req?.kind])

  function record(via: NonNullable<Invoice["sentVia"]>, msg: string, sent: boolean) {
    if (!inv) return
    commit((d) => {
      const i = d.invoices.find((x) => x.id === inv.id)!
      if (kind === "invoice") {
        if (sent && !i.sentAt) i.sentAt = new Date().toISOString()
        i.sentVia = via
      } else i.reminders.push(new Date().toISOString())
      if (to && !i.to.email) i.to.email = to
      const cl = i.clientId ? d.clients.find((c) => c.id === i.clientId) : undefined
      if (to && cl && !cl.email) cl.email = to
      else if (to && !cl && !d.profile.billToEmail) d.profile.billToEmail = to
    }, msg)
  }
  async function sendNow() {
    if (!inv) return
    if (!to.trim()) return setNote("Add the pharmacy’s email address first.")
    setBusy("send")
    setNote("")
    try {
      await sendMail({ to: to.trim(), subject, body, attachments: attach ? [invoiceAttachment(inv, data.profile.logo)] : undefined }, me.email)
      record("gmail", `Sent to ${to.trim()} ✓`, true)
      onClose()
    } catch (e) {
      if (!(e instanceof GoogleError && e.kind === "cancelled")) setNote("Gmail didn’t send it. " + googleMsg(e))
    } finally {
      setBusy(null)
    }
  }
  async function viaAdmin() {
    if (!inv) return
    if (!to.trim()) return setNote("Add the pharmacy’s email address first.")
    setBusy("admin")
    try {
      const att = attach ? invoiceAttachment(inv, data.profile.logo) : undefined
      await queueEmail({
        uid: me.uid, name: data.profile.fullName || me.name || me.email, email: me.email,
        kind, invoiceId: inv.id, invoiceNumber: inv.number, to: to.trim(), subject, body,
        ...(att && att.content.length < 700_000 ? { attachment: att } : {}),
      })
      record("admin", `Queued. ${settings?.adminName || "The admin"} will send it from their email.`, false)
      refreshOutbox()
      onClose()
    } catch {
      setNote("Couldn’t queue the email. Check your connection and try again.")
    } finally {
      setBusy(null)
    }
  }
  async function copyMessage() {
    const ok = await copy(`To: ${to}\nSubject: ${subject}\n\n${body}`, document.getElementById("em-body") as HTMLTextAreaElement)
    if (ok) {
      record("copied", "Copied. Paste it into an email to send it.", true)
      onClose()
    } else setNote("Select the message and copy it yourself.")
  }
  function openEmailApp() {
    if (!to.trim()) return setNote("Add the pharmacy’s email address first.")
    const a = document.createElement("a")
    a.href = `mailto:${to.replace(/\s/g, "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    record("email-app", "Opened in your email app", true)
    onClose()
  }
  const late = inv ? daysBetween(inv.due, today()) : 0
  const v = (r: Route) => (r === preferred ? "default" : "outline") as "default" | "outline"

  return (
    <Dialog open={!!inv} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto rounded-2xl">
        {inv && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">{kind === "invoice" ? `Email ${inv.number}` : `Follow up on ${inv.number}`}</DialogTitle>
              <DialogDescription>
                {kind === "invoice"
                  ? `${money(inv.total)} to ${inv.to.name || "the pharmacy"}, due ${fmtDate(inv.due)}.`
                  : `${money(inv.total)} · due ${fmtDate(inv.due)}${late > 0 ? ` · ${plural(late, "day")} overdue` : ""}${inv.reminders.length ? ` · ${plural(inv.reminders.length, "follow-up")} sent before` : ""}.`}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="em-to" className="text-[12.5px] font-normal text-muted-foreground">To</Label>
                <Input id="em-to" type="email" value={to} placeholder="accounts@pharmacy.co.uk" onChange={(e) => setTo(e.target.value)} className="bg-field" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="em-sub" className="text-[12.5px] font-normal text-muted-foreground">Subject</Label>
                <Input id="em-sub" value={subject} onChange={(e) => setSubject(e.target.value)} className="bg-field" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="em-body" className="text-[12.5px] font-normal text-muted-foreground">Message</Label>
                <Textarea id="em-body" rows={11} value={body} onChange={(e) => setBody(e.target.value)} className="bg-field text-[13.5px]" />
              </div>
              {(mine || relay) && (
                <label htmlFor="em-attach" className="flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground">
                  <Checkbox id="em-attach" checked={attach} onCheckedChange={(x) => setAttach(x === true)} />
                  Attach the invoice ({inv.number}.pdf)
                </label>
              )}
            </div>
            {!mine && google.gmail !== "unavailable" && (
              <p className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary px-3 py-2.5 text-[12.5px] text-muted-foreground">
                Connect your Gmail to send straight from here.
                <button type="button" className="font-semibold text-brand-ink underline-offset-2 hover:underline" onClick={() => connect("gmail")}>Connect Gmail</button>
                <span aria-hidden>·</span>
                <button type="button" className="font-semibold text-brand-ink underline-offset-2 hover:underline" onClick={() => { onClose(); go("account") }}>Email settings</button>
              </p>
            )}
            {note && <p role="alert" className="rounded-xl bg-warn-tint px-3 py-2.5 text-[12.5px] text-warn">{note}</p>}
            <DialogFooter className="flex-wrap gap-2">
              <Button variant="ghost" onClick={onBack || onClose}>{onBack ? "Back" : "Cancel"}</Button>
              <Button variant="outline" onClick={openEmailApp}><Mail /> Email app</Button>
              <Button variant={v("copy")} onClick={copyMessage}><Copy /> Copy</Button>
              {relay && <Button variant={v("admin")} disabled={!!busy} onClick={viaAdmin}><Inbox /> {busy === "admin" ? "Queueing…" : `Send from ${settings?.adminName || "admin"}’s email`}</Button>}
              {mine && <Button variant={v("send")} disabled={!!busy} onClick={sendNow}><Send /> {busy === "send" ? "Sending…" : "Send now"}</Button>}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ---------- feedback ---------- */
const TOPICS = ["Suggestion", "Something isn’t working", "Praise", "Other"]
export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, data, settings } = useApp()
  const [topic, setTopic] = useState(TOPICS[0])
  const [rating, setRating] = useState(0)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setTopic(TOPICS[0]); setRating(0); setMessage("") } }, [open])
  async function submit() {
    if (!message.trim()) return toast("Write a short message first.")
    setBusy(true)
    try {
      await sendFeedback({ uid: me.uid, email: me.email, name: data.profile.fullName || me.name || me.email, topic, rating, message: message.trim() })
      toast.success("Thanks, your feedback was sent.")
      onClose()
    } catch {
      toast.error("Couldn’t send your feedback. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Send feedback</DialogTitle>
          <DialogDescription>Goes to {settings?.adminName || "the person who runs this tracker"}, with your name and email so they can reply.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <span className="text-[12.5px] font-normal text-muted-foreground">About</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Feedback topic">
              {TOPICS.map((t) => (
                <button key={t} type="button" aria-pressed={topic === t} onClick={() => setTopic(t)}
                  className={cn("rounded-full border px-3 py-1.5 text-[12.5px] font-semibold", topic === t ? "border-primary bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>{t}</button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <span className="text-[12.5px] font-normal text-muted-foreground">How’s the tracker working for you? <span className="font-normal">(optional)</span></span>
            <div className="flex gap-1" role="group" aria-label="Rating out of 5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-label={`${n} out of 5`} aria-pressed={rating === n} onClick={() => setRating(rating === n ? 0 : n)} className="rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Star className={cn("size-6", n <= rating ? "fill-warn text-warn" : "text-muted-foreground")} />
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fb-msg" className="text-[12.5px] font-normal text-muted-foreground">Message</Label>
            <Textarea id="fb-msg" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What’s working, what isn’t, what you’d like added…" className="bg-field" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={submit}><Send /> {busy ? "Sending…" : "Send feedback"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------- follow-ups due ---------- */
export function FollowUpDialog({ open, onClose, onFollowUp, onView }: { open: boolean; onClose: () => void; onFollowUp: (id: string) => void; onView: () => void }) {
  const { data, commit } = useApp()
  const list = followUpsDue(data)
  const sum = list.reduce((a, i) => a + (Number(i.total) || 0), 0)
  useEffect(() => {
    if (open && !list.length) onClose()
  }, [open, list.length, onClose])
  return (
    <Dialog open={open && list.length > 0} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 font-display">
            <span className="flex size-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground"><AlertTriangle className="size-4" /></span>
            {list.length === 1 ? "1 follow-up due" : `${list.length} follow-ups due`}
          </DialogTitle>
          <DialogDescription>{money(sum)} is unpaid and past its follow-up date.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y">
          {list.map((i) => {
            const last = i.reminders[i.reminders.length - 1]
            return (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="text-sm"><b>{i.number}</b> · <span className="num">{money(i.total)}</span></div>
                  <div className="text-[12.5px] text-muted-foreground">
                    {i.to.name || "No recipient"} · due {fmtDate(i.due)} ·{" "}
                    <span className="font-semibold text-danger-ink">{plural(daysBetween(i.due, today()), "day")} overdue</span>
                    {" · "}{last ? `last follow-up ${fmtDate(isoOf(new Date(last)))}` : i.sentAt ? "no follow-up yet" : "invoice not emailed"}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={() => onFollowUp(i.id)}><Send /> Follow up</Button>
                  <Button size="sm" variant="outline" onClick={() => markPaid(commit, i.id)}>Mark paid</Button>
                </div>
              </li>
            )
          })}
        </ul>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Remind me later</Button>
          <Button variant="outline" onClick={onView}>View invoices</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function markPaid(commit: (fn: (d: Data) => void, m?: string) => void, id: string, paid = true) {
  commit((d) => {
    const i = d.invoices.find((x) => x.id === id)
    if (!i) return
    i.status = paid ? "paid" : "unpaid"
    i.paidDate = paid ? today() : null
  }, paid ? "Marked as paid ✓" : "Marked as unpaid")
}
