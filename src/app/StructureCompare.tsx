// Sole trader or limited company? A side-by-side estimate on the same profit, plus the non-money
// differences that matter for locums. A guide, not financial advice.
import { useState } from "react"
import { ExternalLink } from "lucide-react"
import { money } from "@/lib/model"
import { compareStructures } from "@/lib/structure"
import { cn } from "@/lib/utils"
import { MoneyField, Panel } from "./bits"

const G = "https://www.gov.uk"
const SOURCES: [string, string][] = [
  ["Corporation Tax rates", `${G}/corporation-tax-rates`],
  ["Tax on dividends", `${G}/tax-on-dividends`],
  ["Rates and thresholds for employers 2026 to 2027", `${G}/guidance/rates-and-thresholds-for-employers-2026-to-2027`],
  ["Employment Allowance: who can claim", `${G}/claim-employment-allowance/eligibility`],
  ["Off-payroll working (IR35)", `${G}/guidance/understanding-off-payroll-working-ir35`],
  ["Register a limited company", `${G}/limited-company-formation/register-your-company`],
  ["Running a limited company", `${G}/running-a-limited-company`],
]

export function StructureCompare({ profit, otherSalary, scotland, openAccountant }: { profit: number; otherSalary: number; scotland: boolean; openAccountant: () => void }) {
  const [p, setP] = useState(Math.round(profit))
  const [costs, setCosts] = useState(0)
  const c = compareStructures({ profit: p, otherSalary, companyCosts: costs })
  const close = Math.abs(c.difference) < Math.max(100, p * 0.01)
  const better = c.difference > 0 ? "company" : "sole"
  const co = c.company

  const Card = ({ id, title, total, keep, lines }: { id: "sole" | "company"; title: string; total: number; keep: number; lines: [string, number][] }) => (
    <div className={cn("rounded-xl p-4", !close && better === id ? "bg-ok-tint" : "bg-secondary/60")}>
      <div className="flex items-center justify-between gap-2 text-[13.5px] font-medium">
        {title}
        {!close && better === id && <span className="rounded-full bg-background/70 px-2 py-0.5 text-[11px] text-ok-ink">Keeps more</span>}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[12.5px]">
        <div><span className="block text-muted-foreground">You keep</span><span className="num text-[17px] font-medium">{money(keep)}</span></div>
        <div><span className="block text-muted-foreground">Tax and NI</span><span className="num text-[17px] font-medium">{money(total)}</span></div>
      </div>
      <ul className="mt-2 grid gap-0.5 text-[12px] text-muted-foreground">
        {lines.filter(([, v]) => v > 0.5).map(([k, v]) => <li key={k} className="flex justify-between gap-3"><span>{k}</span><span className="num">{money(v)}</span></li>)}
      </ul>
    </div>
  )

  return (
    <Panel title="Sole trader or limited company?" aside="A guide, not financial advice">
      <p className="mb-4 max-w-[64ch] text-[13px] text-muted-foreground">
        Some locums work through their own limited company instead of as a sole trader. Here’s roughly what each would mean for the same yearly profit, using 2026 to 2027 rates. Change the figures to try other amounts.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <MoneyField key={"p" + Math.round(profit)} id="sc-profit" label="Yearly profit from locum work" defaultValue={p || ""} placeholder="0"
          onBlur={(e) => setP(Math.max(0, parseFloat(e.target.value) || 0))} />
        <MoneyField id="sc-costs" label="Extra yearly cost of running a company (optional)" defaultValue={costs || ""} placeholder="0"
          onBlur={(e) => setCosts(Math.max(0, parseFloat(e.target.value) || 0))} />
      </div>
      <p className="mt-1.5 text-[12px] text-muted-foreground">Profit starts at this year’s estimate. For running costs, add things like accountancy fees from real quotes; we don’t guess them.{otherSalary > 0 ? ` Your ${money(otherSalary)} PAYE salary is included, as it uses up your tax-free allowance and bands first.` : ""}</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Card id="sole" title="Sole trader" total={c.soleTrader.total} keep={c.soleTrader.takeHome}
          lines={[["Income tax", c.soleTrader.incomeTax], ["Class 4 National Insurance", c.soleTrader.ni]]} />
        <Card id="company" title="Limited company" total={co.total} keep={co.takeHome}
          lines={[["Corporation Tax", co.corpTax], ["Employer’s NI on your salary", co.employerNi], ["Employee NI on your salary", co.employeeNi], ["Income tax on salary and dividends", co.incomeTax], ["Running costs you entered", co.costs]]} />
      </div>
      <p className="mt-3 text-[13.5px]">
        {p <= 0 ? "Enter a yearly profit to compare."
          : close ? <>On these figures, both come out <b>about the same</b>.</>
          : better === "company" ? <>On these figures, a company would leave you about <b>{money(c.difference)}</b> a year more, before the points below.</>
          : <>On these figures, being a sole trader leaves you about <b>{money(-c.difference)}</b> a year more.</>}
      </p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        The company side pays you a salary of {money(co.salary)} (whichever of £0, £5,000, £6,708 or £12,570 works out best; these are National Insurance thresholds for 2026 to 2027) and the rest of its profit after Corporation Tax as dividends, all in the same year.
      </p>

      <h3 className="mt-5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Things to weigh up</h3>
      <ul className="mt-2 grid gap-2.5 text-[13px] leading-snug">
        <li><b className="font-medium">IR35.</b> With medium or large clients, the client decides whether you’re employed for tax. If you are, the fee paid to your company has income tax and NI taken off as if you were employed, and most of any saving disappears. With small private-sector clients, your company decides.</li>
        <li><b className="font-medium">Paperwork.</b> A company costs £100 to register online and you’ll need to verify your identity with Companies House. Each year it files accounts, a Company Tax Return and a confirmation statement (there’s a fee), and runs payroll for your salary. As a director you’re legally responsible for these, even with an accountant’s help.</li>
        <li><b className="font-medium">The money is the company’s.</b> You take it out as salary or dividends. Leaving some in the company and taking it out later can change the sums, so it’s worth asking an accountant to model it.</li>
        <li><b className="font-medium">Records.</b> A company keeps its records for 6 years from the end of the financial year; a sole trader for at least 5 years after the 31 January deadline.</li>
        <li><b className="font-medium">Left out here:</b> student loans, pensions, Employment Allowance (not available when a sole director is the company’s only employee) and any income other than a PAYE salary.{scotland ? " This comparison uses England, Wales and Northern Ireland income tax rates; with Scottish rates the figures will differ." : ""}</li>
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={openAccountant} className="rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Talk to an accountant about this</button>
        <span className="text-[12px] text-muted-foreground">This is a general comparison, not advice for your situation.</span>
      </div>
      <details className="mt-3 text-[12.5px]">
        <summary className="cursor-pointer font-medium text-brand-ink">Where these figures come from (GOV.UK)</summary>
        <ul className="mt-2 grid gap-1">
          {SOURCES.map(([l, u]) => <li key={u}><a href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-ink hover:underline">{l}<ExternalLink className="size-3" aria-hidden /></a></li>)}
        </ul>
        <p className="mt-2 text-muted-foreground">Corporation Tax 19% on profits up to £50,000 and 25% over £250,000, with Marginal Relief between. Dividends: £500 allowance, then 10.75%, 35.75% or 39.35%. Employer’s NI 15% above £5,000; employee NI 8% above £12,570. Checked 24 November 2026.</p>
      </details>
    </Panel>
  )
}
