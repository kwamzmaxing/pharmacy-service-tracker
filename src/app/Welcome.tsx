// First visit after signing up: three short questions instead of the full Settings page.
import { useState } from "react"
import { ArrowLeft, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { tidyAccountNumber, tidySortCode, uid } from "@/lib/model"
import { useApp } from "./ctx"
import { AreaField, Field } from "./bits"

const STEPS = ["You", "Getting paid", "First pharmacy"] as const

export function Welcome({ onDone }: { onDone: () => void }) {
  const { data, me, commit } = useApp()
  const [step, setStep] = useState(0)
  const [f, setF] = useState({
    fullName: data.profile.fullName || me.name || "",
    preferredName: data.profile.preferredName || "",
    tradingName: data.profile.tradingName || "",
    accountName: data.profile.accountName || data.profile.fullName || me.name || "",
    sortCode: data.profile.sortCode || "",
    accountNumber: data.profile.accountNumber || "",
    pharmacy: "", pharmacyEmail: "", pharmacyAddress: "",
  })
  const [err, setErr] = useState("")
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  function next() {
    setErr("")
    if (step === 0 && !f.fullName.trim()) return setErr("Enter your name as it should appear on invoices.")
    if (step === 1 && f.sortCode.trim() && !tidySortCode(f.sortCode)) return setErr("A sort code is 6 digits, like 12-34-56.")
    if (step === 1 && f.accountNumber.trim() && !tidyAccountNumber(f.accountNumber)) return setErr("An account number is 6 to 8 digits (most are 8), with no letters.")
    if (step < STEPS.length - 1) return setStep(step + 1)
    finish()
  }
  function finish() {
    const sc = tidySortCode(f.sortCode)
    commit((d) => {
      const p = d.profile
      p.fullName = f.fullName.trim()
      p.preferredName = f.preferredName.trim().slice(0, 40)
      p.tradingName = f.tradingName.trim()
      if (!p.accountName || f.accountName.trim()) p.accountName = f.accountName.trim() || p.fullName
      if (sc) p.sortCode = sc
      const acc = tidyAccountNumber(f.accountNumber)
      if (acc) p.accountNumber = acc
      if (f.pharmacy.trim()) {
        d.clients.push({ id: uid(), name: f.pharmacy.trim(), contact: "", email: f.pharmacyEmail.trim(), phone: "", address: f.pharmacyAddress.trim(), notes: "", created: new Date().toISOString() })
      }
      d.meta.welcomed = 1
    }, "You’re all set ✓")
    onDone()
  }
  function skipAll() {
    commit((d) => {
      d.meta.welcomed = 1
      if (!d.profile.fullName && f.fullName.trim()) d.profile.fullName = f.fullName.trim()
      if (f.preferredName.trim()) d.profile.preferredName = f.preferredName.trim().slice(0, 40)
    })
    onDone()
  }

  return (
    <div className="mx-auto grid max-w-[560px] gap-6 pt-4">
      <div>
        <p className="text-[13px] text-muted-foreground">Welcome to KASA.Rx</p>
        <h2 className="mt-1 font-display text-[clamp(24px,5vw,30px)] font-medium leading-tight">Three quick questions, then you’re ready.</h2>
      </div>

      <ol className="flex gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className={cn("h-1 rounded-full", i <= step ? "bg-primary" : "bg-secondary")} />
            <span className={cn("truncate text-[12px]", i === step ? "font-medium text-foreground" : "text-muted-foreground")}>{i < step && <Check className="mr-1 inline size-3" />}{s}</span>
          </li>
        ))}
      </ol>

      <form className="grid gap-4 rounded-2xl bg-card p-5 sm:p-7" noValidate onSubmit={(e) => { e.preventDefault(); next() }}>
        {step === 0 && (
          <>
            <div>
              <h3 className="font-display text-[18px] font-medium">Who are the invoices from?</h3>
              <p className="mt-1 text-[13px] text-muted-foreground">This goes at the top of every invoice.</p>
            </div>
            <Field id="w-name" label="Your full name" autoComplete="name" value={f.fullName} onChange={set("fullName")} autoFocus />
            <Field id="w-callme" label="What should we call you?" hint="(optional)" autoComplete="nickname" maxLength={40} placeholder={f.fullName.trim().split(/\s+/)[0] || "e.g. Sam"} value={f.preferredName} onChange={set("preferredName")} />
            <Field id="w-trading" label="Business or trading name" hint="(optional)" value={f.tradingName} onChange={set("tradingName")} placeholder="e.g. Patel Locum Services Ltd" />
          </>
        )}
        {step === 1 && (
          <>
            <div>
              <h3 className="font-display text-[18px] font-medium">Where should pharmacies pay you?</h3>
              <p className="mt-1 text-[13px] text-muted-foreground">Shown on your invoices so pharmacies can pay by bank transfer. Only you can see it in the tracker.</p>
            </div>
            <Field id="w-acname" label="Name on the account" value={f.accountName} onChange={set("accountName")} />
            <div className="grid grid-cols-[2fr_3fr] gap-3">
              <Field id="w-sort" label="Sort code" inputMode="numeric" placeholder="12-34-56" value={f.sortCode} onChange={set("sortCode")} autoFocus />
              <Field id="w-acno" label="Account number" inputMode="numeric" placeholder="12345678" value={f.accountNumber} onChange={set("accountNumber")} />
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div>
              <h3 className="font-display text-[18px] font-medium">Which pharmacy do you work for most?</h3>
              <p className="mt-1 text-[13px] text-muted-foreground">Saved so its details fill in on invoices. You can add more under Pharmacies.</p>
            </div>
            <Field id="w-ph" label="Pharmacy name" value={f.pharmacy} onChange={set("pharmacy")} placeholder="e.g. High Street Pharmacy" autoFocus />
            <Field id="w-phemail" label="Email for invoices" hint="(optional)" type="email" value={f.pharmacyEmail} onChange={set("pharmacyEmail")} placeholder="accounts@pharmacy.co.uk" />
            <AreaField id="w-phaddr" label="Address (optional)" value={f.pharmacyAddress} onChange={set("pharmacyAddress")} />
          </>
        )}
        <p role="alert" className="min-h-[18px] text-[13px] text-danger-ink">{err}</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {step > 0 ? <Button type="button" variant="ghost" onClick={() => { setErr(""); setStep(step - 1) }}><ArrowLeft /> Back</Button> : <span />}
          <div className="flex gap-2">
            {step > 0 && <Button type="button" variant="outline" onClick={() => (step < STEPS.length - 1 ? setStep(step + 1) : finish())}>Skip</Button>}
            <Button type="submit">{step < STEPS.length - 1 ? "Next" : "Finish"}</Button>
          </div>
        </div>
      </form>
      <button type="button" onClick={skipAll} className="justify-self-center text-[13px] text-muted-foreground hover:text-foreground">I’ll do this later</button>
    </div>
  )
}
