// Budget maths for the Accounting tab: money in, the tax to put aside, and the suggested split.
// Everything here is plain arithmetic on the person's own figures, so it runs offline and costs nothing.
import { isoOf, money, yearTax, monthLabel, today, type Budget, type BudgetBasis, type Data, type IncomeKind, type Pot, type PotKind, type SaverStyle } from "./model"

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const num = (v: unknown) => Math.max(0, Number(v) || 0)

/* ---------- labels ---------- */
export const STYLES: [SaverStyle, string, string][] = [
  ["heavy", "Heavy saver", "Most of what’s left goes to savings, investing and your pension."],
  ["balanced", "Balanced", "Roughly half of what’s left to enjoy, half put to work."],
  ["light", "Light saver", "A safety net first, then most of it is yours to spend."],
  ["debt", "Paying off debt", "Clear debts faster while keeping a small safety net."],
]
export const INCOME_KINDS: [IncomeKind, string, boolean][] = [
  // [kind, label, set tax aside by default]
  ["selfemployed", "Other self-employed work", true],
  ["employment", "Salary (tax already taken)", false],
  ["rental", "Rental income", true],
  ["investment", "Interest or dividends", false],
  ["benefits", "Benefits", false],
  ["gift", "Gift or transfer", false],
  ["other", "Other", false],
]
export const incomeKindName = (k: IncomeKind) => INCOME_KINDS.find((x) => x[0] === k)?.[1] ?? "Other"
export const BASES: [BudgetBasis, string][] = [["month", "This month"], ["last", "Last month"], ["avg3", "3-month average"], ["own", "My own figure"]]

/** Each kind of pot keeps the same colour slot everywhere, so the tax pot is always the same colour. */
const KIND_COLOR: Record<Exclude<PotKind, "custom">, number> = {
  tax: 0, essentials: 1, savings: 2, emergency: 3, debt: 4, invest: 5, business: 6, spending: 7,
}
export const MAX_POTS = 8

/* ---------- money in ---------- */
const ymOf = (iso: string) => iso.slice(0, 7)
function monthShift(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number)
  return isoOf(new Date(y, m - 1 + n, 1)).slice(0, 7)
}
export type MoneyIn = {
  label: string
  /** Total money in, per month. */
  total: number
  invoices: number
  other: number
  /** Self-employed income: invoices plus other self-employed work (income tax and Class 4 NI). */
  trading: number
  /** Rental income (income tax only). */
  property: number
  /** Other income marked "put tax aside" (income tax only). */
  extra: number
  /** Business costs (from the Expenses tab) over the same period, per month. */
  business: number
}
/** Kinds of other income that the Tax tab counts automatically. */
export const TAX_TAB_KINDS: IncomeKind[] = ["selfemployed", "rental"]
/** Money that came in over the chosen period, as a monthly figure. */
export function moneyIn(d: Data, basis: BudgetBasis, now = today()): MoneyIn {
  const b = d.budget
  const thisYm = ymOf(now)
  if (basis === "own") {
    const total = num(b.ownIncome)
    return { label: "Your own monthly figure", total, invoices: total, other: 0, trading: total, property: 0, extra: 0, business: 0 }
  }
  const months = basis === "month" ? [thisYm] : basis === "last" ? [monthShift(thisYm, -1)] : [-3, -2, -1].map((n) => monthShift(thisYm, n))
  const inMonths = (date?: string | null) => !!date && months.includes(ymOf(date))
  const invoices = sum(d.invoices.filter((i) => i.status === "paid" && inMonths(i.paidDate)).map((i) => num(i.total)))
  const others = b.incomes.filter((x) => inMonths(x.date))
  const of = (pred: (x: (typeof others)[number]) => boolean) => sum(others.filter(pred).map((x) => num(x.amount)))
  const other = of(() => true)
  const otherSE = of((x) => x.kind === "selfemployed")
  const property = of((x) => x.kind === "rental")
  const extra = of((x) => !TAX_TAB_KINDS.includes(x.kind) && x.setAsideTax)
  const business = sum(d.expenses.filter((x) => inMonths(x.date)).map((x) => num(x.amount)))
  const n = months.length
  const label = basis === "avg3" ? `${monthLabel(months[0]).split(" ")[0]} to ${monthLabel(months[2])}` : monthLabel(months[0])
  return { label, total: (invoices + other) / n, invoices: invoices / n, other: other / n, trading: (invoices + otherSE) / n, property: property / n, extra: extra / n, business: business / n }
}

/**
 * Tax to put aside each month: the same sums as the Tax tab (income tax, Class 4 NI on self-employment,
 * no NI on rent, £1,000 property allowance), worked out on a full year at this month's rate.
 */
export function monthlyTax(d: Data, m: MoneyIn) {
  const p = d.profile
  const y = yearTax({ trading: (m.trading - m.business) * 12, property: m.property * 12, extra: m.extra * 12, salary: num(p.otherIncome), scotland: !!p.scotland })
  const base = Math.max(0, m.trading - m.business) + m.property + m.extra
  return { amount: y.total / 12, rate: base > 0 ? y.total / 12 / base : 0 }
}

/* ---------- the suggested split ---------- */
/** How what's left (after tax, business costs, essentials and minimum debt payments) is shared out, by style. */
const WEIGHTS: Record<SaverStyle, Partial<Record<PotKind, number>>> = {
  heavy: { emergency: 25, savings: 25, invest: 35, spending: 15 },
  balanced: { emergency: 15, savings: 15, invest: 20, spending: 50 },
  light: { emergency: 15, savings: 10, invest: 5, spending: 70 },
  debt: { debt: 40, emergency: 15, savings: 5, invest: 5, spending: 35 },
}
const NAMES: Record<Exclude<PotKind, "custom">, string> = {
  tax: "Tax set-aside", business: "Business costs", essentials: "Essentials", debt: "Debt repayments",
  emergency: "Emergency fund", savings: "Savings", invest: "Pension & investing", spending: "Spending",
}
export type Suggestion = { pots: Pot[]; amounts: Record<string, number>; shortfall: number; notes: string[] }

/** Whole-number percentages that add up to exactly 100 (largest remainder). */
export function wholePercents(values: number[]) {
  const total = sum(values)
  if (total <= 0) return values.map(() => 0)
  const raw = values.map((v) => (v / total) * 100)
  const out = raw.map(Math.floor)
  let left = 100 - sum(out)
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) { if (left <= 0) break; out[i]++; left-- }
  return out
}

export function suggest(d: Data, m: MoneyIn): Suggestion {
  const b = d.budget
  const income = m.total
  const notes: string[] = []
  const amounts: Partial<Record<PotKind, number>> = {}
  const why: Partial<Record<PotKind, string>> = {}
  let left = income

  const t = monthlyTax(d, m)
  const tax = Math.min(left, t.amount)
  if (tax > 0) {
    amounts.tax = tax
    why.tax = `About ${Math.round(t.rate * 100)}% of your profit${m.property ? " and rent" : ""}, for income tax and National Insurance if you earned at this rate all year. The same sums as the Tax tab. Self Assessment is due by 31 January.`
  }
  left -= tax

  const business = Math.min(left, m.business)
  if (business > 0) { amounts.business = business; why.business = "What you spent on work costs over the same period (from the Expenses tab)." }
  left -= business

  const essentials = Math.min(left, num(b.essentials))
  if (essentials > 0) { amounts.essentials = essentials; why.essentials = "Rent or mortgage, bills, food and getting about: the figure you entered." }
  left -= essentials

  const debtMin = Math.min(left, num(b.debt))
  if (debtMin > 0) { amounts.debt = debtMin; why.debt = "Your minimum monthly repayments." }
  left -= debtMin

  const shortfall = Math.max(0, num(b.essentials) + num(b.debt) + t.amount + m.business - income)
  if (shortfall > 0) notes.push(`Your tax, costs, essentials and repayments come to more than this period’s income, by about ${money(shortfall)}. There’s nothing left to share out, so look at the essentials figure or wait for more invoices to be paid.`)

  // Share out what's left by style
  const style: SaverStyle = b.style === "debt" && !num(b.debt) ? "balanced" : b.style
  if (b.style === "debt" && !num(b.debt)) notes.push("Add your monthly debt repayments to use the ‘Paying off debt’ split. Until then it works like Balanced.")
  const w = { ...WEIGHTS[style] }
  if (b.emergencyDone && w.emergency) {
    // Safety net already built: send its share to long-term saving instead
    const k: PotKind = style === "heavy" ? "invest" : "savings"
    w[k] = (w[k] || 0) + w.emergency
    delete w.emergency
  }
  const wTotal = sum(Object.values(w).map(num))
  if (left > 0) {
    for (const [k, v] of Object.entries(w) as [PotKind, number][]) amounts[k] = (amounts[k] || 0) + (left * v) / wTotal
    const monthsCovered = num(b.essentials) ? 3 * num(b.essentials) : 0
    why.emergency = monthsCovered
      ? `Build up 3 to 6 months of essentials (${money(monthsCovered)} to ${money(monthsCovered * 2)}) for quiet weeks or late payers. Keep it in an easy-access savings account.`
      : "A cushion for quiet weeks or late payers. Aim for 3 to 6 months of essentials in an easy-access account."
    why.savings = "For goals in the next few years: a holiday, a car, a house deposit."
    why.invest = "As a locum there’s no employer pension, so this is yours to build. A personal pension or SIPP gets tax relief, and a Stocks & Shares ISA is tax-free."
    why.spending = "Guilt-free money for everything else."
    if (style === "debt") why.debt = "Your minimum repayments plus extra, highest interest rate first."
  }

  const kinds = (["tax", "business", "essentials", "debt", "emergency", "savings", "invest", "spending"] as const).filter((k) => (amounts[k] || 0) > 0.005)
  const pcts = wholePercents(kinds.map((k) => amounts[k] || 0))
  const pots: Pot[] = kinds.map((k, i) => ({ id: "s-" + k, name: NAMES[k], pct: pcts[i], color: KIND_COLOR[k], kind: k, why: why[k] }))
  const out: Record<string, number> = {}
  kinds.forEach((k) => (out["s-" + k] = amounts[k] || 0))
  return { pots, amounts: out, shortfall, notes }
}

/* ---------- my own split ---------- */
/** The first colour slot not already used by another pot. */
export function freeColor(pots: Pot[]) {
  const used = new Set(pots.map((p) => p.color))
  for (let i = 0; i < MAX_POTS; i++) if (!used.has(i)) return i
  return 0
}
export const allocated = (pots: Pot[]) => sum(pots.map((p) => num(p.pct)))
/** A simple 50/30/20-style starting point with a tax pot first. */
export function starterPots(uid: () => string): Pot[] {
  return [
    { id: uid(), name: "Tax set-aside", pct: 25, color: KIND_COLOR.tax, kind: "tax" },
    { id: uid(), name: "Essentials", pct: 40, color: KIND_COLOR.essentials, kind: "essentials" },
    { id: uid(), name: "Savings", pct: 15, color: KIND_COLOR.savings, kind: "savings" },
    { id: uid(), name: "Spending", pct: 20, color: KIND_COLOR.spending, kind: "spending" },
  ]
}

/** Months of ticked-off pots worth keeping. */
export function pruneMoved(moved: Budget["moved"], keep = 12) {
  const keys = Object.keys(moved).sort().slice(-keep)
  return Object.fromEntries(keys.map((k) => [k, moved[k]]))
}
