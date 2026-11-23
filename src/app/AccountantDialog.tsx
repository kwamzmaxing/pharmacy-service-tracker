// "Talk to an accountant": register interest; KASA matches the person with an accountant.
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { fmtDate, isoOf } from "@/lib/model"
import { myRequest, sendRequest, TOPICS, withdrawRequest, type AccountantRequest } from "@/lib/accountant"
import { useApp } from "./ctx"
import { AreaField, Chips, Field } from "./bits"

const STATUS: Record<AccountantRequest["status"], string> = {
  new: "Received: we’ll be in touch soon",
  contacted: "We’ve been in touch",
  matched: "Matched with an accountant",
  closed: "Closed",
}

export function AccountantDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, data, ask } = useApp()
  const [existing, setExisting] = useState<AccountantRequest | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState({ name: "", phone: "", contactBy: "email" as AccountantRequest["contactBy"], topics: [] as string[], other: "", otherOn: false, details: "", when: "", consent: false })
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setErr(""); setEditing(false); setExisting(undefined)
    myRequest(me.uid).then((r) => {
      setExisting(r)
      setF({
        name: r?.name || data.profile.fullName || me.name || "", phone: r?.phone || data.profile.phone || "", contactBy: r?.contactBy || "email",
        topics: r?.topics || [], other: r?.other || "", otherOn: !!r?.other, details: r?.details || "", when: r?.when || "", consent: false,
      })
    }).catch(() => setExisting(null))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (t: string) => setF((x) => ({ ...x, topics: x.topics.includes(t) ? x.topics.filter((y) => y !== t) : [...x.topics, t] }))
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr("")
    if (!f.name.trim()) return setErr("Enter your name.")
    if (!f.topics.length && !(f.otherOn && f.other.trim())) return setErr("Choose at least one thing you’d like to talk about, or tell us under Something else.")
    if (f.otherOn && !f.other.trim()) return setErr("Tell us what else you’d like to talk about.")
    if ((f.contactBy !== "email") && !f.phone.trim()) return setErr("Add a phone number, or choose email.")
    if (!f.consent) return setErr("Tick the box to let us share your details with an accountant.")
    setBusy(true)
    try {
      await sendRequest({
        uid: me.uid, name: f.name.trim().slice(0, 120), email: me.email, phone: f.phone.trim().slice(0, 40), contactBy: f.contactBy,
        topics: f.topics.slice(0, 12), other: f.otherOn ? f.other.trim().slice(0, 200) : "", details: f.details.trim().slice(0, 2000), when: f.when.trim().slice(0, 120), consent: true,
      })
      toast.success("Thanks, your request has been sent ✓")
      setExisting(await myRequest(me.uid)); setEditing(false)
    } catch {
      setErr("Your request couldn’t be sent. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }
  async function withdraw() {
    if (!(await ask({ title: "Withdraw your request?", message: "We’ll delete it and won’t contact you about it.", ok: "Withdraw", danger: true }))) return
    try { await withdrawRequest(me.uid); setExisting(null); toast("Request withdrawn") } catch { toast.error("Couldn’t withdraw it. Try again.") }
  }

  const showForm = existing === null || editing
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Talk to an accountant</DialogTitle>
          <DialogDescription className="text-[13.5px] leading-relaxed">
            KASA.Rx’s tax pages are a guide, but it’s always best to get advice for your own situation. Register your interest and we’ll match you with an accredited accountant, aiming to within 24 hours. Consultation rates are shared when we get in touch; registering is free and doesn’t commit you to anything.
          </DialogDescription>
        </DialogHeader>

        {existing === undefined ? <p className="py-6 text-center text-[13px] text-muted-foreground">Loading…</p> : !showForm && existing ? (
          <div className="grid gap-3 text-[13.5px]">
            <div className="rounded-xl bg-ok-tint px-4 py-3">
              <p className="font-medium text-ok-ink">{STATUS[existing.status]}</p>
              <p className="mt-1 text-muted-foreground">Sent {fmtDate(isoOf(new Date(existing.at)))}. We’ll contact you by {existing.contactBy === "either" ? "email or phone" : existing.contactBy} at {existing.contactBy === "phone" ? existing.phone : existing.email}.</p>
            </div>
            <p><span className="text-muted-foreground">You’d like to talk about:</span> {[...existing.topics, ...(existing.other ? [existing.other] : [])].join(", ")}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setEditing(true)}>Change my request</Button>
              <Button variant="ghost" className="text-danger-ink" onClick={withdraw}>Withdraw</Button>
              <Button variant="ghost" onClick={onClose}>Close</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="ac-name" label="Your name" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              <Field id="ac-email" label="Email" value={me.email} readOnly hint="(your account email)" />
              <Field id="ac-phone" label="Phone" hint="(optional)" type="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
              <Field id="ac-when" label="Best time to contact you" hint="(optional)" placeholder="e.g. weekday evenings" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <span className="text-[12.5px] text-muted-foreground">Contact me by</span>
              <Chips<AccountantRequest["contactBy"]> label="Contact me by" value={f.contactBy} onChange={(v) => setF({ ...f, contactBy: v })} options={[["email", "Email"], ["phone", "Phone"], ["either", "Either"]]} />
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-[12.5px] text-muted-foreground">What would you like to talk about? Choose any</legend>
              <div className="flex flex-wrap gap-1.5">
                {TOPICS.map((t) => (
                  <button key={t} type="button" aria-pressed={f.topics.includes(t)} onClick={() => toggle(t)}
                    className={cn("rounded-full px-3.5 py-2 text-left text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", f.topics.includes(t) ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground")}>{t}</button>
                ))}
                <button type="button" aria-pressed={f.otherOn} onClick={() => setF({ ...f, otherOn: !f.otherOn })}
                  className={cn("rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", f.otherOn ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground")}>Something else</button>
              </div>
              {f.otherOn && <Field id="ac-other" label="Something else" placeholder="What would you like help with?" maxLength={200} value={f.other} onChange={(e) => setF({ ...f, other: e.target.value })} />}
            </fieldset>
            <AreaField id="ac-details" label="Anything else the accountant should know? (optional)" maxLength={2000} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} />
            <label htmlFor="ac-consent" className="flex cursor-pointer items-start gap-2.5 text-[13px]">
              <Checkbox id="ac-consent" className="mt-0.5" checked={f.consent} onCheckedChange={(v) => setF({ ...f, consent: v === true })} />
              <span>I agree to KASA sharing these details with an accountant so they can arrange a consultation with me. <a href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noopener" className="font-medium text-brand-ink hover:underline">Privacy policy</a></span>
            </label>
            <p role="alert" className="min-h-[18px] text-[13px] text-danger-ink">{err}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>{busy ? "Sending…" : existing ? "Update my request" : "Register my interest"}</Button>
              <Button type="button" variant="ghost" onClick={() => (existing ? setEditing(false) : onClose())}>Cancel</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
