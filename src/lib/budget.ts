// Budget maths for the Accounting tab: money in, the tax to put aside, and the suggested split.
// Everything here is plain arithmetic on the person's own figures, so it runs offline and costs nothing.
import { isoOf, money, yearTax, monthLabel, today, type Budget, type BudgetBasis, type Data, type IncomeKind, type Pot, type PotKind, type SaverStyle, type OutCat } from "./model"

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
  emergency: "Emergency fund", savings: "Savings", invest: "ISA, pension & investing", spending: "Spending",
}

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

/* ---------- what they pay each month ---------- */
type Group = "essentials" | "spending" | "debt" | "emergency" | "savings" | "invest"
/** [category, label, which pot it belongs to, example] */
export const OUT_CATS: [OutCat, string, Group, string][] = [
  ["housing", "Rent or mortgage", "essentials", "Rent, mortgage, council tax"],
  ["bills", "Bills and utilities", "essentials", "Energy, water, phone, broadband"],
  ["food", "Food and groceries", "essentials", "Weekly shop"],
  ["transport", "Transport and car", "essentials", "Car finance, insurance, fuel, parking, train"],
  ["childcare", "Childcare", "essentials", "Nursery, after-school club"],
  ["insurance", "Insurance", "essentials", "Home, life, income protection"],
  ["essential", "Other essentials", "essentials", "Anything else you have to pay"],
  ["subscriptions", "Subscriptions", "spending", "Streaming, apps, memberships"],
  ["health", "Health and fitness", "spending", "Gym, classes, dentist plan"],
  ["lifestyle", "Other regular spending", "spending", "Eating out, hobbies"],
  ["debt", "Debt repayments", "debt", "Credit card, loan, overdraft"],
  ["emergency", "Emergency fund", "emergency", "Easy-access safety net"],
  ["savings", "Savings", "savings", "Holiday, house deposit, a new car"],
  ["isa", "ISA and investing", "invest", "Stocks and shares ISA, Lifetime ISA"],
  ["pension", "Pension", "invest", "Personal pension or SIPP"],
]
export const catLabel = (c: OutCat) => OUT_CATS.find((x) => x[0] === c)?.[1] ?? "Other"
const groupOf = (c: OutCat): Group => OUT_CATS.find((x) => x[0] === c)?.[2] ?? "essentials"
const SAVE_GROUPS: Group[] = ["emergency", "savings", "invest"]

export type Suggestion = { pots: Pot[]; amounts: Record<string, number>; shortfall: number; notes: string[]; plan: Plan }
/** The monthly plan behind the pie, for the score and tips. */
export type Plan = {
  income: number; tax: number; business: number
  /** Income after tax and business costs: what the split is judged against. */
  takeHome: number
  essentials: number; debt: number; lifestyle: number; freeSpending: number
  saving: number; emergency: number; invest: number; savings: number
  /** What they've listed, per group, and the extra the style suggests on top. */
  committed: Record<Group, number>; topUp: Partial<Record<Group, number>>
  items: Record<Group, { name: string; amount: number; cat: OutCat }[]>
}

export function suggest(d: Data, m: MoneyIn): Suggestion {
  const b = d.budget
  const income = m.total
  const notes: string[] = []
  const amounts: Partial<Record<PotKind, number>> = {}
  const why: Partial<Record<PotKind, string>> = {}
  const items: Plan["items"] = { essentials: [], spending: [], debt: [], emergency: [], savings: [], invest: [] }
  const committed: Plan["committed"] = { essentials: 0, spending: 0, debt: 0, emergency: 0, savings: 0, invest: 0 }
  for (const o of b.outgoings) {
    const g = groupOf(o.cat), a = num(o.amount)
    if (!a) continue
    committed[g] += a
    items[g].push({ name: o.name.trim() || catLabel(o.cat), amount: a, cat: o.cat })
  }
  for (const g of Object.keys(items) as Group[]) items[g].sort((x, y) => y.amount - x.amount)
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
  const takeHome = left

  // Must-pays first: essentials, then minimum debt repayments, then regular lifestyle costs
  const essentials = Math.min(left, committed.essentials); left -= essentials
  const debtMin = Math.min(left, committed.debt); left -= debtMin
  const lifestyle = Math.min(left, committed.spending); left -= lifestyle
  if (essentials > 0) { amounts.essentials = essentials; why.essentials = "What you’ve listed that has to be paid: home, bills, food, transport and so on." }
  if (debtMin > 0) { amounts.debt = debtMin; why.debt = "Your repayments, as listed." }

  // What's left, plus what they already put into savings, is shared by style. What they already pay in
  // counts towards each goal; the style only adds a top-up where they're below it.
  const style: SaverStyle = b.style === "debt" && !committed.debt ? "balanced" : b.style
  if (b.style === "debt" && !committed.debt) notes.push("Add a debt repayment below to use the ‘Paying off debt’ split. Until then it works like Balanced.")
  const w = { ...WEIGHTS[style] }
  if (b.emergencyDone && w.emergency) {
    const k: PotKind = style === "heavy" ? "invest" : "savings"
    w[k] = (w[k] || 0) + w.emergency
    delete w.emergency
  }
  const wTotal = sum(Object.values(w).map(num))
  const listedSaving = committed.emergency + committed.savings + committed.invest
  const pool = Math.max(0, left)
  const goal = (k: PotKind) => (pool * num(w[k])) / wTotal
  const topUp: Plan["topUp"] = {}
  const saveAmt: Record<"emergency" | "savings" | "invest" | "debt", number> = { emergency: 0, savings: 0, invest: 0, debt: 0 }
  // Listed saving comes out of the pool first (it's money they've decided to save)
  let spare = pool
  for (const g of SAVE_GROUPS) { const a = Math.min(spare, committed[g]); saveAmt[g as "emergency"] = a; spare -= a }
  if (listedSaving > pool) notes.push(`What you put into savings and investing (${money(listedSaving)}) is more than is left after tax, essentials, repayments and regular spending (${money(pool)}). The pie shows what fits; look at the list below.`)
  // Then top up each goal the style asks for, as far as the spare money goes
  for (const k of ["emergency", "savings", "invest", "debt"] as const) {
    if (!w[k]) continue
    const want = Math.max(0, goal(k) - (k === "debt" ? 0 : saveAmt[k]))
    const add = Math.min(spare, want)
    if (add > 0.005) { saveAmt[k] += add; topUp[k === "debt" ? "debt" : k] = add; spare -= add }
  }
  if (saveAmt.debt > 0) { amounts.debt = (amounts.debt || 0) + saveAmt.debt; why.debt = "Your repayments plus extra, highest interest rate first." }
  for (const k of ["emergency", "savings", "invest"] as const) if (saveAmt[k] > 0) amounts[k] = saveAmt[k]
  const freeSpending = spare
  amounts.spending = lifestyle + freeSpending

  const shortfall = Math.max(0, t.amount + m.business + committed.essentials + committed.debt + committed.spending - income)
  if (shortfall > 0) notes.push(`Your tax, costs, essentials, repayments and regular spending come to more than this period’s income, by about ${money(shortfall)}. Look at the list below, or wait for more invoices to be paid.`)

  const monthsCovered = committed.essentials ? 3 * committed.essentials : 0
  why.emergency = (committed.emergency ? `You put in ${money(committed.emergency)}${topUp.emergency ? `; your style suggests ${money(topUp.emergency)} more` : ""}. ` : "") + (monthsCovered
    ? `MoneyHelper suggests 3 to 6 months of essential outgoings (${money(monthsCovered)} to ${money(monthsCovered * 2)} for you), in an easy-access account.`
    : "A cushion for quiet weeks or late payers. MoneyHelper suggests 3 to 6 months of essential outgoings, in an easy-access account.")
  why.savings = committed.savings ? `You put in ${money(committed.savings)}${topUp.savings ? `; your style suggests ${money(topUp.savings)} more` : ""}.` : "For goals in the next few years: a holiday, a car, a house deposit."
  why.invest = (committed.invest ? `You put in ${money(committed.invest)}${topUp.invest ? `; your style suggests ${money(topUp.invest)} more` : ""}. ` : "") + "Self-employed work doesn’t come with a workplace pension, so this is yours to build. A guide, not financial advice."
  why.spending = lifestyle ? `${money(lifestyle)} of regular spending you’ve listed, and ${money(freeSpending)} free to spend on anything else.` : "Guilt-free money for everything else."

  const groupItems: Partial<Record<PotKind, { name: string; amount: number }[]>> = {
    essentials: items.essentials, debt: items.debt, emergency: items.emergency, savings: items.savings, invest: items.invest,
    spending: [...items.spending, ...(freeSpending > 0.005 && items.spending.length ? [{ name: "Free to spend", amount: freeSpending }] : [])],
  }
  for (const k of ["emergency", "savings", "invest", "debt"] as const) if (topUp[k] && groupItems[k]?.length) groupItems[k] = [...groupItems[k]!, { name: "Suggested top-up", amount: topUp[k]! }]

  const kinds = (["tax", "business", "essentials", "debt", "emergency", "savings", "invest", "spending"] as const).filter((k) => (amounts[k] || 0) > 0.005)
  const pcts = wholePercents(kinds.map((k) => amounts[k] || 0))
  const pots: Pot[] = kinds.map((k, i) => ({ id: "s-" + k, name: NAMES[k], pct: pcts[i], color: KIND_COLOR[k], kind: k, why: why[k], items: groupItems[k]?.length ? groupItems[k] : undefined }))
  const out: Record<string, number> = {}
  kinds.forEach((k) => (out["s-" + k] = amounts[k] || 0))
  const saving = saveAmt.emergency + saveAmt.savings + saveAmt.invest
  const plan: Plan = { income, tax, business, takeHome, essentials, debt: debtMin + saveAmt.debt, lifestyle, freeSpending, saving, emergency: saveAmt.emergency, invest: saveAmt.invest, savings: saveAmt.savings, committed, topUp, items }
  return { pots, amounts: out, shortfall, notes, plan }
}

/* ---------- how balanced it is, out of five ---------- */
export type ScoreReason = { ok: boolean; text: string }
/**
 * KASA.Rx's own balance score: starts at 5 stars and loses some for each thing that's out of balance,
 * judged on take-home (income after tax and business costs). The guides it uses are common rules of
 * thumb, such as about half on needs and at least a fifth saved. A guide, not financial advice.
 */
export function balanceScore(s: Suggestion, emergencyDone: boolean): { stars: number; reasons: ScoreReason[] } | null {
  const p = s.plan
  if (p.takeHome <= 0) return null
  const pct = (n: number) => Math.round((n / p.takeHome) * 100)
  const reasons: ScoreReason[] = []
  let stars = 5
  if (s.shortfall > 0) {
    reasons.push({ ok: false, text: `Your outgoings are more than your take-home this period, by ${money(s.shortfall)}.` })
    return { stars: 1, reasons }
  }
  const save = pct(p.saving)
  if (save >= 20) reasons.push({ ok: true, text: `You’re saving or investing ${save}% of your take-home (a common guide is at least 20%).` })
  else { stars -= save < 10 ? 1.5 : save < 15 ? 1 : 0.5; reasons.push({ ok: false, text: `You’re saving or investing ${save}% of your take-home; a common guide is at least 20%.` }) }
  const needs = pct(p.essentials + p.debt)
  if (needs <= 50) reasons.push({ ok: true, text: `Essentials and repayments take ${needs}% (a common guide is about half or less).` })
  else { stars -= needs > 75 ? 2 : needs > 65 ? 1.5 : needs > 55 ? 1 : 0.5; reasons.push({ ok: false, text: `Essentials and repayments take ${needs}%; a common guide is about half or less.` }) }
  const wants = pct(p.lifestyle + p.freeSpending)
  if (wants <= 30) reasons.push({ ok: true, text: `Spending is ${wants}% (a common guide is up to about 30%).` })
  else { stars -= wants > 45 ? 1 : 0.5; reasons.push({ ok: false, text: `Spending is ${wants}%; a common guide is up to about 30%.` }) }
  if (emergencyDone || p.emergency > 0) reasons.push({ ok: true, text: emergencyDone ? "You already have an emergency fund." : "You’re building an emergency fund." })
  else { stars -= 1; reasons.push({ ok: false, text: "Nothing is going into an emergency fund yet." }) }
  return { stars: Math.max(1, Math.round(stars * 2) / 2), reasons }
}

/* ---------- where they could cut back ---------- */
/** Plain suggestions from their own figures; only ones that would actually help. */
export function cutBackTips(s: Suggestion): string[] {
  const p = s.plan
  if (p.takeHome <= 0) return []
  const tips: string[] = []
  const pct = (n: number) => Math.round((n / p.takeHome) * 100)
  const target = p.takeHome * 0.2
  const gap = Math.max(0, target - p.saving)
  const regular = [...p.items.spending].sort((a, b) => b.amount - a.amount)
  if (gap > 0 && regular.length) {
    const sumReg = regular.reduce((a, x) => a + x.amount, 0)
    tips.push(`Your regular spending comes to ${money(sumReg)} a month (${regular.slice(0, 3).map((x) => `${x.name} ${money(x.amount)}`).join(", ")}). Cutting ${money(Math.min(gap, sumReg))} of it would take your saving to ${pct(p.saving + Math.min(gap, sumReg))}% of your take-home.`)
  }
  if (gap > 0 && p.freeSpending > 0) tips.push(`Moving ${money(Math.min(gap, p.freeSpending))} a month from free spending into savings would bring you to ${pct(p.saving + Math.min(gap, p.freeSpending))}%.`)
  // Costs people can usually shop around for (not rent or a mortgage, or food)
  const shoppable = p.items.essentials.filter((x) => ["transport", "bills", "insurance"].includes(x.cat)).sort((a, b) => b.amount - a.amount)
  if (pct(p.essentials + p.debt) > 50 && shoppable.length) tips.push(`${shoppable[0].name} costs ${money(shoppable[0].amount)} a month (${pct(shoppable[0].amount)}% of your take-home). It may be worth comparing deals when it’s next up for renewal.`)
  if (p.debt > 0 && p.emergency === 0) tips.push("With debt and no emergency fund, an unexpected bill can mean borrowing more. Even a small monthly amount into an easy-access account helps.")
  if (!tips.length && s.plan.freeSpending > 0) tips.push(`You have ${money(s.plan.freeSpending)} a month free after everything else. Your split looks balanced for your style.`)
  return tips
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
