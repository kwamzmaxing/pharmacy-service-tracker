// Making Tax Digital for Income Tax: am I in it, my four quarterly updates, and an export of my
// digital records for HMRC-recognised bridging software. Facts are from GOV.UK (see src/lib/mtd.ts).
import { useState } from "react"
import { toast } from "sonner"
import { Download, ExternalLink, FileSpreadsheet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { fmtDate, money, RATES_CHECKED, today } from "@/lib/model"
import { digitalRecords, HMRC_EXPENSES, HMRC_INCOME, loggedIn, MTD_THRESHOLDS, qualifyingIncome, updatePeriods, updateTotals, type PeriodKind } from "@/lib/mtd"
import { saveFile } from "@/lib/store"
import { useApp } from "./ctx"
import { Chips, Panel } from "./bits"

const G = "https://www.gov.uk"
const LINKS: [string, string][] = [
  ["Find out if and when you need Making Tax Digital", `${G}/guidance/find-out-if-and-when-you-need-to-use-making-tax-digital-for-income-tax`],
  ["Send quarterly updates: periods and deadlines", `${G}/guidance/use-making-tax-digital-for-income-tax/send-quarterly-updates`],
  ["Create digital records", `${G}/guidance/use-making-tax-digital-for-income-tax/create-digital-records`],
  ["Choose the right software (including bridging software)", `${G}/guidance/choose-the-right-software-for-making-tax-digital-for-income-tax`],
  ["Find software that works with Making Tax Digital", `${G}/guidance/find-software-that-works-with-making-tax-digital-for-income-tax`],
  ["Quarterly update direction (the categories)", `${G}/government/publications/update-notice-for-making-tax-digital-for-income-tax`],
]
const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-ink hover:underline">{children}<ExternalLink className="size-3" aria-hidden /></a>
)

export function MtdPanel({ startYear }: { startYear: number }) {
  const { data, commit, me, openAccountant } = useApp()
  const p = data.profile
  const kind: PeriodKind = p.mtdPeriods || "standard"
  const [open, setOpen] = useState<number | null>(null)
  const records = digitalRecords(data, startYear, kind)
  const updates = updateTotals(records, updatePeriods(startYear, kind))
  const t = today()

  // Am I in it? Look at the years the tracker has figures for.
  const checks = MTD_THRESHOLDS.map(([y, limit]) => ({ y, limit, income: qualifyingIncome(data, y), logged: loggedIn(data, y), starts: `6 April ${y + 2}` }))
  const over = checks.filter((c) => c.income > c.limit)
  const first = over[0]

  async function exportFile(type: "xlsx" | "csv") {
    if (!records.length) return toast("Nothing to export for this tax year yet.")
    const { downloadWorkbook, toCsv } = await import("@/lib/sheets")
    const label = `${startYear}-${String(startYear + 1).slice(2)}`
    const rows = records.map((r) => ({ Date: r.date, Type: r.type, "HMRC category": r.category, Description: r.description, "Amount (£)": r.amount, Source: r.source }))
    if (type === "csv") {
      const csv = toCsv(rows)
      saveFile(`digital-records-${label}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }))
      return toast.success("CSV saved ✓")
    }
    const used = [...HMRC_INCOME, ...HMRC_EXPENSES].filter((c) => updates.some((u) => u.totals[c]))
    const quarters = updates.map((u) => {
      const row: Record<string, string | number> = { Update: `Quarterly update ${u.n}`, "Covers": `${fmtDate(u.from)} to ${fmtDate(u.to)}`, Deadline: fmtDate(u.deadline) }
      for (const c of used) row[c] = u.totals[c] || 0
      row["Total income (£)"] = u.income
      row["Total expenses (£)"] = u.expenses
      return row
    })
    const notes = [
      [`KASA.Rx digital records for the ${startYear} to ${startYear + 1} tax year (${kind === "standard" ? "standard update periods, from 6 April" : "calendar update periods, from 1 April"}).`],
      [`Prepared for ${p.tradingName || p.fullName || me.name || me.email} on ${fmtDate(t)}.`],
      [""],
      ["How to use this file"],
      ["Import it into HMRC-recognised Making Tax Digital software (for example bridging software), which sends your quarterly updates and tax return. KASA.Rx does not send anything to HMRC."],
      ["Import the file rather than retyping or copying and pasting the figures: HMRC asks for records to be linked digitally, and lists importing and exporting CSV files as one way."],
      ["Each quarterly update covers from the start of the tax year to the end of the update period, using the same income and expense categories as Self Assessment."],
      ["Check every record before you send an update. Keep your original invoices and receipts (or copies) as you would for Self Assessment."],
      [""],
      ["What's included"],
      [(p.taxBasis || "cash") === "cash" ? "Income: invoices on the date they were paid (cash basis)." : "Income: invoices on the date they were issued (traditional accounting)."],
      ["Expenses: everything on the Expenses tab, in the HMRC category it belongs to (Self-employment (full) notes SA103F, boxes 20, 23, 28 and 30)."],
      ["Mileage: business miles at HMRC's flat rates (simplified expenses), under car, van and travel expenses."],
      ["Not included: rental income (a property business has its own records and updates) and income added on the Accounting tab. If other self-employed work is a separate business, it needs its own records too."],
      [""],
      ["A guide, not financial or tax advice. Check with HMRC or an accountant."],
      [""],
      ["GOV.UK sources"],
      ...LINKS.map(([l, u]) => [`${l}: ${u}`]),
    ]
    await downloadWorkbook(`digital-records-${label}.xlsx`, [
      { name: "Digital records", rows }, { name: "Quarterly updates", rows: quarters }, { name: "Notes", lines: notes },
    ])
    toast.success("Spreadsheet saved ✓")
  }

  return (
    <Panel title="Making Tax Digital" aside={`${startYear}/${String(startYear + 1).slice(2)} · quarterly updates`}>
      <div className="grid gap-4 text-[13.5px]">
        <div className="rounded-xl bg-secondary/60 px-4 py-3">
          <p className="font-medium">Do I need it?</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            You need Making Tax Digital for Income Tax if your <b className="font-medium text-foreground">self-employment and property income before expenses</b> (not a PAYE salary) is over £50,000 in 2024/25 (from 6 April 2026), £30,000 in 2025/26 (from 6 April 2027) or £20,000 in 2026/27 (from 6 April 2028).
          </p>
          <p className="mt-2 text-[13px]">
            {first
              ? <>From what’s in KASA.Rx, your {first.y}/{String(first.y + 1).slice(2)} income was {money(first.income)}, over £{first.limit.toLocaleString("en-GB")}, so you’re likely to need it from <b>{first.starts}</b>.</>
              : checks.some((c) => c.income > 0)
                ? <>From what’s in KASA.Rx: {checks.filter((c) => c.income > 0).map((c) => `${c.y}/${String(c.y + 1).slice(2)} ${money(c.income)}`).join(", ")}, none over its threshold so far.</>
                : <>KASA.Rx doesn’t have enough income recorded for those years to tell.</>}{" "}
            <span className="text-muted-foreground">It only knows what you’ve recorded here, so check with <A href={LINKS[0][1]}>HMRC’s tool</A>. HMRC also writes to people who need to start.</span>
          </p>
        </div>

        <div className="grid gap-1.5">
          <span className="text-[12.5px] text-muted-foreground">Update periods</span>
          <Chips<PeriodKind> label="Update periods" value={kind} onChange={(v) => commit((d) => void (d.profile.mtdPeriods = v), "Saved ✓")}
            options={[["standard", "Standard (from 6 April)"], ["calendar", "Calendar (from 1 April)"]]} />
          <p className="text-[12px] text-muted-foreground">Standard is the default. Calendar is for accounts that run from 1 April to 31 March. You choose in your software before your first update, and can’t change it for the rest of the year.</p>
        </div>

        <ol className="grid gap-2">
          {updates.map((u) => {
            const state = t > u.deadline ? "past" : t > u.to ? "due" : t >= u.from ? "open" : "later"
            const isOpen = open === u.n
            return (
              <li key={u.n} className="rounded-xl bg-secondary/60">
                <button type="button" onClick={() => setOpen(isOpen ? null : u.n)} aria-expanded={isOpen}
                  className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="min-w-0">
                    <span className="block font-medium">Update {u.n} <span className="font-normal text-muted-foreground">· {fmtDate(u.from)} to {fmtDate(u.to)}</span></span>
                    <span className={cn("block text-[12.5px]", state === "due" ? "font-medium text-warn" : "text-muted-foreground")}>
                      {state === "past" ? `Deadline ${fmtDate(u.deadline)} (passed)` : state === "due" ? `Period ended: send by ${fmtDate(u.deadline)}` : state === "open" ? `In progress · send by ${fmtDate(u.deadline)}` : `Send by ${fmtDate(u.deadline)}`}
                    </span>
                  </span>
                  <span className="num text-[12.5px] text-muted-foreground sm:text-right">
                    <span className="block"><span className="text-foreground">{money(u.income)}</span> income</span>
                    <span className="block"><span className="text-foreground">{money(u.expenses)}</span> expenses</span>
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-border/60 px-4 py-3">
                    {!u.count ? <p className="text-[12.5px] text-muted-foreground">Nothing recorded for this period yet. HMRC still expects an update if you’re in Making Tax Digital, even with nothing to report.</p> : (
                      <ul className="divide-y divide-border/60 text-[13px]">
                        {[...HMRC_INCOME, ...HMRC_EXPENSES].filter((c) => u.totals[c]).map((c) => (
                          <li key={c} className="flex items-baseline justify-between gap-3 py-1.5"><span className="min-w-0">{c}</span><span className="num whitespace-nowrap">{money(u.totals[c] || 0)}</span></li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
        <p className="text-[12px] text-muted-foreground">
          Each update covers from the start of the tax year to the end of its period, using the same categories as Self Assessment. For 2026/27, HMRC isn’t giving penalty points for late quarterly updates; from 2027/28, 4 points means a £200 penalty.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => exportFile("xlsx")}><FileSpreadsheet /> Download records (spreadsheet)</Button>
          <Button variant="outline" onClick={() => exportFile("csv")}><Download /> CSV</Button>
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          {records.length} records for this year: invoices{(p.taxBasis || "cash") === "cash" ? " (on the date paid)" : " (on the invoice date)"}, expenses and mileage, each with its HMRC category. Import the file into HMRC-recognised software, such as bridging software, to send your updates. HMRC counts importing a CSV file as a digital link; don’t retype or copy and paste the figures. KASA.Rx doesn’t send anything to HMRC. Rental income and other businesses need their own records.
        </p>

        <details className="text-[12.5px]">
          <summary className="cursor-pointer font-medium text-brand-ink">GOV.UK guidance</summary>
          <ul className="mt-2 grid gap-1.5">{LINKS.map(([l, u]) => <li key={u}><A href={u}>{l}</A></li>)}</ul>
        </details>
        <p className="text-[12px] text-muted-foreground">A guide, not financial or tax advice. Dates and categories checked against GOV.UK on {fmtDate(RATES_CHECKED)}. Check your records and figures with HMRC or an accountant. <button type="button" onClick={openAccountant} className="font-medium text-brand-ink hover:underline">Talk to an accountant</button></p>
      </div>
    </Panel>
  )
}
