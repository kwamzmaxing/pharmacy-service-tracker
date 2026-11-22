// Where to keep savings: the kinds of account, tax on interest and protection, with links to live
// comparison tables. No provider names or rates are shown here: rates change all the time, so the
// page sends people to tables that are kept up to date. Not financial advice.
// Sources: GOV.UK (ISAs, Lifetime ISA, tax on savings interest, Nov 2026); Bank of England (FSCS limit).
import { useState } from "react"
import { ExternalLink } from "lucide-react"
import { fmtDate, money, RATES_CHECKED, taxSummary } from "@/lib/model"
import { useApp } from "./ctx"
import { Field, Panel } from "./bits"

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-ink hover:underline">{children}<ExternalLink className="size-3" aria-hidden /></a>
)
const COMPARE: [string, string][] = [
  ["MoneySavingExpert: top savings accounts", "https://www.moneysavingexpert.com/savings/savings-accounts-best-interest/"],
  ["Which?: compare savings accounts", "https://www.which.co.uk/money/savings-and-isas/compare-savings"],
  ["MoneyHelper: how to find the top savings accounts", "https://www.moneyhelper.org.uk/en/blog/savings/how-to-find-the-top-savings-accounts"],
]

export function SavingsGuide() {
  const { data } = useApp()
  const [amount, setAmount] = useState("")
  const [rate, setRate] = useState("")
  const a = Math.max(0, parseFloat(amount) || 0), r = Math.max(0, parseFloat(rate) || 0)
  const yearly = (a * r) / 100
  // Tax band from this year's estimate: self-employed profit plus any salary entered on the Tax tab
  const t = taxSummary(data)
  const income = t.profit + (Number(data.profile.otherIncome) || 0) + t.property.taxable
  const psa = income > 125140 ? 0 : income > 50270 ? 500 : 1000
  const band = psa === 1000 ? "basic rate" : psa === 500 ? "higher rate" : "additional rate"

  return (
    <Panel title="Where to keep your savings" aside="A guide, not financial advice">
      <div className="grid gap-4 text-[13.5px] leading-relaxed">
        <p className="text-muted-foreground">
          Savings rates change often, so KASA.Rx doesn’t list accounts or rates, and doesn’t recommend any provider. Compare today’s rates on these independent tables:
        </p>
        <ul className="grid gap-1.5">{COMPARE.map(([l, u]) => <li key={u}><A href={u}>{l}</A></li>)}</ul>
        <p className="text-[12.5px] text-muted-foreground">Rates are shown as AER. Some of the best are only for new customers, or need you to hold a particular current account, so check the conditions.</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-secondary/60 p-4">
            <p className="font-medium">Cash ISA</p>
            <p className="mt-1 text-[13px] text-muted-foreground">You don’t pay tax on the interest. You can save up to £20,000 a year across all your ISAs (2026/27). <A href="https://www.gov.uk/individual-savings-accounts">GOV.UK</A></p>
          </div>
          <div className="rounded-xl bg-secondary/60 p-4">
            <p className="font-medium">Lifetime ISA</p>
            <p className="mt-1 text-[13px] text-muted-foreground">Open between 18 and 39. Pay in up to £4,000 a year and the government adds 25% (up to £1,000). For a first home, or from age 60; other withdrawals have a 25% charge. <A href="https://www.gov.uk/lifetime-isa">GOV.UK</A></p>
          </div>
          <div className="rounded-xl bg-secondary/60 p-4">
            <p className="font-medium">Tax on savings interest</p>
            <p className="mt-1 text-[13px] text-muted-foreground">The Personal Savings Allowance lets you earn £1,000 of interest tax-free as a basic-rate taxpayer, £500 at higher rate and £0 at additional rate. Up to £5,000 more can be tax-free if your other income is under £17,570. <A href="https://www.gov.uk/apply-tax-free-interest-on-savings/how-much-is-tax-free">GOV.UK</A></p>
          </div>
          <div className="rounded-xl bg-secondary/60 p-4">
            <p className="font-medium">Is my money protected?</p>
            <p className="mt-1 text-[13px] text-muted-foreground">The FSCS protects up to £120,000 per person at each UK-authorised bank or building society (for failures from 1 December 2025). Banks in the same group that share a banking licence count once. <A href="https://www.bankofengland.co.uk/explainers/what-is-the-financial-services-compensation-scheme">Bank of England</A></p>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 p-4">
          <p className="font-medium">What would it earn?</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Type an amount and a rate from a comparison table. A rough guide: it assumes the rate stays the same for a year and interest isn’t added to the balance.</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md">
            <Field id="sv-amount" label="Amount saved (£)" type="number" inputMode="decimal" min={0} placeholder="5000" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Field id="sv-rate" label="Rate (AER %)" type="number" inputMode="decimal" min={0} step="0.01" placeholder="4.5" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          {a > 0 && r > 0 && (
            <p className="mt-3">
              About <b className="num">{money(yearly)}</b> a year before tax ({money(yearly / 12)} a month).{" "}
              <span className="text-muted-foreground">
                {psa === 0
                  ? "At the additional rate there’s no Personal Savings Allowance, so interest outside an ISA is taxed."
                  : yearly <= psa
                    ? `Your figures on the Tax tab suggest you’re a ${band} taxpayer, so up to ${money(psa)} of interest a year is tax-free: this would be within it (interest from all your accounts counts together).`
                    : `Your figures on the Tax tab suggest you’re a ${band} taxpayer: interest over ${money(psa)} a year (from all your accounts together) is taxed, unless it’s in an ISA.`}
              </span>
            </p>
          )}
        </div>
        <p className="text-[12px] text-muted-foreground">General information, not financial advice. Figures checked on {fmtDate(RATES_CHECKED)}. Check an account’s terms before you open it, and speak to a regulated adviser if you’re unsure.</p>
      </div>
    </Panel>
  )
}
