// Making Tax Digital for Income Tax: digital records and quarterly update totals, worked out from
// the tracker so they can be exported to HMRC-recognised bridging software. KASA.Rx never sends
// anything to HMRC itself.
//
// Sources (checked on GOV.UK, November 2026):
// - Quarterly update direction (the self-employment income and expense categories):
//   gov.uk/government/publications/update-notice-for-making-tax-digital-for-income-tax
// - Which costs go in which category: Self-employment (full) notes SA103F 2026, boxes 17 to 30
// - Update periods and deadlines: gov.uk/guidance/use-making-tax-digital-for-income-tax/send-quarterly-updates
// - Digital records (amount, date, category) and CSV import as a digital link:
//   gov.uk/guidance/use-making-tax-digital-for-income-tax/create-digital-records
// - Who needs it and when: gov.uk/guidance/find-out-if-and-when-you-need-to-use-making-tax-digital-for-income-tax
import { entryAmt, mileageRates, unitOf, type Data, type ExpenseCategory } from "./model"

/** HMRC's self-employment categories, in the order of the quarterly update direction. */
export const HMRC_INCOME = ["Turnover", "Other business income"] as const
export const HMRC_EXPENSES = [
  "Cost of goods bought for resale or goods used",
  "Construction industry — payments to subcontractors",
  "Wages, salaries, and other staff costs",
  "Car, van, and travel expenses",
  "Rent, rates, power, and insurance costs",
  "Repairs and maintenance of property and equipment",
  "Phone, fax, stationery, and other office costs",
  "Advertising",
  "Business entertainment costs",
  "Interest on bank and other loans",
  "Bank, credit card and other financial charges",
  "Accountancy, legal and other professional fees",
  "Other business expenses",
] as const
export type HmrcCategory = (typeof HMRC_INCOME)[number] | (typeof HMRC_EXPENSES)[number]

/** Where each KASA.Rx expense category goes (SA103F notes, boxes 20, 23, 28 and 30). */
export const HMRC_FOR: Record<ExpenseCategory, HmrcCategory> = {
  travel: "Car, van, and travel expenses", // box 20: fares, parking
  accommodation: "Car, van, and travel expenses", // box 20: hotel room costs
  subsistence: "Car, van, and travel expenses", // box 20: meals on overnight business trips
  fees: "Other business expenses", // box 30: trade or professional journals and subscriptions
  insurance: "Accountancy, legal and other professional fees", // box 28: indemnity insurance premiums
  training: "Other business expenses", // no box of its own; box 30 covers other running costs
  phone: "Phone, fax, stationery, and other office costs", // box 23
  equipment: "Phone, fax, stationery, and other office costs", // box 23: stationery, printing, postage, software, small office equipment
  accountancy: "Accountancy, legal and other professional fees", // box 28
  other: "Other business expenses", // box 30
}

export type PeriodKind = "standard" | "calendar"
export type UpdatePeriod = { n: 1 | 2 | 3 | 4; from: string; to: string; deadline: string }
/**
 * The four quarterly updates for the tax year starting in April of `startYear`.
 * Each one covers from the start of the year to the end of its period.
 */
export function updatePeriods(startYear: number, kind: PeriodKind): UpdatePeriod[] {
  const y = startYear, n = startYear + 1
  const from = kind === "standard" ? `${y}-04-06` : `${y}-04-01`
  const ends = kind === "standard"
    ? [`${y}-07-05`, `${y}-10-05`, `${n}-01-05`, `${n}-04-05`]
    : [`${y}-06-30`, `${y}-09-30`, `${y}-12-31`, `${n}-03-31`]
  const deadlines = [`${y}-08-07`, `${y}-11-07`, `${n}-02-07`, `${n}-05-07`]
  return ends.map((to, i) => ({ n: (i + 1) as 1 | 2 | 3 | 4, from, to, deadline: deadlines[i] }))
}

export type DigitalRecord = {
  date: string
  type: "Income" | "Expense"
  category: HmrcCategory
  description: string
  amount: number
  source: string
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Digital records for one tax year: invoices as turnover (on the date paid with cash basis, or the
 * invoice date with traditional accounting), expenses, and flat-rate mileage.
 */
export function digitalRecords(d: Data, startYear: number, kind: PeriodKind): DigitalRecord[] {
  const [from, to] = kind === "standard" ? [`${startYear}-04-06`, `${startYear + 1}-04-05`] : [`${startYear}-04-01`, `${startYear + 1}-03-31`]
  const inRange = (x?: string | null) => !!x && x >= from && x <= to
  const cash = (d.profile.taxBasis || "cash") === "cash"
  const out: DigitalRecord[] = []
  for (const i of d.invoices) {
    const date = cash ? (i.status === "paid" ? i.paidDate : null) : i.issued
    if (!inRange(date)) continue
    out.push({ date: date!, type: "Income", category: "Turnover", description: `Invoice ${i.number}${i.to?.name ? ` · ${i.to.name}` : ""}`, amount: r2(Number(i.total) || 0), source: cash ? "Invoice paid" : "Invoice issued" })
  }
  for (const x of d.expenses) {
    if (!inRange(x.date)) continue
    out.push({ date: x.date, type: "Expense", category: HMRC_FOR[x.category] ?? "Other business expenses", description: x.desc || x.category, amount: r2(Number(x.amount) || 0), source: "Expense" })
  }
  // Business miles at HMRC's flat rates, in date order so the rate drops after 10,000 miles in the tax year
  const rates = mileageRates(d.profile.vehicle || "car", startYear)
  if (rates.first > 0) {
    const mileSvc = new Set(d.services.filter((s) => unitOf(s) === "mile").map((s) => s.id))
    const trips = d.entries.filter((e) => mileSvc.has(e.serviceId) && inRange(e.date)).sort((a, b) => a.date.localeCompare(b.date))
    let used = 0
    for (const e of trips) {
      const miles = Number(e.qty) || 0
      const atFirst = Math.max(0, Math.min(miles, 10000 - used))
      const amount = atFirst * rates.first + (miles - atFirst) * rates.after
      used += miles
      if (amount <= 0) continue
      out.push({ date: e.date, type: "Expense", category: "Car, van, and travel expenses", description: `${miles} business miles at HMRC flat rate${e.desc ? ` · ${e.desc}` : ""}`, amount: r2(amount), source: "Mileage (simplified expenses)" })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type))
}

export type UpdateTotals = UpdatePeriod & { totals: Partial<Record<HmrcCategory, number>>; income: number; expenses: number; count: number }
/** Totals for each quarterly update: from the start of the year to the end of each period. */
export function updateTotals(records: DigitalRecord[], periods: UpdatePeriod[]): UpdateTotals[] {
  return periods.map((p) => {
    const rs = records.filter((r) => r.date >= p.from && r.date <= p.to)
    const totals: Partial<Record<HmrcCategory, number>> = {}
    for (const r of rs) totals[r.category] = r2((totals[r.category] || 0) + r.amount)
    const income = r2(rs.filter((r) => r.type === "Income").reduce((a, r) => a + r.amount, 0))
    const expenses = r2(rs.filter((r) => r.type === "Expense").reduce((a, r) => a + r.amount, 0))
    return { ...p, totals, income, expenses, count: rs.length }
  })
}

/** Thresholds: qualifying income in one tax year decides whether MTD starts two Aprils later. */
export const MTD_THRESHOLDS: [number, number][] = [[2024, 50000], [2025, 30000], [2026, 20000]]
/**
 * "Qualifying income" as far as the tracker knows it: self-employment and property income before
 * expenses (not a PAYE salary). Invoices count when paid with cash basis, or when issued otherwise.
 */
export function qualifyingIncome(d: Data, startYear: number) {
  const from = `${startYear}-04-06`, to = `${startYear + 1}-04-05`
  const inY = (x?: string | null) => !!x && x >= from && x <= to
  const cash = (d.profile.taxBasis || "cash") === "cash"
  const invoices = d.invoices.filter((i) => inY(cash ? (i.status === "paid" ? i.paidDate : null) : i.issued)).reduce((a, i) => a + (Number(i.total) || 0), 0)
  // Work logged but not yet invoiced isn't income until it's invoiced or paid
  const other = d.budget.incomes.filter((x) => (x.kind === "selfemployed" || x.kind === "rental") && inY(x.date)).reduce((a, x) => a + (Number(x.amount) || 0), 0)
  return r2(invoices + other)
}
/** Logged work in a tax year (for a hint when nothing has been invoiced yet). */
export const loggedIn = (d: Data, startYear: number) =>
  d.entries.filter((e) => e.date >= `${startYear}-04-06` && e.date <= `${startYear + 1}-04-05`).reduce((a, e) => a + entryAmt(e), 0)
