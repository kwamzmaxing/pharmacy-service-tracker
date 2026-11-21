import { useState } from "react"
import { toast } from "sonner"
import { FileDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { categoryName, fmtDate, mileageRates, money, PROPERTY_ALLOWANCE, taxSummary, taxYearsWithData, tradingAllowance, yearTax, VEHICLES, type DeductionMethod, type Vehicle } from "@/lib/model"
import { saveFile } from "@/lib/store"
import { useApp } from "./ctx"
import { Chips, Ledger, MoneyField, Panel } from "./bits"

const pence = (n: number) => `${Math.round(n * 100)}p`

export function TaxTab() {
  const { data, commit, me, go } = useApp()
  const p = data.profile
  const years = taxYearsWithData(data)
  const [yearFrom, setYearFrom] = useState(years[0].from)
  const t = taxSummary(data, yearFrom)
  const current = t.elapsed > 0 && t.elapsed < 1
  const set = (k: keyof typeof p, v: unknown) => commit((d) => void ((d.profile as Record<string, unknown>)[k] = v), "Saved ✓")

  // If the rest of the year goes like this: scale this year's figures to a full year
  const canProject = current && t.elapsed >= 0.08
  const other = Math.max(0, Number(p.otherIncome) || 0)
  const realCosts = t.expenses + t.mileage.amount
  /** Tax for the full year at this year's pace, deducting either real costs or a flat allowance. */
  const fullYear = (m: "expenses" | "allowance", allowance = t.allowance) => {
    const k = canProject ? t.elapsed : 1
    const deduct = m === "allowance" ? allowance : realCosts / k
    return yearTax({ trading: Math.max(0, t.income / k - deduct), property: t.property.income / k, salary: other, scotland: !!p.scotland }).total
  }
  const projTotal = canProject ? fullYear(t.method) : t.total
  const startYear = Number(t.year.from.slice(0, 4))
  const nextAllowance = tradingAllowance(startYear + 1)
  const pref: DeductionMethod = p.deductionMethod || "auto"
  const better: "expenses" | "allowance" = t.compare.allowance.total < t.compare.expenses.total ? "allowance" : "expenses"
  const saving = Math.abs(t.compare.allowance.total - t.compare.expenses.total)
  // Next year's bigger allowance, judged on this year's pace
  const nextYear = nextAllowance > t.allowance && (t.income > 0 || realCosts > 0)
    ? { costs: realCosts / (canProject ? t.elapsed : 1), diff: fullYear("expenses") - fullYear("allowance", nextAllowance) }
    : null
  const rent = t.property.income > 0
  // Salary logged on the Accounting tab but no yearly salary here: the tax bands would be wrong
  const salaryLogged = !other && data.budget.incomes.some((x) => x.kind === "employment" && x.date >= t.year.from && x.date <= t.year.to)
  const monthsLeft = current ? Math.max(1, Math.round((1 - t.elapsed) * 12)) : 12
  const setAside = canProject ? projTotal / 12 : t.total / 12
  const rates = mileageRates(p.vehicle || "car", Number(t.year.from.slice(0, 4)))

  async function download() {
    const { pdfBlob, taxSummaryPdf } = await import("@/lib/pdf")
    const who = p.tradingName || p.fullName || me.name || me.email
    saveFile(`tax-estimate-${t.year.label.replace("/", "-")}.pdf`, pdfBlob(taxSummaryPdf(t, who, {
      scotland: !!p.scotland, vehicle: VEHICLES.find((v) => v[0] === (p.vehicle || "car"))?.[1] ?? "Car or van", basis: p.taxBasis || "cash", otherIncome: other,
    })))
    toast.success("Tax summary saved ✓")
  }

  const Row = ({ k, v, strong, minus, sub }: { k: React.ReactNode; v: number; strong?: boolean; minus?: boolean; sub?: React.ReactNode }) => (
    <li className={cn("flex items-baseline justify-between gap-4 py-2", strong && "font-semibold")}>
      <span className="min-w-0">{k}{sub && <span className="block text-[12px] font-normal text-muted-foreground">{sub}</span>}</span>
      <span className="num whitespace-nowrap">{minus && v > 0 ? "−" : ""}{money(v)}</span>
    </li>
  )

  return (
    <div className="grid gap-5 sm:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="t-year" className="text-[13px] text-muted-foreground">Tax year</Label>
          <Select value={yearFrom} onValueChange={setYearFrom}>
            <SelectTrigger id="t-year" className="h-9 w-auto gap-2 bg-card text-[13.5px] shadow-none"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map((y) => <SelectItem key={y.from} value={y.from}>{y.label} ({fmtDate(y.from)} – {fmtDate(y.to)})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={download}><FileDown /> Download summary (PDF)</Button>
      </div>

      <Ledger cells={[
        { label: current ? "Taxable profit so far" : "Taxable profit", value: money(t.profit), sub: `${money(t.income)} income` },
        { label: current ? "Tax and NI so far" : "Tax and NI", value: money(t.total), sub: "Income tax and Class 4 NI" },
        { label: "Full-year estimate", value: canProject ? money(projTotal) : current ? "—" : money(t.total), sub: canProject ? "At this year’s pace" : current ? "Shows after the first month" : "This tax year has ended" },
        { label: "Set aside each month", value: money(setAside), sub: current ? `${monthsLeft} months to go` : "Average across the year" },
      ]} />

      <Panel title="How it’s worked out" aside={`${t.year.label} · ${p.scotland ? "Scottish rates" : "UK rates"}`}>
        <ul className="divide-y text-[14px]">
          {t.incomeLines.map((l) => <Row key={l.label} k={l.label} v={l.amount} sub={(p.taxBasis || "cash") === "cash" ? "Money received in this tax year" : "Work logged in this tax year"} />)}
          {t.method === "allowance" ? (
            <Row k="Trading allowance" v={t.compare.allowance.deduct} minus
              sub={`Used instead of your expenses and mileage (${money(realCosts)}), because it means less tax. See “Expenses or trading allowance?” below.`} />
          ) : <>
          <Row k={<button type="button" className="text-left hover:underline" onClick={() => go("expenses")}>Allowable expenses</button>} v={t.expenses} minus
            sub={t.byCategory.length ? t.byCategory.slice(0, 3).map((c) => `${categoryName(c.category)} ${money(c.amount)}`).join(" · ") + (t.byCategory.length > 3 ? " · …" : "") : "None recorded yet"} />
          <Row k="Mileage allowance" v={t.mileage.amount} minus
            sub={!t.miles ? "No mileage logged in this tax year" : t.mileage.after
              ? `${Math.round(t.miles * 10) / 10} business miles: 10,000 at ${pence(rates.first)}, ${(Math.round(t.mileage.after * 10) / 10).toLocaleString("en-GB")} at ${pence(rates.after)}`
              : `${Math.round(t.miles * 10) / 10} business miles at ${pence(rates.first)} a mile`} />
          </>}
          <Row k="Taxable profit" v={t.profit} strong sub={rent ? "From self-employment" : undefined} />
        </ul>
        {rent && (
          <ul className="mt-2 divide-y border-t text-[14px]">
            <Row k={<button type="button" className="text-left hover:underline" onClick={() => go("budget")}>Rental income ({t.property.count})</button>} v={t.property.income} sub="Added on the Accounting tab" />
            <Row k="Property allowance" v={t.property.allowance} minus sub={`The first ${money(PROPERTY_ALLOWANCE)} is tax-free. Used instead of rental expenses, which aren’t recorded here.`} />
            <Row k="Taxable rental profit" v={t.property.taxable} strong sub="Income tax only: no National Insurance on rent" />
          </ul>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Income tax</h3>
            <ul className="divide-y text-[13.5px]">
              {other > 0 && <li className="py-1.5 text-[12.5px] text-muted-foreground">Includes {money(other)} employment income, already taxed through PAYE</li>}
              <Row k="Personal allowance" v={t.tax.allowance} />
              {t.tax.lines.map((l) => <Row key={l.label} k={l.label} v={l.tax} sub={`on ${money(l.amount)}`} />)}
              <Row k={rent ? "On your self-employment and rent" : "On your self-employment"} v={t.incomeTaxDue} strong />
            </ul>
          </div>
          <div>
            <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">National Insurance</h3>
            <ul className="divide-y text-[13.5px]">
              {!t.ni.lines.length && <li className="py-2 text-muted-foreground">Profit is below £12,570, so no Class 4 NI.</li>}
              {t.ni.lines.map((l) => <Row key={l.label} k={l.label} v={l.tax} sub={`on ${money(l.amount)}`} />)}
              <Row k="Class 4 total" v={t.ni.tax} strong />
            </ul>
          </div>
        </div>
        <div className="mt-4 flex items-baseline justify-between border-t-2 border-foreground pt-3">
          <span className="font-display text-[16px] font-medium">Estimated tax and NI</span>
          <span className="num font-display text-[20px] font-medium">{money(t.total)}</span>
        </div>
        {t.total > 1000 && (
          <p className="mt-3 rounded-md bg-secondary px-3 py-2.5 text-[12.5px] text-muted-foreground">
            With a bill over £1,000, HMRC usually also asks for <b className="text-foreground">payments on account</b>: two advance payments towards next year, each half of this year’s bill, due 31 January and 31 July.
          </p>
        )}
      </Panel>

      <Panel title="Expenses or trading allowance?" aside={`${t.year.label} allowance ${money(t.allowance)}`}>
        <p className="mb-4 max-w-[64ch] text-[13px] text-muted-foreground">
          From your self-employed income you can take off <b className="font-medium text-foreground">either</b> your real costs (expenses and mileage) <b className="font-medium text-foreground">or</b> a flat trading allowance of {money(t.allowance)}, not both. Whichever is bigger means less tax.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["expenses", "allowance"] as const).map((m) => (
            <div key={m} className={cn("rounded-xl p-4", m === better && saving >= 1 ? "bg-ok-tint" : "bg-secondary/60")}>
              <div className="flex items-center justify-between gap-2 text-[13px] font-medium">
                {m === "expenses" ? "Claim my expenses and mileage" : `Claim the ${money(t.allowance)} allowance`}
                {m === better && saving >= 1 && <span className="rounded-full bg-background/70 px-2 py-0.5 text-[11px] text-ok-ink">Less tax</span>}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[12.5px]">
                <div><span className="block text-muted-foreground">Takes off</span><span className="num text-[15px] font-medium">{money(t.compare[m].deduct)}</span></div>
                <div><span className="block text-muted-foreground">Tax and NI</span><span className="num text-[15px] font-medium">{money(t.compare[m].total)}</span></div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[13.5px]">
          {saving < 1
            ? "Right now both come out the same."
            : better === "expenses"
              ? <>Claiming your expenses saves you about <b>{money(saving)}</b>{current ? " so far this year" : ""}.</>
              : <>The trading allowance saves you about <b>{money(saving)}</b>{current ? " so far this year" : ""}, because your costs are under {money(t.allowance)}.</>}
        </p>
        {nextYear && (
          <p className="mt-3 rounded-xl bg-secondary/60 px-4 py-3 text-[13px] text-muted-foreground">
            <b className="font-medium text-foreground">From 6 April 2027 the allowance rises to {money(nextAllowance)}.</b>{" "}
            {canProject ? "At this year’s pace" : "On this year’s figures"}, your expenses and mileage come to about {money(nextYear.costs)} a year,{" "}
            {nextYear.costs >= nextAllowance
              ? <>more than {money(nextAllowance)}, so claiming your expenses should still be better.</>
              : nextYear.diff >= 1
                ? <>less than {money(nextAllowance)}, so switching to the allowance could save you about <b className="text-foreground">{money(nextYear.diff)}</b> a year. Keep your receipts anyway, in case your costs go up.</>
                : <>so the two would be about the same.</>}
          </p>
        )}
        <div className="mt-4 grid gap-1.5">
          <span className="text-[12.5px] text-muted-foreground">Use in this estimate</span>
          <Chips<DeductionMethod> label="Use in this estimate" value={pref} onChange={(v) => set("deductionMethod", v)}
            options={[["auto", "Whichever is less tax"], ["expenses", "My expenses"], ["allowance", "Trading allowance"]]} />
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          You choose when you file your Self Assessment, and you can choose differently each year. With the allowance you can’t also claim mileage or other costs. If your self-employed income is under the allowance, it’s tax-free. It can’t be used on income from a business you own or are a partner in, or from your employer. A guide, not financial advice.
        </p>
      </Panel>

      <Panel title="Your tax settings">
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <span className="text-[12.5px] font-normal text-muted-foreground">Count income</span>
            <Chips<"cash" | "earned"> label="Count income" value={p.taxBasis || "cash"} onChange={(v) => set("taxBasis", v)} options={[["cash", "When I’m paid (HMRC default)"], ["earned", "When I do the work"]]} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="t-vehicle" className="text-[12.5px] font-normal text-muted-foreground">I travel to work by</Label>
              <Select value={p.vehicle || "car"} onValueChange={(v) => set("vehicle", v as Vehicle)}>
                <SelectTrigger id="t-vehicle" className="h-11 bg-field text-[15px]"><SelectValue /></SelectTrigger>
                <SelectContent>{VEHICLES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
            <MoneyField key={"oi" + (p.otherIncome ?? 0)} id="t-other" label="Yearly salary from an employed job (if any)" defaultValue={p.otherIncome || ""} placeholder="0"
              onBlur={(e) => { const v = Math.max(0, parseFloat(e.target.value) || 0); if (v !== (p.otherIncome || 0)) set("otherIncome", v) }} />
            {salaryLogged && <p className="text-[12.5px] text-warn">You’ve added salary on the Accounting tab. Put your yearly salary before tax here so your tax bands are right.</p>}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="t-scot" className="text-[13.5px]">I live in Scotland <span className="block text-[12px] text-muted-foreground">Uses Scottish income tax bands; NI is the same everywhere.</span></label>
            <Switch id="t-scot" checked={!!p.scotland} onCheckedChange={(v) => set("scotland", v)} />
          </div>
        </div>
      </Panel>

      <p className="px-1 text-[12px] leading-relaxed text-muted-foreground">
        An estimate to help you plan, not financial or tax advice (<a href={`${import.meta.env.BASE_URL}privacy.html#disclaimer`} target="_blank" rel="noopener" className="underline underline-offset-2">disclaimer</a>). It uses {t.year.label} rates: personal allowance £12,570 (reduced above £100,000), Class 4 NI 6% on profits from £12,570 to £50,270 and 2% above, a {money(t.allowance)} trading allowance, and HMRC mileage of {pence(mileageRates("car", startYear).first)} a mile for the first 10,000 business miles by car ({pence(mileageRates("car", startYear).after)} after). Other self-employed work and rent added on the Accounting tab are included; rent uses the {money(PROPERTY_ALLOWANCE)} property allowance and has no NI. It leaves out student loans, pensions, savings interest, dividends, rental expenses and payments on account. Self Assessment for {t.year.label} is due online by 31 January {Number(t.year.to.slice(0, 4)) + 1}.
      </p>
    </div>
  )
}
