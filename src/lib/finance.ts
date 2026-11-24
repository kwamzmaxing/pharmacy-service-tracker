// Figures for the Insights page, worked out only from what the person has logged and invoiced.
// Nothing here is estimated or assumed: every number traces back to entries and invoices in their tracker.
import { addDays, daysBetween, daysToPay, entryAmt, invStatus, isoOf, taxYear, today, unitOf, type Data, type Invoice, type Unit } from "./model"

export type PeriodKey = "ty" | "12m" | "lastTy" | "all"
export type Period = { key: PeriodKey; from: string; to: string; label: string }

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const minusYear = (iso: string) => `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`.replace(/-02-29$/, "-02-28")

/** The date range a period covers, up to `t` (today) at most. */
export function periodOf(key: PeriodKey, d: Data, t = today()): Period {
  const ty = taxYear(t)
  if (key === "ty") return { key, from: ty.from, to: t, label: `${ty.label} tax year so far` }
  if (key === "lastTy") { const p = taxYear(addDays(ty.from, -1)); return { key, from: p.from, to: p.to, label: `${p.label} tax year` } }
  if (key === "12m") { const n = new Date(t + "T00:00:00"); return { key, from: isoOf(new Date(n.getFullYear(), n.getMonth() - 11, 1)), to: t, label: "Last 12 months" } }
  const first = [...d.entries.map((e) => e.date), ...d.invoices.map((i) => i.issued)].filter(Boolean).sort()[0] || t
  return { key, from: first, to: t, label: "All time" }
}

/** The same stretch of time a year earlier, for "vs last year" comparisons (none for all time). */
export const previousOf = (p: Period): { from: string; to: string } | null => (p.key === "all" ? null : { from: minusYear(p.from), to: minusYear(p.to) })

export type ServiceRow = { id: string; name: string; unit: Unit; qty: number; count: number; revenue: number }
export type MonthRow = { ym: string; label: string; long: string; revenue: number }
export type AgeBucket = { key: string; label: string; total: number; count: number }

export type Finance = {
  /** Services done (consultations, checks, jabs...): quantities of per-item services, excluding hours and mileage. */
  services: number
  hours: number
  miles: number
  /** Everything logged in the period: services, hours and mileage. */
  revenue: number
  invoiced: number
  /** Of the period's revenue, how much has been paid for so far. */
  paidFor: number
  /** Money received in the period (by the date invoices were marked paid). */
  received: number
  byService: ServiceRow[]
  byMonth: MonthRow[]
  /** Invoices paid in the period: average, fastest and slowest days from issue to payment, and how many were paid by their due date. */
  pay: { count: number; avgDays: number | null; fastest: number | null; slowest: number | null; onTime: number }
  payByPharmacy: { name: string; avgDays: number; count: number }[]
  /** As of today, whatever the period. */
  outstanding: { invoices: Invoice[]; total: number; overdueTotal: number; overdueCount: number; ageing: AgeBucket[] }
}

export function finance(d: Data, from: string, to: string, t = today()): Finance {
  const svc = (id: string) => d.services.find((s) => s.id === id)
  const entries = d.entries.filter((e) => e.date >= from && e.date <= to)
  const paidIds = new Set(d.invoices.filter((i) => i.status === "paid").map((i) => i.id))
  const linked = new Set(d.entries.map((e) => e.invoiceId).filter(Boolean))

  let services = 0, hours = 0, miles = 0
  const rows: Record<string, ServiceRow> = {}
  for (const e of entries) {
    const s = svc(e.serviceId), unit = e.hours ? "hour" : unitOf(s), q = Number(e.qty) || 0
    if (unit === "hour") hours += q
    else if (unit === "mile") miles += q
    else services += q
    const id = s ? s.id : "__gone"
    const r = (rows[id] ||= { id, name: s?.name || "Services no longer in your list", unit, qty: 0, count: 0, revenue: 0 })
    r.qty += q; r.count++; r.revenue += entryAmt(e)
  }

  // Months from the start of the period to its end
  const byMonth: MonthRow[] = []
  const start = new Date(from + "T00:00:00"), end = new Date(to + "T00:00:00")
  const span = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1
  for (let k = 0; k < span; k++) {
    const m = new Date(start.getFullYear(), start.getMonth() + k, 1)
    const ym = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`
    byMonth.push({
      ym,
      label: m.toLocaleDateString("en-GB", span > 12 ? { month: "short", year: "2-digit" } : { month: "short" }),
      long: m.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
      revenue: sum(entries.filter((e) => e.date.startsWith(ym)).map(entryAmt)),
    })
  }

  const paidInPeriod = d.invoices.filter((i) => i.status === "paid" && i.paidDate && i.paidDate >= from && i.paidDate <= to)
  const days = paidInPeriod.map(daysToPay).filter((x): x is number => x !== null)
  const groups: Record<string, number[]> = {}
  for (const i of paidInPeriod) { const n = d.clients.find((c) => c.id === i.clientId)?.name || i.to.name || "Unnamed pharmacy"; (groups[n] ||= []).push(daysToPay(i) ?? 0) }

  const open = d.invoices.filter((i) => i.status !== "paid").sort((a, b) => a.due.localeCompare(b.due))
  const late = (i: Invoice) => Math.max(0, daysBetween(i.due, t))
  const bucket = (key: string, label: string, test: (i: Invoice) => boolean): AgeBucket => {
    const xs = open.filter(test)
    return { key, label, total: sum(xs.map((i) => i.total)), count: xs.length }
  }
  const overdue = open.filter((i) => invStatus(i) === "overdue")

  const revenue = sum(entries.map(entryAmt))
  return {
    services, hours, miles,
    revenue,
    invoiced: sum(entries.filter((e) => e.invoiced).map(entryAmt)),
    // As on Home: paid invoices with no entries in the log (older data) count by the date they were issued
    paidFor: Math.min(revenue, sum(entries.filter((e) => e.invoiceId && paidIds.has(e.invoiceId)).map(entryAmt)) +
      sum(d.invoices.filter((i) => i.status === "paid" && !linked.has(i.id) && i.issued >= from && i.issued <= to).map((i) => i.total))),
    received: sum(paidInPeriod.map((i) => i.total)),
    byService: Object.values(rows).sort((a, b) => b.revenue - a.revenue),
    byMonth,
    pay: {
      count: days.length,
      avgDays: days.length ? Math.round(sum(days) / days.length) : null,
      fastest: days.length ? Math.min(...days) : null,
      slowest: days.length ? Math.max(...days) : null,
      onTime: paidInPeriod.filter((i) => i.paidDate! <= i.due).length,
    },
    payByPharmacy: Object.entries(groups).map(([name, xs]) => ({ name, count: xs.length, avgDays: Math.round(sum(xs) / xs.length) })).sort((a, b) => b.avgDays - a.avgDays),
    outstanding: {
      invoices: open,
      total: sum(open.map((i) => i.total)),
      overdueTotal: sum(overdue.map((i) => i.total)),
      overdueCount: overdue.length,
      ageing: [
        bucket("due", "Not due yet", (i) => invStatus(i) !== "overdue"),
        bucket("1-30", "1–30 days overdue", (i) => invStatus(i) === "overdue" && late(i) <= 30),
        bucket("31-60", "31–60 days overdue", (i) => late(i) > 30 && late(i) <= 60),
        bucket("60+", "Over 60 days overdue", (i) => late(i) > 60),
      ],
    },
  }
}

/* ---------- what to do next ---------- */

export type InvoiceGroup = { key: string; clientId: string | null; name: string; ym: string; period: string; from: string; to: string; total: number; count: number; oldest: string }
/**
 * Work done (dated today or earlier) that isn't on an invoice yet, grouped by pharmacy and calendar month,
 * oldest first. Work not linked to a pharmacy is grouped on its own so it can be sorted out by hand.
 */
export function readyToInvoice(d: Data, t = today()): InvoiceGroup[] {
  const groups: Record<string, InvoiceGroup> = {}
  for (const e of d.entries) {
    if (e.invoiced || e.date > t) continue
    const ym = e.date.slice(0, 7)
    const c = e.clientId ? d.clients.find((x) => x.id === e.clientId) : undefined
    const cid = c ? c.id : null
    const key = (cid || "none") + "|" + ym
    const m = new Date(ym + "-01T00:00:00")
    const g = (groups[key] ||= {
      key, clientId: cid, name: c?.name || "Not linked to a pharmacy", ym,
      period: m.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
      from: `${ym}-01`, to: isoOf(new Date(m.getFullYear(), m.getMonth() + 1, 0)), total: 0, count: 0, oldest: e.date,
    })
    g.total += entryAmt(e); g.count++
    if (e.date < g.oldest) g.oldest = e.date
  }
  return Object.values(groups).filter((g) => g.total > 0).sort((a, b) => a.oldest.localeCompare(b.oldest))
}

export type PayerRecord = { clientId: string; name: string; paid: number; paidLate: number; overdueNow: number; avgDaysLate: number | null; avgDaysToPay: number | null }
/** Each pharmacy's payment record: invoices paid, how many after the due date, and how many are overdue now. */
export function payerRecords(d: Data, t = today()): PayerRecord[] {
  return d.clients.map((c) => {
    const invs = d.invoices.filter((i) => i.clientId === c.id)
    const paid = invs.filter((i) => i.status === "paid" && i.paidDate)
    const late = paid.filter((i) => i.paidDate! > i.due)
    const days = paid.map(daysToPay).filter((x): x is number => x !== null)
    return {
      clientId: c.id, name: c.name, paid: paid.length, paidLate: late.length,
      overdueNow: invs.filter((i) => i.status !== "paid" && t > i.due).length,
      avgDaysLate: late.length ? Math.round(sum(late.map((i) => daysBetween(i.due, i.paidDate!))) / late.length) : null,
      avgDaysToPay: days.length ? Math.round(sum(days) / days.length) : null,
    }
  })
}
/** A repeat late payer: at least two late payments (paid late, or overdue now), and late on at least half of them. */
export const isRepeatLate = (r: PayerRecord) => r.paidLate + r.overdueNow >= 2 && (r.paidLate + r.overdueNow) / Math.max(1, r.paid + r.overdueNow) >= 0.5
export const repeatLatePayers = (d: Data, t = today()) => payerRecords(d, t).filter(isRepeatLate).sort((a, b) => (b.paidLate + b.overdueNow) - (a.paidLate + a.overdueNow))

/**
 * When an unpaid invoice is likely to be paid: from the pharmacy's own record when it has paid at least
 * two invoices before (invoice date + its average days to pay), otherwise the due date.
 */
export function expectedPayment(d: Data, inv: Invoice): { date: string; basis: "history" | "terms"; days?: number } {
  const r = inv.clientId ? payerRecords(d).find((x) => x.clientId === inv.clientId) : undefined
  if (r && r.paid >= 2 && r.avgDaysToPay !== null) return { date: addDays(inv.issued, r.avgDaysToPay), basis: "history", days: r.avgDaysToPay }
  return { date: inv.due, basis: "terms" }
}

/** Unpaid invoices due in the next `days` days (not yet overdue), soonest first. */
export const dueSoon = (d: Data, t = today(), days = 7) =>
  d.invoices.filter((i) => i.status !== "paid" && i.due >= t && daysBetween(t, i.due) <= days).sort((a, b) => a.due.localeCompare(b.due))

/**
 * This month's income: what has arrived so far, plus unpaid invoices expected by the end of the month
 * (from each pharmacy's record or the due date). Overdue invoices are listed separately, since there's no
 * telling when they'll arrive.
 */
export function expectedThisMonth(d: Data, t = today()) {
  const ym = t.slice(0, 7)
  const end = isoOf(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0))
  const received = sum(d.invoices.filter((i) => i.status === "paid" && i.paidDate && i.paidDate.startsWith(ym) && i.paidDate <= t).map((i) => i.total))
  const open = d.invoices.filter((i) => i.status !== "paid")
  const coming = open.filter((i) => i.due >= t).filter((i) => { const e = expectedPayment(d, i).date; return e <= end })
  const overdue = open.filter((i) => i.due < t)
  return { received, expected: sum(coming.map((i) => i.total)), expectedCount: coming.length, overdue: sum(overdue.map((i) => i.total)), overdueCount: overdue.length, total: received + sum(coming.map((i) => i.total)) }
}
