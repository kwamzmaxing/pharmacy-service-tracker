// The top of the Tax page: one number to set aside, one rule of thumb, and one bar showing where
// locum income goes. The detail lives further down for anyone who wants it.
import { useState } from "react"
import { money, STUDENT_PLANS, type TaxSummary } from "@/lib/model"
import { cn } from "@/lib/utils"

type Seg = { id: string; label: string; value: number; color: string }

export function TaxReserve({ t, current, projected, perMonth, monthsLeft, situation, onEdit }: {
  t: TaxSummary; current: boolean; projected: number | null; perMonth: number; monthsLeft: number
  situation: { salary: number; plans: string[]; scotland: boolean; basis: "cash" | "earned" }; onEdit: () => void
}) {
  const [hot, setHot] = useState<string | null>(null)
  const gross = t.income + t.property.income
  const pct = Math.ceil(t.nextRate * 100)
  const segs: Seg[] = [
    { id: "keep", label: "You keep", value: Math.max(0, t.takeHome), color: "var(--pot-0)" },
    { id: "tax", label: "Income tax", value: t.incomeTaxDue, color: "var(--pot-1)" },
    { id: "ni", label: "National Insurance", value: t.ni.tax, color: "var(--pot-2)" },
    { id: "sl", label: "Student loan", value: t.studentLoan, color: "var(--pot-3)" },
    { id: "exp", label: "Expenses paid", value: Math.min(t.expenses, gross), color: "hsl(var(--muted-foreground))" },
  ].filter((s) => s.value > 0.005)
  const barTotal = segs.reduce((a, s) => a + s.value, 0)
  const parts = [`Income tax ${money(t.incomeTaxDue)}`, `National Insurance ${money(t.ni.tax)}`, ...(t.studentLoan > 0 ? [`Student loan ${money(t.studentLoan)}`] : [])]
  const due = `31 January ${Number(t.year.to.slice(0, 4)) + 1}`
  const planNames = situation.plans.map((k) => STUDENT_PLANS.find((x) => x[0] === k)?.[1]).filter(Boolean)

  return (
    <section aria-labelledby="h-reserve" className="grid gap-5 rounded-xl bg-card p-5 sm:p-7">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-center">
        <div>
          <h2 id="h-reserve" className="text-[13px] text-muted-foreground">Put aside for tax{current ? `, ${t.year.label} so far` : `, ${t.year.label}`}</h2>
          <p className="num mt-1 font-display text-[clamp(32px,8vw,44px)] font-medium leading-none">{money(t.reserve)}</p>
          <p className="mt-2 text-[13px] text-muted-foreground">{parts.join(" · ")}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Pay it with your Self Assessment by <b className="font-medium text-foreground">{due}</b>.</p>
        </div>
        <div className="rounded-xl bg-primary/10 p-4 sm:p-5">
          <p className="text-[12.5px] font-medium text-brand-ink">Simple rule</p>
          <p className="mt-1 font-display text-[clamp(20px,5vw,24px)] font-medium leading-tight">{pct > 0 ? `Put aside ${pct}% of every payment` : "Nothing to put aside yet"}</p>
          <p className="mt-1.5 text-[12.5px] leading-snug text-muted-foreground">
            {pct > 0
              ? <>That’s what each extra £100 you’re paid adds to your bill right now{situation.plans.length ? ", student loan included" : ""}. It goes up as you earn more, so check back now and then.</>
              : <>Your income so far is under the tax-free amounts. This changes as you earn more, so check back after your next few payments.</>}
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[14px] font-medium">Where your locum income goes</h3>
          <span className="num text-[12.5px] text-muted-foreground">{money(gross)} {(situation.basis === "cash" ? "paid to you" : "earned")}{current ? " so far" : ""}</span>
        </div>
        {barTotal > 0 ? (
          <>
            <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={`Of ${money(gross)}: ${segs.map((s) => `${s.label} ${money(s.value)}`).join(", ")}`}>
              {segs.map((s) => (
                <span key={s.id} className="h-full transition-opacity first:rounded-l-full last:rounded-r-full" onMouseEnter={() => setHot(s.id)} onMouseLeave={() => setHot(null)}
                  style={{ width: `${(s.value / barTotal) * 100}%`, background: s.color, opacity: hot && hot !== s.id ? 0.45 : 1, minWidth: 3 }} />
              ))}
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-3 lg:grid-cols-5">
              {segs.map((s) => (
                <li key={s.id} className={cn("flex min-w-0 items-start gap-2", hot && hot !== s.id && "opacity-60")} onMouseEnter={() => setHot(s.id)} onMouseLeave={() => setHot(null)}>
                  <span className="mt-1 size-2.5 flex-none rounded-[3px]" style={{ background: s.color }} aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-muted-foreground">{s.label}</span>
                    <span className="num font-medium">{money(s.value)}</span> <span className="num text-[12px] text-muted-foreground">{Math.round((s.value / barTotal) * 100)}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : <p className="text-[13px] text-muted-foreground">Once you’re paid for some work, you’ll see how it splits between tax and what you keep.</p>}
      </div>

      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          ["Take-home", money(t.takeHome), `What’s left after expenses and tax${current ? ", so far" : ""}`],
          ["Full-year estimate", projected === null ? "—" : money(projected), projected === null ? "Shows after the first month" : current ? "Tax to put aside if the year carries on like this" : "This tax year has ended"],
          ["Set aside each month", money(perMonth), current ? `With ${money(t.reserve)} already put aside, this covers the rest over the ${monthsLeft} months left` : "Average across the year"],
        ].map(([k, v, sub]) => (
          <div key={k} className="rounded-lg bg-secondary/60 px-4 py-3">
            <dt className="text-[12.5px] text-muted-foreground">{k}</dt>
            <dd className="num mt-0.5 font-display text-[19px] font-medium">{v}</dd>
            <dd className="text-[12px] leading-snug text-muted-foreground">{sub}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t pt-4 text-[12.5px] text-muted-foreground">
        <span>Worked out for:</span>
        {[
          situation.salary > 0 ? `${money(situation.salary)} salary from a PAYE job` : "No PAYE job",
          planNames.length ? `Student loan: ${planNames.join(" + ")}` : "No student loan",
          situation.scotland ? "Scottish tax rates" : "England, Wales and NI tax rates",
          situation.basis === "cash" ? "Income counted when paid" : "Income counted when earned",
        ].map((x) => <span key={x} className="rounded-full bg-secondary px-2.5 py-0.5 text-foreground">{x}</span>)}
        <button type="button" onClick={onEdit} className="font-medium text-brand-ink hover:underline">Change</button>
      </div>
    </section>
  )
}
